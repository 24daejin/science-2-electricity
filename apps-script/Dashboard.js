/**
 * 교사 대시보드: 반별 → 학생별 진행률/정답률 요약, 학생별 상세(전체 응답 이력 + 챗봇 대화 전문).
 * 학생 상세는 학기말 생활기록부 작성 참고 자료로도 그대로 활용할 수 있도록
 * 원본 데이터를 가공 없이 시간순으로 보여줍니다.
 */

function Dashboard_getClassSummary(payload, auth) {
  requireTeacher_(auth);
  var classroom = String(payload.classroom || '').trim();
  if (!classroom) throw new Error('classroom이 필요합니다.');

  var roster = SheetUtils_getRows(SHEET_NAMES.ROSTER) || [];
  var students = roster.filter(function (r) {
    return String(r['반']).trim() === classroom && String(r['학적']).trim() === '재학';
  });

  var diagResponses = SheetUtils_getRows(SHEET_NAMES.DIAGNOSTIC_RESPONSES) || [];
  var formResponses = SheetUtils_getRows(SHEET_NAMES.FORMATIVE_RESPONSES) || [];
  var chatLogs = SheetUtils_getRows(SHEET_NAMES.CHATBOT_LOG) || [];

  var summaries = students.map(function (s) {
    var seq = String(s['순번']);
    var diag = diagResponses.filter(function (r) { return String(r['순번']) === seq; });
    var form = formResponses.filter(function (r) { return String(r['순번']) === seq; });

    var chatSessionIds = {};
    chatLogs.forEach(function (r) {
      if (String(r['순번']) === seq) chatSessionIds[r['세션ID']] = true;
    });

    // 소단원별: 마지막 시도 기준으로 몇 문항을 풀었고 몇 문항을 맞혔는지
    var bySubunit = {};
    form.forEach(function (r) {
      var subunitId = String(r['소단원ID']);
      if (!bySubunit[subunitId]) bySubunit[subunitId] = {};
      bySubunit[subunitId][r['문항ID']] = r['정오답'] === '정답';
    });
    var subunitSummary = {};
    Object.keys(bySubunit).forEach(function (id) {
      var qIds = Object.keys(bySubunit[id]);
      var correct = qIds.filter(function (qid) { return bySubunit[id][qid]; }).length;
      subunitSummary[id] = { answered: qIds.length, correct: correct };
    });

    var diagByQuestion = {};
    diag.forEach(function (r) { diagByQuestion[r['문항ID']] = r['정오답'] === '정답'; });
    var diagQIds = Object.keys(diagByQuestion);

    return {
      seq: s['순번'],
      number: s['번호'],
      name: s['이름'],
      diagnosticAnswered: diagQIds.length,
      diagnosticCorrect: diagQIds.filter(function (qid) { return diagByQuestion[qid]; }).length,
      diagnosticAttempts: diag.length,
      formativeAttempts: form.length,
      chatbotSessionCount: Object.keys(chatSessionIds).length,
      subunitSummary: subunitSummary,
    };
  });

  summaries.sort(function (a, b) { return Number(a.number) - Number(b.number); });
  return { classroom: classroom, students: summaries };
}

function Dashboard_getStudentDetail(payload, auth) {
  requireTeacher_(auth);
  var seq = String(payload.seq || '').trim();
  if (!seq) throw new Error('seq가 필요합니다.');

  var roster = SheetUtils_getRows(SHEET_NAMES.ROSTER) || [];
  var student = roster.find(function (r) { return String(r['순번']) === seq; });
  if (!student) throw new Error('학생을 찾을 수 없습니다.');

  var diag = (SheetUtils_getRows(SHEET_NAMES.DIAGNOSTIC_RESPONSES) || []).filter(function (r) {
    return String(r['순번']) === seq;
  });
  var form = (SheetUtils_getRows(SHEET_NAMES.FORMATIVE_RESPONSES) || []).filter(function (r) {
    return String(r['순번']) === seq;
  });
  var chatRows = (SheetUtils_getRows(SHEET_NAMES.CHATBOT_LOG) || []).filter(function (r) {
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
    sessionMap[sid].turns.push({
      turnNumber: Number(r['턴번호']),
      speaker: r['발화자'],
      message: r['메시지'],
      time: r['시각'],
    });
  });
  var sessions = sessionOrder.map(function (sid) {
    var s = sessionMap[sid];
    s.turns.sort(function (a, b) { return a.turnNumber - b.turnNumber; });
    return s;
  });

  diag.sort(function (a, b) { return new Date(a['제출시각']) - new Date(b['제출시각']); });
  form.sort(function (a, b) { return new Date(a['제출시각']) - new Date(b['제출시각']); });

  return {
    student: {
      seq: student['순번'],
      name: student['이름'],
      classroom: student['반'],
      number: student['번호'],
    },
    diagnosticResponses: diag,
    formativeResponses: form,
    chatbotSessions: sessions,
  };
}
