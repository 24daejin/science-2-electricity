/**
 * Apps Script → Firestore REST API 클라이언트 (서비스 계정 인증).
 *
 * Firebase Admin SDK는 Node.js 전용이라 Apps Script에서 쓸 수 없습니다. 대신 서비스 계정
 * 키로 직접 JWT를 서명해 OAuth2 액세스 토큰을 받아 Firestore REST API를 호출합니다.
 * 이렇게 서비스 계정으로 인증된 요청은 Firestore 보안 규칙을 우회하는 관리자 권한으로
 * 처리됩니다 — 그래서 Firestore 규칙에서는 브라우저(클라이언트) 쓰기를 막아두고
 * (allow write: if false) 오직 이 경로로만 씁니다.
 *
 * 필요한 스크립트 속성: FIREBASE_SERVICE_ACCOUNT_JSON
 *   (Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > "새 비공개 키 생성"으로 받은 JSON 파일 전체 내용)
 */

function getFirebaseServiceAccount_() {
  var raw = getRequiredProp_('FIREBASE_SERVICE_ACCOUNT_JSON');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON이 올바른 JSON이 아닙니다: ' + e.message);
  }
}

/** 문자열 또는 byte[]를 base64url(패딩 없음)로 인코딩합니다. JWT 각 파트 인코딩에 씁니다. */
function Firestore_base64Url_(data) {
  return Utilities.base64EncodeWebSafe(data).replace(/=+$/, '');
}

function Firestore_getAccessToken_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('firestore_access_token');
  if (cached) return cached;

  var account = getFirebaseServiceAccount_();
  var now = Math.floor(Date.now() / 1000);
  var header = { alg: 'RS256', typ: 'JWT' };
  var claimSet = {
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  var unsigned = Firestore_base64Url_(JSON.stringify(header)) + '.' + Firestore_base64Url_(JSON.stringify(claimSet));
  var signatureBytes = Utilities.computeRsaSha256Signature(unsigned, account.private_key);
  var jwt = unsigned + '.' + Firestore_base64Url_(signatureBytes);

  var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    },
    muteHttpExceptions: true,
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error('Firebase 인증 토큰 발급 실패: ' + resp.getContentText());
  }

  var json = JSON.parse(resp.getContentText());
  cache.put('firestore_access_token', json.access_token, Math.max(60, json.expires_in - 120));
  return json.access_token;
}

function Firestore_baseUrl_() {
  var projectId = getFirebaseServiceAccount_().project_id;
  return 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents';
}

/** JS 값을 Firestore REST "Value" 표현으로 변환합니다. */
function Firestore_toValue_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(Firestore_toValue_) } };
  }
  if (typeof v === 'object') {
    var fields = {};
    Object.keys(v).forEach(function (k) { fields[k] = Firestore_toValue_(v[k]); });
    return { mapValue: { fields: fields } };
  }
  return { stringValue: String(v) };
}

/** 문서를 만들거나(이미 있으면) 통째로 덮어씁니다. docObj는 평범한 JS 객체입니다. */
function Firestore_setDocument(collection, docId, docObj) {
  var fields = {};
  Object.keys(docObj).forEach(function (k) { fields[k] = Firestore_toValue_(docObj[k]); });

  var url = Firestore_baseUrl_() + '/' + collection + '/' + encodeURIComponent(docId);
  var resp = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + Firestore_getAccessToken_() },
    payload: JSON.stringify({ fields: fields }),
    muteHttpExceptions: true,
  });

  if (resp.getResponseCode() >= 300) {
    throw new Error('Firestore 쓰기 실패(' + collection + '/' + docId + '): ' + resp.getContentText());
  }
}

/** 컬렉션의 문서 중, keepIds에 없는 것들을 삭제합니다(시트에서 삭제된 문항 등을 정리). */
function Firestore_pruneCollection(collection, keepIds) {
  var token = Firestore_getAccessToken_();
  var keepSet = {};
  keepIds.forEach(function (id) { keepSet[id] = true; });

  var pageToken = null;
  do {
    var url = Firestore_baseUrl_() + '/' + collection + '?pageSize=200' + (pageToken ? '&pageToken=' + pageToken : '');
    var resp = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() >= 300) {
      throw new Error('Firestore 목록 조회 실패(' + collection + '): ' + resp.getContentText());
    }
    var json = JSON.parse(resp.getContentText());
    (json.documents || []).forEach(function (doc) {
      var name = doc.name; // projects/.../documents/{collection}/{docId}
      var id = name.substring(name.lastIndexOf('/') + 1);
      if (keepSet[id]) return;
      UrlFetchApp.fetch('https://firestore.googleapis.com/v1/' + name, {
        method: 'delete',
        headers: { Authorization: 'Bearer ' + token },
        muteHttpExceptions: true,
      });
    });
    pageToken = json.nextPageToken || null;
  } while (pageToken);
}
