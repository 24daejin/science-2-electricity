/**
 * 소단원별 추가 자료(웹앱/링크) 관리.
 * 형성평가·"관련 내용 답하기" 외에 소단원마다 추가로 연결하고 싶은 웹앱/자료 링크를
 * 코드 수정 없이 이 시트에서 관리합니다. 홈 화면(학생/교사 모두)이 그대로 읽어서
 * 소단원 카드 안에 버튼으로 보여줍니다. 관리는 roster/index.html 화면에서 합니다.
 */

var SUBUNIT_RESOURCE_HEADERS = ['ID', '소단원ID', '이름', '링크', '설명', '등록시각'];

/** action=listSubunitResources: 로그인만 되어 있으면 학생/교사 누구나 조회 가능(홈 화면에서 사용). */
function SubunitResource_list(payload, auth) {
  var rows = SheetUtils_getRows(SHEET_NAMES.SUBUNIT_RESOURCES);
  if (rows === null) {
    SheetUtils_ensureSheet(SHEET_NAMES.SUBUNIT_RESOURCES, SUBUNIT_RESOURCE_HEADERS);
    rows = [];
  }
  return rows
    .map(function (r) {
      return { id: r['ID'], subunitId: String(r['소단원ID']), name: r['이름'], url: r['링크'], desc: r['설명'] || '' };
    })
    .sort(function (a, b) { return Number(a.subunitId) - Number(b.subunitId); });
}

/** action=upsertSubunitResource: 교사 전용. payload.id가 있으면 수정, 없으면 새로 추가. */
function SubunitResource_upsert(payload, auth) {
  requireTeacher_(auth);
  var subunitId = String(payload.subunitId || '').trim();
  var name = String(payload.name || '').trim();
  var url = String(payload.url || '').trim();
  if (!subunitId || !name || !url) throw new Error('소단원, 이름, 링크는 필수입니다.');

  var rows = SheetUtils_getRows(SHEET_NAMES.SUBUNIT_RESOURCES);
  if (rows === null) {
    SheetUtils_ensureSheet(SHEET_NAMES.SUBUNIT_RESOURCES, SUBUNIT_RESOURCE_HEADERS);
    rows = [];
  }

  var id = payload.id ? String(payload.id).trim() : '';
  var existing = id ? rows.find(function (r) { return String(r['ID']) === id; }) : null;
  if (!id) id = Utilities.getUuid();

  var rowObj = {
    ID: id,
    소단원ID: subunitId,
    이름: name,
    링크: url,
    설명: payload.desc || '',
    등록시각: existing ? existing['등록시각'] : new Date(),
  };

  if (existing) {
    SheetUtils_updateRow(SHEET_NAMES.SUBUNIT_RESOURCES, SUBUNIT_RESOURCE_HEADERS, existing._row, rowObj);
  } else {
    SheetUtils_appendRow(SHEET_NAMES.SUBUNIT_RESOURCES, SUBUNIT_RESOURCE_HEADERS, rowObj);
  }
  return { id: id };
}

/** action=deleteSubunitResource: 교사 전용. */
function SubunitResource_delete(payload, auth) {
  requireTeacher_(auth);
  var id = String(payload.id || '').trim();
  if (!id) throw new Error('id가 필요합니다.');

  var rows = SheetUtils_getRows(SHEET_NAMES.SUBUNIT_RESOURCES);
  if (!rows) throw new Error('소단원_자료 시트가 없습니다.');
  var existing = rows.find(function (r) { return String(r['ID']) === id; });
  if (!existing) throw new Error('해당 자료를 찾을 수 없습니다.');

  SheetUtils_deleteRow(SHEET_NAMES.SUBUNIT_RESOURCES, existing._row);
  return { deleted: true };
}
