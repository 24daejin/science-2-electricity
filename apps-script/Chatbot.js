/**
 * "관련 내용 답하기" 챗봇: 질문 먼저 던지는 소크라테스식 자기설명 챗봇.
 * - 사전에 정해진 질문 트리를 쓰지 않고, 학생 답변을 바탕으로 Claude가 매번 다음 질문을 새로 생성합니다.
 * - 최대 5턴(챗봇 질문 5회) 후 종료하며, 다룬/놓친 개념 요약을 제공합니다.
 * - 전체 대화를 챗봇_로그에 저장합니다. 대화 상태는 챗봇_로그를 진실 공급원으로 재구성합니다(클라이언트 조작 방지).
 */

var CHATBOT_LOG_HEADERS = ['세션ID', '턴번호', '발화자', '메시지', '개념', '순번', '이름', '반', '번호', '시각'];
var CHATBOT_MAX_TURNS = 5;

// 개념은 더 이상 고정된 6개 화이트리스트로 검증하지 않습니다. 형성평가_문항의 "핵심개념" 값은
// 문항별 세부 개념(예: "원자의 구조")이라 6개보다 훨씬 다양하고, 시트가 SSOT이므로
// 코드에 하드코딩된 목록과 어긋나면 안 되기 때문입니다. 홈 화면의 "직접 선택" 진입점만
// 6개 소단원명을 안내용으로 보여주고, 실제로는 어떤 개념 문자열이 와도 챗봇을 시작합니다.

function Chatbot_buildSystemPrompt_(concept) {
  return [
    '너는 중학교 과학 "전기와 자기" 단원을 가르치는 파인만 기법 기반 소크라테스식 튜터야.',
    '오늘 다룰 개념은 "' + concept + '"이야.',
    '',
    '규칙:',
    '1. 네가 먼저 설명하지 마. 항상 질문으로 이끌고, 학생의 방금 답변에 실제로 반응해서 다음 질문을 그때그때 새로 만들어. 미리 정해둔 질문 목록을 순서대로 따라가지 마.',
    '2. 파인만 기법을 따라: 학생이 자기 언어로 설명하게 하고 -> 막히거나 애매한 지점을 찾아내고 -> 그 지점을 짧고 구체적인 다음 질문으로 파고들어.',
    '3. 학생이 틀리거나 막혀도 정답을 바로 알려주지 말고, 더 쉬운 하위 질문이나 일상 속 비유로 스스로 도달하도록 도와.',
    '4. 한 번에 질문 하나만, 2~3문장 이내로 짧게. 중학생 눈높이의 다정하고 격려하는 말투.',
    '5. 대전 순서(대전열)는 이 단원 지도 범위에서 완전히 제외돼. 절대 언급하거나 질문하지 마.',
  ].join('\n');
}

function Chatbot_buildSummaryPrompt_(concept) {
  return [
    '지금까지의 대화를 바탕으로 "' + concept + '" 개념에 대해',
    '학생이 스스로 잘 설명해낸 부분과, 여전히 헷갈려하거나 다루지 못한 부분을 각각 불릿 2~3개로 정리해줘.',
    '마지막 줄에는 다음에 복습하면 좋을 한 가지를 짧게 제안해줘.',
    '대전 순서(대전열)는 절대 언급하지 마.',
    '학생에게 직접 말하듯 친근한 말투로, 전체 5~7문장 이내로 작성해줘.',
  ].join('\n');
}

