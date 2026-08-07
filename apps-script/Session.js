/**
 * 교사 주도 실시간 진행 제어 (멘티미터 방식, 폴링 기반).
 * 소단원(1~6)별로 한 행을 두고, 교사가 "현재문항ID"·"진행상태" 값을 바꾸면
 * 학생 화면이 2~3초 폴링으로 이를 감지해 화면을 맞춥니다.
 *
 * 교사 대시보드가 이번 범위에서 제외되었으므로, 교사는 세션_상태 탭을
 * 시트에서 직접 편집하거나(가장 간단), setSessionState API(교사 인증 필요)를
 * 통해 갱신할 수 있습니다.
 */

var SESSION_STATE_HEADERS = ['소단원ID', '현재문항ID', '진행상태', '수정시각', '수정자'];

function Session_getState(payload) {
  var subunitId = String(payload.subunitId || '').trim();
  if (!subunitId) throw new Error('subunitId가 필요합니다.');

  var rows = SheetUtils_getRows(SHEET_NAMES.SESSION_STATE);
  if (rows === null) {
    SheetUtils_ensureSheet(SHEET_NAMES.SESSION_STATE, SESSION_STATE_HEADERS);
    rows = [];
  }

  var row = rows.find(function (r) { return String(r['소단원ID']).trim() === subunitId; });
  if (!row) {
    return { subunitId: subunitId, currentQuestionId: null, status: '대기', updatedAt: null };
  }
  return {
    subunitId: subunitId,
    currentQuestionId: row['현재문항ID'] || null,
    status: row['진행상태'] || '대기',
    updatedAt: row['수정시각'] || null,
  };
}

function Session_setState(payload, auth) {
  requireTeacher_(auth);
  var subunitId = String(payload.subunitId || '').trim();
  if (!subunitId) throw new Error('subunitId가 필요합니다.');

  var rows = SheetUtils_getRows(SHEET_NAMES.SESSION_STATE);
  if (rows === null) {
    SheetUtils_ensureSheet(SHEET_NAMES.SESSION_STATE, SESSION_STATE_HEADERS);
    rows = [];
  }

  var existing = rows.find(function (r) { return String(r['소단원ID']).trim() === subunitId; });
  var rowObj = {
    소단원ID: subunitId,
    현재문항ID: payload.currentQuestionId || '',
    진행상태: payload.status || '진행중',
    수정시각: new Date(),
    수정자: auth.name,
  };

  if (existing) {
    SheetUtils_updateRow(SHEET_NAMES.SESSION_STATE, SESSION_STATE_HEADERS, existing._row, rowObj);
  } else {
    SheetUtils_appendRow(SHEET_NAMES.SESSION_STATE, SESSION_STATE_HEADERS, rowObj);
  }
  return { saved: true };
}
