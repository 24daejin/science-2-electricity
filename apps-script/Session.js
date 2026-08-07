/**
 * 교사 주도 실시간 진행 제어 (멘티미터 방식).
 * 소단원(1~6)별로 한 행을 두고, 교사가 "현재문항ID"·"진행상태" 값을 시트에서 바꾸면
 * Sync.js가 Firestore(sessionState 컬렉션)로 밀어넣고, 학생 화면은 Firestore 실시간
 * 리스너로 이를 즉시 받습니다(폴링 없음). 이 파일의 getSessionState/setSessionState API는
 * 시트를 직접 읽는 예전 경로로, 디버깅이나 향후 교사용 제어 화면을 위해 남겨둡니다 —
 * 현재 학생 화면은 이 API를 쓰지 않고 Firestore를 직접 구독합니다.
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

  // 시트 수정 트리거를 기다리지 않고 Firestore에도 바로 반영(학생 화면은 이걸 실시간으로 받음).
  try {
    Firestore_setDocument('sessionState', subunitId, {
      currentQuestionId: rowObj.현재문항ID,
      status: rowObj.진행상태,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.name,
    });
  } catch (e) {
    // Firestore가 아직 설정되지 않았을 수 있음 — 시트 저장은 이미 성공했으니 조용히 넘어간다.
  }

  return { saved: true };
}
