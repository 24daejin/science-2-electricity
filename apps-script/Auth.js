/**
 * 자체 로그인(Google OAuth 미사용) + 세션 토큰 관리.
 *
 * 배경: 학교 계정이 교육청 정책으로 Google Cloud Console 접근이 차단되어(개인 계정으로도
 * 동일하게 막혀 있음을 확인함) GIS(OAuth 2.0 클라이언트)를 발급받을 수 없습니다. 대신:
 *  - 학생: 반 + 번호 + 이름 + 반 공통 로그인코드(반코드 탭에서 교사가 관리)
 *  - 교사: 이름 + 비밀번호(스크립트 속성 TEACHER_ACCOUNTS)
 * 로 로그인하고, 서버가 발급한 authToken을 이후 모든 요청에 함께 보냅니다.
 * (Google 계정 자체가 신원을 보증해주지 않으므로, 같은 반 공통 코드를 아는 학생끼리는
 *  서로 다른 반/번호로 로그인할 수 있다는 한계가 있습니다 — 교실 내 활동임을 감안해 채택.)
 *
 * 학생명단 탭의 "번호" 열은 1~7이 전각숫자(１２３…), 8 이후가 반각숫자로 섞여 입력되어 있어
 * 비교 전에 전각숫자를 반각숫자로 정규화합니다(toHalfWidthDigits_).
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

function requireParent_(auth) {
  if (!auth || auth.role !== 'parent') {
    throw new Error('학부모만 접근할 수 있는 기능입니다.');
  }
}

/** 전각숫자(０-９)를 반각숫자(0-9)로 변환합니다. 학생명단 "번호" 열 표기가 섞여 있어 비교 전 정규화가 필요합니다. */
function toHalfWidthDigits_(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/[０-９]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
    });
}

/** action=login 핸들러. payload.role로 학생/교사/학부모 로그인을 분기합니다. */
function Auth_login(payload) {
  if (payload.role === 'teacher') {
    return Auth_loginTeacher_(payload);
  }
  if (payload.role === 'parent') {
    return Auth_loginParent_(payload);
  }
  return Auth_loginStudent_(payload);
}

function Auth_loginStudent_(payload) {
  var classroom = toHalfWidthDigits_(payload.classroom);
  var number = toHalfWidthDigits_(payload.number);
  var name = String(payload.name || '').trim();
  var code = String(payload.code || '').trim();
  if (!classroom || !number || !name || !code) {
    throw new Error('반, 번호, 이름, 코드를 모두 입력해주세요.');
  }

  var roster = SheetUtils_getRowsCached(SHEET_NAMES.ROSTER, 60);
  if (roster === null) {
    throw new Error('학생명단이 아직 준비되지 않았습니다. 담당 선생님께 문의하세요.');
  }

  var student = roster.find(function (r) {
    return (
      toHalfWidthDigits_(r['반']) === classroom &&
      toHalfWidthDigits_(r['번호']) === number &&
      String(r['이름'] || '').trim() === name
    );
  });
  if (!student) {
    throw new Error('반·번호·이름이 일치하는 학생을 찾을 수 없습니다. 다시 확인하거나 담당 선생님께 문의하세요.');
  }
  if (String(student['학적'] || '').trim() !== '재학') {
    throw new Error('현재 재학 상태가 아닌 것으로 등록되어 있습니다. 담당 선생님께 문의하세요.');
  }

  var classCodes = SheetUtils_getRowsCached(SHEET_NAMES.CLASS_CODES, 30);
  var codeRow = classCodes
    ? classCodes.find(function (r) { return toHalfWidthDigits_(r['반']) === classroom; })
    : null;
  if (!codeRow || String(codeRow['코드'] || '').trim() === '') {
    throw new Error('아직 이 반의 로그인 코드가 설정되지 않았습니다. 담당 선생님께 문의하세요.');
  }
  if (String(codeRow['코드']).trim() !== code) {
    throw new Error('코드가 올바르지 않습니다. 선생님이 안내한 코드를 다시 확인해주세요.');
  }

  var user = {
    role: 'student',
    seq: student['순번'],
    name: name,
    classroom: classroom,
    number: number,
  };
  return { authToken: issueAuthToken_(user), user: user };
}

/**
 * 학부모 로그인: 반+번호+자녀 이름+학생별 고유 학부모 코드로 확인합니다.
 * 반 공통 코드가 아니라 학생마다 다른 코드를 쓰므로, 다른 학생의 정보를 볼 수 없습니다.
 */
function Auth_loginParent_(payload) {
  var classroom = toHalfWidthDigits_(payload.classroom);
  var number = toHalfWidthDigits_(payload.number);
  var name = String(payload.name || '').trim();
  var code = String(payload.code || '').trim();
  if (!classroom || !number || !name || !code) {
    throw new Error('반, 번호, 자녀 이름, 학부모 코드를 모두 입력해주세요.');
  }

  var roster = SheetUtils_getRowsCached(SHEET_NAMES.ROSTER, 60);
  if (roster === null) {
    throw new Error('학생명단이 아직 준비되지 않았습니다. 담당 선생님께 문의하세요.');
  }

  var student = roster.find(function (r) {
    return (
      toHalfWidthDigits_(r['반']) === classroom &&
      toHalfWidthDigits_(r['번호']) === number &&
      String(r['이름'] || '').trim() === name
    );
  });
  if (!student) {
    throw new Error('반·번호·자녀 이름이 일치하는 학생을 찾을 수 없습니다. 다시 확인하거나 담당 선생님께 문의하세요.');
  }

  var expectedCode = String(student['학부모코드'] || '').trim();
  if (!expectedCode || expectedCode !== code) {
    throw new Error('학부모 코드가 올바르지 않습니다. 담임 선생님께 문의하세요.');
  }

  var user = {
    role: 'parent',
    seq: student['순번'],
    studentName: name,
    classroom: classroom,
    number: number,
  };
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

  // classrooms를 지정 안 한 계정은 담당 반 제한 없음(null) — 화면에서 모든 반이 기본으로 보입니다.
  var classrooms =
    Array.isArray(match.classrooms) && match.classrooms.length
      ? match.classrooms.map(function (c) { return String(c).trim(); })
      : null;

  var user = { role: 'teacher', name: name, classrooms: classrooms };
  return { authToken: issueAuthToken_(user), user: user };
}
