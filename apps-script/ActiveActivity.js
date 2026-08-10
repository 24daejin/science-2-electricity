/**
 * 반별로 "오늘 학생이 할 수 있는 활동들"을 지정하는 기능.
 *
 * 학생 홈 화면은 반코드로 로그인한 것만으로는 어떤 소단원/활동에 참여해야 하는지 알 수
 * 없었습니다(반코드는 그냥 로그인용). 이 파일은 그걸 보완합니다: 교사가 반마다 "지금 이
 * 활동들만 하세요"를 지정하면(한 번에 여러 개 가능 — 예: 형성평가를 마친 학생이 곧바로
 * "관련 내용 답하기"도 할 수 있게), 학생 화면엔 그 활동들이 속한 소단원(또는 진단평가)
 * 카드만 보이고, 그 안에서도 지정된 활동들만 버튼으로 눌리며 나머지는 목록에 보이기만
 * 하고 눌리지 않습니다.
 *
 * 활동키 형식: 'diagnostic' | 'formative-{소단원ID}' | 'chatbot-{소단원ID}' | 'resource-{소단원_자료ID}'
 * (형성평가는 문항 하나씩 넘기는 교사 진행 제어 없이, 활동키가 열리면 학생이 소단원 전체
 * 문항을 곧바로 자기 속도로 풉니다 — 이 파일은 "그 활동에 들어갈 수 있는지"만 결정합니다.)
 */

var CLASS_ACTIVE_ACTIVITY_HEADERS = ['반', '활성활동키', '수정시각', '수정자'];

/**
 * action=setClassActiveActivity: 반 하나에 활성 활동 "목록"을 통째로 지정합니다(기존 목록을
 * 덮어씀). 형성평가를 마친 학생이 곧바로 "관련 내용 답하기"도 할 수 있게, 같은 소단원 안의
 * 여러 활동을 동시에 켜둘 수 있습니다. activityKeys를 빈 배열로 보내면 "지정 해제"입니다.
 * (이전 버전 프론트엔드가 보내는 단일 activityKey 문자열도 하위 호환으로 받아줍니다.)
 */
function ActiveActivity_set(payload, auth) {
  requireTeacher_(auth);
  var classroom = String(payload.classroom || '').trim();
  if (!classroom) throw new Error('classroom이 필요합니다.');

  var activityKeys;
  if (Array.isArray(payload.activityKeys)) {
    activityKeys = payload.activityKeys.map(function (k) { return String(k || '').trim(); }).filter(Boolean);
  } else if (payload.activityKey) {
    activityKeys = [String(payload.activityKey).trim()];
  } else {
    activityKeys = [];
  }

  var rows = SheetUtils_getRows(SHEET_NAMES.CLASS_ACTIVE_ACTIVITY);
  if (rows === null) {
    SheetUtils_ensureSheet(SHEET_NAMES.CLASS_ACTIVE_ACTIVITY, CLASS_ACTIVE_ACTIVITY_HEADERS);
    rows = [];
  }

  var existing = rows.find(function (r) { return String(r['반']).trim() === classroom; });
  var rowObj = {
    반: classroom,
    활성활동키: activityKeys.join(','), // 시트 한 칸엔 콤마로 이어붙여 저장
    수정시각: new Date(),
    수정자: auth.name,
  };

  if (existing) {
    SheetUtils_updateRow(SHEET_NAMES.CLASS_ACTIVE_ACTIVITY, CLASS_ACTIVE_ACTIVITY_HEADERS, existing._row, rowObj);
  } else {
    SheetUtils_appendRow(SHEET_NAMES.CLASS_ACTIVE_ACTIVITY, CLASS_ACTIVE_ACTIVITY_HEADERS, rowObj);
  }

  // 시트 저장과 별개로 Firestore에도 바로 반영(학생 화면이 실시간으로 받음).
  try {
    Firestore_setDocument('classActiveActivity', classroom, {
      classroom: classroom,
      activityKeys: activityKeys,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.name,
    });
  } catch (e) {
    // Firestore가 아직 설정되지 않았을 수 있음 — 시트 저장은 이미 성공했으니 조용히 넘어간다.
  }

  return { saved: true };
}
