// 키 순서를 지키는 Map을 `JSON.stringify(값, null, 2)`와 같은 모양으로 쓴다. read-json.mjs가 읽은 정본을 다시 쓸 때 쓴다.

// cost: time O(n), heap O(n), stack O(d)
// vars: n = 값 글자 수, d = 중첩 깊이
// basis: estimate
/** 정본 글. 마지막에 줄바꿈이 붙는다. */
export function serializeJson(value) {
  return `${write(value, '')}\n`;
}

// cost: time O(n), heap O(n), stack O(d)
// vars: n = 값 글자 수, d = 중첩 깊이
// basis: estimate
function write(value, indent) {
  const inner = `${indent}  `;
  if (value instanceof Map) {
    if (!value.size) return '{}';
    return `{\n${[...value].map(([key, child]) => `${inner}${JSON.stringify(key)}: ${write(child, inner)}`).join(',\n')}\n${indent}}`;
  }
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return `[\n${value.map((child) => `${inner}${write(child, inner)}`).join(',\n')}\n${indent}]`;
  }
  return JSON.stringify(value);
}
