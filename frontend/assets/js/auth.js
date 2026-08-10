/**
 * 자체 로그인(반+번호+이름+반코드 / 교사 이름+비밀번호) 공통 로직.
 * Google Cloud Console 접근이 교육청 정책으로 막혀 GIS(OAuth) 대신 이 방식을 씁니다.
 * 로그인 성공 시 서버가 발급하는 authToken(6시간 유효)을 세션스토리지에 저장하고,
 * 이후 모든 API 호출에 함께 보냅니다.
 */

async function loginStudent(classroom, number, name, code) {
  const result = await callApi('login', { role: 'student', classroom, number, name, code });
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

async function loginParent(classroom, number, name, code) {
  const result = await callApi('login', { role: 'parent', classroom, number, name, code });
  sessionStorage.setItem('authToken', result.authToken);
  sessionStorage.setItem('user', JSON.stringify(result.user));
  return result.user;
}

/** 현재 로그인한 사용자 정보를 반환합니다(없으면 null). { role, seq?, name, classroom?, number? } */
function getCurrentUser() {
  const raw = sessionStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

/**
 * 로그인한 교사의 담당 반 목록(문자열 배열)을 반환합니다. 담당 반 제한이 없는 계정(또는
 * 교사가 아닌 경우)이면 null입니다 — 화면 쪽에서 null이면 "전체 반"으로 취급하면 됩니다.
 * (TEACHER_ACCOUNTS 스크립트 속성에 classrooms를 넣은 교사만 값이 채워집니다.)
 */
function myClassrooms() {
  const user = getCurrentUser();
  if (!user || user.role !== 'teacher') return null;
  return Array.isArray(user.classrooms) && user.classrooms.length ? user.classrooms.map(String) : null;
}

/**
 * 여러 교사 화면(반별 활동 지정/대시보드/명단/평가 검수)이 공통으로 쓰는 "내 담당 반만" ↔
 * "전체 반 보기" 토글 버튼을 el 안에 그립니다. 담당 반 제한이 없는 교사(classrooms 없음)는
 * 볼 것도 없으니 버튼을 그리지 않고 그냥 true(전체로 취급)를 돌려줍니다.
 * @param {HTMLElement} el 토글을 그릴 빈 컨테이너
 * @param {boolean} showAll 지금 "전체 보기" 상태인지
 * @param {(next: boolean) => void} onToggle 버튼을 눌렀을 때 다음 상태를 넘겨줌(호출부가 그 상태를 저장하고 다시 그려야 함)
 * @returns {boolean} 실제로 전체 반으로 취급해야 하는지(담당 반 제한이 아예 없으면 항상 true)
 */
function renderScopeToggle(el, showAll, onToggle) {
  const mine = myClassrooms();
  if (!mine) {
    el.innerHTML = '';
    return true;
  }
  el.innerHTML = `
    <div class="scope-toggle-row">
      <button type="button" class="btn secondary" id="scope-toggle-btn">
        ${showAll ? '내 담당 반만 보기' : `전체 반 보기 (담당: ${mine.join(', ')}반)`}
      </button>
    </div>`;
  document.getElementById('scope-toggle-btn').addEventListener('click', () => onToggle(!showAll));
  return showAll;
}

/** 현재 페이지 깊이에 맞는 로그인 화면(frontend/index.html) 경로를 계산합니다. */
function homeUrl() {
  const path = window.location.pathname;
  // frontend/ 바로 아래 폴더 전부 나열 — 여기 빠지면 그 폴더의 페이지에서 로그인 안 된 상태로
  // 접근했을 때 "index.html"(상대경로)이 자기 자신을 가리켜 무한 리다이렉트 루프에 빠집니다.
  const subfolders = ['diagnostic', 'formative', 'chatbot', 'roster', 'dashboard', 'parent', 'eval-review', 'activity'];
  const inSubfolder = subfolders.some((f) => path.includes(`/${f}/`));
  return inSubfolder ? '../index.html' : 'index.html';
}

/**
 * 하위 폴더(diagnostic/, formative/, chatbot/, roster/, dashboard/,
 * parent/, eval-review/)의 페이지에서 호출합니다. 로그인되어 있지 않으면 루트 로그인
 * 화면으로 돌려보냅니다.
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
