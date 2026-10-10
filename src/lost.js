// 사라짐(`lost=60%`)의 경계 판정. 시간표 계산(값, 후광, 선 켜짐, 카드 도착)이 같은 규칙을 쓴다(docs/design/playback.md 사라짐).

/** 경로 길이 비율을 견주는 오차. 퍼센트 글(`62.5%`)을 비율로 바꿀 때 생기는 부동소수점 오차를 같은 값으로 본다. */
const LOST_EPSILON = 1e-9;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 경로 길이 비율 fraction의 지점을 점이 사라지기 전에 통과했는지. 사라짐(lost)이 없으면 늘 통과다.
 * 사라지는 비율보다 작을 때만 통과다. 같거나 크면 같은 시각의 도착이라도 효과를 적용하지 않는다.
 */
export function isPassed(fraction, lost) {
  return lost === undefined || fraction < lost - LOST_EPSILON;
}
