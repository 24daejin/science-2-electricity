/**
 * 반별로 "오늘 학생이 할 수 있는 활동"을 딱 하나만 지정하는 기능.
 *
 * 학생 홈 화면은 반코드로 로그인한 것만으로는 어떤 소단원/활동에 참여해야 하는지 알 수
 * 없었습니다(반코드는 그냥 로그인용). 이 파일은 그걸 보완합니다: 교사가 반마다 "지금 이
 * 활동만 하세요"를 지정하면, 학생 화면엔 그 활동이 속한 소단원(또는 진단평가) 카드만
 * 보이고, 그 안에서도 지정된 활동만 선택 가능(나머지는 드롭다운에 보이기만 하고 비활성화)합니다.
 *
 * 활동키 형식: 'diagnostic' | 'formative-{소단원ID}' | 'chatbot-{소단원ID}' | 'resource-{소단원_자료ID}'
 * (문항 하나씩 넘기는 세부 진행은 이 파일과 별개로 세션_상태/Session.js가 계속 담당합니다 —
 * 이 파일은 "그 활동에 들어갈 수 있는지"만 결정하고, 들어간 뒤의 문항 진행은 그대로입니다.)
 */

var CLASS_ACTIVE_ACTIVITY_HEADERS = ['반', '활성활동키', '수정시각', '수정자'];

/** action=setClassActiveActivity: activityKey를 빈 문자열로 보내면 "지정 해제"입니다. */
function ActiveActivity_set(payload, auth) {
  requireTeacher_(auth);
  var classroom = String(payload.classroom || '').trim();
  var activityKey = String(payload.activityKey || '').trim();
  if (!classroom) throw new Error('classroom이 필요합니다.');

  var rows = SheetUtils_getRows(SHEET_NAMES.CLASS_ACTIVE_ACTIVITY);
  if (rows === null) {
    SheetUtils_ensureSheet(SHEET_NAMES.CLASS_ACTIVE_ACTIVITY, CLASS_ACTIVE_ACTIVITY_HEADERS);
    rows = [];
  }

  var existing = rows.find(function (r) { return String(r['반']).trim() === classroom; });
  var rowObj = {
    반: classroom,
    활성활동키: activityKey,
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
      activityKey: activityKey,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.name,
    });
  } catch (e) {
    // Firestore가 아직 설정되지 않았을 수 있음 — 시트 저장은 이미 성공했으니 조용히 넘어간다.
  }

  return { saved: true };
}
