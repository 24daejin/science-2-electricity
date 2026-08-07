/**
 * Apps Script 백엔드 호출 공통 유틸.
 *
 * 중요: 반드시 Content-Type: text/plain 으로 보냅니다.
 * application/json을 쓰면 브라우저가 CORS preflight(OPTIONS)를 먼저 보내는데,
 * Apps Script 웹앱은 OPTIONS 메서드를 지원하지 않아 요청이 실패합니다.
 * 서버(Code.js)는 text/plain으로 온 본문을 JSON.parse()로 수동 파싱합니다.
 */
async function callApi(action, payload) {
  const url = window.APP_CONFIG.APPS_SCRIPT_URL;
  const authToken = sessionStorage.getItem('authToken') || '';

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, authToken, payload: payload || {} }),
  });

  if (!res.ok) {
    throw new Error(`서버 요청 실패 (HTTP ${res.status})`);
  }

  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || '알 수 없는 오류가 발생했습니다.');
  }
  return json.data;
}
