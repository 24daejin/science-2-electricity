/**
 * 전기와 자기 학습 플랫폼 — Apps Script 백엔드 진입점.
 *
 * 프론트엔드는 항상 Content-Type: text/plain 으로 POST 요청을 보내고,
 * 본문은 JSON 문자열입니다: { action, authToken, payload }.
 * (Content-Type: application/json을 쓰면 브라우저가 preflight(OPTIONS)를 먼저 보내는데,
 *  Apps Script 웹앱은 OPTIONS 메서드를 지원하지 않아 요청이 실패합니다. 절대 쓰지 마세요.)
 *
 * 인증: Google OAuth 없이 자체 로그인(반+번호+이름+반코드 / 교사 이름+비밀번호)을 사용합니다.
 * 로그인 성공 시 발급되는 authToken(CacheService 기반, 6시간 유효)을 이후 요청마다 함께 보냅니다.
 */

function doGet(e) {
  return jsonOutput_({
    ok: true,
    message: '전기와 자기 학습 플랫폼 API가 정상 동작 중입니다.',
    time: new Date().toISOString(),
  });
}

// action 이름 -> { fn: function(payload, auth), auth: boolean(기본 true) }
function getRoutes_() {
  return {
    // 인증 (로그인 자체는 토큰이 없는 상태에서 호출되므로 auth: false)
    login: { fn: Auth_login, auth: false },

    // 진단평가
    getDiagnosticQuestions: { fn: Diagnostic_getQuestions, auth: true },
    submitDiagnosticResponse: { fn: Diagnostic_submitResponse, auth: true },
    getDiagnosticAttemptCounts: { fn: Diagnostic_getAttemptCounts, auth: true },

    // 형성평가 (6개 소단원 공용)
    getFormativeQuestions: { fn: Formative_getQuestions, auth: true },
    submitFormativeResponse: { fn: Formative_submitResponse, auth: true },
    getFormativeAttemptCounts: { fn: Formative_getAttemptCounts, auth: true },

    // 점수 (학생: 본인 점수만 / 교사: 반 전체)
    getMyScore: { fn: Score_getMine, auth: true },
    getClassScores: { fn: Score_getClassScores, auth: true },

    // 교과서 활동("해보기") — 페이지 이미지 위 빈칸에 쓴 답 저장/복원
    getMyActivityResponses: { fn: Activity_getMyResponses, auth: true },
    submitActivityResponse: { fn: Activity_submitResponse, auth: true },

    // "관련 내용 답하기" 챗봇
    startChatbotSession: { fn: Chatbot_start, auth: true },
    sendChatbotMessage: { fn: Chatbot_sendMessage, auth: true },

    // 챗봇 AI 루브릭 평가 검수 (교사 전용, 핸들러 내부에서 검사) — 승인해야 학부모 포털에 노출됨
    listPendingChatbotEvals: { fn: ChatbotEval_listPending, auth: true },
    approveChatbotEval: { fn: ChatbotEval_approve, auth: true },
    rejectChatbotEval: { fn: ChatbotEval_reject, auth: true },

    // 이탈(탭 전환) 로그
    logDropout: { fn: DropoutLog_record, auth: true },

    // 교사 주도 실시간 진행 상태 (반+소단원 단위)
    getSessionState: { fn: Session_getState, auth: true },
    setSessionState: { fn: Session_setState, auth: true }, // 교사 여부는 핸들러 내부에서 검사
    setClassActiveSubunit: { fn: Session_setClassActiveSubunit, auth: true }, // 메인 화면의 "반별 오늘 수업 소단원" 빠른 설정
    getAllSessionStates: { fn: Session_getAllStates, auth: true },

    // 반 공통 로그인코드 관리 (교사 전용, 핸들러 내부에서 검사)
    listClassCodes: { fn: ClassCode_list, auth: true },
    setClassCode: { fn: ClassCode_set, auth: true },

    // 명단 관리 (교사 전용, 핸들러 내부에서 검사)
    listRoster: { fn: Roster_list, auth: true },
    upsertRosterEntry: { fn: Roster_upsert, auth: true },
    deleteRosterEntry: { fn: Roster_delete, auth: true },
    regenerateParentCode: { fn: Roster_regenerateParentCode, auth: true },
    bulkGenerateParentCodes: { fn: Roster_bulkGenerateParentCodes, auth: true },

    // 소단원별 추가 자료(웹앱/링크) — 조회는 학생/교사 모두, 관리는 교사 전용(핸들러 내부에서 검사)
    listSubunitResources: { fn: SubunitResource_list, auth: true },
    upsertSubunitResource: { fn: SubunitResource_upsert, auth: true },
    deleteSubunitResource: { fn: SubunitResource_delete, auth: true },

    // 교사 대시보드 (교사 전용, 핸들러 내부에서 검사)
    getClassDashboard: { fn: Dashboard_getClassSummary, auth: true },
    getStudentDetail: { fn: Dashboard_getStudentDetail, auth: true },

    // 학부모 포털 (학부모 전용, 본인 자녀만 조회 가능)
    getParentView: { fn: Parent_getView, auth: true },
  };
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (parseErr) {
    return jsonOutput_({ ok: false, error: '요청 본문을 파싱할 수 없습니다(JSON 문자열이어야 합니다).' });
  }

  var routes = getRoutes_();
  var route = routes[body.action];
  if (!route) {
    return jsonOutput_({ ok: false, error: '알 수 없는 action: ' + body.action });
  }

  var auth = null;
  if (route.auth !== false) {
    var verify = verifyAuthToken_(body.authToken);
    if (!verify.ok) {
      return jsonOutput_({ ok: false, error: verify.error || '인증 실패' });
    }
    auth = verify.user;
  }

  try {
    var data = route.fn(body.payload || {}, auth);
    return jsonOutput_({ ok: true, data: data });
  } catch (err) {
    return jsonOutput_({ ok: false, error: err.message });
  }
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
