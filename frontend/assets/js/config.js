/**
 * 전역 설정. 배포 환경에 맞게 아래 값만 채우면 됩니다.
 * 이 파일은 정적 파일이라 GitHub Pages에 그대로 노출됩니다 —
 * 여기에는 "공개되어도 되는" 값만 넣으세요.
 * 교사 비밀번호·Claude API 키 등 비밀 값은 절대 이 파일에 넣지 말고 Apps Script 스크립트 속성에 저장하세요.
 */
window.APP_CONFIG = {
  // apps-script 배포 후 발급되는 웹앱 URL (로그인/응답저장/챗봇 등 "쓰기"에 사용)
  // 예: https://script.google.com/macros/s/AKfycb.../exec
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwn6CcqLstciuRL59GbmEeaNJ1-gZO1ibUAlJ1xWnqxBkYmvKU67NDRs_LJ6vL2QpJW/exec",

  // Firebase 프로젝트 설정 (문항 조회·세션 상태 실시간 구독 등 "읽기"에 사용).
  // Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹)에서 그대로 복사해 채우세요.
  // apiKey 등은 브라우저에 노출되는 게 정상입니다(비밀키 아님) — 실제 접근 제어는
  // Firestore 보안 규칙(docs/FIREBASE_SETUP.md)이 담당합니다.
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyDouWp7ffGVsXvxyLCz-sS_B7gLbTghWcA",
    authDomain: "lesson-app1.firebaseapp.com",
    projectId: "lesson-app1",
    storageBucket: "lesson-app1.firebasestorage.app",
    messagingSenderId: "805811549552",
    appId: "1:805811549552:web:f63edc442703762c7fcbb5",
  },

  // 파인만 챗봇 최대 턴 수
  CHATBOT_MAX_TURNS: 5,
};
