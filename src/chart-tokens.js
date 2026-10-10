// 차트 SVG 조각을 열고 닫는 태그와 글 낱말로 나눈다. 차트 그리기는 속성을 큰따옴표로만 쓰므로 정규식으로 충분하다.
// 프레임 비교(chart-frames.js)와 움직이는 SVG의 프레임 전환(animate/frames.js)이 같은 나눔을 쓴다.

const TAG = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g;
const ATTRIBUTE = /([\w:.-]+)="([^"]*)"/g;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = SVG 글자 수
// basis: estimate
/**
 * @returns 낱말 목록. 태그는 { type: 'open' | 'close' | 'self', tag, attrs: [이름, 값][], start, afterName, end, close? }이고(open의 close는 짝 닫는 태그의 낱말 번호), 글은 { type: 'text', text, start, end }다.
 */
export function tokenize(body) {
  const tokens = [];
  const stack = [];
  let last = 0;
  for (const m of body.matchAll(TAG)) {
    if (m.index > last) tokens.push({ type: 'text', text: body.slice(last, m.index), start: last, end: m.index });
    const type = m[1] ? 'close' : m[4] ? 'self' : 'open';
    const token = { type, tag: m[2], attrs: [...m[3].matchAll(ATTRIBUTE)].map((a) => [a[1], a[2]]), start: m.index, afterName: m.index + 1 + m[2].length, end: m.index + m[0].length };
    if (type === 'open') stack.push(tokens.length);
    if (type === 'close' && stack.length) tokens[stack.pop()].close = tokens.length;
    tokens.push(token);
    last = token.end;
  }
  if (last < body.length) tokens.push({ type: 'text', text: body.slice(last), start: last, end: body.length });
  return tokens;
}
