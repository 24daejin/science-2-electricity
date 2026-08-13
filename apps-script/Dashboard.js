/**
 * 대시보드 3종:
 *  - Dashboard_getClassSummary: 교사용, 반별 → 학생별 진단평가 정답률 + 챗봇 참여 요약.
 *  - Dashboard_getStudentDetail: 교사용, 학생 한 명의 상세(전체 응답 이력 + 챗봇 대화 전문).
 *    학기말 생활기록부 작성 참고 자료로도 그대로 활용할 수 있도록 원본 데이터를 시간순으로 보여줌.
 *  - Dashboard_getMyDashboard: 학생 본인용 "내 대시보드". 반 평균/친구 비교 없이 본인의
 *    점수·진단평가 결과(+ 오답 개념 설명)·챗봇 평가만 보여주는 동기부여용 요약.
 *
 * (형성평가는 종이 학습지로 진행하므로 이 앱은 더 이상 형성평가 데이터를 다루지 않습니다.)
 *
 * 소단원별로 "관련 내용 답하기"(챗봇) 결과를 볼 수 있도록, 형성평가_문항의 소단원명/핵심개념 →
 * 소단원ID 매핑을 만들어 챗봇_로그의 "개념" 값과 연결합니다(문항 자체는 안 쓰고 매핑 용도로만 참조).
 */

/** 형성평가_문항 기준 "소단원명" 또는 "핵심개념" 문자열 → 소단원ID 매핑. 챗봇 개념 문자열과 매칭할 때 씁니다. */
function Dashboard_buildConceptSubunitMap_() {
  var rows = SheetUtils_getRows(SHEET_NAMES.FORMATIVE_QUESTIONS) || [];
  var map = {};
  rows.forEach(function (r) {
    var id = String(r['소단원ID'] || '').trim();
    if (!id) return;
    var subName = String(r['소단원명'] || '').trim();
    var concept = String(r['핵심개념'] || '').trim();
    if (subName) map[subName] = id;
    if (concept) map[concept] = id;
  });
  return map;
}

// 진단평가 확신도 라벨 -> 버킷. frontend/assets/js/confidence.js의 CONFIDENCE_TAGS와 동일한 규칙
// (진짜 개념 이해에 기반한 확신만 "확신", 소거법/추측은 "비확신")을 서버에서도 써서, 학생이
// 실제로 봤던 것과 같은 피드백 문구를 "내 대시보드"에서도 그대로 보여줍니다.
var DIAGNOSTIC_CONFIDENCE_BUCKET_BY_LABEL = {
  '정확하게 알고 있음': 'confident',
  '다른 것들이 아니라서': 'unsure',
  '정확하게는 잘 모르겠음': 'unsure',
};

/**
 * 학생 한 명의 진단평가 결과 + "다시 봐야 할 개념" 목록을 계산합니다(Dashboard_getMyDashboard 전용).
 * 문항마다 최신 시도만 반영합니다(재도전 시 이전 오답은 무시 — 학생 화면과 동일한 규칙).
 * 개념 설명은 새로 생성하지 않고, 진단평가_문항에 교사가 이미 써둔 오답 피드백(확신/비확신 2종
 * 중 그 학생이 실제로 골랐던 확신도에 맞는 것)을 그대로 재사용합니다.
 */
function Dashboard_buildDiagnosticReview_(seq) {
  var responses = (SheetUtils_getRows(SHEET_NAMES.DIAGNOSTIC_RESPONSES) || [])
    .filter(function (r) { return String(r['순번']) === seq; })
    .sort(function (a, b) { return new Date(a['제출시각']) - new Date(b['제출시각']); });

  var latestByQuestion = {};
  responses.forEach(function (r) { latestByQuestion[r['문항ID']] = r; }); // 뒤에 온 게 이전 걸 덮어써서 최신 시도만 남음

  var questionRows = SheetUtils_getRows(SHEET_NAMES.DIAGNOSTIC_QUESTIONS) || [];
  var questionById = {};
  questionRows.forEach(function (r) { questionById[String(r['문항ID']).trim()] = r; });

  var answeredIds = Object.keys(latestByQuestion);
  var correctCount = answeredIds.filter(function (qid) { return latestByQuestion[qid]['정오답'] === '정답'; }).length;

  var weakConcepts = [];
  var seenConcepts = {};
  answeredIds.forEach(function (qid) {
    var resp = latestByQuestion[qid];
    if (resp['정오답'] === '정답') return;
    var q = questionById[qid];
    if (!q) return;
    var concept = String(q['연결 개념(중등 단원)'] || '').trim();
    if (!concept || seenConcepts[concept]) return; // 같은 개념 문항이 여러 개면 한 번만 보여줌
    seenConcepts[concept] = true;

    var bucket = DIAGNOSTIC_CONFIDENCE_BUCKET_BY_LABEL[resp['확신도']] || 'unsure';
    var feedbackField = bucket === 'confident' ? '피드백_오답_확신' : '피드백_오답_비확신';

    weakConcepts.push({
      concept: concept,
      priorArea: q['선수학습 영역'] || '',
      question: q['문제'] || '',
      explanation: q[feedbackField] || '',
    });
  });

  return {
    diagnosticAnswered: answeredIds.length,
    diagnosticCorrect: correctCount,
    weakConcepts: weakConcepts,
  };
}

