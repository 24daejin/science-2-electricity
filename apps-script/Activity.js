/**
 * 교과서 활동("해보기") 응답 저장 + 문항별 도움말.
 * 교과서 페이지 이미지 위, 원본 빈칸(연필 아이콘) 자리에 학생이 쓴 답을 그대로 겹쳐 보여주는
 * frontend/activity/index.html이 이 API를 씁니다. 한 활동(activityId)에 빈칸(questionId)이
 * 여러 개 있을 수 있어 (활동ID, 문항ID, 학생) 조합마다 최신 답변 하나만 유지합니다
 * (다시 쓰면 이전 답을 덮어씀).
 *
 * 도움말: 선생님이 "활동_모범답안" 시트에 문항별 모범답안(+선택적으로 문제 텍스트)을 적어두면,
 * 학생이 그 문항을 처음 열 때 Claude가 "질문의 의도"를 짚어주는 도움말을 한 번 생성해서 같은
 * 시트에 저장해둡니다(다음부터는 재생성 없이 그대로 재사용). 모범답안 문장 자체는 절대 그대로
 * 노출하지 않도록 프롬프트로 강제합니다.
 */

var ACTIVITY_RESPONSE_HEADERS = ['활동ID', '문항ID', '순번', '이름', '반', '번호', '답변', '수정시각'];
var ACTIVITY_POINTS_PER_ANSWER = 10; // 정답 개념이 없는 서술형이라 "제출했는지"로 참여 점수를 줍니다.
var ACTIVITY_HINT_HEADERS = ['활동ID', '문항ID', '문제', '모범답안', '도움말'];

/** action=getMyActivityResponses: 이 활동에 내가 지금까지 쓴 답을 { 문항ID: 답변 } 형태로 반환(다시 들어왔을 때 복원용). */
function Activity_getMyResponses(payload, auth) {
  var activityId = String(payload.activityId || '').trim();
  if (!activityId) throw new Error('activityId가 필요합니다.');

  var rows = SheetUtils_getRows(SHEET_NAMES.ACTIVITY_RESPONSES) || [];
  var mine = rows.filter(function (r) {
    return String(r['활동ID']) === activityId && String(r['순번']) === String(auth.seq);
  });
  var byQuestion = {};
  mine.forEach(function (r) { byQuestion[r['문항ID']] = r['답변']; });
  return byQuestion;
}

/** action=submitActivityResponse: 빈칸 하나에 대한 답을 저장(있으면 갱신, 없으면 새로 추가). */
function Activity_submitResponse(payload, auth) {
  var activityId = String(payload.activityId || '').trim();
  var questionId = String(payload.questionId || '').trim();
  var answer = payload.answer == null ? '' : String(payload.answer);
  if (!activityId || !questionId) throw new Error('activityId, questionId가 필요합니다.');

  var rows = SheetUtils_getRows(SHEET_NAMES.ACTIVITY_RESPONSES);
  if (rows === null) {
    SheetUtils_ensureSheet(SHEET_NAMES.ACTIVITY_RESPONSES, ACTIVITY_RESPONSE_HEADERS);
    rows = [];
  }

  var existing = rows.find(function (r) {
    return String(r['활동ID']) === activityId && String(r['문항ID']) === questionId && String(r['순번']) === String(auth.seq);
  });
  var rowObj = {
    활동ID: activityId,
    문항ID: questionId,
    순번: auth.seq || '',
    이름: auth.name || '',
    반: auth.classroom || '',
    번호: auth.number || '',
    답변: answer,
    수정시각: new Date(),
  };

  if (existing) {
    SheetUtils_updateRow(SHEET_NAMES.ACTIVITY_RESPONSES, ACTIVITY_RESPONSE_HEADERS, existing._row, rowObj);
  } else {
    SheetUtils_appendRow(SHEET_NAMES.ACTIVITY_RESPONSES, ACTIVITY_RESPONSE_HEADERS, rowObj);
  }

  // 빈칸을 채워 제출하면 참여 점수(교과서활동 유형)를 적립하고, 지우면(빈 답으로 다시 저장) 점수도 함께 사라집니다.
  ScoreLog_upsert_(auth, '교과서활동', activityId + '-' + questionId, answer.trim() ? ACTIVITY_POINTS_PER_ANSWER : 0);

  return { saved: true };
}

