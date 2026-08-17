/**
 * 학부모 포털 백엔드. 로그인한 학부모는 오직 본인 자녀(auth.seq)의 데이터만 조회할 수 있습니다
 * — payload로 다른 학생의 seq를 받지 않고 항상 auth에 들어있는 값만 사용합니다.
 *
 * 교과서 활동 내용은 기본적으로 비공개입니다. 활동마다 따로 동의를 받지 않고, 학생 홈 화면에서
 * 딱 한 번(전역) "부모님께 공개" 여부를 정합니다(학부모_공개동의 시트, 옵트인 — 학생이 직접
 * 켜야만 공개되고, 언제든 다시 꺼서 철회할 수 있습니다. 교사가 대신 켤 수 있는 경로는 없음).
 * 동의 안 한 학생은 activityResponses가 이 함수 자체에서 빈 배열로 걸러지므로, 학부모 화면
 * 코드가 따로 필터링할 필요가 없습니다.
 */

var PARENT_CONSENT_HEADERS = ['순번', '이름', '반', '번호', '동의여부', '수정시각'];

function Parent_findConsentRow_(seq) {
  var rows = SheetUtils_getRows(SHEET_NAMES.PARENT_CONSENT) || [];
  return rows.find(function (r) { return String(r['순번']) === String(seq); });
}

/** action=getParentConsent: 이 학생이 (활동 전체를) 학부모에게 공개하기로 동의했는지. 기본은 false(비공개). */
function Parent_getConsent(payload, auth) {
  var existing = Parent_findConsentRow_(auth.seq);
  return { consent: !!existing && String(existing['동의여부']) === '예' };
}

/**
 * action=setParentConsent: 학생이 홈 화면에서 직접 동의/철회합니다(옵트인 — 기본 비공개,
 * 학생이 켜야만 학부모 포털에 모든 교과서 활동 답변이 노출됨). 활동마다 따로 묻지 않고
 * 학생 1명당 한 행만 유지합니다. 교사가 대신 켤 수 있는 경로는 의도적으로 두지 않았습니다.
 */
function Parent_setConsent(payload, auth) {
  requireStudent_(auth);
  var consent = !!payload.consent;

  var rowObj = {
    순번: auth.seq || '',
    이름: auth.name || '',
    반: auth.classroom || '',
    번호: auth.number || '',
    동의여부: consent ? '예' : '아니오',
    수정시각: new Date(),
  };

  var existing = Parent_findConsentRow_(auth.seq);
  if (existing) {
    SheetUtils_updateRow(SHEET_NAMES.PARENT_CONSENT, PARENT_CONSENT_HEADERS, existing._row, rowObj);
  } else {
    SheetUtils_appendRow(SHEET_NAMES.PARENT_CONSENT, PARENT_CONSENT_HEADERS, rowObj);
  }
  return { saved: true, consent: consent };
}

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

  // 학생이 홈 화면에서 "부모님께 공개"에 동의했으면(전역, 활동 단위 아님) 답변이 있는 모든
  // 교과서 활동 응답을 붙여준다(옵트인). 동의 안 했으면 빈 배열.
  var consentRow = Parent_findConsentRow_(seq);
  var hasConsent = !!consentRow && String(consentRow['동의여부']) === '예';

  var activityResponses = !hasConsent
    ? []
    : (SheetUtils_getRows(SHEET_NAMES.ACTIVITY_RESPONSES) || [])
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
