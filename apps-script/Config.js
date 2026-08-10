/**
 * 배포 환경 설정값 접근 유틸.
 *
 * 스프레드시트 ID, 교사 계정, Claude API 키 등은 절대 코드에 하드코딩하지 않고
 * Apps Script "스크립트 속성"(프로젝트 설정 > 스크립트 속성)에 저장합니다.
 * 값을 바꿀 때 코드를 재배포할 필요가 없고, git에 비밀값이 남지 않습니다.
 * 설정 방법: docs/DEPLOY.md 참고.
 *
 * 필요한 스크립트 속성 목록:
 *   SPREADSHEET_ID              - 마스터 구글 시트 ID
 *   CLAUDE_API_KEY               - Claude API 키
 *   TEACHER_ACCOUNTS             - 교사 로그인 계정 JSON 배열 문자열.
 *                                  예: [{"name":"김다은","password":"바꿔주세요1"},{"name":"박OO","password":"바꿔주세요2"}]
 *                                  담당 반을 나누고 싶으면 classrooms 배열을 추가하세요(선택):
 *                                  [{"name":"김다은","password":"...","classrooms":["1","2","3","4","5","6","7","8"]},
 *                                   {"name":"박OO","password":"...","classrooms":["9","10"]}]
 *                                  classrooms를 안 넣은 계정은 예전처럼 모든 반을 담당하는 것으로 취급됩니다
 *                                  (화면에 기본으로 자기 담당 반만 보이고, "전체 보기"로 언제든 다른 반도 볼 수 있음 —
 *                                  강제 차단이 아니라 화면 정리용입니다).
 *   FIREBASE_SERVICE_ACCOUNT_JSON - Firestore 동기화(Sync.js)에 사용. Firebase 콘솔 >
 *                                  프로젝트 설정 > 서비스 계정 > "새 비공개 키 생성"으로 받은
 *                                  JSON 파일의 내용을 그대로 붙여넣습니다. (docs/FIREBASE_SETUP.md 참고)
 */

function getScriptProps_() {
  return PropertiesService.getScriptProperties();
}

function getRequiredProp_(key) {
  var value = getScriptProps_().getProperty(key);
  if (!value) {
    throw new Error('스크립트 속성 "' + key + '"가 설정되지 않았습니다. Apps Script 편집기 > 프로젝트 설정 > 스크립트 속성에서 추가하세요.');
  }
  return value;
}

function getSpreadsheetId_() {
  return getRequiredProp_('SPREADSHEET_ID');
}

function getClaudeApiKey_() {
  return getRequiredProp_('CLAUDE_API_KEY');
}

/** 교사 로그인 계정 목록 [{name, password}, ...] */
function getTeacherAccounts_() {
  var raw = getRequiredProp_('TEACHER_ACCOUNTS');
  try {
    var list = JSON.parse(raw);
    if (!Array.isArray(list)) throw new Error('not an array');
    return list;
  } catch (e) {
    throw new Error('스크립트 속성 TEACHER_ACCOUNTS가 올바른 JSON 배열이 아닙니다: ' + e.message);
  }
}

var _cachedSpreadsheet_ = null;

/** 실행 1건 안에서 스프레드시트를 한 번만 엽니다(한 요청 안에 여러 탭을 읽는 경우 절약). */
function getSpreadsheet_() {
  if (!_cachedSpreadsheet_) {
    _cachedSpreadsheet_ = SpreadsheetApp.openById(getSpreadsheetId_());
  }
  return _cachedSpreadsheet_;
}
