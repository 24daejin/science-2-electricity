/**
 * 학부모 포털 백엔드. 로그인한 학부모는 오직 본인 자녀(auth.seq)의 데이터만 조회할 수 있습니다
 * — payload로 다른 학생의 seq를 받지 않고 항상 auth에 들어있는 값만 사용합니다.
 */

function Parent_getView(payload, auth) {
  requireParent_(auth);
  var seq = String(auth.seq);

  var roster = SheetUtils_getRows(SHEET_NAMES.ROSTER) || [];
  var student = roster.find(function (r) { return String(r['순번']) === seq; });

  var diag = (SheetUtils_getRows(SHEET_NAMES.DIAGNOSTIC_RESPONSES) || []).filter(function (r) {
    return String(r['순번']) === seq;
  });
  var form = (SheetUtils_getRows(SHEET_NAMES.FORMATIVE_RESPONSES) || []).filter(function (r) {
    return String(r['순번']) === seq;
  });
  var chatRows = (SheetUtils_getRows(SHEET_NAMES.CHATBOT_LOG) || []).filter(function (r) {
    return String(r['순번']) === seq;
  });
  var evalRows = (SheetUtils_getRows(SHEET_NAMES.CHATBOT_EVAL) || []).filter(function (r) {
    return String(r['순번']) === seq;
  });
  var scoreRows = (SheetUtils_getRows(SHEET_NAMES.SCORE_LOG) || []).filter(function (r) {
    return String(r['순번']) === seq;
  });

  var sessionMap = {};
  var sessionOrder = [];
  chatRows.forEach(function (r) {
    var sid = r['세션ID'];
    if (!sessionMap[sid]) {
      sessionMap[sid] = { sessionId: sid, concept: r['개념'], turns: [] };
      sessionOrder.push(sid);
    }
    sessionMap[sid].turns.push({ turnNumber: Number(r['턴번호']), speaker: r['발화자'], message: r['메시지'], time: r['시각'] });
  });
  var sessions = sessionOrder.map(function (sid) {
    var s = sessionMap[sid];
    s.turns.sort(function (a, b) { return a.turnNumber - b.turnNumber; });
    return s;
  });

  var evaluations = evalRows.map(function (r) {
    return {
      sessionId: r['세션ID'],
      concept: r['개념'],
      standard: r['성취기준'],
      stars: Number(r['별점']) || 0,
      rationale: r['평가근거'],
      time: r['시각'],
    };
  });

  var sumBy = function (type) {
    return scoreRows
      .filter(function (r) { return r['유형'] === type; })
      .reduce(function (sum, r) { return sum + Number(r['점수'] || 0); }, 0);
  };

  diag.sort(function (a, b) { return new Date(a['제출시각']) - new Date(b['제출시각']); });
  form.sort(function (a, b) { return new Date(a['제출시각']) - new Date(b['제출시각']); });

  return {
    student: {
      name: student ? student['이름'] : auth.studentName,
      classroom: auth.classroom,
      number: auth.number,
    },
    quizScore: sumBy('문제풀이'),
    activityScore: sumBy('교과서활동'),
    diagnosticResponses: diag,
    formativeResponses: form,
    chatbotSessions: sessions,
    chatbotEvaluations: evaluations,
  };
}
