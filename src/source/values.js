// 원본의 시간과 숫자 값을 읽는다.
import { MIN_VALUE } from './chart-limits.js';
import { NUMBER_PATTERN, TIME_PATTERN } from './words.js';

/** 시간 값 하나, 단계 하나의 길이, 그림 전체 시간의 상한(ms). 1시간이다. 1시간보다 긴 문서 그림 재생은 쓸모가 없어 정한 정책 상한이고, 부동소수점 정밀도를 보장하지 않는다(출발 시각의 정밀도는 따로 검사한다). */
export const TIME_LIMIT_MS = 3_600_000;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 시간 글의 밀리초. 형식이 틀리면 undefined, 너무 커서 무한대가 되면 Infinity다.
function timeMs(text) {
  const m = TIME_PATTERN.exec(text ?? '');
  return m ? Number(m[1]) * (m[2] === 's' ? 1000 : 1) : undefined;
}

/** `900ms`, `2s`를 밀리초로. 형식이 틀리거나 0 이하거나 상한(TIME_LIMIT_MS)을 넘으면 undefined. isZeroOk면 0도 받는다(출발 시각처럼 0이 뜻이 있는 자리). */
export function parseTime(text, isZeroOk = false) {
  const ms = timeMs(text);
  return ms !== undefined && ms <= TIME_LIMIT_MS && (ms > 0 || (isZeroOk && ms === 0)) ? ms : undefined;
}

/** 시간 모양은 맞지만 상한을 넘는 글인지. 모양이 틀린 글과 다른 오류 메시지를 내기 위해 가른다. */
export function isOverTimeLimit(text) {
  const ms = timeMs(text);
  return ms !== undefined && !(ms <= TIME_LIMIT_MS);
}

// 메시지에 되풀이하는 원본 글의 최대 길이. 자릿수가 아주 긴 값이 줄 하나를 채우지 않게 자른다.
const FOUND_LENGTH_MAX = 40;

/** 상한을 넘은 시간 값의 오류 메시지. key는 `for`, `time` 같은 이름이다. */
export const overLimitMessage = (key, text) => `${key} is over the limit of 1h (${TIME_LIMIT_MS}ms). Found "${text.length > FOUND_LENGTH_MAX ? `${text.slice(0, FOUND_LENGTH_MAX)}...` : text}"`;

/** 십진수 글을 숫자로. `-`와 소수점만 받는다. 모양이 틀리거나 Number로 바꾸면 무한대가 되는 글(309자리가 넘는 정수)이면 undefined. */
export function parseNumber(text) {
  const number = NUMBER_PATTERN.test(text ?? '') ? Number(text) : undefined;
  return Number.isFinite(number) ? number : undefined;
}

/** 숫자 모양은 맞지만 Number로 바꾸면 무한대가 되는 글인지. 모양이 틀린 글과 다른 오류 메시지를 내기 위해 가른다. */
export function isOverflowNumber(text) {
  return NUMBER_PATTERN.test(text ?? '') && !Number.isFinite(Number(text));
}

/** 숫자 모양이고 0이 아닌데 절댓값이 지원 하한보다 작은 글인지. Number로 바꾸면 0이 되는 글(0 뒤에 0이 400개인 소수)도 포함한다. */
export function isTinyNumber(text) {
  return NUMBER_PATTERN.test(text ?? '') && /[1-9]/.test(text) && Math.abs(Number(text)) < MIN_VALUE;
}
