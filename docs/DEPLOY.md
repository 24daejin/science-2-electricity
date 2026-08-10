# 배포 가이드

네 부분을 순서대로 설정합니다: **① Apps Script 백엔드 → ② GitHub Pages 프론트엔드 → ③ 프론트-백엔드 연결 → ④ Firestore(성능 개선, [FIREBASE_SETUP.md](FIREBASE_SETUP.md))**.

> 인증은 Google OAuth(GIS)가 아니라 자체 로그인(반+번호+이름+반코드 / 교사 이름+비밀번호)입니다. Cloud Console 설정이 필요 없습니다. Cloud Console 접근이 나중에 가능해지면 [OAUTH_SETUP.md](OAUTH_SETUP.md)를 참고해 GIS로 전환할 수 있습니다.
> 문항 조회와 반별 활성 활동은 Apps Script(느림) 대신 Firestore에서 직접 읽습니다 — ④번(선택이지만 강력 추천)을 마쳐야 형성평가가 빠르게 동작합니다.

## ① Apps Script 백엔드 배포

### 1. Apps Script 프로젝트 만들기
1. [script.google.com](https://script.google.com) 접속 → 새 프로젝트.
2. 이 저장소의 `apps-script/` 폴더 안 모든 `.js` 파일과 `appsscript.json` 내용을 그대로 옮겨 넣습니다.
   - 파일명은 자유지만(`.gs`로 자동 저장됨), **내용은 그대로** 복사하세요.
   - `appsscript.json`은 Apps Script 편집기에서 프로젝트 설정 → "appsscript.json 매니페스트 파일을 편집기에 표시" 체크 후 편집합니다.
   - clasp(CLI)를 쓰는 경우: `npm i -g @google/clasp` → `clasp login` → `apps-script/` 폴더에서 `clasp create --type webapp` (기존 프로젝트라면 `.clasp.json`에 scriptId만 채우고) → `clasp push`.

### 2. 스크립트 속성 설정 (Config.js가 읽는 값들)
Apps Script 편집기 좌측 톱니바퀴 ⚙ **프로젝트 설정 → 스크립트 속성 → 스크립트 속성 추가**에서 아래를 등록합니다.

| 속성 | 값 | 비고 |
|---|---|---|
| `SPREADSHEET_ID` | `1zCWl9O6to8HdAXimDLx6BiMtchSOm3_M5cQ7yiK65l0` | 현재 마스터 시트 ID (형성평가/명단 탭이 병합돼도 ID는 그대로 유지됩니다) |
| `CLAUDE_API_KEY` | Claude API 키 | [console.anthropic.com](https://console.anthropic.com)에서 발급. **여기에만** 저장 — 코드/git에는 절대 넣지 않음 |
| `TEACHER_ACCOUNTS` | JSON 배열 문자열, 예: `[{"name":"김다은","password":"바꿔주세요1"},{"name":"박OO","password":"바꿔주세요2"}]` | 두 담당 교사의 로그인 이름/비밀번호. 비밀번호는 추측하기 어려운 값으로 직접 정해서 채우세요 |

학생 로그인에 쓰이는 **반코드**는 스크립트 속성이 아니라 시트(반코드 탭)에서 관리합니다 — 배포 후 [roster/index.html](../frontend/roster/index.html)에서 반별로 설정하세요.

### 3. 웹앱으로 배포
1. 우측 상단 **배포 → 새 배포**.
2. 유형: **웹 앱**.
3. 다음에 실행: **나(배포자)** / 액세스 권한: **모든 사용자**.
   - (`appsscript.json`의 `webapp.access: "ANYONE_ANONYMOUS"`와 일치합니다. 인증은 Apps Script 레벨이 아니라 우리 코드의 자체 로그인이 담당합니다.)
4. 배포 후 나오는 **웹 앱 URL**(`https://script.google.com/macros/s/.../exec`)을 복사해둡니다 — ③에서 씁니다.
5. 코드를 수정할 때마다 **새 배포**(또는 기존 배포의 "배포 관리 → 편집 → 새 버전")를 해야 반영됩니다.

### 4. 빠른 동작 확인
브라우저에서 웹 앱 URL을 직접 열어 아래와 같은 JSON이 보이면 정상입니다:
```json
{"ok":true,"message":"전기와 자기 학습 플랫폼 API가 정상 동작 중입니다.", "time": "..."}
```

## ② GitHub Pages 프론트엔드 배포

이 저장소는 `frontend/apps-script/docs`가 한 폴더에 같이 있으므로, GitHub Pages는 **GitHub Actions를 통해 `frontend/` 폴더만** 배포합니다(`.github/workflows/deploy-pages.yml`에 이미 작성돼 있음).

1. GitHub에 이 저장소를 만들고 push합니다.
   ```bash
   git remote add origin https://github.com/<계정>/<저장소>.git
   git branch -M main
   git push -u origin main
   ```
2. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정합니다.
3. `main` 브랜치에 push하면 워크플로가 자동 실행되어 `frontend/`를 배포합니다. Actions 탭에서 진행 상황을 볼 수 있습니다.
4. 배포 완료 후 Settings → Pages 상단에 표시되는 주소(예: `https://<계정>.github.io/<저장소>/`)가 학생들이 접속할 URL입니다.

## ③ 프론트-백엔드 연결

[frontend/assets/js/config.js](../frontend/assets/js/config.js)를 열어 웹 앱 URL을 채우고 다시 push합니다. `FIREBASE_CONFIG`는 ④번([FIREBASE_SETUP.md](FIREBASE_SETUP.md))에서 채웁니다.

```js
window.APP_CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/.../exec", // ①에서 복사한 웹 앱 URL
  FIREBASE_CONFIG: { /* ④에서 채움 */ },
  CHATBOT_MAX_TURNS: 5,
};
```

## ④ Firestore 연동 (성능 개선, 강력 추천)

문항 조회와 반별 활성 활동을 Apps Script(느림) 대신 Firestore(빠름)에서 직접 읽도록 하는 단계입니다. 자세한 절차는 [FIREBASE_SETUP.md](FIREBASE_SETUP.md)를 그대로 따라가세요. 신용카드 등록이 필요한 유료 요금제는 필요 없습니다.

## 배포 후 점검 체크리스트

- [ ] 웹 앱 URL을 직접 열면 `{"ok":true,...}` JSON이 보인다.
- [ ] GitHub Pages 주소에서 로그인 화면(학생/교사 폼)이 뜬다.
- [ ] 반코드 탭에 반별 코드를 넣고, 학생명단에 있는 반+번호+이름+코드로 로그인하면 통과된다. 이름을 틀리게 입력하면 거부된다.
- [ ] 형성평가_문항 탭 1행(헤더)이 [DATA_MODEL.md](DATA_MODEL.md)에 적힌 15개 컬럼 순서와 정확히 일치한다.
- [ ] 교사 계정(TEACHER_ACCOUNTS)으로 로그인하면 홈 화면에 "학생명단 · 반코드 관리" 메뉴가 보인다.
- [ ] 진단평가에서 **보기 선택 → 확신도 3종 선택(이 시점까지 정오답 비공개) → 정답 공개+피드백** 순서로 화면이 넘어간다.
- [ ] 브라우저 개발자도구 Network 탭에서 Apps Script로 가는 요청의 Content-Type이 `text/plain`이고, OPTIONS(preflight) 요청이 발생하지 않는다.
- [ ] (④ 완료 후) 메인 화면에서 반의 활성 활동 체크박스를 바꾸면, 그 반 학생 화면이 1초 내로 바뀐다(Firestore 실시간 리스너).
- [ ] 형성평가 오답 시 "관련 내용 답하기로 다시 살펴보기" 링크가 뜨고, 클릭하면 해당 핵심 개념으로 챗봇이 시작된다.
- [ ] "관련 내용 답하기" 챗봇이 미리 정해진 질문이 아니라 학생 답변마다 다른 질문을 던지고, 5턴 후 요약을 보여준다.
- [ ] 다른 탭으로 전환했다가 돌아오면 이탈_로그 시트에 행이 쌓인다(막지는 않음).
- [ ] 교사 계정으로 로그인 시 명단/반코드 추가·수정·삭제가 시트에 즉시 반영된다.
