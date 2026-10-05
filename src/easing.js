// 3차 베지어 곡선 움직임. 토큰 easing의 [x1, y1, x2, y2]를 쓴다. x는 시간 비율, y는 진행 비율이다.
// player/curve.js에도 같은 계산이 있다. 브라우저 코드는 이 파일을 불러올 수 없어 따로 둔다.

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

/** 점이 선을 지나는 곡선(`easing.move`). 움직이는 SVG와 재생기가 같은 곡선을 쓴다. */
export const MOVE = curveOf('move');

// cost: time O(l), heap O(1), stack O(1)
// vars: l = 구간 수
// basis: estimate
/** 구간별 이동 시간의 꺾은선 pace(`[시간 비율, 길이 비율]` 목록)에서 이동 곡선을 건 진행 비율 progress의 경로 길이 비율. pace가 없으면 progress 그대로다. player/curve.js에도 같은 계산이 있다. */
export function paceLength(pace, progress) {
  if (!pace) return progress;
  const k = Math.min(pace.length - 2, Math.max(0, pace.findLastIndex(([at]) => at <= progress)));
  const [[t0, l0], [t1, l1]] = [pace[k], pace[k + 1]];
  return t1 > t0 ? l0 + ((l1 - l0) * (Math.min(1, Math.max(0, progress)) - t0)) / (t1 - t0) : l1;
}

// cost: time O(l), heap O(1), stack O(1)
// vars: l = 구간 수
// basis: estimate
/** paceLength의 반대. 경로 길이 비율 length에 닿는 진행 비율. 길이가 늘지 않는 구간은 구간이 시작하는 진행 비율이다. pace가 없으면 length 그대로다. */
export function paceProgress(pace, length) {
  if (!pace) return length;
  const reached = pace.findIndex(([, l]) => l >= length);
  const k = reached < 0 ? pace.length - 2 : Math.max(0, reached - 1);
  const [[t0, l0], [t1, l1]] = [pace[k], pace[k + 1]];
  return l1 > l0 ? t0 + ((t1 - t0) * (Math.min(1, Math.max(0, length)) - l0)) / (l1 - l0) : t0;
}

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

// cost: time O(STEPS), heap O(1), stack O(1)
// vars: STEPS = 이분 탐색 횟수
// basis: estimate
/** 시간 비율 time의 진행 비율. timeAt의 반대로, 곡선의 x가 time이 되는 매개변수를 이분 탐색으로 찾는다. */
export function progressAt(curve, time) {
  const [x1, y1, x2, y2] = curve;
  let [low, high] = [0, 1];
  for (let i = 0; i < STEPS; i++) {
    const mid = (low + high) / 2;
    if (axis(x1, x2, mid) < time) low = mid;
    else high = mid;
  }
  return axis(y1, y2, (low + high) / 2);
}
