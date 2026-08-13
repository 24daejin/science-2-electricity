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

  // 정답 여부는 클라이언트가 보낸 값(payload.isCorrect)을 믿지 않고, 서버가 문항ID로 정답을
  // 직접 조회해서 판정합니다 — 그렇지 않으면 개발자도구로 요청을 조작해 오답을 정답으로
  // 기록시킬 수 있고, 대시보드의 "다시 봐야 할 개념" 같은 기능이 무력화됩니다.
  var questions = SheetUtils_getRows(SHEET_NAMES.DIAGNOSTIC_QUESTIONS) || [];
  var question = questions.find(function (r) { return String(r['문항ID']).trim() === String(questionId).trim(); });
  if (!question) throw new Error('존재하지 않는 문항입니다.');
  var isCorrect = Number(selectedChoice) === Number(question['정답(번호)']);

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
    정오답: isCorrect ? '정답' : '오답',
    시도번호: attemptNumber,
  });

  // 진단평가는 배우기 전 선수학습 확인용이라 점수를 주지 않습니다(점수는 교과서 활동만 대상).

  return { saved: true, attemptNumber: attemptNumber, isCorrect: isCorrect };
}
