// 차트 축 눈금, 숫자 표기, 바뀐 비율. 규칙은 docs/design/charts.md의 그리기 절이다.
import { DECIMALS_MAX } from '../source/grammar.js';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 십진 반올림. 절반은 0에서 먼 쪽이다. 12자리로 먼저 줄여 이진 부동소수점 오차(0.1 + 0.2 꼴)를 지운다. */
export function roundHalfAway(value, digits = 0) {
  // 12자리로 줄인 뒤 십진 자리를 글자로 옮긴다. 1e+21, 5e-7 같은 지수 표기도 그대로 옮겨진다.
  const shifted = Math.round(shiftDecimal(Number(Math.abs(value).toPrecision(12)), digits));
  return Math.sign(value) * shiftDecimal(shifted, -digits);
}

// 십진 자리 옮기기. x × 10^n을 이진 곱셈 오차 없이 구한다.
function shiftDecimal(x, n) {
  const [mantissa, exponent = '0'] = String(x).split('e');
  return Number(`${mantissa}e${Number(exponent) + n}`);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 숫자 글자. 1000 이상은 k, 1000000 이상은 M, 소수 한 자리, 끝의 .0은 지운다. 1000 미만은 가장 짧은 십진 표기다. */
export function formatNumber(value) {
  const abs = Math.abs(value);
  if (abs < 1000) return String(Number(value.toPrecision(12)));
  const inK = roundHalfAway(value / 1000, 1);
  if (Math.abs(inK) < 1000) return `${inK}k`;
  return `${roundHalfAway(value / 1e6, 1)}M`;
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 눈금 수
// basis: estimate
/**
 * 눈금 글자 목록(눈금과 같은 순서). 기본은 formatNumber다. k, M의 소수 한 자리 반올림 때문에 서로 다른 눈금이 같은 글자가 되면(큰 값 위의 작은 간격)
 * 눈금마다 15자리 유효숫자의 십진 표기로 쓴다. 눈금이 15자리로도 가려지지 않는 범위는 값의 절댓값 1e15 미만 제한(source/chart-rules.js)이 막는다.
 */
export function tickLabels(ticks) {
  const labels = ticks.map(formatNumber);
  if (new Set(labels).size === labels.length) return labels;
  return ticks.map((t) => String(Number(t.toPrecision(15))));
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 값 수
// basis: estimate
/** 값 목록에 쓰인 가장 긴 소수 자릿수(상한 DECIMALS_MAX). 1000 이상 값은 k, M 표기라 세지 않는다. */
export function decimalPlaces(list) {
  const places = list.filter((v) => Math.abs(v) < 1000).map((v) => (String(Number(v.toPrecision(12))).split('e')[0].split('.')[1] ?? '').length);
  return Math.min(DECIMALS_MAX, Math.max(0, ...places));
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 값 수
// basis: estimate
/**
 * 값 글자를 만드는 함수. 같은 목록(계열, 표)은 같은 소수 자릿수로 쓴다. 자릿수는 decimals(머리 줄)이고, 없으면 목록에 쓰인 가장 긴 소수 자릿수다.
 * 1000 이상은 formatNumber(k, M)로 쓴다.
 */
export function valueFormat(list, decimals) {
  const places = decimals ?? decimalPlaces(list);
  // 소수 자릿수가 모자라 0으로 지워지는 0이 아닌 값은(머리 줄 decimals가 없을 때) 0으로 쓰지 않고 지수 표기로 쓴다.
  const isErased = (value) => decimals === undefined && value !== 0 && roundHalfAway(value, places) === 0;
  return (value) => (Math.abs(value) >= 1000 || isErased(value) ? formatNumber(value) : roundHalfAway(value, places).toFixed(places));
}

/** 덤벨 바뀐 비율 글자. 줄면 −, 늘면 +. 첫 값이 0이면 빈 글이다. */
export function formatChange(before, after) {
  if (before === 0) return '';
  const change = roundHalfAway(((after - before) * 100) / before);
  return `${change < 0 ? '−' : '+'}${Math.abs(change)}%`;
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 눈금 수
// basis: estimate
/**
 * 값 → 좌표 함수와 눈금. log는 10의 거듭제곱마다, linear는 1, 2, 5 단위로 다섯 칸 안팎이다.
 * linear는 0과 가장 작은 값 가운데 작은 쪽에서 시작한다. 값 축이 아닌 축(선 차트 가로축)은 fromZero=false로 가장 작은 값에서 시작한다.
 * @param range { min, max, start, length, fromZero }. 값 범위와, 좌표에서 축이 놓이는 시작과 길이
 * @returns { at, ticks, origin, start, length }
 */
export function makeScale(kind, { min, max, start, length, fromZero = true }) {
  const axis = { start, length };
  if (kind === 'log') {
    const lo = Math.floor(Math.log10(min));
    const hi = Math.max(lo + 1, Math.ceil(Math.log10(max)));
    const ticks = Array.from({ length: hi - lo + 1 }, (_, k) => 10 ** (lo + k));
    return { ...axis, at: (v) => start + ((Math.log10(v) - lo) / (hi - lo)) * length, ticks, labels: tickLabels(ticks), origin: 10 ** lo };
  }
  const low = fromZero ? Math.min(0, min) : min;
  const step = niceStep((max - low) / 5 || 1);
  // 눈금은 간격의 정수배다. 값 자체를 반올림하지 않고 정수배를 십진 글자로 이어 만들어, 간격이 아무리 작아도 눈금이 서로 다르다.
  const first = Math.floor(inSteps(low, step));
  const last = Math.max(first + 1, Math.ceil(inSteps(max, step)));
  const tickAt = (k) => Number(`${k * step.mantissa}e${step.exponent}`);
  const ticks = Array.from({ length: last - first + 1 }, (_, k) => tickAt(first + k));
  const [bottom, top] = [ticks[0], ticks.at(-1)];
  return { ...axis, at: (v) => start + ((v - bottom) / (top - bottom)) * length, ticks, labels: tickLabels(ticks), origin: Math.max(bottom, Math.min(0, top)) };
}

// cost: time O(1), heap O(1), stack O(1), alloc 1
// basis: estimate
// 1, 2, 5, 10 × 10ⁿ 가운데 raw 이상인 가장 작은 간격. 간격은 { mantissa, exponent }로 들고 다닌다(값은 mantissa × 10^exponent).
function niceStep(raw) {
  const exponent = Math.floor(Math.log10(raw));
  const mantissa = [1, 2, 5, 10].find((m) => m * Number(`1e${exponent}`) >= raw);
  return { mantissa, exponent };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 값이 간격의 몇 배인지. 십진 자리를 글자로 옮겨 나눠서 0.3 ÷ 0.1이 2.9999999999999996이 되는 이진 오차를 피한다.
function inSteps(value, { mantissa, exponent }) {
  return shiftDecimal(value, -exponent) / mantissa;
}
