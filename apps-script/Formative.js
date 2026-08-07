/** 형성평가: 6개 소단원 공용. 형성평가_문항 탭을 소단원ID로 필터링해서 제공합니다. */

var FORMATIVE_RESPONSE_HEADERS = [
  '제출시각', '순번', '이름', '반', '번호', '소단원ID', '문항ID', '선택한 보기', '확신도', '정오답', '핵심개념', '시도번호',
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
      coreConcept: r['핵심개념'],
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
