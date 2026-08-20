/**
 * 학부모 포털 백엔드. 로그인한 학부모는 오직 본인 자녀(auth.seq)의 데이터만 조회할 수 있습니다
 * — payload로 다른 학생의 seq를 받지 않고 항상 auth에 들어있는 값만 사용합니다.
 *
 * 교과서 활동 내용은 학생 동의 없이 항상 노출됩니다 — 학부모 포털 자체가 이미 학생별로
 * 발급된 고유 학부모코드로만 접근 가능하므로(다른 학생 정보를 볼 수 없음), 별도 동의 절차를
 * 두지 않기로 했습니다(교사가 학기 말에 학부모코드를 나눠주는 시점에 실질적으로 공개됨).
 */

function Parent_getView(payload, auth) {
  requireParent_(auth);
  var seq = String(auth.seq);

  var roster = SheetUtils_getRows(SHEET_NAMES.ROSTER) || [];
  var student = roster.find(function (r) { return String(r['순번']) === seq; });

  var diag = (SheetUtils_getRows(SHEET_NAMES.DIAGNOSTIC_RESPONSES) || []).filter(function (r) {
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

  // 교사가 [챗봇 평가 검수]에서 승인한 평가만 학부모에게 공개합니다(AI 채점 오류가
  // 그대로 노출되는 것을 막기 위한 안전장치 — ChatbotEvalReview.js 참고).
  var evaluations = evalRows
    .filter(function (r) { return String(r['승인상태'] || '') === '승인'; })
    .map(function (r) {
      return {
        sessionId: r['세션ID'],
        concept: r['개념'],
        standard: r['성취기준'],
        stars: Number(r['별점']) || 0,
        rationale: r['평가근거'],
        time: r['시각'],
      };
    });

  var activityScore = scoreRows
    .filter(function (r) { return r['유형'] === '교과서활동'; })
    .reduce(function (sum, r) { return sum + Number(r['점수'] || 0); }, 0);

  diag.sort(function (a, b) { return new Date(a['제출시각']) - new Date(b['제출시각']); });

  // 답변이 있는 모든 교과서 활동 응답을 그대로 보여준다(동의 절차 없음 — 위 docblock 참고).
  var activityResponses = (SheetUtils_getRows(SHEET_NAMES.ACTIVITY_RESPONSES) || [])
    .filter(function (r) { return String(r['순번']) === seq && String(r['답변'] || '').trim(); })
    .map(function (r) {
      return {
        activityId: r['활동ID'],
        questionId: r['문항ID'],
        answer: r['답변'],
        time: r['수정시각'],
      };
    });

  return {
    student: {
      name: student ? student['이름'] : auth.studentName,
      classroom: auth.classroom,
      number: auth.number,
    },
    activityScore: activityScore,
    activityResponses: activityResponses,
    diagnosticResponses: diag,
    chatbotSessions: sessions,
    chatbotEvaluations: evaluations,
  };
}
