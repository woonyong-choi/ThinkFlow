// DBML 원본을 낱말로 나누고 요소(Project, Table, Ref, Enum, TableGroup)로 읽는다. 의미는 dbml.js가 정한다(docs/design/import.md DBML).

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
/**
 * 낱말 목록. 낱말은 { type: 'word'|'string'|'expr'|'punct', value, line, start, end }다.
 * 주석(`//`, `/* *\/`)은 버리고, 글은 `'...'`, `"..."`, `'''...'''`, 식은 백틱 글이다.
 */
export function tokenize(text) {
  const tokens = [];
  let at = 0;
  let line = 1;
  while (at < text.length) {
    const start = at;
    const token = readToken(text, at);
    at = token.end;
    if (token.type) tokens.push({ type: token.type, value: token.value, line, start, end: at });
    for (let i = start; i < at; i++) if (text[i] === '\n') line++;
  }
  return tokens;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 낱말 글자 수
// basis: estimate
// at에서 시작하는 낱말 하나 { type?, value?, end }. 공백과 주석은 type이 없다.
function readToken(text, at) {
  const c = text[at];
  if (/\s/.test(c)) return { end: at + 1 };
  if (text.startsWith('//', at)) return { end: endOfLine(text, at) };
  if (text.startsWith('/*', at)) return { end: blockEnd(text, at + 2, '*/') };
  if (text.startsWith("'''", at)) {
    const end = blockEnd(text, at + 3, "'''");
    return { type: 'string', value: text.slice(at + 3, end - 3).trim().replace(/\s+/g, ' '), end };
  }
  if (c === "'" || c === '"') {
    const end = quotedEnd(text, at);
    return { type: 'string', value: text.slice(at + 1, end - 1).replace(/\\(.)/g, '$1'), end };
  }
  if (c === '`') {
    const end = blockEnd(text, at + 1, '`');
    return { type: 'expr', value: text.slice(at + 1, end - 1), end };
  }
  if (text.startsWith('<>', at)) return { type: 'punct', value: '<>', end: at + 2 };
  if ('{}[]():,.<>-~'.includes(c)) return { type: 'punct', value: c, end: at + 1 };
  const word = /^[^\s{}[\]():,.<>'"`~]+/.exec(text.slice(at))[0];
  return { type: 'word', value: word, end: at + word.length };
}

const endOfLine = (text, at) => {
  const end = text.indexOf('\n', at);
  return end < 0 ? text.length : end;
};

const blockEnd = (text, at, close) => {
  const end = text.indexOf(close, at);
  return end < 0 ? text.length : end + close.length;
};

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 글자 수
// basis: estimate
function quotedEnd(text, at) {
  const quote = text[at];
  let i = at + 1;
  while (i < text.length && text[i] !== quote && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1;
  return Math.min(i + 1, text.length);
}

// cost: time O(t), heap O(t), stack O(d)
// vars: t = 낱말 수, d = 블록 깊이
// basis: estimate
/**
 * 낱말 목록을 요소 목록으로 읽는다. 요소는 { kind, line, ... }이고 kind는 project, table, ref, enum, group, 그리고 모르는 요소의 other다.
 * 낱말 하나하나를 거르지 않고, 줄과 블록 단위로 묶어 넘긴다. 줄 단위의 뜻은 dbml.js가 읽는다.
 */
export function parseDbml(tokens) {
  const cursor = { tokens, at: 0 };
  const elements = [];
  while (cursor.at < tokens.length) {
    const head = tokens[cursor.at];
    const word = head.type === 'word' ? head.value.toLowerCase() : '';
    const header = takeLine(cursor, true);
    const body = header.at(-1)?.value === '{' && header.at(-1).type === 'punct' ? takeBlock(cursor) : undefined;
    elements.push({ kind: word, line: head.line, header: body ? header.slice(0, -1) : header, body });
  }
  return elements;
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 줄 낱말 수
// basis: estimate
/** 같은 줄의 낱말들. stopAtOpen이면 `{`에서 끝난다(`{`를 포함한다). 대괄호 안은 줄이 바뀌어도 이어 읽는다. */
export function takeLine(cursor, stopAtOpen = false) {
  const out = [];
  const line = cursor.tokens[cursor.at]?.line;
  let depth = 0;
  while (cursor.at < cursor.tokens.length) {
    const token = cursor.tokens[cursor.at];
    if (depth === 0 && token.line !== line) break;
    if (token.type === 'punct' && token.value === '}' && depth === 0) break;
    cursor.at++;
    out.push(token);
    if (token.type === 'punct' && (token.value === '[' || token.value === '(')) depth++;
    if (token.type === 'punct' && (token.value === ']' || token.value === ')')) depth = Math.max(0, depth - 1);
    if (stopAtOpen && depth === 0 && token.type === 'punct' && token.value === '{') break;
  }
  if (!out.length) out.push(cursor.tokens[cursor.at++]);
  return out;
}

// cost: time O(t), heap O(t), stack O(d)
// vars: t = 블록 낱말 수, d = 블록 깊이
// basis: estimate
/** `{` 뒤부터 짝이 맞는 `}`까지의 줄 목록. 줄은 { tokens, block? }이고 안쪽 블록은 다시 줄 목록이다. */
export function takeBlock(cursor) {
  const lines = [];
  while (cursor.at < cursor.tokens.length) {
    const token = cursor.tokens[cursor.at];
    if (token.type === 'punct' && token.value === '}') {
      cursor.at++;
      return lines;
    }
    const tokens = takeLine(cursor, true);
    const opens = tokens.at(-1)?.type === 'punct' && tokens.at(-1).value === '{';
    lines.push({ tokens: opens ? tokens.slice(0, -1) : tokens, block: opens ? takeBlock(cursor) : undefined, line: tokens[0].line });
  }
  return lines;
}
