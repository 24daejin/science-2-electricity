/**
 * 자체 로그인(학번+이름+반코드 / 교사 이름+비밀번호) 공통 로직.
 * Google Cloud Console 접근이 교육청 정책으로 막혀 GIS(OAuth) 대신 이 방식을 씁니다.
 * 로그인 성공 시 서버가 발급하는 authToken(6시간 유효)을 세션스토리지에 저장하고,
 * 이후 모든 API 호출에 함께 보냅니다.
 */

async function loginStudent(studentId, name, code) {
  const result = await callApi('login', { role: 'student', studentId, name, code });
  sessionStorage.setItem('authToken', result.authToken);
  sessionStorage.setItem('user', JSON.stringify(result.user));
  return result.user;
}

async function loginTeacher(teacherName, teacherPassword) {
  const result = await callApi('login', { role: 'teacher', teacherName, teacherPassword });
  sessionStorage.setItem('authToken', result.authToken);
  sessionStorage.setItem('user', JSON.stringify(result.user));
  return result.user;
}

/** 현재 로그인한 사용자 정보를 반환합니다(없으면 null). { role, studentId?, name, classroom? } */
function getCurrentUser() {
  const raw = sessionStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

/** 현재 페이지 깊이에 맞는 로그인 화면(frontend/index.html) 경로를 계산합니다. */
function homeUrl() {
  const path = window.location.pathname;
  const subfolders = ['diagnostic', 'formative', 'chatbot', 'roster'];
  const inSubfolder = subfolders.some((f) => path.includes(`/${f}/`));
  return inSubfolder ? '../index.html' : 'index.html';
}

/**
 * 하위 폴더(diagnostic/, formative/, chatbot/, roster/)의 페이지에서 호출합니다.
 * 로그인되어 있지 않으면 루트 로그인 화면으로 돌려보냅니다.
 */
function requireLogin() {
  const user = getCurrentUser();
  if (!user || !sessionStorage.getItem('authToken')) {
    window.location.href = homeUrl();
    return null;
  }
  return user;
}

function requireTeacher() {
  const user = requireLogin();
  if (user && user.role !== 'teacher') {
    alert('교사 계정만 접근할 수 있는 화면입니다.');
    window.location.href = homeUrl();
    return null;
  }
  return user;
}

function logout() {
  sessionStorage.removeItem('authToken');
  sessionStorage.removeItem('user');
  window.location.href = homeUrl();
}
