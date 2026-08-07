/**
 * 점수 시스템: 문항을 정답으로 맞히면(최근 시도 기준) 문항당 고정 점수를 적립합니다.
 * 재도전해서 오답으로 바뀌면 그 문항의 점수는 사라집니다(최신 결과만 반영, 점수 농사 방지).
 *
 * "유형"으로 문제풀이/교과서활동을 구분해둡니다 — 나중에 교과서 활동을 웹앱으로 추가할 때도
 * ScoreLog_upsert_(auth, '교과서활동', 활동ID, 점수)를 그대로 호출해 같은 체계로 적립할 수 있습니다.
 */

var SCORE_LOG_HEADERS = ['순번', '이름', '반', '번호', '유형', '항목', '점수', '수정시각'];
var POINTS_PER_CORRECT_ANSWER = 10;

/** 유형+항목(문항ID 등) 단위로 최신 점수만 유지합니다(재도전 시 그 행을 갱신). */
function ScoreLog_upsert_(auth, type, itemId, points) {
  var rows = SheetUtils_getRows(SHEET_NAMES.SCORE_LOG);
  if (rows === null) {
    SheetUtils_ensureSheet(SHEET_NAMES.SCORE_LOG, SCORE_LOG_HEADERS);
    rows = [];
  }
  var existing = rows.find(function (r) {
    return String(r['순번']) === String(auth.seq) && r['유형'] === type && String(r['항목']) === String(itemId);
  });
  var rowObj = {
    순번: auth.seq || '',
    이름: auth.name || '',
    반: auth.classroom || '',
    번호: auth.number || '',
    유형: type,
    항목: itemId,
    점수: points,
    수정시각: new Date(),
  };
  if (existing) {
    SheetUtils_updateRow(SHEET_NAMES.SCORE_LOG, SCORE_LOG_HEADERS, existing._row, rowObj);
  } else {
    SheetUtils_appendRow(SHEET_NAMES.SCORE_LOG, SCORE_LOG_HEADERS, rowObj);
  }
}

/** action=getMyScore: 로그인한 학생 자신의 점수(문제풀이/교과서활동 분리 + 합계) */
function Score_getMine(payload, auth) {
  var rows = SheetUtils_getRows(SHEET_NAMES.SCORE_LOG) || [];
  var mine = rows.filter(function (r) { return String(r['순번']) === String(auth.seq); });
  var sumBy = function (type) {
    return mine
      .filter(function (r) { return r['유형'] === type; })
      .reduce(function (sum, r) { return sum + Number(r['점수'] || 0); }, 0);
  };
  var quiz = sumBy('문제풀이');
  var activity = sumBy('교과서활동');
  return { quizScore: quiz, activityScore: activity, total: quiz + activity };
}

/** action=getClassScores: 교사용 — 반 전체 학생의 점수 목록 (대시보드에서 사용) */
function Score_getClassScores(payload, auth) {
  requireTeacher_(auth);
  var classroom = String(payload.classroom || '').trim();
  if (!classroom) throw new Error('classroom이 필요합니다.');

  var roster = SheetUtils_getRows(SHEET_NAMES.ROSTER) || [];
  var students = roster.filter(function (r) {
    return String(r['반']).trim() === classroom && String(r['학적']).trim() === '재학';
  });
  var scoreRows = SheetUtils_getRows(SHEET_NAMES.SCORE_LOG) || [];

  return students.map(function (s) {
    var seq = String(s['순번']);
    var mine = scoreRows.filter(function (r) { return String(r['순번']) === seq; });
    var sumBy = function (type) {
      return mine
        .filter(function (r) { return r['유형'] === type; })
        .reduce(function (sum, r) { return sum + Number(r['점수'] || 0); }, 0);
    };
    var quiz = sumBy('문제풀이');
    var activity = sumBy('교과서활동');
    return { seq: s['순번'], number: s['번호'], name: s['이름'], quizScore: quiz, activityScore: activity, total: quiz + activity };
  });
}
