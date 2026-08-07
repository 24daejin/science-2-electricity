/**
 * 전역 설정. 배포 환경에 맞게 아래 값만 채우면 됩니다.
 * 이 파일은 정적 파일이라 GitHub Pages에 그대로 노출됩니다 —
 * 여기에는 "공개되어도 되는" 값만 넣으세요.
 * 교사 비밀번호·Claude API 키 등 비밀 값은 절대 이 파일에 넣지 말고 Apps Script 스크립트 속성에 저장하세요.
 */
window.APP_CONFIG = {
  // apps-script 배포 후 발급되는 웹앱 URL
  // 예: https://script.google.com/macros/s/AKfycb.../exec
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbzfCyezn-CI6MEfVE72M0htoINP49RNu_Oj7iItyPWZCH5l9AS7kAtKWS0rRfY9IC9k/exec",

  // 세션 상태 폴링 주기 (ms). 기획서 기준 2~3초.
  POLLING_INTERVAL_MS: 2500,

  // 파인만 챗봇 최대 턴 수
  CHATBOT_MAX_TURNS: 5,
};
