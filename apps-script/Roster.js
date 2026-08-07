/**
 * 학생명단 CRUD + 반 공통 로그인코드 관리 (모두 교사 전용).
 * 학생명단/반코드 탭이 아직 마스터 시트에 없다면, 최초 호출 시 헤더와 함께 자동 생성합니다.
 */

var ROSTER_HEADERS = ['학번', '이름', '반', '구글 계정 이메일', '상태', '비고'];
var CLASS_CODE_HEADERS = ['반', '코드', '수정시각', '수정자'];

function Roster_list(payload, auth) {
  requireTeacher_(auth);
  var rows = SheetUtils_getRows(SHEET_NAMES.ROSTER);
  if (rows === null) {
    SheetUtils_ensureSheet(SHEET_NAMES.ROSTER, ROSTER_HEADERS);
    rows = [];
  }
  return rows.map(function (r) {
    return {
      studentId: r['학번'],
      name: r['이름'],
      classroom: r['반'],
      email: r['구글 계정 이메일'],
      status: r['상태'],
      note: r['비고'],
    };
  });
}

function Roster_upsert(payload, auth) {
  requireTeacher_(auth);
  var studentId = String(payload.studentId || '').trim();
  if (!studentId) throw new Error('학번은 필수입니다.');

  var rows = SheetUtils_getRows(SHEET_NAMES.ROSTER);
  if (rows === null) {
    SheetUtils_ensureSheet(SHEET_NAMES.ROSTER, ROSTER_HEADERS);
    rows = [];
  }

  var existing = rows.find(function (r) { return String(r['학번']).trim() === studentId; });
  var rowObj = {
    학번: studentId,
    이름: payload.name || '',
    반: payload.classroom || '',
    '구글 계정 이메일': payload.email || '',
    상태: payload.status || '활성',
    비고: payload.note || '',
  };

  if (existing) {
    SheetUtils_updateRow(SHEET_NAMES.ROSTER, ROSTER_HEADERS, existing._row, rowObj);
    return { updated: true, studentId: studentId };
  }
  SheetUtils_appendRow(SHEET_NAMES.ROSTER, ROSTER_HEADERS, rowObj);
  return { created: true, studentId: studentId };
}

function Roster_delete(payload, auth) {
  requireTeacher_(auth);
  var studentId = String(payload.studentId || '').trim();
  if (!studentId) throw new Error('학번은 필수입니다.');

  var rows = SheetUtils_getRows(SHEET_NAMES.ROSTER);
  if (!rows) throw new Error('학생명단 시트가 없습니다.');
  var existing = rows.find(function (r) { return String(r['학번']).trim() === studentId; });
  if (!existing) throw new Error('해당 학번을 찾을 수 없습니다: ' + studentId);

  SheetUtils_deleteRow(SHEET_NAMES.ROSTER, existing._row);
  return { deleted: true, studentId: studentId };
}

/** action=listClassCodes: 반별 로그인코드 목록 (교사 전용) */
function ClassCode_list(payload, auth) {
  requireTeacher_(auth);
  var rows = SheetUtils_getRows(SHEET_NAMES.CLASS_CODES);
  if (rows === null) {
    SheetUtils_ensureSheet(SHEET_NAMES.CLASS_CODES, CLASS_CODE_HEADERS);
    rows = [];
  }
  return rows.map(function (r) {
    return { classroom: r['반'], code: r['코드'], updatedAt: r['수정시각'], updatedBy: r['수정자'] };
  });
}

/** action=setClassCode: 반 로그인코드 생성/변경 (교사 전용) */
function ClassCode_set(payload, auth) {
  requireTeacher_(auth);
  var classroom = String(payload.classroom || '').trim();
  var code = String(payload.code || '').trim();
  if (!classroom || !code) throw new Error('반과 코드를 모두 입력해주세요.');

  var rows = SheetUtils_getRows(SHEET_NAMES.CLASS_CODES);
  if (rows === null) {
    SheetUtils_ensureSheet(SHEET_NAMES.CLASS_CODES, CLASS_CODE_HEADERS);
    rows = [];
  }

  var existing = rows.find(function (r) { return String(r['반']).trim() === classroom; });
  var rowObj = { 반: classroom, 코드: code, 수정시각: new Date(), 수정자: auth.name };

  if (existing) {
    SheetUtils_updateRow(SHEET_NAMES.CLASS_CODES, CLASS_CODE_HEADERS, existing._row, rowObj);
  } else {
    SheetUtils_appendRow(SHEET_NAMES.CLASS_CODES, CLASS_CODE_HEADERS, rowObj);
  }
  return { saved: true };
}
