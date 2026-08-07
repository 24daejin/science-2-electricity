/**
 * 교사 주도 실시간 진행 상태 폴링 (멘티미터 방식, 기본 2.5초 간격 — config.js POLLING_INTERVAL_MS).
 * 교사가 세션_상태 시트(또는 향후 만들 제어 화면)에서 현재문항ID/진행상태를 바꾸면
 * 다음 폴링 때 학생 화면이 그에 맞춰 갱신됩니다.
 *
 * @param {string} subunitId 소단원ID(1~6)
 * @param {(state: {subunitId, currentQuestionId, status, updatedAt}) => void} onUpdate 상태가 바뀔 때만 호출됨
 * @returns {() => void} 폴링 중지 함수
 */
function startSessionPolling(subunitId, onUpdate) {
  let lastQuestionId;
  let lastStatus;

  async function tick() {
    try {
      const state = await callApi('getSessionState', { subunitId });
      if (state.currentQuestionId !== lastQuestionId || state.status !== lastStatus) {
        lastQuestionId = state.currentQuestionId;
        lastStatus = state.status;
        onUpdate(state);
      }
    } catch (err) {
      console.warn('세션 상태 폴링 실패:', err.message);
    }
  }

  tick();
  const timerId = setInterval(tick, window.APP_CONFIG.POLLING_INTERVAL_MS);
  return () => clearInterval(timerId);
}