function Activity_buildHintPrompt_(activityTitle, questionText, modelAnswer) {
  return [
    '너는 중학교 과학 교사다. 학생들이 교과서 활동 문항에 답을 쓸 때, 질문이 정확히 무엇을 묻는지',
    '잘 모르고 엉뚱한 내용을 쓰는 경우가 많다. 아래 정보를 바탕으로 학생이 답을 쓰기 전에 참고할',
    '짧은 도움말을 만들어라.',
    '',
    '활동 제목: "' + activityTitle + '"',
    questionText ? '문항 내용: "' + questionText + '"' : '',
    '모범답안(학생에게 절대 그대로 보여주면 안 됨 — 도움말을 만들기 위한 참고용일 뿐): "' + modelAnswer + '"',
    '',
    '규칙:',
    '- 모범답안의 문장이나 핵심 표현을 그대로 옮기지 마라. 정답을 알려주는 게 아니라 "무엇을 묻는지"를 짚어주는 것이다.',
    '- 이 질문이 정확히 뭘 묻고 있는지, 답에 꼭 들어가야 할 요소가 뭔지 짚어줘라.',
    '- 2~3문장 이내, 중학생이 이해하기 쉬운 다정한 말투로.',
    '- 다른 말 덧붙이지 말고 도움말 본문만 바로 작성해라.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * action=getActivityHints: 이 활동(activityId)에 등록된 문항별 도움말을 { 문항ID: 도움말 }로
 * 반환합니다. 모범답안이 없는 문항은 결과에서 아예 빠집니다(학생 화면에 힌트 버튼 자체를 안
 * 보여주기 위함). 도움말이 아직 생성 안 됐으면(시트에 빈 칸) 이 요청에서 Claude로 생성해
 * 시트에 저장한 뒤 돌려줍니다 — 그래서 같은 문항을 여는 다음 학생부터는 즉시 응답됩니다.
 */
function Activity_getHints(payload, auth) {
  var activityId = String(payload.activityId || '').trim();
  if (!activityId) throw new Error('activityId가 필요합니다.');
  var activityTitle = String(payload.title || '').trim();

  var rows = SheetUtils_getRows(SHEET_NAMES.ACTIVITY_HINTS) || [];
  var mine = rows.filter(function (r) { return String(r['활동ID']).trim() === activityId; });

  var hints = {};
  mine.forEach(function (r) {
    var questionId = String(r['문항ID'] || '').trim();
    var modelAnswer = String(r['모범답안'] || '').trim();
    if (!questionId || !modelAnswer) return; // 모범답안이 없으면 힌트 대상이 아님

    var existingHint = String(r['도움말'] || '').trim();
    if (existingHint) {
      hints[questionId] = existingHint;
      return;
    }

    // 아직 생성된 적 없는 경우에만 이 요청에서 만들어서 저장한다(요청마다 다시 만들지 않도록).
    try {
      var prompt = Activity_buildHintPrompt_(activityTitle, String(r['문제'] || ''), modelAnswer);
      var generated = Claude_callMessages(prompt, [{ role: 'user', content: '도움말을 만들어줘.' }], 300);
      SheetUtils_updateRow(SHEET_NAMES.ACTIVITY_HINTS, ACTIVITY_HINT_HEADERS, r._row, {
        활동ID: r['활동ID'],
        문항ID: r['문항ID'],
        문제: r['문제'],
        모범답안: r['모범답안'],
        도움말: generated,
      });
      hints[questionId] = generated;
    } catch (err) {
      // 생성 실패해도 활동 자체는 계속 쓸 수 있어야 하므로 이 문항의 힌트만 조용히 건너뛴다
      // (다음 요청에서 다시 시도됨 — 시트엔 여전히 빈 칸으로 남아있으므로).
    }
  });

  return hints;
}
