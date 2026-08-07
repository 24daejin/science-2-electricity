/**
 * Google Sheets 읽기/쓰기 공통 유틸.
 * 문항·명단 데이터는 이 유틸을 통해서만 읽습니다 — 코드에 하드코딩하지 않습니다(SSOT 원칙).
 */

var SHEET_NAMES = {
  ROSTER: '학생명단',
  CLASS_CODES: '반코드',
  DIAGNOSTIC_QUESTIONS: '진단평가_문항',
  FORMATIVE_QUESTIONS: '형성평가_문항',
  DIAGNOSTIC_RESPONSES: '진단평가_응답',
  FORMATIVE_RESPONSES: '형성평가_응답',
  CHATBOT_LOG: '챗봇_로그',
  DROPOUT_LOG: '이탈_로그',
  SESSION_STATE: '세션_상태',
};

/**
 * 시트를 헤더 행 기준으로 읽어 [{헤더명: 값, ..., _row: 실제시트행번호}, ...] 로 반환합니다.
 * 시트 자체가 존재하지 않으면 null을 반환합니다 (호출부가 "아직 준비 안 됨"으로 처리).
 */
function SheetUtils_getRows(sheetName) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return null;

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var isBlank = row.every(function (c) { return c === '' || c === null; });
    if (isBlank) continue;
    var obj = { _row: i + 1 };
    headers.forEach(function (h, idx) { obj[h] = row[idx]; });
    rows.push(obj);
  }
  return rows;
}

/**
 * 시트가 없으면 헤더와 함께 새로 만들고, 있으면 그대로 반환합니다.
 * (진단평가_응답/형성평가_응답/챗봇_로그/이탈_로그/세션_상태처럼 Apps Script가 자동 관리하는 탭에 사용)
 */
function SheetUtils_ensureSheet(sheetName, headers) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    return sheet;
  }
  var firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var isEmpty = firstRow.every(function (c) { return c === '' || c === null; });
  if (isEmpty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** headers 순서에 맞춰 한 행을 추가합니다. rowObj에 없는 컬럼은 빈 문자열로 채웁니다. */
function SheetUtils_appendRow(sheetName, headers, rowObj) {
  var sheet = SheetUtils_ensureSheet(sheetName, headers);
  var row = headers.map(function (h) {
    return rowObj[h] !== undefined && rowObj[h] !== null ? rowObj[h] : '';
  });
  sheet.appendRow(row);
}

/** SheetUtils_getRows가 반환한 _row(실제 시트 행 번호)를 이용해 한 행을 통째로 갱신합니다. */
function SheetUtils_updateRow(sheetName, headers, rowNumber, rowObj) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('시트를 찾을 수 없습니다: ' + sheetName);
  var row = headers.map(function (h) {
    return rowObj[h] !== undefined && rowObj[h] !== null ? rowObj[h] : '';
  });
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
}

/** _row 번호로 한 행을 삭제합니다. */
function SheetUtils_deleteRow(sheetName, rowNumber) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('시트를 찾을 수 없습니다: ' + sheetName);
  sheet.deleteRow(rowNumber);
}