/** 성취기준 대비 5점 루브릭 채점 프롬프트. 학부모에게도 공개되므로 근거를 명확히 요구합니다. */
function Chatbot_buildRubricPrompt_(concept, standard) {
  return [
    '너는 중학교 과학 교사다. 아래는 학생과 "' + concept + '" 개념에 대해 나눈 소크라테스식 대화 전체 기록이다.',
    standard ? '이 대화는 성취기준 "' + standard + '"와 관련이 있다.' : '',
    '이 대화만 근거로 삼아, 학생의 개념 이해도를 5점 만점 루브릭으로 채점하라.',
    '',
    '루브릭:',
    '5점 - 개념을 정확히, 자기 언어로 설명하고 예시나 응용까지 스스로 제시함',
    '4점 - 개념을 대체로 정확히 설명함(사소한 오류만 있음)',
    '3점 - 핵심은 이해했으나 설명이 불완전하거나 부분적 오개념이 있음',
    '2점 - 개념을 단편적으로만 이해, 오개념이 여러 곳에서 드러남',
    '1점 - 대화만으로는 개념을 이해했다고 보기 어려움',
    '',
    '아래 형식만 정확히 지켜서 답하라(다른 말 덧붙이지 마):',
    '별점: (1~5 중 하나의 정수)',
    '평가: (이 학생이 무엇을 잘 이해했고 무엇이 부족했는지, 대화 내용을 근거로 3~4문장. 학부모가 읽을 것이므로 정중하고 건설적인 어투)',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Claude의 "별점: N / 평가: ..." 형식 응답을 파싱합니다. */
function Chatbot_parseRubric_(text) {
  var starMatch = String(text || '').match(/별점\s*[:：]\s*([1-5])/);
  var rationaleMatch = String(text || '').match(/평가\s*[:：]\s*([\s\S]*)/);
  return {
    stars: starMatch ? Number(starMatch[1]) : null,
    rationale: rationaleMatch ? rationaleMatch[1].trim() : String(text || '').trim(),
  };
}

/** 형성평가_문항에서 이 개념(핵심개념 또는 소단원명)과 연결된 성취기준을 찾습니다. 못 찾으면 빈 문자열. */
function Chatbot_findStandardForConcept_(concept) {
  var rows = SheetUtils_getRows(SHEET_NAMES.FORMATIVE_QUESTIONS);
  if (!rows) return '';
  var match = rows.find(function (r) {
    return String(r['핵심개념']).trim() === concept || String(r['소단원명']).trim() === concept;
  });
  return match ? match['성취기준'] : '';
}

var CHATBOT_EVAL_HEADERS = ['세션ID', '순번', '이름', '반', '번호', '개념', '성취기준', '별점', '평가근거', '시각'];

function ChatbotEval_save_(sessionId, concept, standard, rubric, auth) {
  SheetUtils_appendRow(SHEET_NAMES.CHATBOT_EVAL, CHATBOT_EVAL_HEADERS, {
    세션ID: sessionId,
    순번: auth.seq || '',
    이름: auth.name || '',
    반: auth.classroom || '',
    번호: auth.number || '',
    개념: concept,
    성취기준: standard || '',
    별점: rubric.stars || '',
    평가근거: rubric.rationale || '',
    시각: new Date(),
  });
}

function Chatbot_readHistory_(sessionId) {
  var rows = SheetUtils_getRows(SHEET_NAMES.CHATBOT_LOG);
  if (!rows) return [];
  return rows
    .filter(function (r) { return String(r['세션ID']) === sessionId; })
    .sort(function (a, b) { return Number(a['턴번호']) - Number(b['턴번호']); });
}

function Chatbot_appendLog_(sessionId, turnNumber, speaker, message, concept, auth) {
  SheetUtils_appendRow(SHEET_NAMES.CHATBOT_LOG, CHATBOT_LOG_HEADERS, {
    세션ID: sessionId,
    턴번호: turnNumber,
    발화자: speaker,
    메시지: message,
    개념: concept,
    순번: auth.seq || '',
    이름: auth.name || '',
    반: auth.classroom || '',
    번호: auth.number || '',
    시각: new Date(),
  });
}

/** action=startChatbotSession: 새 세션을 만들고 첫 질문을 생성합니다. */
function Chatbot_start(payload, auth) {
  var concept = String(payload.concept || '').trim();
  if (!concept) throw new Error('concept이 필요합니다.');

  var sessionId = Utilities.getUuid();
  var systemPrompt = Chatbot_buildSystemPrompt_(concept);

  var firstQuestion = Claude_callMessages(
    systemPrompt,
    [{ role: 'user', content: '(대화 시작) 학생에게 "' + concept + '"를 스스로 설명해보라고 요청하는 첫 질문을 던져줘.' }],
    300
  );

  Chatbot_appendLog_(sessionId, 1, '챗봇', firstQuestion, concept, auth);

  return {
    sessionId: sessionId,
    concept: concept,
    turnNumber: 1,
    maxTurns: CHATBOT_MAX_TURNS,
    message: firstQuestion,
    isFinal: false,
  };
}

/** action=sendChatbotMessage: 학생 답변을 받아 다음 질문(또는 최종 요약)을 생성합니다. */
function Chatbot_sendMessage(payload, auth) {
  var sessionId = payload.sessionId;
  var concept = payload.concept;
  var studentMessage = payload.message;
  if (!sessionId || !concept || !studentMessage) {
    throw new Error('sessionId, concept, message가 모두 필요합니다.');
  }

  var history = Chatbot_readHistory_(sessionId);
  if (history.length === 0) throw new Error('존재하지 않는 세션입니다. 새로 시작해주세요.');

  var lastTurnNumber = Number(history[history.length - 1]['턴번호']);
  var studentTurnNumber = lastTurnNumber + 1;
  Chatbot_appendLog_(sessionId, studentTurnNumber, '학생', studentMessage, concept, auth);

  var botTurnsSoFar = history.filter(function (r) { return r['발화자'] === '챗봇'; }).length;
  var reachedMaxTurns = botTurnsSoFar >= CHATBOT_MAX_TURNS;

  var messages = history.map(function (r) {
    return { role: r['발화자'] === '학생' ? 'user' : 'assistant', content: String(r['메시지']) };
  });
  messages.push({ role: 'user', content: studentMessage });

  if (reachedMaxTurns) {
    var summary = Claude_callMessages(Chatbot_buildSummaryPrompt_(concept), messages, 500);
    var summaryTurn = studentTurnNumber + 1;
    Chatbot_appendLog_(sessionId, summaryTurn, '시스템', summary, concept, auth);

    // 성취기준 기준 5점 루브릭 평가(학부모 공개용). 평가가 실패해도 대화 자체는 정상 종료되게 한다.
    try {
      var standard = Chatbot_findStandardForConcept_(concept);
      var rubricText = Claude_callMessages(Chatbot_buildRubricPrompt_(concept, standard), messages, 400);
      var rubric = Chatbot_parseRubric_(rubricText);
      ChatbotEval_save_(sessionId, concept, standard, rubric, auth);
    } catch (evalErr) {
      // 루브릭 평가 실패는 조용히 무시(로그만 필요하면 여기서 남길 수 있음).
    }

    return {
      sessionId: sessionId,
      concept: concept,
      turnNumber: summaryTurn,
      maxTurns: CHATBOT_MAX_TURNS,
      message: summary,
      isFinal: true,
    };
  }

  var nextQuestion = Claude_callMessages(Chatbot_buildSystemPrompt_(concept), messages, 300);
  var botTurnNumber = studentTurnNumber + 1;
  Chatbot_appendLog_(sessionId, botTurnNumber, '챗봇', nextQuestion, concept, auth);

  return {
    sessionId: sessionId,
    concept: concept,
    turnNumber: botTurnNumber,
    maxTurns: CHATBOT_MAX_TURNS,
    message: nextQuestion,
    isFinal: false,
  };
}
