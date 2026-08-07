/**
 * 이탈(탭 전환) 감지 로그.
 * Page Visibility API로 감지된 이벤트를 "기록만" 합니다.
 * 브라우저 잠금/탭 이동 차단은 기술적으로 불가능하므로 시도하지 않습니다.
 */

var DROPOUT_LOG_HEADERS = ['시각', '순번', '이름', '반', '번호', '화면', '이벤트', '비고'];

function DropoutLog_record(payload, auth) {
  var event = payload.event; // 'hidden' | 'visible'
  if (!event) throw new Error('event가 필요합니다.');

  SheetUtils_appendRow(SHEET_NAMES.DROPOUT_LOG, DROPOUT_LOG_HEADERS, {
    시각: new Date(),
    순번: auth.seq || '',
    이름: auth.name || '',
    반: auth.classroom || '',
    번호: auth.number || '',
    화면: payload.screen || '',
    이벤트: event,
    비고: payload.note || '',
  });

  return { saved: true };
}
