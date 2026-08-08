/**
 * "관련 내용 답하기" 챗봇의 AI 루브릭 평가를 교사가 검수(확인/수정 후 승인)하는 화면의 백엔드.
 * 학부모 포털은 승인상태="승인"인 평가만 보여줍니다(Parent.js) — AI가 채점을 잘못했을 때
 * 학부모에게 그대로 노출되는 것을 막기 위한 안전장치입니다. 교사 대시보드는 검수 전이라도
 * 참고용으로 그대로 보여줍니다(Dashboard.js).
 */

/** action=listPendingChatbotEvals: 승인 대기 중인 평가 전체 + 각 세션의 대화 전문을 함께 반환합니다. */
function ChatbotEval_listPending(payload, auth) {
  requireTeacher_(auth);

  var evalRows = SheetUtils_getRows(SHEET_NAMES.CHATBOT_EVAL) || [];
  var pending = evalRows.filter(function (r) { return String(r['승인상태'] || '대기') !== '승인'; });
  if (!pending.length) return [];

  var neededSessions = {};
  pending.forEach(function (r) { neededSessions[r['세션ID']] = true; });

  var chatRows = SheetUtils_getRows(SHEET_NAMES.CHATBOT_LOG) || [];
  var turnsBySession = {};
  chatRows.forEach(function (r) {
    var sid = r['세션ID'];
    if (!neededSessions[sid]) return;
    if (!turnsBySession[sid]) turnsBySession[sid] = [];
    turnsBySession[sid].push({
      turnNumber: Number(r['턴번호']),
      speaker: r['발화자'],
      message: r['메시지'],
    });
  });
  Object.keys(turnsBySession).forEach(function (sid) {
    turnsBySession[sid].sort(function (a, b) { return a.turnNumber - b.turnNumber; });
  });

  return pending
    .map(function (r) {
      return {
        sessionId: r['세션ID'],
        seq: r['순번'],
        name: r['이름'],
        classroom: r['반'],
        number: r['번호'],
        concept: r['개념'],
        standard: r['성취기준'] || '',
        stars: r['별점'] ? Number(r['별점']) : null,
        rationale: r['평가근거'] || '',
        time: r['시각'],
        turns: turnsBySession[r['세션ID']] || [],
      };
    })
    .sort(function (a, b) { return new Date(a.time) - new Date(b.time); });
}

/** action=approveChatbotEval: 교사가 확인(필요하면 별점/평가근거 수정)한 뒤 승인 — 이후 학부모 포털에 노출됩니다. */
function ChatbotEval_approve(payload, auth) {
  requireTeacher_(auth);
  var sessionId = String(payload.sessionId || '').trim();
  if (!sessionId) throw new Error('sessionId가 필요합니다.');

  var rows = SheetUtils_getRows(SHEET_NAMES.CHATBOT_EVAL);
  if (!rows) throw new Error('챗봇_평가 시트가 없습니다.');
  var existing = rows.find(function (r) { return String(r['세션ID']) === sessionId; });
  if (!existing) throw new Error('해당 평가를 찾을 수 없습니다.');

  var rowObj = {
    세션ID: existing['세션ID'],
    순번: existing['순번'],
    이름: existing['이름'],
    반: existing['반'],
    번호: existing['번호'],
    개념: existing['개념'],
    성취기준: existing['성취기준'],
    별점: payload.stars ? Number(payload.stars) : existing['별점'],
    평가근거: payload.rationale !== undefined && payload.rationale !== null ? String(payload.rationale) : existing['평가근거'],
    시각: existing['시각'],
    승인상태: '승인',
    검수시각: new Date(),
    검수자: auth.name,
  };
  SheetUtils_updateRow(SHEET_NAMES.CHATBOT_EVAL, CHATBOT_EVAL_HEADERS, existing._row, rowObj);
  return { approved: true };
}

/** action=rejectChatbotEval: AI 채점이 쓸 만하지 않을 때 — 평가 자체를 삭제합니다(학부모에게도 노출 안 됨). */
function ChatbotEval_reject(payload, auth) {
  requireTeacher_(auth);
  var sessionId = String(payload.sessionId || '').trim();
  if (!sessionId) throw new Error('sessionId가 필요합니다.');

  var rows = SheetUtils_getRows(SHEET_NAMES.CHATBOT_EVAL);
  if (!rows) throw new Error('챗봇_평가 시트가 없습니다.');
  var existing = rows.find(function (r) { return String(r['세션ID']) === sessionId; });
  if (!existing) throw new Error('해당 평가를 찾을 수 없습니다.');

  SheetUtils_deleteRow(SHEET_NAMES.CHATBOT_EVAL, existing._row);
  return { rejected: true };
}
