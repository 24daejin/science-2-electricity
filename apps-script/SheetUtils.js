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
 * SheetUtils_getRows를 CacheService로 감쌉니다. 매 요청마다 스프레드시트를 여는
 * 비용(폴링처럼 자주 호출되는 경로에서 특히 큼)을 줄이기 위한 성능 최적화입니다.
 * ttlSeconds 동안은 시트를 다시 읽지 않고 캐시를 반환합니다 — 그만큼 "교사가 시트를
 * 수정하면 즉시 반영"이 최대 ttlSeconds만큼 늦어질 수 있습니다. 앱을 통한 쓰기(추가/수정/
 * 삭제)는 SheetUtils_appendRow/updateRow/deleteRow가 자동으로 캐시를 무효화하므로 즉시
 * 반영되고, 이 지연은 "시트를 직접 편집했을 때"에만 해당합니다.
 */
function SheetUtils_getRowsCached(sheetName, ttlSeconds) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'rows_' + sheetName;
  var cached = cache.get(cacheKey);
  if (cached !== null) {
    if (cached === '__NULL__') return null;
    try {
      return JSON.parse(cached);
    } catch (e) {
      // 캐시 값이 깨졌으면 무시하고 새로 읽는다.
    }
  }

  var rows = SheetUtils_getRows(sheetName);
  try {
    var serialized = rows === null ? '__NULL__' : JSON.stringify(rows);
    if (serialized.length < 95000) {
      cache.put(cacheKey, serialized, ttlSeconds);
    }
  } catch (e) {
    // 캐시 저장 실패는 무시 — 다음 요청도 시트를 다시 읽을 뿐 기능에는 영향 없음.
  }
  return rows;
}

/** 해당 시트에 대한 캐시를 무효화합니다. 앱을 통한 모든 쓰기(append/update/delete)에서 자동 호출됩니다. */
function SheetUtils_invalidateCache_(sheetName) {
  CacheService.getScriptCache().remove('rows_' + sheetName);
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
  SheetUtils_invalidateCache_(sheetName);
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
  SheetUtils_invalidateCache_(sheetName);
}

/** _row 번호로 한 행을 삭제합니다. */
function SheetUtils_deleteRow(sheetName, rowNumber) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('시트를 찾을 수 없습니다: ' + sheetName);
  sheet.deleteRow(rowNumber);
  SheetUtils_invalidateCache_(sheetName);
}
