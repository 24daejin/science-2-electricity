/** 형성평가: 6개 소단원 공용. 형성평가_문항 탭을 소단원ID로 필터링해서 제공합니다. */

var FORMATIVE_RESPONSE_HEADERS = [
  '제출시각', '학번', '이름', '소단원ID', '문항ID', '선택한 보기', '확신도', '정오답', '핵심개념',
];

function Formative_getQuestions(payload) {
  var subunitId = String(payload.subunitId || '').trim();
  if (!subunitId) throw new Error('subunitId가 필요합니다.');

  var rows = SheetUtils_getRows(SHEET_NAMES.FORMATIVE_QUESTIONS);
  if (!rows) {
    throw new Error('형성평가_문항 시트가 아직 마스터 스프레드시트에 병합되지 않았습니다. 준비되는 대로 자동으로 반영됩니다.');
  }

  var filtered = rows.filter(function (r) { return String(r['소단원ID']).trim() === subunitId; });

  return filtered.map(function (r) {
    return {
      questionId: r['문항ID'],
      subunitId: r['소단원ID'],
      subunitName: r['소단원명'],
      coreConcept: r['핵심 개념'],
      standard: r['성취기준'],
      question: r['문제'],
      choices: [r['보기1'], r['보기2'], r['보기3'], r['보기4']],
      answer: Number(r['정답(번호)']),
      feedback: {
        correct_confident: r['피드백_정답_확신'],
        correct_unsure: r['피드백_정답_비확신'],
        incorrect_confident: r['피드백_오답_확신'],
        incorrect_unsure: r['피드백_오답_비확신'],
      },
    };
  });
}

function Formative_submitResponse(payload, auth) {
  ['subunitId', 'questionId', 'selectedChoice', 'confidence'].forEach(function (k) {
    if (!payload[k]) throw new Error('필수 값 누락: ' + k);
  });

  SheetUtils_appendRow(SHEET_NAMES.FORMATIVE_RESPONSES, FORMATIVE_RESPONSE_HEADERS, {
    제출시각: new Date(),
    학번: auth.studentId || '',
    이름: auth.name || '',
    소단원ID: payload.subunitId,
    문항ID: payload.questionId,
    '선택한 보기': payload.selectedChoice,
    확신도: payload.confidence,
    정오답: payload.isCorrect ? '정답' : '오답',
    핵심개념: payload.coreConcept || '',
  });

  return { saved: true };
}
