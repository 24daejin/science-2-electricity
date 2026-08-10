/**
 * 교사 주도 실시간 진행 제어 (멘티미터 방식).
 *
 * 세션 상태는 "반 + 소단원"별로 한 행을 둡니다 — 반마다(그리고 교사 2인이 각자 다른 반을
 * 동시에 진행할 수 있으므로) 지금 어떤 소단원을 수업 중인지가 서로 달라야 하기 때문입니다.
 * 교사가 이 상태를 바꾸면 Sync.js/이 파일이 Firestore(sessionState 컬렉션, 문서ID는
 * "반_소단원ID")로 밀어넣고, 학생 화면은 자기 반으로 스코프된 문서만 실시간 구독합니다.
 */

var SESSION_STATE_HEADERS = ['반', '소단원ID', '현재문항ID', '진행상태', '수정시각', '수정자'];

function Session_docId_(classroom, subunitId) {
  return classroom + '_' + subunitId;
}

function Session_getState(payload) {
  var classroom = String(payload.classroom || '').trim();
  var subunitId = String(payload.subunitId || '').trim();
  if (!classroom || !subunitId) throw new Error('classroom, subunitId가 필요합니다.');

  var rows = SheetUtils_getRows(SHEET_NAMES.SESSION_STATE);
  if (rows === null) {
    SheetUtils_ensureSheet(SHEET_NAMES.SESSION_STATE, SESSION_STATE_HEADERS);
    rows = [];
  }

  var row = rows.find(function (r) {
    return String(r['반']).trim() === classroom && String(r['소단원ID']).trim() === subunitId;
  });
  if (!row) {
    return { classroom: classroom, subunitId: subunitId, currentQuestionId: null, status: '대기', updatedAt: null };
  }
  return {
    classroom: classroom,
    subunitId: subunitId,
    currentQuestionId: row['현재문항ID'] || null,
    status: row['진행상태'] || '대기',
    updatedAt: row['수정시각'] || null,
  };
}

function Session_setState(payload, auth) {
  requireTeacher_(auth);
  var classroom = String(payload.classroom || '').trim();
  var subunitId = String(payload.subunitId || '').trim();
  if (!classroom || !subunitId) throw new Error('classroom, subunitId가 필요합니다.');

  var rows = SheetUtils_getRows(SHEET_NAMES.SESSION_STATE);
  if (rows === null) {
    SheetUtils_ensureSheet(SHEET_NAMES.SESSION_STATE, SESSION_STATE_HEADERS);
    rows = [];
  }

  var existing = rows.find(function (r) {
    return String(r['반']).trim() === classroom && String(r['소단원ID']).trim() === subunitId;
  });
  var rowObj = {
    반: classroom,
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
    Firestore_setDocument('sessionState', Session_docId_(classroom, subunitId), {
      classroom: classroom,
      subunitId: subunitId,
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
