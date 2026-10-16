// 목록의 최댓값과 최솟값. `Math.max(...목록)`은 목록을 함수 인자로 펼쳐 개수가 엔진의 호출 스택 한도(V8에서 약 10만 개)를 넘으면 RangeError로 끝난다.
// 개수가 원본 길이, 자료 파일, 시간표 사건 수에 따라 커지는 목록은 펼치지 않고 이 함수로 읽는다. 개수가 작고 정해진 목록(차트 계열, 글 줄, 패널)은 펼쳐 써도 된다.

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 값 수
// basis: estimate
/**
 * `Math.max(start, ...values)`와 같은 값(NaN이 있으면 NaN, 빈 목록이면 start)이고 스택을 쓰지 않는다.
 * @param values 숫자의 반복 가능 목록
 */
export function maxOf(values, start = -Infinity) {
  let max = start;
  for (const value of values) max = Math.max(max, value);
  return max;
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 값 수
// basis: estimate
/**
 * `Math.min(start, ...values)`와 같은 값(NaN이 있으면 NaN, 빈 목록이면 start)이고 스택을 쓰지 않는다.
 * @param values 숫자의 반복 가능 목록
 */
export function minOf(values, start = Infinity) {
  let min = start;
  for (const value of values) min = Math.min(min, value);
  return min;
}
