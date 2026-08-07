/**
 * 자체 로그인(Google OAuth 미사용) + 세션 토큰 관리.
 *
 * 배경: 학교 계정이 교육청 정책으로 Google Cloud Console 접근이 차단되어
 * GIS(OAuth 2.0 클라이언트)를 발급받을 수 없습니다. 대신:
 *  - 학생: 학번 + 이름 + 반 공통 로그인코드(반코드 탭에서 교사가 관리)
 *  - 교사: 이름 + 비밀번호(스크립트 속성 TEACHER_ACCOUNTS)
 * 로 로그인하고, 서버가 발급한 authToken을 이후 모든 요청에 함께 보냅니다.
 * (Google 계정 자체가 신원을 보증해주지 않으므로, 같은 반 공통 코드를 아는 학생끼리는
 *  서로 다른 학번으로 로그인할 수 있다는 한계가 있습니다 — 교실 내 활동임을 감안해 채택.)
 */

var AUTH_CACHE_PREFIX = 'auth_';
var AUTH_TOKEN_TTL_SECONDS = 21600; // Apps Script CacheService 최대치(6시간)

function issueAuthToken_(user) {
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put(AUTH_CACHE_PREFIX + token, JSON.stringify(user), AUTH_TOKEN_TTL_SECONDS);
  return token;
}

function verifyAuthToken_(token) {
  if (!token) return { ok: false, error: '로그인 정보가 없습니다. 다시 로그인해주세요.' };
  var raw = CacheService.getScriptCache().get(AUTH_CACHE_PREFIX + token);
  if (!raw) return { ok: false, error: '로그인이 만료되었습니다. 다시 로그인해주세요.' };
  try {
    return { ok: true, user: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: '로그인 정보를 해석할 수 없습니다. 다시 로그인해주세요.' };
  }
}

function requireTeacher_(auth) {
  if (!auth || auth.role !== 'teacher') {
    throw new Error('교사만 접근할 수 있는 기능입니다.');
  }
}

/** action=login 핸들러. payload.role이 'teacher'면 교사 로그인, 아니면 학생 로그인. */
function Auth_login(payload) {
  if (payload.role === 'teacher') {
    return Auth_loginTeacher_(payload);
  }
  return Auth_loginStudent_(payload);
}

function Auth_loginStudent_(payload) {
  var studentId = String(payload.studentId || '').trim();
  var name = String(payload.name || '').trim();
  var code = String(payload.code || '').trim();
  if (!studentId || !name || !code) {
    throw new Error('학번, 이름, 코드를 모두 입력해주세요.');
  }

  var roster = SheetUtils_getRows(SHEET_NAMES.ROSTER);
  if (roster === null) {
    throw new Error('학생명단이 아직 준비되지 않았습니다. 담당 선생님께 문의하세요.');
  }

  var student = roster.find(function (r) { return String(r['학번']).trim() === studentId; });
  if (!student) {
    throw new Error('등록되지 않은 학번입니다. 학번을 다시 확인하거나 담당 선생님께 문의하세요.');
  }
  if (String(student['상태'] || '').trim() === '비활성') {
    throw new Error('현재 비활성 상태인 계정입니다. 담당 선생님께 문의하세요.');
  }
  if (String(student['이름'] || '').trim() !== name) {
    throw new Error('학번과 이름이 일치하지 않습니다. 다시 확인해주세요.');
  }

  var classroom = String(student['반'] || '').trim();
  var classCodes = SheetUtils_getRows(SHEET_NAMES.CLASS_CODES);
  var codeRow = classCodes ? classCodes.find(function (r) { return String(r['반']).trim() === classroom; }) : null;
  if (!codeRow || String(codeRow['코드'] || '').trim() === '') {
    throw new Error('아직 이 반의 로그인 코드가 설정되지 않았습니다. 담당 선생님께 문의하세요.');
  }
  if (String(codeRow['코드']).trim() !== code) {
    throw new Error('코드가 올바르지 않습니다. 선생님이 안내한 코드를 다시 확인해주세요.');
  }

  var user = { role: 'student', studentId: studentId, name: name, classroom: classroom };
  return { authToken: issueAuthToken_(user), user: user };
}

function Auth_loginTeacher_(payload) {
  var name = String(payload.teacherName || '').trim();
  var password = String(payload.teacherPassword || '');
  if (!name || !password) {
    throw new Error('이름과 비밀번호를 모두 입력해주세요.');
  }

  var teachers = getTeacherAccounts_();
  var match = teachers.find(function (t) { return String(t.name).trim() === name && String(t.password) === password; });
  if (!match) {
    throw new Error('이름 또는 비밀번호가 올바르지 않습니다.');
  }

  var user = { role: 'teacher', name: name };
  return { authToken: issueAuthToken_(user), user: user };
}
