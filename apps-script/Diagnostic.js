/** 진단평가: 문항 조회는 프론트가 Firestore에서 직접 하고, 이 파일은 응답을 진단평가_응답 탭에 기록합니다. */

var DIAGNOSTIC_RESPONSE_HEADERS = ['제출시각', '순번', '이름', '반', '번호', '문항ID', '선택한 보기', '확신도', '정오답', '시도번호'];

/** action=getDiagnosticAttemptCounts: 이 학생이 각 문항을 지금까지 몇 번 풀었는지 { 문항ID: 횟수 } 로 반환. */
function Diagnostic_getAttemptCounts(payload, auth) {
  var rows = SheetUtils_getRows(SHEET_NAMES.DIAGNOSTIC_RESPONSES) || [];
  var counts = {};
  rows.forEach(function (r) {
    if (String(r['순번']) !== String(auth.seq)) return;
    var qid = r['문항ID'];
    counts[qid] = (counts[qid] || 0) + 1;
  });
  return counts;
}

function Diagnostic_submitResponse(payload, auth) {
  var questionId = payload.questionId;
  var selectedChoice = payload.selectedChoice;
  var confidence = payload.confidence;

  if (!questionId || !selectedChoice || !confidence) {
    throw new Error('필수 값 누락(questionId, selectedChoice, confidence)');
  }

  var prior = SheetUtils_getRows(SHEET_NAMES.DIAGNOSTIC_RESPONSES) || [];
  var attemptNumber =
    prior.filter(function (r) {
      return String(r['순번']) === String(auth.seq) && String(r['문항ID']) === String(questionId);
    }).length + 1;

  SheetUtils_appendRow(SHEET_NAMES.DIAGNOSTIC_RESPONSES, DIAGNOSTIC_RESPONSE_HEADERS, {
    제출시각: new Date(),
    순번: auth.seq || '',
    이름: auth.name || '',
    반: auth.classroom || '',
    번호: auth.number || '',
    문항ID: questionId,
    '선택한 보기': selectedChoice,
    확신도: confidence,
    정오답: payload.isCorrect ? '정답' : '오답',
    시도번호: attemptNumber,
  });

  // 진단평가는 배우기 전 선수학습 확인용이라 점수를 주지 않습니다(형성평가만 점수 대상).

  return { saved: true, attemptNumber: attemptNumber };
}