/**
 * 학생 한 명의 소단원별 챗봇 참여(세션수/평균 별점)를 계산합니다.
 * Dashboard_getClassSummary(반 전체)와 Dashboard_getMyDashboard(학생 본인용)가 공유합니다.
 */
function Dashboard_buildStudentSubunitSummary_(seq, chatLogs, evalBySession, conceptSubunitMap) {
  var chats = chatLogs.filter(function (r) { return String(r['순번']) === seq; });

  // 챗봇 로그는 턴 단위 행이므로, 세션ID별 대표 개념을 한 번씩만 뽑아둔다.
  var sessionConcept = {};
  chats.forEach(function (r) {
    if (!sessionConcept[r['세션ID']]) sessionConcept[r['세션ID']] = r['개념'];
  });

  var bySubunit = {};
  function ensureSub(id) {
    if (!bySubunit[id]) bySubunit[id] = { chatbotSessions: 0, starSum: 0, starCount: 0 };
    return bySubunit[id];
  }

  Object.keys(sessionConcept).forEach(function (sid) {
    var subId = conceptSubunitMap[sessionConcept[sid]];
    if (!subId) return;
    var sub = ensureSub(subId);
    sub.chatbotSessions += 1;
    var evalRow = evalBySession[sid];
    if (evalRow && evalRow['별점']) {
      sub.starSum += Number(evalRow['별점']);
      sub.starCount += 1;
    }
  });

  var subunitSummary = {};
  Object.keys(bySubunit).forEach(function (id) {
    var sub = bySubunit[id];
    subunitSummary[id] = {
      chatbotSessions: sub.chatbotSessions,
      chatbotAvgStars: sub.starCount ? Math.round((sub.starSum / sub.starCount) * 10) / 10 : null,
    };
  });

  return { subunitSummary: subunitSummary, chatbotSessionCount: Object.keys(sessionConcept).length };
}

function Dashboard_getClassSummary(payload, auth) {
  requireTeacher_(auth);
  var classroom = String(payload.classroom || '').trim();
  if (!classroom) throw new Error('classroom이 필요합니다.');

  var roster = SheetUtils_getRows(SHEET_NAMES.ROSTER) || [];
  var students = roster.filter(function (r) {
    return String(r['반']).trim() === classroom && String(r['학적']).trim() === '재학';
  });

  var diagResponses = SheetUtils_getRows(SHEET_NAMES.DIAGNOSTIC_RESPONSES) || [];
  var chatLogs = SheetUtils_getRows(SHEET_NAMES.CHATBOT_LOG) || [];
  var chatEvals = SheetUtils_getRows(SHEET_NAMES.CHATBOT_EVAL) || [];
  var conceptSubunitMap = Dashboard_buildConceptSubunitMap_();

  var evalBySession = {};
  chatEvals.forEach(function (r) { evalBySession[r['세션ID']] = r; });

  var summaries = students.map(function (s) {
    var seq = String(s['순번']);
    var diag = diagResponses.filter(function (r) { return String(r['순번']) === seq; });

    var summary = Dashboard_buildStudentSubunitSummary_(seq, chatLogs, evalBySession, conceptSubunitMap);

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
      chatbotSessionCount: summary.chatbotSessionCount,
      subunitSummary: summary.subunitSummary,
    };
  });

  summaries.sort(function (a, b) { return Number(a.number) - Number(b.number); });
  return { classroom: classroom, students: summaries };
}

/**
 * 학생 본인용 "내 대시보드" — Dashboard_getStudentDetail(교사 전용, seq를 payload로 받음)과 달리
 * 항상 auth.seq(로그인한 본인)만 조회합니다. 반 평균/친구 비교는 일부러 넣지 않습니다.
 */
