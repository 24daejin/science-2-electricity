/**
 * 구글 시트(교사가 편집하는 SSOT) -> Firestore(학생 화면이 읽는 빠른 사본) 동기화.
 *
 * 시트는 그대로 문항/진행상태 편집 도구로 남고, 학생 화면은 Apps Script(느림) 대신
 * Firestore에서 직접 읽습니다. 세션_상태는 Firestore 실시간 리스너로 폴링을 대체합니다.
 *
 * 최초 1회, Apps Script 편집기에서 이 파일을 열고 함수 목록에서 Sync_setup을 선택해
 * 직접 실행(▶)하세요 — 자동 동기화 트리거가 설치되고 최초 전체 동기화가 실행됩니다.
 * 그 뒤로는 시트를 수정할 때마다 몇 초 안에 자동으로 Firestore에 반영됩니다.
 */

function Sync_diagnosticQuestions() {
  var rows = SheetUtils_getRows(SHEET_NAMES.DIAGNOSTIC_QUESTIONS);
  if (!rows) return;
  var ids = [];
  rows.forEach(function (r) {
    var id = String(r['문항ID'] || '').trim();
    if (!id) return;
    ids.push(id);
    Firestore_setDocument('diagnosticQuestions', id, {
      priorArea: r['선수학습 영역'] || '',
      linkedConcept: r['연결 개념(중등 단원)'] || '',
      question: r['문제'] || '',
      choices: [r['보기1'], r['보기2'], r['보기3'], r['보기4']],
      answer: Number(r['정답(번호)']),
      feedback: {
        correct_confident: r['피드백_정답_확신'] || '',
        correct_unsure: r['피드백_정답_비확신'] || '',
        incorrect_confident: r['피드백_오답_확신'] || '',
        incorrect_unsure: r['피드백_오답_비확신'] || '',
      },
    });
  });
  Firestore_pruneCollection('diagnosticQuestions', ids);
}

function Sync_formativeQuestions() {
  var rows = SheetUtils_getRows(SHEET_NAMES.FORMATIVE_QUESTIONS);
  if (!rows) return;
  var ids = [];
  rows.forEach(function (r) {
    var id = String(r['문항ID'] || '').trim();
    if (!id) return;
    ids.push(id);
    Firestore_setDocument('formativeQuestions', id, {
      subunitId: String(r['소단원ID'] || '').trim(),
      subunitName: r['소단원명'] || '',
      coreConcept: r['핵심개념'] || '',
      standard: r['성취기준'] || '',
      question: r['문제'] || '',
      choices: [r['보기1'], r['보기2'], r['보기3'], r['보기4']],
      answer: Number(r['정답(번호)']),
      feedback: {
        correct_confident: r['피드백_정답_확신'] || '',
        correct_unsure: r['피드백_정답_비확신'] || '',
        incorrect_confident: r['피드백_오답_확신'] || '',
        incorrect_unsure: r['피드백_오답_비확신'] || '',
      },
    });
  });
  Firestore_pruneCollection('formativeQuestions', ids);
}

function Sync_sessionState() {
  var rows = SheetUtils_getRows(SHEET_NAMES.SESSION_STATE);
  if (!rows) return;
  var ids = [];
  rows.forEach(function (r) {
    var classroom = String(r['반'] || '').trim();
    var subunitId = String(r['소단원ID'] || '').trim();
    if (!classroom || !subunitId) return; // "반" 헤더가 아직 없거나 반이 비어있는 예전 행은 건너뜀
    var docId = Session_docId_(classroom, subunitId);
    ids.push(docId);
    Firestore_setDocument('sessionState', docId, {
      classroom: classroom,
      subunitId: subunitId,
      currentQuestionId: r['현재문항ID'] || '',
      status: r['진행상태'] || '대기',
      updatedAt: new Date().toISOString(),
      updatedBy: r['수정자'] || '',
    });
  });
  Firestore_pruneCollection('sessionState', ids);
}

/** 전체 동기화. 수동 메뉴("지금 동기화") 또는 최초 설정(Sync_setup)에서 호출됩니다. */
function Sync_all() {
  Sync_diagnosticQuestions();
  Sync_formativeQuestions();
  Sync_sessionState();
}

/**
 * 최초 1회 수동 실행용. 자동 동기화 트리거(시트 수정 시 + 시트 열 때 메뉴 추가)를 설치하고
 * 최초 전체 동기화를 실행합니다. Apps Script 편집기에서 이 함수를 선택해 ▶ 실행하세요.
 */
function Sync_setup() {
  Sync_removeTriggers_();
  var ssId = getSpreadsheetId_();
  ScriptApp.newTrigger('Sync_onEditTrigger').forSpreadsheet(ssId).onEdit().create();
  ScriptApp.newTrigger('Sync_onOpenTrigger').forSpreadsheet(ssId).onOpen().create();
  Sync_all();
}

function Sync_removeTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'Sync_onEditTrigger' || fn === 'Sync_onOpenTrigger') {
      ScriptApp.deleteTrigger(t);
    }
  });
}

/** 설치형 onOpen 트리거: 시트를 열 때 수동 동기화 메뉴를 추가합니다. */
function Sync_onOpenTrigger() {
  SpreadsheetApp.getUi()
    .createMenu('전기와자기 플랫폼')
    .addItem('지금 Firestore로 동기화', 'Sync_all')
    .addToUi();
}

/** 설치형 onEdit 트리거: 수정된 탭만 골라 동기화합니다. */
function Sync_onEditTrigger(e) {
  if (!e || !e.range) return;
  var sheetName = e.range.getSheet().getName();
  if (sheetName === SHEET_NAMES.DIAGNOSTIC_QUESTIONS) Sync_diagnosticQuestions();
  else if (sheetName === SHEET_NAMES.FORMATIVE_QUESTIONS) Sync_formativeQuestions();
  else if (sheetName === SHEET_NAMES.SESSION_STATE) Sync_sessionState();
}
