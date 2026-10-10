// `--json` 출력 한 줄의 모양을 한 곳에 선언한다. 필드는 file, line, message, severity, code, column이고 이 순서로 낸다.

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 진단 하나를 `--json` 한 줄의 객체로. */
export function toJson(file, { line, message, severity, code, column }) {
  return { file, line, message, severity, code, column };
}
