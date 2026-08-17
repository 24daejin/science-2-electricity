/**
 * 학부모 포털 백엔드. 로그인한 학부모는 오직 본인 자녀(auth.seq)의 데이터만 조회할 수 있습니다
 * — payload로 다른 학생의 seq를 받지 않고 항상 auth에 들어있는 값만 사용합니다.
 *
 * 교과서 활동 내용은 기본적으로 비공개입니다 — 학생이 활동 화면에서 직접 "부모님께 공개"에
 * 동의한 활동만(활동_공개동의 시트, 옵트인) 여기 노출됩니다. 동의 안 한 활동은 이 함수
 * 자체에서 걸러지므로, 학부모 화면 코드가 따로 필터링할 필요가 없습니다.
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

  // 학생이 "부모님께 공개"에 동의한 활동만 골라서, 그 활동의 문항 응답을 붙여준다(옵트인).
  var consentedActivities = {}; // { 활동ID: 활동명 }
  (SheetUtils_getRows(SHEET_NAMES.ACTIVITY_CONSENT) || [])
    .filter(function (r) { return String(r['순번']) === seq && String(r['동의여부']) === '예'; })
    .forEach(function (r) { consentedActivities[String(r['활동ID']).trim()] = r['활동명'] || r['활동ID']; });

  var activityResponses = (SheetUtils_getRows(SHEET_NAMES.ACTIVITY_RESPONSES) || [])
    .filter(function (r) {
      return (
        String(r['순번']) === seq &&
        consentedActivities.hasOwnProperty(String(r['활동ID']).trim()) &&
        String(r['답변'] || '').trim()
      );
    })
    .map(function (r) {
      return {
        activityId: r['활동ID'],
        activityTitle: consentedActivities[String(r['활동ID']).trim()],
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
