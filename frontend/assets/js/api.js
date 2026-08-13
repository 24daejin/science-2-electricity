/**
 * Apps Script 백엔드 호출 공통 유틸.
 *
 * 중요: 반드시 Content-Type: text/plain 으로 보냅니다.
 * application/json을 쓰면 브라우저가 CORS preflight(OPTIONS)를 먼저 보내는데,
 * Apps Script 웹앱은 OPTIONS 메서드를 지원하지 않아 요청이 실패합니다.
 * 서버(Code.js)는 text/plain으로 온 본문을 JSON.parse()로 수동 파싱합니다.
 *
 * 반 전체가 비슷한 타이밍에 요청을 몰아 보내면(예: 다같이 답 제출) Apps Script가
 * 순간적으로 요청을 못 받아 네트워크 오류나 404/502 같은 HTTP 레벨 오류가 나는
 * 경우가 있다 — 코드 문제가 아니라 트래픽이 몰린 순간의 일시적 현상이라 보통
 * 몇 초 안에 풀린다. 그래서 이런 "일시적으로 보이는" 실패는 화면에 오류를
 * 띄우기 전에 짧게 자동 재시도한다(로그인 실패 같은 "정상 응답인데 거부된"
 * 경우는 재시도해도 결과가 똑같으므로 재시도 대상이 아니다).
 */
const API_RETRY_DELAYS_MS = [700, 1500];

function isTransientHttpStatus(status) {
  return status === 0 || status === 404 || status === 429 || (status >= 500 && status <= 599);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callApi(action, payload) {
  const url = window.APP_CONFIG.APPS_SCRIPT_URL;
  const authToken = sessionStorage.getItem('authToken') || '';
  const body = JSON.stringify({ action, authToken, payload: payload || {} });

  let lastError;
  for (let attempt = 0; attempt <= API_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
      });

      if (!res.ok) {
        if (isTransientHttpStatus(res.status) && attempt < API_RETRY_DELAYS_MS.length) {
          lastError = new Error(`서버 요청 실패 (HTTP ${res.status})`);
          await wait(API_RETRY_DELAYS_MS[attempt]);
          continue;
        }
        throw new Error(`서버 요청 실패 (HTTP ${res.status})`);
      }

      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error || '알 수 없는 오류가 발생했습니다.');
      }
      return json.data;
    } catch (err) {
      // fetch() 자체가 던지는 오류(네트워크 끊김 등)도 같은 방식으로 재시도한다.
      if (err instanceof TypeError && attempt < API_RETRY_DELAYS_MS.length) {
        lastError = err;
        await wait(API_RETRY_DELAYS_MS[attempt]);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
