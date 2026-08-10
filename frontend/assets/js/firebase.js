/**
 * Firebase(Firestore) 클라이언트 — 읽기 전용 헬퍼.
 *
 * 문항 데이터와 반별 활성 활동처럼 자주 읽히거나 실시간으로 바뀌어야 하는 데이터를
 * Apps Script(요청마다 스프레드시트를 여는 구조라 느림) 대신 브라우저에서
 * Firestore로 직접 읽습니다. 실제 "쓰기"(응답 저장, 로그인, 챗봇, 명단 CRUD)는
 * 여전히 api.js를 통해 Apps Script를 거칩니다 — 신원 검증이 필요하기 때문입니다.
 *
 * Firestore 보안 규칙은 diagnosticQuestions/formativeQuestions/classActiveActivity에
 * 읽기만 열어두고 쓰기는 막아둡니다(Apps Script가 서비스 계정으로만 씀).
 * 이 파일을 쓰는 페이지는 config.js보다 뒤, 그리고 아래 두 CDN 스크립트보다
 * 뒤에 로드해야 합니다:
 *   <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js"></script>
 *   <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js"></script>
 */

firebase.initializeApp(window.APP_CONFIG.FIREBASE_CONFIG);
const db = firebase.firestore();

async function fetchDiagnosticQuestionsFS() {
  const snap = await db.collection('diagnosticQuestions').get();
  return snap.docs
    .map((doc) => ({ questionId: doc.id, ...doc.data() }))
    .sort((a, b) => a.questionId.localeCompare(b.questionId));
}

async function fetchFormativeQuestionsFS(subunitId) {
  const snap = await db
    .collection('formativeQuestions')
    .where('subunitId', '==', String(subunitId))
    .get();
  return snap.docs
    .map((doc) => ({ questionId: doc.id, ...doc.data() }))
    .sort((a, b) => a.questionId.localeCompare(b.questionId));
}

// Firestore 문서가 배열(activityKeys, 현재 버전) 또는 문자열(activityKey, 이전 버전 잔여
// 데이터)일 수 있어 항상 배열로 정규화합니다.
function activeActivityKeysFrom_(data) {
  if (!data) return [];
  if (Array.isArray(data.activityKeys)) return data.activityKeys.filter(Boolean);
  if (data.activityKey) return [data.activityKey];
  return [];
}

/**
 * 반이 지금 "학생이 할 수 있는 활동"으로 지정한 활동키들을 실시간으로 구독합니다.
 * 학생 홈 화면이 이 값에 따라 어떤 소단원(또는 진단평가) 카드를 보여줄지, 그 안에서
 * 어떤 활동만 클릭 가능하게 할지 결정합니다. 동시에 여러 개가 지정될 수 있습니다(예:
 * 형성평가 + 관련 내용 답하기를 같이 열어둔 경우). 지정된 게 없으면 빈 배열이 전달됩니다.
 * @returns {() => void} 구독 해제 함수
 */
function watchClassActiveActivity(classroom, onUpdate) {
  return db
    .collection('classActiveActivity')
    .doc(String(classroom))
    .onSnapshot(
      (doc) => onUpdate(doc.exists ? activeActivityKeysFrom_(doc.data()) : []),
      (err) => console.warn('반 활성 활동 구독 실패:', err.message)
    );
}

/**
 * 모든 반의 "오늘의 활성 활동들"을 한 번에 실시간으로 구독합니다. 교사 홈 화면의
 * "반별 오늘 활동 지정" 카드에서 반마다 지금 뭐가 활성화돼 있는지 보여줄 때 씁니다.
 * onUpdate에는 { 반: [활동키, ...] } 형태의 맵이 전달됩니다.
 * @returns {() => void} 구독 해제 함수
 */
function watchAllClassActiveActivities(onUpdate) {
  return db.collection('classActiveActivity').onSnapshot(
    (snap) => {
      const byClassroom = {};
      snap.forEach((doc) => {
        const data = doc.data();
        if (data.classroom) byClassroom[String(data.classroom)] = activeActivityKeysFrom_(data);
      });
      onUpdate(byClassroom);
    },
    (err) => console.warn('전체 반 활성 활동 구독 실패:', err.message)
  );
}
