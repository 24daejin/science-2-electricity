/**
 * 교과서 활동("해보기") 응답 저장.
 * 교과서 페이지 이미지 위, 원본 빈칸(연필 아이콘) 자리에 학생이 쓴 답을 그대로 겹쳐 보여주는
 * frontend/activity/index.html이 이 API를 씁니다. 한 활동(activityId)에 빈칸(questionId)이
 * 여러 개 있을 수 있어 (활동ID, 문항ID, 학생) 조합마다 최신 답변 하나만 유지합니다
 * (형성평가 재도전과 같은 방식 — 다시 쓰면 이전 답을 덮어씀).
 */

var ACTIVITY_RESPONSE_HEADERS = ['활동ID', '문항ID', '순번', '이름', '반', '번호', '답변', '수정시각'];
var ACTIVITY_POINTS_PER_ANSWER = 10; // 정답 개념이 없는 서술형이라 "제출했는지"로 참여 점수를 줍니다.

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
