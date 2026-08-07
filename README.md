# 전기와 자기 개별화 학습 플랫폼

중학교 과학 "전기와 자기" 단원(성취기준 9과14-01~04)의 개별화 학습을 지원하는 웹 플랫폼입니다.
담당 교사 2인이 공동 운영합니다.

> ⚠️ 지도상 유의점: **대전 순서(대전열)는 문항·피드백·챗봇 대화 어디에서도 다루지 않습니다.**

## 인증 방식에 대한 안내

원래 설계는 Google Identity Services(GIS)로 학교 구글 워크스페이스 계정 로그인이었으나, **교육청 정책으로 담당 교사 계정의 Google Cloud Console 접근이 차단**되어 OAuth 클라이언트를 발급받을 수 없었습니다. 그래서 현재는 **자체 로그인 방식**을 씁니다:

- **학생**: 반 + 번호 + 이름 + 반 공통 로그인코드(교사가 반코드 탭에서 관리, 매 수업 칠판 등으로 안내)
- **교사**: 이름 + 비밀번호(스크립트 속성에 저장)

로그인 성공 시 Apps Script가 임시 `authToken`(CacheService 기반, 6시간 유효)을 발급하고, 이후 모든 요청에 이 토큰을 함께 보냅니다. Google 계정이 신원을 보증해주지 않으므로, 같은 반 학생끼리는 서로 다른 번호로 로그인할 수 있다는 한계가 있습니다 — 교실 내 활동 맥락에서 감수 가능하다고 판단해 채택했습니다. (추후 Cloud Console 접근이 열리면 [docs/OAUTH_SETUP.md](docs/OAUTH_SETUP.md)의 절차로 GIS 방식으로 전환할 수 있도록 문서를 남겨두었습니다.)

## 아키텍처

```
[학생/교사 브라우저]
   │  자체 로그인(반+번호+이름+반코드 / 교사 이름+비밀번호) → authToken 발급
   ▼
[GitHub Pages: frontend/]  ── 정적 HTML/CSS/JS, git으로 버전관리
   │  POST (Content-Type: text/plain, JSON 문자열 body) — preflight 회피
   ▼
[Google Apps Script 웹앱: apps-script/]  doGet/doPost 라우팅
   │  ① authToken을 CacheService로 검증(역할: 학생/교사, 순번, 이름, 반, 번호)
   │  ② SpreadsheetApp으로 Google Sheets 읽기/쓰기 (로그인 검증, 응답/로그 저장, 명단·반코드 CRUD)
   │  ③ UrlFetchApp으로 Claude API 서버측 프록시 호출 (API 키 미노출)
   │  ④ 서비스 계정으로 Firestore에 문항·세션 상태 동기화 (Sync.js, 시트 수정 시 자동)
   ▼                                              ▼
[Google Sheets: 마스터 스프레드시트]      [Firestore: diagnosticQuestions/
  ← 교사가 편집하는 SSOT                     formativeQuestions/sessionState]
                                              ▲
                                              │ 브라우저가 직접 읽음(빠름, 폴링 없음)
                                    [학생/교사 브라우저]
```

- **왜 Sheets와 Firestore를 같이 쓰나**: 애초에 GitHub Pages + Apps Script(+ Google Sheets SSOT) 조합만 쓰기로 확정했었지만, Apps Script가 요청마다 스프레드시트를 새로 여는 구조라 형성평가의 2.5초 폴링이 전체를 느리게 만드는 문제가 있었습니다. 그래서 **교사의 편집 경험은 그대로 Sheets로 유지**하되, **학생이 자주 읽는 데이터(문항, 세션 진행 상태)만 Firestore로 미러링**해서 그 부분만 빠르게 만들었습니다 — 로그인·응답저장·챗봇·명단관리처럼 정확성이 중요하고 반복 호출되지 않는 부분은 그대로 Apps Script+Sheets입니다. 자세한 설정은 [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) 참고.
- **CORS 우회**: Apps Script로 보내는 모든 POST 요청은 `Content-Type: text/plain`으로 전송하고, 서버에서 `JSON.parse(e.postData.contents)`로 수동 파싱합니다. `application/json`을 쓰면 preflight(OPTIONS) 요청이 발생하고 Apps Script는 이를 지원하지 않아 실패합니다. **절대 `application/json`을 쓰지 마십시오.**
- **실시간 동기화**: 형성평가의 세션 진행 상태는 더 이상 폴링하지 않고, 학생 브라우저가 Firestore `sessionState` 문서를 실시간 리스너(`onSnapshot`)로 직접 구독합니다. 교사가 세션_상태 시트를 수정하면 Apps Script가 Firestore로 동기화하고, 그 순간 모든 학생 화면이 즉시 갱신됩니다.
- **이탈(탭 전환) 감지의 한계**: `document.hidden` / `visibilitychange` 이벤트로 **감지·로그만** 남깁니다. 브라우저가 다른 탭 이동을 막거나 화면을 잠그는 것은 웹 기술로 불가능하므로 시도하지 않습니다. 교사는 이 로그를 참고 자료로만 활용해야 합니다.

