// 3차 베지어 곡선 움직임. 토큰 easing의 [x1, y1, x2, y2]를 쓴다. x는 시간 비율, y는 진행 비율이다.
// player.js에도 같은 계산이 있다. 브라우저 코드는 이 파일을 불러올 수 없어 따로 둔다.

import { values } from './tokens.js';

const STEPS = 30;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 토큰 easing 이름의 [x1, y1, x2, y2] */
export function curveOf(name) {
  return values.easing[name].match(/[\d.]+/g).map(Number);
}

function axis(a, b, t) {
  return 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
}

// cost: time O(STEPS), heap O(1), stack O(1)
// vars: STEPS = 이분 탐색 횟수
// basis: estimate
/** 진행 비율 progress에 닿는 시간 비율. 곡선의 y가 progress가 되는 매개변수를 이분 탐색으로 찾는다. */
export function timeAt(curve, progress) {
  const [x1, y1, x2, y2] = curve;
  let [low, high] = [0, 1];
  for (let i = 0; i < STEPS; i++) {
    const mid = (low + high) / 2;
    if (axis(y1, y2, mid) < progress) low = mid;
    else high = mid;
  }
  return axis(x1, x2, (low + high) / 2);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** SVG keySplines 값 */
export function keySpline(curve) {
  return curve.join(' ');
}
