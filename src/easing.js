// 3차 베지어 곡선 움직임. 토큰 easing의 [x1, y1, x2, y2]를 쓴다. x는 시간 비율, y는 진행 비율이다.
// 순수 수학은 motion-math.js가 소유하며 HTML도 같은 함수 원문을 실행한다.

import { motionMath } from './motion-math.js';
import { values } from './vendor/theme/tokens.js';

export const { progressAt, timeAt, paceLength, paceProgress } = motionMath();

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 토큰 easing 이름의 [x1, y1, x2, y2] */
export function curveOf(name) {
  return values.ease[name].slice(values.ease[name].indexOf('(') + 1, -1).split(',').map(Number);
}

/** 점이 선을 지나는 곡선(`easing.move`). 움직이는 SVG와 재생기가 같은 곡선을 쓴다. */
export const MOVE = curveOf('move');

// cost: time O(STEPS + l), heap O(1), stack O(1)
// vars: STEPS = 이분 탐색 횟수, l = 구간 수
// basis: estimate
/** 시간 비율 u(이동 시작 뒤 지난 시간 / 이동 시간)에서 점이 있는 경로 길이 비율. 이동 곡선을 건 진행 비율을 구간 꺾은선(pace)으로 길이 비율로 바꾼다. */
export function positionAt(u, pace) {
  return paceLength(pace, progressAt(MOVE, u));
}

// cost: time O(STEPS + l), heap O(1), stack O(1)
// vars: STEPS = 이분 탐색 횟수, l = 구간 수
// basis: estimate
/** positionAt의 반대. 경로 길이 비율 length에 닿는 시간 비율(이동 시작 뒤 지난 시간 / 이동 시간). 끝점(0, 1)도 곡선에서 풀어 구한다(arrivalOffsetMs는 끝점을 그대로 둔다). */
export function timeAtPosition(length, pace) {
  return timeAt(MOVE, paceProgress(pace, length));
}

// cost: time O(STEPS + l), heap O(1), stack O(1)
// vars: STEPS = 이분 탐색 횟수, l = 구간 수
// basis: estimate
/** 이동 곡선(`easing.move`)을 따르는 점이 경로 길이의 비율 fraction에 닿는 시각(이동 시작 뒤 ms). 구간별 이동 시간(pace)이 있으면 그 꺾은선을 거꾸로 푼다. 처음(0 이하)은 0, 끝(1 이상)은 이동 시간 그대로다. */
export function arrivalOffsetMs(fraction, durationMs, pace) {
  if (fraction <= 0) return 0;
  return fraction >= 1 ? durationMs : timeAt(MOVE, paceProgress(pace, fraction)) * durationMs;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** SVG keySplines 값 */
export function keySpline(curve) {
  return curve.join(' ');
}
