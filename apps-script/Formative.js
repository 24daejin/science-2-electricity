/** 형성평가: 6개 소단원 공용. 문항 조회는 프론트가 Firestore에서 직접 하고, 이 파일은 응답 저장/시도횟수만 담당합니다. */

var FORMATIVE_RESPONSE_HEADERS = [
  '제출시각', '순번', '이름', '반', '번호', '소단원ID', '문항ID', '선택한 보기', '확신도', '정오답', '핵심개념', '시도번호',
];

/** action=getFormativeAttemptCounts: 이 학생이 각 문항을 지금까지 몇 번 풀었는지 { 문항ID: 횟수 } 로 반환. */
function Formative_getAttemptCounts(payload, auth) {
  var rows = SheetUtils_getRows(SHEET_NAMES.FORMATIVE_RESPONSES) || [];
  var counts = {};
  rows.forEach(function (r) {
    if (String(r['순번']) !== String(auth.seq)) return;
    var qid = r['문항ID'];
    counts[qid] = (counts[qid] || 0) + 1;
  });
  return counts;
}

function Formative_submitResponse(payload, auth) {
  ['subunitId', 'questionId', 'selectedChoice', 'confidence'].forEach(function (k) {
    if (!payload[k]) throw new Error('필수 값 누락: ' + k);
  });

  var prior = SheetUtils_getRows(SHEET_NAMES.FORMATIVE_RESPONSES) || [];
  var attemptNumber =
    prior.filter(function (r) {
      return String(r['순번']) === String(auth.seq) && String(r['문항ID']) === String(payload.questionId);
    }).length + 1;

  SheetUtils_appendRow(SHEET_NAMES.FORMATIVE_RESPONSES, FORMATIVE_RESPONSE_HEADERS, {
    제출시각: new Date(),
    순번: auth.seq || '',
    이름: auth.name || '',
    반: auth.classroom || '',
    번호: auth.number || '',
    소단원ID: payload.subunitId,
    문항ID: payload.questionId,
    '선택한 보기': payload.selectedChoice,
    확신도: payload.confidence,
    정오답: payload.isCorrect ? '정답' : '오답',
    핵심개념: payload.coreConcept || '',
    시도번호: attemptNumber,
  });

  ScoreLog_upsert_(auth, '문제풀이', payload.questionId, payload.isCorrect ? POINTS_PER_CORRECT_ANSWER : 0);

  return { saved: true, attemptNumber: attemptNumber };
}
