// 원본의 시간과 숫자 값을 읽는다.
import { NUMBER_PATTERN, TIME_PATTERN } from './words.js';

/** `900ms`, `2s`를 밀리초로. 형식이 틀리거나 0 이하면 undefined. isZeroOk면 0도 받는다(출발 시각처럼 0이 뜻이 있는 자리). */
export function parseTime(text, isZeroOk = false) {
  const m = TIME_PATTERN.exec(text ?? '');
  if (!m) return undefined;
  const ms = Number(m[1]) * (m[2] === 's' ? 1000 : 1);
  return ms > 0 || (isZeroOk && ms === 0) ? ms : undefined;
}

/** 십진수 글을 숫자로. `-`와 소수점만 받는다. 아니면 undefined. */
export function parseNumber(text) {
  return NUMBER_PATTERN.test(text ?? '') ? Number(text) : undefined;
}
