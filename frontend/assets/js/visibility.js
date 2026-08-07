/**
 * 이탈(탭 전환) 감지 — Page Visibility API.
 *
 * 한계(중요): document.hidden / visibilitychange로 "감지·로그만" 남깁니다.
 * 브라우저가 다른 탭 이동을 막거나 화면을 잠그는 것은 웹 기술로 불가능하므로
 * 시도하지 않습니다. 교사는 이 로그를 참고 자료로만 활용해야 합니다.
 */
function initDropoutTracking(screenName) {
  document.addEventListener('visibilitychange', () => {
    const event = document.hidden ? 'hidden' : 'visible';
    callApi('logDropout', { screen: screenName, event }).catch((err) => {
      console.warn('이탈 로그 전송 실패:', err.message);
    });
  });
}