function Dashboard_getMyDashboard(payload, auth) {
  requireStudent_(auth);
  var seq = String(auth.seq);

  var roster = SheetUtils_getRows(SHEET_NAMES.ROSTER) || [];
  var student = roster.find(function (r) { return String(r['순번']) === seq; });

  var chatEvals = SheetUtils_getRows(SHEET_NAMES.CHATBOT_EVAL) || [];
  var scoreRows = (SheetUtils_getRows(SHEET_NAMES.SCORE_LOG) || []).filter(function (r) {
    return String(r['순번']) === seq;
  });

  var sumBy = function (type) {
    return scoreRows
      .filter(function (r) { return r['유형'] === type; })
      .reduce(function (sum, r) { return sum + Number(r['점수'] || 0); }, 0);
  };

  // 교사가 [챗봇 평가 검수]에서 승인한 평가만 보여줍니다(학부모 포털과 같은 안전장치 —
  // AI 채점 오류가 검수 전에 그대로 학생에게 노출되는 걸 막기 위함).
  var evaluations = chatEvals
    .filter(function (r) { return String(r['순번']) === seq && String(r['승인상태'] || '') === '승인'; })
    .map(function (r) {
      return {
        sessionId: r['세션ID'],
        concept: r['개념'],
        standard: r['성취기준'],
        stars: Number(r['별점']) || 0,
        rationale: r['평가근거'],
        time: r['시각'],
      };
    })
    .sort(function (a, b) { return new Date(a.time) - new Date(b.time); });

  var diagnosticReview = Dashboard_buildDiagnosticReview_(seq);

  return {
    student: {
      name: student ? student['이름'] : auth.name,
      classroom: auth.classroom,
      number: auth.number,
    },
    activityScore: sumBy('교과서활동'),
    diagnosticAnswered: diagnosticReview.diagnosticAnswered,
    diagnosticCorrect: diagnosticReview.diagnosticCorrect,
    weakConcepts: diagnosticReview.weakConcepts,
    chatbotEvaluations: evaluations,
  };
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
  var activityResponses = (SheetUtils_getRows(SHEET_NAMES.ACTIVITY_RESPONSES) || [])
    .filter(function (r) { return String(r['순번']) === seq && String(r['답변'] || '').trim(); })
    .map(function (r) {
      return { activityId: r['활동ID'], questionId: r['문항ID'], answer: r['답변'], time: r['수정시각'] };
    });
  var chatRows = (SheetUtils_getRows(SHEET_NAMES.CHATBOT_LOG) || []).filter(function (r) {
    return String(r['순번']) === seq;
  });
  var evalRows = (SheetUtils_getRows(SHEET_NAMES.CHATBOT_EVAL) || []).filter(function (r) {
    return String(r['순번']) === seq;
  });
  // 이탈(탭 전환) 로그는 강제 조치 없이 참고용으로만 함께 보여줍니다(README 유의사항 참고).
  var dropoutLog = (SheetUtils_getRows(SHEET_NAMES.DROPOUT_LOG) || [])
    .filter(function (r) { return String(r['순번']) === seq; })
    .sort(function (a, b) { return new Date(a['시각']) - new Date(b['시각']); })
    .map(function (r) {
      return { time: r['시각'], screen: r['화면'] || '', event: r['이벤트'] || '' };
    });
  var evalBySession = {};
  evalRows.forEach(function (r) { evalBySession[r['세션ID']] = r; });

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
    var evalRow = evalBySession[sid];
    s.stars = evalRow && evalRow['별점'] ? Number(evalRow['별점']) : null;
    s.rationale = evalRow ? evalRow['평가근거'] : '';
    s.standard = evalRow ? evalRow['성취기준'] : '';
    // 대시보드는 교사 본인용 참고자료라 검수 전(대기) 평가도 그대로 보여주되, 상태를 함께 표시합니다.
    s.evalApproved = !!evalRow && String(evalRow['승인상태'] || '') === '승인';
    return s;
  });

  diag.sort(function (a, b) { return new Date(a['제출시각']) - new Date(b['제출시각']); });

  // 소단원별로 챗봇 세션을 묶어서 반환(대시보드 화면이 이 단위로 카드를 그림).
  var conceptSubunitMap = Dashboard_buildConceptSubunitMap_();
  var bySubunit = {};
  function ensureSub(id) {
    if (!bySubunit[id]) bySubunit[id] = { chatbotSessions: [] };
    return bySubunit[id];
  }
  ['1', '2', '3', '4', '5', '6'].forEach(ensureSub);
  sessions.forEach(function (s) {
    var id = conceptSubunitMap[s.concept];
    if (!id) return;
    ensureSub(id).chatbotSessions.push(s);
  });

  return {
    student: {
      seq: student['순번'],
      name: student['이름'],
      classroom: student['반'],
      number: student['번호'],
    },
    diagnosticResponses: diag,
    activityResponses: activityResponses,
    chatbotSessions: sessions,
    subunitBreakdown: bySubunit,
    dropoutLog: dropoutLog,
  };
}
