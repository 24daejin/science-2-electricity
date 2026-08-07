/**
 * Claude API 서버측 프록시. API 키는 스크립트 속성(CLAUDE_API_KEY)에서만 읽으며
 * 프론트엔드에는 절대 전달되지 않습니다.
 */
function Claude_callMessages(systemPrompt, messages, maxTokens) {
  var apiKey = getClaudeApiKey_();

  var body = {
    model: 'claude-sonnet-5',
    max_tokens: maxTokens || 600,
    system: systemPrompt,
    messages: messages,
  };

  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });

  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code !== 200) {
    throw new Error('Claude API 호출 실패(' + code + '): ' + text);
  }

  var json = JSON.parse(text);
  var textBlock = (json.content || []).filter(function (b) { return b.type === 'text'; })[0];
  return textBlock ? textBlock.text : '';
}
