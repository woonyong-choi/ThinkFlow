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

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 값 수
// basis: estimate
/** 값 목록에 쓰인 가장 긴 소수 자릿수(상한 DECIMALS_MAX). 1000 이상 값은 k, M 표기라 세지 않는다. */
export function decimalPlaces(list) {
  const places = list.filter((v) => Math.abs(v) < 1000).map((v) => (String(Number(v.toPrecision(12))).split('.')[1] ?? '').length);
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
  return (value) => (Math.abs(value) >= 1000 ? formatNumber(value) : roundHalfAway(value, places).toFixed(places));
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
    return { ...axis, at: (v) => start + ((Math.log10(v) - lo) / (hi - lo)) * length, ticks, origin: 10 ** lo };
  }
  const low = fromZero ? Math.min(0, min) : min;
  const step = niceStep((max - low) / 5 || 1);
  const bottom = Math.floor(low / step) * step;
  const top = Math.max(bottom + step, Math.ceil(max / step) * step);
  const count = Math.round((top - bottom) / step);
  const ticks = Array.from({ length: count + 1 }, (_, k) => roundHalfAway(bottom + k * step, 10));
  return { ...axis, at: (v) => start + ((v - bottom) / (top - bottom)) * length, ticks, origin: Math.max(bottom, Math.min(0, top)) };
}

// cost: time O(1), heap O(1), stack O(1), alloc 1
// basis: estimate
// 1, 2, 5 × 10ⁿ 가운데 raw 이상인 가장 작은 값
function niceStep(raw) {
  const base = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * base).find((s) => s >= raw);
}
