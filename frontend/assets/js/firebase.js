/**
 * Firebase(Firestore) 클라이언트 — 읽기 전용 헬퍼.
 *
 * 문항 데이터와 세션 진행 상태처럼 자주(특히 폴링으로) 읽히는 데이터를
 * Apps Script(요청마다 스프레드시트를 여는 구조라 느림) 대신 브라우저에서
 * Firestore로 직접 읽습니다. 실제 "쓰기"(응답 저장, 로그인, 챗봇, 명단 CRUD)는
 * 여전히 api.js를 통해 Apps Script를 거칩니다 — 신원 검증이 필요하기 때문입니다.
 *
 * Firestore 보안 규칙은 diagnosticQuestions/formativeQuestions/sessionState에
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

// 세션 상태 문서는 "반_소단원ID"를 문서ID로 씁니다(반마다 진행 상태가 독립적이어야 하므로).
function sessionDocId_(classroom, subunitId) {
  return `${classroom}_${subunitId}`;
}

/**
 * 특정 반의 6개 소단원 세션 상태를 전부 실시간으로 구독합니다. 학생 홈 화면에서
 * "우리 반이 지금 진행 중인 소단원"을 강조 표시하는 데 씁니다. onUpdate에는
 * { subunitId: {status, currentQuestionId, updatedAt} } 형태의 맵이 전달됩니다.
 * @returns {() => void} 구독 해제 함수
 */
function watchClassSessionStates(classroom, onUpdate) {
  return db
    .collection('sessionState')
    .where('classroom', '==', String(classroom))
    .onSnapshot(
      (snap) => {
        const byId = {};
        snap.forEach((doc) => {
          const data = doc.data();
          byId[data.subunitId] = {
            status: data.status || '대기',
            currentQuestionId: data.currentQuestionId || null,
            updatedAt: data.updatedAt || null,
          };
        });
        onUpdate(byId);
      },
      (err) => console.warn('반 세션 상태 구독 실패:', err.message)
    );
}

/**
 * 모든 반의 세션 상태를 전부 실시간으로 구독합니다. 교사 홈 화면의 "반별 오늘 수업
 * 소단원" 카드에서 반마다 지금 활성화된 소단원이 무엇인지 한눈에 보여줄 때 씁니다.
 * onUpdate에는 { classroom, subunitId, status, currentQuestionId, updatedAt } 배열이 전달됩니다.
 * @returns {() => void} 구독 해제 함수
 */
function watchAllClassSessionStates(onUpdate) {
  return db.collection('sessionState').onSnapshot(
    (snap) => {
      const list = [];
      snap.forEach((doc) => {
        const data = doc.data();
        if (!data.classroom || !data.subunitId) return;
        list.push({
          classroom: String(data.classroom),
          subunitId: String(data.subunitId),
          status: data.status || '대기',
          currentQuestionId: data.currentQuestionId || null,
          updatedAt: data.updatedAt || null,
        });
      });
      onUpdate(list);
    },
    (err) => console.warn('전체 세션 상태 구독 실패:', err.message)
  );
}

/**
 * 특정 반+소단원의 세션 진행 상태를 실시간으로 구독합니다(폴링 대체). 학생의 형성평가
 * 화면과 교사의 진행 제어 화면에서 씁니다. 상태가 바뀔 때마다 onUpdate가 호출됩니다.
 * @returns {() => void} 구독 해제 함수
 */
function watchSessionState(classroom, subunitId, onUpdate) {
  return db
    .collection('sessionState')
    .doc(sessionDocId_(classroom, subunitId))
    .onSnapshot(
      (doc) => {
        if (!doc.exists) {
          onUpdate({ classroom, subunitId, currentQuestionId: null, status: '대기', updatedAt: null });
          return;
        }
        const data = doc.data();
        onUpdate({
          classroom,
          subunitId,
          currentQuestionId: data.currentQuestionId || null,
          status: data.status || '대기',
          updatedAt: data.updatedAt || null,
        });
      },
      (err) => console.warn('세션 상태 구독 실패:', err.message)
    );
}
