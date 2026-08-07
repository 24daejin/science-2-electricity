/**
 * 확신도 태그 3종 -> 피드백 2버킷(확신/비확신) 매핑.
 * "정확하게 알고 있음"만 확신으로 분류하고, 나머지 둘("다른 것들이 아니라서"=소거법,
 * "정확하게는 잘 모르겠음")은 모두 비확신으로 분류합니다.
 * (진짜 개념 이해에 기반한 확신만 "확신"으로 보고, 소거법/추측은 비확신으로 취급)
 */
const CONFIDENCE_TAGS = [
  { key: 'know_precisely', label: '정확하게 알고 있음', bucket: 'confident' },
  { key: 'by_elimination', label: '다른 것들이 아니라서', bucket: 'unsure' },
  { key: 'not_sure', label: '정확하게는 잘 모르겠음', bucket: 'unsure' },
];

function feedbackKeyFor(isCorrect, confidenceBucket) {
  const correctness = isCorrect ? 'correct' : 'incorrect';
  const bucket = confidenceBucket === 'confident' ? 'confident' : 'unsure';
  return `${correctness}_${bucket}`;
}