## 디렉터리 구조

```
frontend/           GitHub Pages에 그대로 배포되는 정적 사이트
  index.html           로그인 진입점 (학생/교사 자체 로그인)
  diagnostic/           진단평가 웹앱
  formative/             형성평가 웹앱 (소단원ID 1~6 공용)
  chatbot/                파인만 챗봇
  roster/                  교사용 학생명단·반코드 관리
  assets/js/            config.js(설정) · auth.js(로그인/세션) · api.js(Apps Script 호출 공통) ·
                         firebase.js(Firestore 읽기: 문항·세션 상태 실시간 구독) ·
                         visibility.js(이탈 감지) · confidence.js(확신도 매핑)
apps-script/         clasp로 관리하는 Apps Script 프로젝트 소스 (Sync.js/FirestoreClient.js가 Firestore 동기화 담당)
docs/                배포/운영 가이드
```

## 데이터 모델 (Google Sheets, 파일 1개 · 여러 탭)

문항·명단 데이터는 절대 프론트/백엔드 코드에 하드코딩하지 않고, 아래 마스터 스프레드시트를 SSOT로 실시간 조회합니다. 교사가 시트를 수정하면 앱에 즉시 반영됩니다.

| 탭 | 용도 | 상태 |
|---|---|---|
| 진단평가_문항 | 선수학습 확인 9문항 | ✅ 운영 중, Firestore로 동기화됨 |
| 형성평가_문항 | 소단원ID(1~6)로 구분된 54문항 | ✅ 운영 중, Firestore로 동기화됨 |
| 학생명단 | 순번·학년·반·번호·이름·학적 | ✅ 운영 중 (262명) |
| 반코드 | 반별 로그인 공통 코드 | Apps Script가 최초 실행 시 자동 생성, roster/ 화면에서 관리 |
| 진단평가_응답 / 형성평가_응답 | 학생 응답, 확신도, 정오답, 제출시각 | Apps Script가 최초 실행 시 자동 생성 |
| 챗봇_로그 | 학생-챗봇 전체 대화 | Apps Script가 최초 실행 시 자동 생성 |
| 이탈_로그 | 탭 전환 감지 로그 | Apps Script가 최초 실행 시 자동 생성 |
| 세션_상태 | 교사 주도 실시간 진행 상태 | Apps Script가 최초 실행 시 자동 생성, Firestore로 동기화됨 |

현재 마스터 스프레드시트 ID: `1zCWl9O6to8HdAXimDLx6BiMtchSOm3_M5cQ7yiK65l0`

"Firestore로 동기화됨" 표시된 탭은 `diagnosticQuestions`/`formativeQuestions`/`sessionState` Firestore 컬렉션으로 자동 미러링되어, 학생 화면은 시트가 아니라 Firestore에서 직접 읽습니다(속도 때문 — [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) 참고). 교사는 여전히 시트에서만 편집합니다.

자세한 컬럼 명세는 [docs/DATA_MODEL.md](docs/DATA_MODEL.md) 참고.

## 배포

- [docs/DEPLOY.md](docs/DEPLOY.md) — GitHub Pages + Apps Script 배포, 스크립트 속성(교사 계정 등) 설정
- [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md) — Firestore 연동(성능 개선용) 설정
- [docs/OAUTH_SETUP.md](docs/OAUTH_SETUP.md) — (선택/추후용) Cloud Console 접근이 가능해질 경우의 GIS 전환 절차

## 진행 상태

- [x] 리포지토리 스캐폴딩
- [x] 인증(자체 로그인) + 백엔드 공통 기반
- [x] 진단평가 웹앱
- [x] 형성평가 웹앱 (6개 소단원 공용) — 실제 문항 데이터 반영, 헤더 행 수정 완료
- [x] 오답 재학습 → 챗봇 라우팅
- [x] 파인만 챗봇
- [x] 교사 주도 실시간 진행 제어(Firestore 실시간 리스너) + 이탈 감지
- [x] 명단 관리 CRUD + 반코드 관리 — 실제 명단(262명) 반영
- [x] 배포 가이드 문서
- [x] Apps Script/GitHub Pages 실배포 완료 (https://24daejin.github.io/science-2-electricity/)
- [x] 성능 개선: Sheets 읽기 캐싱 + Firestore 미러링(문항·세션 상태)

미완료: [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)의 Firebase 프로젝트 설정(아직 미실행), 반코드 실값 입력.

교사 대시보드는 이번 구현 범위에서 제외되었습니다(우선순위 미정).
