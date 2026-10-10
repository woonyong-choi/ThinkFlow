// 값 글자 자리(slot)의 크기. 자리는 그 값이 모든 장면에서 가질 글의 실제 글꼴 폭으로 정하고, 글이 더해져 자리가 넓어지면 배치를 다시 한다.
// 시간표의 값 글은 이동 시간에 기대고 이동 시간은 배치에 기대므로, 배치와 시간표를 되풀이하되 자리는 줄어들지 않고 횟수에 상한을 둔다(build-scene.js).
import { measure } from './measure/fonts.js';
import { STYLE } from './measure/texts.js';

/** 배치와 시간표를 되풀이하는 횟수의 상한. 넘으면 값 글이 수렴하지 않는다는 오류다. */
export const SLOT_ITERATIONS = 4;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글 수
// basis: estimate
/** 글 목록이 차지할 가장 넓은 폭(px). 값 글자 자리가 같은 글꼴과 같은 방식으로 잰다. */
export function widestText(texts) {
  return Math.max(0, ...[...texts].map((text) => measure(text, STYLE.value.size, STYLE.value.face)));
}

// cost: time O(v·n), heap O(v), stack O(1)
// vars: v = 값 수, n = 글 수
// basis: estimate
/**
 * 값 자리 폭이 늘어난 값 이름 목록. previous와 next는 값 이름 → 글 집합이다.
 * 자리는 실제 글꼴 폭의 최댓값이라 줄어들지 않고, 글이 더해져도 가장 넓은 글보다 좁으면 자리는 그대로다.
 */
export function grownSlots(previous, next) {
  return [...next].filter(([id, set]) => widestText(set) > widestText(previous.get(id) ?? [])).map(([id]) => id);
}

// cost: time O(v·n), heap O(v·n), stack O(1)
// vars: v = 값 수, n = 글 수
// basis: estimate
/** 값 글 집합의 합집합. 자리가 단조롭게만 커지도록 이전 글을 잃지 않는다. */
export function unionTexts(previous, next) {
  return new Map([...next].map(([id, set]) => [id, new Set([...(previous.get(id) ?? []), ...set])]));
}
