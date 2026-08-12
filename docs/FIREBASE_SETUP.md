# Firebase(Firestore) 설정 가이드 — 성능 개선용

## 왜 추가했나
Apps Script는 요청마다 스프레드시트를 새로 여는 구조라 기본적으로 느립니다(요청 1건당 0.5~2초).
(도입 당시엔 형성평가 화면의 "2.5초마다 폴링"이 이 느린 경로를 계속 두드리는 게 특히 문제였지만,
지금은 형성평가를 종이 학습지로 진행해서 그 화면 자체가 없습니다 — 진단평가 문항 조회·반별
활성 활동은 여전히 이 구조의 도움을 받습니다.)

그래서 **시트는 그대로 선생님들의 편집 화면으로 남기고**, 학생 화면이 실제로 읽는 데이터(문항,
반별 활성 활동)만 Firestore로 복사해서 빠르게 읽도록 바꿨습니다. 시트를 수정하면 Apps Script가
자동으로 Firestore에 동기화합니다. 반별 활성 활동은 폴링 대신 **실시간 리스너**로 바뀌어, 폴링
자체가 사라졌습니다.

- 로그인, 응답 저장, 챗봇, 명단/반코드 관리는 그대로 Apps Script를 거칩니다(신원 검증이 필요해서
  속도보다 정확성이 중요하고, 애초에 폴링처럼 반복 호출되지 않아 속도 영향이 적습니다).
- **Firestore 무료(Spark) 요금제로 충분합니다.** 신용카드 등록이 필요한 유료(Blaze) 요금제는
  필요 없습니다.

## 1. Firebase 프로젝트 만들기
1. [console.firebase.google.com](https://console.firebase.google.com) 접속(개인 Gmail 계정 가능) → **프로젝트 추가**.
2. 프로젝트 이름은 자유롭게(예: `electricity-magnetism-platform`). Google 애널리틱스는 켜지 않아도 됩니다.

## 2. Firestore Database 만들기
1. 좌측 메뉴 **빌드 → Firestore Database → 데이터베이스 만들기**.
2. 위치: `asia-northeast3 (서울)` 추천.
3. 보안 규칙 모드는 아무거나 선택해도 됩니다 — 3단계에서 덮어씁니다.

## 3. 보안 규칙 설정
**Firestore Database → 규칙** 탭에서 아래 내용으로 전체 교체 후 **게시**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /diagnosticQuestions/{doc} {
      allow read: if true;
      allow write: if false;
    }
    match /classActiveActivity/{doc} {
      allow read: if true;
      allow write: if false;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

누구나 읽을 수 있지만(문항 내용·진행 상태는 비밀이 아님) 아무도 직접 쓸 수 없습니다. Apps Script는
서비스 계정으로 인증하므로 이 규칙과 무관하게 쓸 수 있습니다(6단계).

## 4. 웹 앱 등록 (프론트엔드용 설정값 받기)
1. 프로젝트 개요 옆 ⚙ **프로젝트 설정 → 일반** 탭 아래로 스크롤 → **내 앱 → 웹 앱 추가**(`</>` 아이콘).
2. 앱 닉네임 아무거나 입력 → **Firebase Hosting은 설정하지 않음** → 앱 등록.
3. 나오는 `firebaseConfig` 객체 값을 복사해 [frontend/assets/js/config.js](../frontend/assets/js/config.js)의 `FIREBASE_CONFIG`에 그대로 채웁니다.
   ```js
   FIREBASE_CONFIG: {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "...",
   },
   ```
   이 값들은 브라우저에 그대로 노출돼도 안전합니다(비밀키가 아닙니다) — 실제 접근 제어는 3단계의 보안 규칙이 담당합니다.

## 5. 서비스 계정 키 발급 (Apps Script용)
1. ⚙ **프로젝트 설정 → 서비스 계정** 탭 → **새 비공개 키 생성** → JSON 파일이 다운로드됩니다.
2. 그 JSON 파일을 메모장 등으로 열어 **내용 전체**를 복사합니다.
3. Apps Script 편집기 → ⚙ **프로젝트 설정 → 스크립트 속성 → 스크립트 속성 추가**:
   - 속성: `FIREBASE_SERVICE_ACCOUNT_JSON`
   - 값: 방금 복사한 JSON 전체 (한 줄로 붙여넣으면 됩니다)

## 6. 동기화 켜기 (최초 1회만 하면 됨)
1. Apps Script 편집기에서 `apps-script/` 폴더의 새 파일 2개를 추가합니다(기존 파일들과 같은 방식으로 파일 추가 후 복사/붙여넣기):
   - `FirestoreClient` ← https://raw.githubusercontent.com/24daejin/science-2-electricity/main/apps-script/FirestoreClient.js
   - `Sync` ← https://raw.githubusercontent.com/24daejin/science-2-electricity/main/apps-script/Sync.js
2. 상단 함수 선택 드롭다운에서 **Sync_setup**을 선택 → ▶ **실행**.
3. 처음 실행하면 권한 승인 화면이 뜹니다 — 본인 계정이니 **고급 → (프로젝트명)로 이동(안전하지 않음)**을 눌러 승인하세요(Google이 아직 앱을 검증하지 않았다는 표준 경고이며, 본인이 만든 스크립트라 문제없습니다).
4. 실행이 끝나면 자동 동기화 트리거가 설치되고, 지금 시트에 있는 문항이 Firestore로 최초 복사됩니다.
5. Firestore 콘솔로 가서 `diagnosticQuestions`(9개) 컬렉션에 문서가 채워졌는지 확인하세요.

이후로는 시트(진단평가_문항)를 수정할 때마다 몇 초 안에 자동으로 Firestore에 반영됩니다. 시트를 열면 상단에 "전기와자기 플랫폼" 메뉴가 생기고, 그 안의 "지금 Firestore로 동기화"로 언제든 수동 동기화도 가능합니다. (반별 활성 활동은 이 시트 동기화와 별개로, [메인 화면](../frontend/index.html)에서 활동을 켜는 순간 Apps Script가 바로 Firestore에 반영합니다.)

## 7. Apps Script 재배포 + 프론트엔드 재배포
1. Apps Script: **배포 → 배포 관리 → (기존 배포) 편집 → 새 버전 → 배포** (FirestoreClient/Sync 파일과 캐싱 코드가 반영되도록).
2. `frontend/assets/js/config.js`(FIREBASE_CONFIG 채운 것)를 `main` 브랜치에 커밋/push하면 GitHub Pages가 자동 재배포됩니다.

## 8. 확인
- 메인 화면에서 반의 활성 활동 체크박스를 바꾸면, 그 반 학생 화면이 거의 즉시(1초 이내) 바뀝니다.
- 진단평가 화면 로딩 자체도 이전보다 눈에 띄게 빨라집니다(Apps Script를 거치지 않으므로).
