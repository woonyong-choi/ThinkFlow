// 조건과 대기를 쓰는 단계의 시간 표현(docs/design/playback.md 시간 정밀도). 이벤트, 점의 출발과 도착, 값 변화, 대기 해제, 시간 초과가 모두 같은 눈금의 정수 번호로 시각을 센다.
import { arrivalOffsetMs } from './easing.js';
import { DIGITS } from './format.js';
import { FigureError, makeDiagnostic } from './source/problems.js';

/** 1ms를 나눈 눈금 수. 시간표가 담는 자릿수(소수 다섯째 자리)와 같아 눈금 하나가 0.00001ms다. */
export const TICKS_PER_MS = 10 ** DIGITS.ratio;

// 입력이 눈금의 정수배인지 가르는 허용 오차(눈금 단위). 큰 값(1시간 = 3.6e11 눈금)의 이진 부동소수점 오차보다 크고 눈금의 1%보다 작다.
const GRID_TOLERANCE = 1e-3;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 지원하지 않는 시간 정밀도 오류(`time-precision`). 줄은 그 시간을 쓴 줄이다. */
export function precisionError(line, message) {
  return new FigureError([makeDiagnostic({ severity: 'error', line, message: `time precision is not supported: ${message}` }, { code: 'time-precision' })]);
}

/** 눈금 번호를 ms로. 같은 번호는 늘 같은 ms다. */
export const msOfTicks = (ticks) => ticks / TICKS_PER_MS;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 원본에 적은 시간(ms)의 눈금 번호. 눈금의 정수배가 아니면(`0.000001ms`, `0.000015ms`) 반올림해 다른 시각과 합치거나 가르지 않고 오류로 끝낸다.
 * @param key 원본의 옵션 이름(`at`, `every`, `time`, `timeout`, `legs`, `for`). 오류 메시지에 쓴다
 */
export function inputTicks(ms, { line, key }) {
  const exact = ms * TICKS_PER_MS;
  const ticks = Math.round(exact);
  if (Math.abs(exact - ticks) > Math.max(GRID_TOLERANCE, Math.abs(ticks) * 1e-14)) throw precisionError(line, `${key}=${ms}ms is finer than the ${msOfTicks(1)}ms that events keep. Use a multiple of ${msOfTicks(1)}ms`);
  return ticks;
}

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 구간별 시간 수
// basis: estimate
/** 원본의 이동 시간 입력(`time=`, `legs=`의 항목)이 모두 눈금의 정수배인지 본다. 아니면 오류다. */
export function checkMoveInputs({ timeMs, legTimes }, line) {
  if (timeMs !== undefined) inputTicks(timeMs, { line, key: 'time' });
  for (const leg of legTimes ?? []) if (leg !== null) inputTicks(leg, { line, key: 'legs' });
}

// cost: time O(p·s), heap O(p), stack O(1)
// vars: p = 경로의 도형 수, s = 곡선 풀이 횟수
// basis: estimate
/**
 * 이동 하나를 눈금에 올린다. 이동 시간(거리로 정한 값처럼 눈금에 맞지 않을 수 있는 계산 값)을 가장 가까운 눈금으로 바꾸고, 경로의 도형마다 닿는 눈금 번호(출발 뒤)를 정한다.
 * 이동 시간이 눈금 하나보다 짧거나, 서로 다른 시각에 닿는 두 도형이 같은 눈금으로 합쳐지면 그 줄의 `time-precision` 오류다. 그래서 도착은 늘 출발보다 뒤이고 도형 순서가 시각 순서와 같다.
 * @param plan { ms, fracs, pace?, nodes }
 * @returns 이동 시간을 눈금에 올린 plan. ms는 눈금의 정수배이고 arrivals[k]는 k번째 도형에 닿는 눈금 번호(arrivals[0]은 0)다
 */
export function gridPlan(plan, { line }) {
  const ticks = Math.round(plan.ms * TICKS_PER_MS);
  if (!(ticks >= 1)) throw precisionError(line, `a move of ${plan.ms}ms is shorter than the time grid of ${msOfTicks(1)}ms. Make it at least ${msOfTicks(1)}ms`);
  const ms = msOfTicks(ticks);
  const arrivals = plan.fracs.map((frac) => Math.round(arrivalOffsetMs(frac, ms, plan.pace) * TICKS_PER_MS));
  for (let k = 1; k < arrivals.length; k++) {
    if (arrivals[k] <= arrivals[k - 1] && plan.fracs[k] > plan.fracs[k - 1]) throw precisionError(line, `the move reaches ${plan.nodes[k - 1]} and ${plan.nodes[k]} within the same ${msOfTicks(1)}ms of its ${ms}ms. Make it longer`);
  }
  return { ...plan, ms, arrivals };
}
