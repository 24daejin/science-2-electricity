/**
 * 학생명단 CRUD + 반 공통 로그인코드 관리 (모두 교사 전용).
 * 학생명단 실제 컬럼: 순번(고유키, 자동 부여), 학년, 반, 번호, 이름, 학적(재학/그 외).
 * 학생명단/반코드 탭이 아직 마스터 시트에 없다면, 최초 호출 시 헤더와 함께 자동 생성합니다.
 */

var ROSTER_HEADERS = ['순번', '학년', '반', '번호', '이름', '학적', '학부모코드'];
var CLASS_CODE_HEADERS = ['반', '코드', '수정시각', '수정자'];

/** 학부모 로그인용 고유 코드. 학생끼리 겹치지 않도록 매번 새로 생성합니다. */
function generateParentCode_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
}

function Roster_list(payload, auth) {
  requireTeacher_(auth);
  var rows = SheetUtils_getRows(SHEET_NAMES.ROSTER);
  if (rows === null) {
    SheetUtils_ensureSheet(SHEET_NAMES.ROSTER, ROSTER_HEADERS);
    rows = [];
  }
  return rows
    .map(function (r) {
      return {
        seq: r['순번'],
        grade: r['학년'],
        classroom: r['반'],
        number: r['번호'],
        name: r['이름'],
        enrollment: r['학적'],
        parentCode: r['학부모코드'] || '',
      };
    })
    .sort(function (a, b) { return Number(a.seq) - Number(b.seq); });
}

function Roster_upsert(payload, auth) {
  requireTeacher_(auth);
  var name = String(payload.name || '').trim();
  var classroom = String(payload.classroom || '').trim();
  var number = String(payload.number || '').trim();
  if (!name || !classroom || !number) {
    throw new Error('반, 번호, 이름은 필수입니다.');
  }

  var rows = SheetUtils_getRows(SHEET_NAMES.ROSTER);
  if (rows === null) {
    SheetUtils_ensureSheet(SHEET_NAMES.ROSTER, ROSTER_HEADERS);
    rows = [];
  }

  var seq = payload.seq ? String(payload.seq).trim() : '';
  var existing = seq ? rows.find(function (r) { return String(r['순번']).trim() === seq; }) : null;

  if (!seq) {
    var maxSeq = rows.reduce(function (max, r) { return Math.max(max, Number(r['순번']) || 0); }, 0);
    seq = String(maxSeq + 1);
  }

  var parentCode = existing && existing['학부모코드'] ? existing['학부모코드'] : generateParentCode_();

  var rowObj = {
    순번: seq,
    학년: payload.grade || '2',
    반: classroom,
    번호: number,
    이름: name,
    학적: payload.enrollment || '재학',
    학부모코드: parentCode,
  };

  if (existing) {
    SheetUtils_updateRow(SHEET_NAMES.ROSTER, ROSTER_HEADERS, existing._row, rowObj);
    return { updated: true, seq: seq, parentCode: parentCode };
  }
  SheetUtils_appendRow(SHEET_NAMES.ROSTER, ROSTER_HEADERS, rowObj);
  return { created: true, seq: seq, parentCode: parentCode };
}

/** action=regenerateParentCode: 이 학생의 학부모 코드를 새로 발급합니다(기존 코드는 즉시 무효화). */
function Roster_regenerateParentCode(payload, auth) {
  requireTeacher_(auth);
  var seq = String(payload.seq || '').trim();
  if (!seq) throw new Error('seq가 필요합니다.');

  var rows = SheetUtils_getRows(SHEET_NAMES.ROSTER);
  if (!rows) throw new Error('학생명단 시트가 없습니다.');
  var existing = rows.find(function (r) { return String(r['순번']).trim() === seq; });
  if (!existing) throw new Error('해당 순번을 찾을 수 없습니다: ' + seq);

  var newCode = generateParentCode_();
  var rowObj = {
    순번: existing['순번'],
    학년: existing['학년'],
    반: existing['반'],
    번호: existing['번호'],
    이름: existing['이름'],
    학적: existing['학적'],
    학부모코드: newCode,
  };
  SheetUtils_updateRow(SHEET_NAMES.ROSTER, ROSTER_HEADERS, existing._row, rowObj);
  return { seq: seq, parentCode: newCode };
}

function Roster_delete(payload, auth) {
  requireTeacher_(auth);
  var seq = String(payload.seq || '').trim();
  if (!seq) throw new Error('순번은 필수입니다.');

  var rows = SheetUtils_getRows(SHEET_NAMES.ROSTER);
  if (!rows) throw new Error('학생명단 시트가 없습니다.');
  var existing = rows.find(function (r) { return String(r['순번']).trim() === seq; });
  if (!existing) throw new Error('해당 순번을 찾을 수 없습니다: ' + seq);

  SheetUtils_deleteRow(SHEET_NAMES.ROSTER, existing._row);
  return { deleted: true, seq: seq };
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
