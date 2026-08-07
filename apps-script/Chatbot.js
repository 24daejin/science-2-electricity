/**
 * 파인만 챗봇: 질문 먼저 던지는 소크라테스식 자기설명 챗봇.
 * - 사전에 정해진 질문 트리를 쓰지 않고, 학생 답변을 바탕으로 Claude가 매번 다음 질문을 새로 생성합니다.
 * - 최대 5턴(챗봇 질문 5회) 후 종료하며, 다룬/놓친 개념 요약을 제공합니다.
 * - 전체 대화를 챗봇_로그에 저장합니다. 대화 상태는 챗봇_로그를 진실 공급원으로 재구성합니다(클라이언트 조작 방지).
 */

var CHATBOT_LOG_HEADERS = ['세션ID', '턴번호', '발화자', '메시지', '개념', '학번', '이름', '시각'];
var CHATBOT_MAX_TURNS = 5;

var FEYNMAN_CONCEPTS = [
  '마찰전기와 정전기 유도',
  '옴의 법칙과 저항',
  '직렬·병렬 회로',
  '전기에너지 전환과 소비전력',
  '자기장',
  '전자기력과 전동기',
];

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
    학번: auth.studentId || '',
    이름: auth.name || '',
    시각: new Date(),
  });
}

/** action=startChatbotSession: 새 세션을 만들고 첫 질문을 생성합니다. */
function Chatbot_start(payload, auth) {
  var concept = payload.concept;
  if (FEYNMAN_CONCEPTS.indexOf(concept) === -1) throw new Error('알 수 없는 개념입니다: ' + concept);

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
