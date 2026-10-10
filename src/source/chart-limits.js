// 모든 차트 입력의 공통 숫자 범위와 진단.
// 값의 절댓값 상한. 이보다 크면 십진 반올림이 12자리 정밀도를 넘어 눈금과 글자를 정확히 쓸 수 없다.
export const MAX_VALUE = 1e15;
/** 값이 범위를 넘을 때의 오류 글. 행 값, 기준선, 무한대가 되는 글이 같은 글을 쓴다. */
export const RANGE_MESSAGE = `values must be under ${MAX_VALUE.toExponential(0).replace('+', '')} in absolute value`;
// 0이 아닌 값의 절댓값 하한. 가장 작은 정규 수(2^-1022)다. 이보다 작은 비정규화 수는 간격 계산이 0으로 떨어지고 유효 자릿수도 줄어 그릴 수 없다.
export const MIN_VALUE = 2 ** -1022;
/** 0이 아닌 값이 하한보다 작을 때의 오류 글. */
export const TINY_MESSAGE = `nonzero values must be at least ${MIN_VALUE} in absolute value`;
/** 0이 아니고 절댓값이 하한보다 작은 숫자인지. */
export const isTiny = (number) => number !== 0 && Math.abs(number) < MIN_VALUE;
