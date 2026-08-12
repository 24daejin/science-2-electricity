/**
 * 점수 시스템: 교과서 활동("해보기")을 완료하면 항목당 고정 점수를 적립합니다.
 *
 * "유형"으로 점수 종류를 구분해둡니다(현재는 교과서활동만 씀 — 형성평가는 종이 학습지로
 * 진행하므로 앱에서 문제풀이 점수를 더 이상 적립하지 않습니다. 예전에 쌓인 '문제풀이' 유형
 * 점수_로그 행은 그대로 두되, 화면에는 더 이상 합산해서 보여주지 않습니다).
 */

var SCORE_LOG_HEADERS = ['순번', '이름', '반', '번호', '유형', '항목', '점수', '수정시각'];

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

/** action=getMyScore: 로그인한 학생 자신의 점수(교과서활동) */
function Score_getMine(payload, auth) {
  var rows = SheetUtils_getRows(SHEET_NAMES.SCORE_LOG) || [];
  var mine = rows.filter(function (r) { return String(r['순번']) === String(auth.seq); });
  var activity = mine
    .filter(function (r) { return r['유형'] === '교과서활동'; })
    .reduce(function (sum, r) { return sum + Number(r['점수'] || 0); }, 0);
  return { activityScore: activity, total: activity };
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
    var activity = mine
      .filter(function (r) { return r['유형'] === '교과서활동'; })
      .reduce(function (sum, r) { return sum + Number(r['점수'] || 0); }, 0);
    return { seq: s['순번'], number: s['번호'], name: s['이름'], activityScore: activity, total: activity };
  });
}
