// D2 원본을 문장 나무로 나눈다. 의미는 d2.js가 정한다(docs/design/import.md D2).
// 문장: { line, paths: 경로[], ops: 화살표[], value?, block?, isRef? }. 경로는 마디 글의 목록이다. value는 { text, kind: 'text'|'block'|'array' }다.

// 줄 시작부터 다음 낱말이 화살표인지. 긴 것을 먼저 본다.
const EDGE_OPS = ['<->', '->', '<-', '--'];

// cost: time O(n), heap O(n), stack O(d)
// vars: n = 원본 글자 수, d = 블록 깊이
// basis: estimate
/** 원본 전체를 문장 나무로 읽는다. 읽지 못한 곳은 problems에 줄과 함께 넣고 그 문장을 건너뛴다. */
export function parseD2(text, onProblem) {
  const scanner = { text: text.replace(/^﻿/, ''), at: 0, line: 1, onProblem };
  const items = readBlock(scanner, false);
  return items;
}

// cost: time O(n), heap O(n), stack O(d)
// vars: n = 블록 글자 수, d = 블록 깊이
// basis: estimate
// `}`나 글 끝까지의 문장 목록
function readBlock(scanner, isNested) {
  const items = [];
  for (;;) {
    skipBlank(scanner);
    const c = scanner.text[scanner.at];
    if (c === undefined) {
      if (isNested) scanner.onProblem(scanner.line, 'a block has no "}". It is closed at the end of the file');
      return items;
    }
    if (c === '}') {
      scanner.at++;
      if (isNested) return items;
      scanner.onProblem(scanner.line, '"}" without an open block is not imported');
      continue;
    }
    const item = readStatement(scanner);
    if (item) items.push(item);
  }
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 건너뛸 글자 수
// basis: estimate
// 공백, 줄바꿈, `;`, 주석을 건너뛴다.
function skipBlank(scanner) {
  for (;;) {
    const c = scanner.text[scanner.at];
    if (c === '\n') scanner.line++;
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === ';') scanner.at++;
    else if (c === '#') skipLine(scanner);
    else return;
  }
}

const skipLine = (scanner) => {
  while (scanner.at < scanner.text.length && scanner.text[scanner.at] !== '\n') scanner.at++;
};

// cost: time O(n), heap O(n), stack O(d)
// vars: n = 문장 글자 수, d = 블록 깊이
// basis: estimate
// 문장 하나: 경로와 화살표, `:` 뒤 값, `{` 블록
function readStatement(scanner) {
  const line = scanner.line;
  const item = { line, paths: [], ops: [] };
  if (scanner.text[scanner.at] === '(') {
    item.isRef = true;
    skipStatement(scanner);
    return item;
  }
  item.paths.push(readPath(scanner));
  for (let op = readOp(scanner); op; op = readOp(scanner)) {
    item.ops.push(op);
    item.paths.push(readPath(scanner));
  }
  skipSpaces(scanner);
  if (scanner.text[scanner.at] === ':') {
    scanner.at++;
    skipSpaces(scanner);
    item.value = readValue(scanner);
    skipSpaces(scanner);
  }
  if (scanner.text[scanner.at] === '{') {
    scanner.at++;
    item.block = readBlock(scanner, true);
  }
  skipSpaces(scanner);
  const c = scanner.text[scanner.at];
  if (c !== undefined && !'\n;#}'.includes(c)) {
    scanner.onProblem(scanner.line, `the text "${scanner.text.slice(scanner.at).split('\n')[0].trim()}" is not imported. It is not a D2 key, edge, or value`);
    skipStatement(scanner);
  }
  return item;
}

const skipSpaces = (scanner) => {
  while (scanner.text[scanner.at] === ' ' || scanner.text[scanner.at] === '\t' || scanner.text[scanner.at] === '\r') scanner.at++;
};

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 문장 글자 수
// basis: estimate
// 문장 끝(줄 끝이나 `;`)까지 건너뛴다. 사이의 블록은 통째로 건너뛴다.
function skipStatement(scanner) {
  let depth = 0;
  while (scanner.at < scanner.text.length) {
    const c = scanner.text[scanner.at];
    if (depth === 0 && (c === '\n' || c === ';')) return;
    if (c === '\n') scanner.line++;
    if (c === '{') depth++;
    if (c === '}') {
      if (depth === 0) return;
      depth--;
    }
    if (c === '"' || c === "'") readQuoted(scanner);
    else scanner.at++;
  }
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 경로 글자 수
// basis: estimate
// 점으로 나눈 마디들. 마디는 따옴표 글이거나, 따옴표 없는 글(공백 포함, 화살표·`:`·`.`·`;`·괄호·줄바꿈 앞까지)이다.
function readPath(scanner) {
  const segments = [];
  do {
    skipSpaces(scanner);
    const c = scanner.text[scanner.at];
    if (c === '"' || c === "'") segments.push(readQuoted(scanner));
    else segments.push(readBare(scanner));
  } while (scanner.text[scanner.at] === '.' && ++scanner.at);
  return segments;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 마디 글자 수
// basis: estimate
function readBare(scanner) {
  const start = scanner.at;
  while (scanner.at < scanner.text.length) {
    const c = scanner.text[scanner.at];
    if ('.:;{}\n#'.includes(c) || EDGE_OPS.some((op) => scanner.text.startsWith(op, scanner.at))) break;
    scanner.at++;
  }
  return scanner.text.slice(start, scanner.at).trim();
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 따옴표 글자 수
// basis: estimate
// 따옴표 글. `\"`는 따옴표다.
function readQuoted(scanner) {
  const quote = scanner.text[scanner.at];
  let out = '';
  scanner.at++;
  while (scanner.at < scanner.text.length && scanner.text[scanner.at] !== quote) {
    if (scanner.text[scanner.at] === '\\' && scanner.at + 1 < scanner.text.length) scanner.at++;
    if (scanner.text[scanner.at] === '\n') scanner.line++;
    out += scanner.text[scanner.at++];
  }
  scanner.at++;
  return out;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function readOp(scanner) {
  skipSpaces(scanner);
  const op = EDGE_OPS.find((o) => scanner.text.startsWith(o, scanner.at));
  if (op) scanner.at += op.length;
  return op;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 값 글자 수
// basis: estimate
// `:` 뒤 값: 따옴표 글, `|...|` 블록 글, `[...]` 배열, 따옴표 없는 글
function readValue(scanner) {
  const c = scanner.text[scanner.at];
  if (c === '"' || c === "'") return { text: readQuoted(scanner), kind: 'text' };
  if (c === '|') return readBlockString(scanner);
  if (c === '[') {
    const end = scanner.text.indexOf(']', scanner.at);
    const stop = end < 0 ? scanner.text.length : end + 1;
    const text = scanner.text.slice(scanner.at + 1, stop - 1);
    scanner.at = stop;
    return { text, kind: 'array' };
  }
  if (c === '{' || c === undefined || c === '\n' || c === ';') return undefined;
  const start = scanner.at;
  while (scanner.at < scanner.text.length && !'\n;{}#'.includes(scanner.text[scanner.at])) scanner.at++;
  return { text: scanner.text.slice(start, scanner.at).trim(), kind: 'text' };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 블록 글 글자 수
// basis: estimate
// `|md 글 |`, `|||글|||`, ``|`js 글`|``. 여는 막대 수(와 백틱)만큼의 같은 꼴로 닫는다.
function readBlockString(scanner) {
  const open = /^\|+`?/.exec(scanner.text.slice(scanner.at))[0];
  const close = open.endsWith('`') ? `\`${open.slice(0, -1)}` : open;
  scanner.at += open.length;
  const lang = /^[\w-]*/.exec(scanner.text.slice(scanner.at))[0];
  scanner.at += lang.length;
  const end = scanner.text.indexOf(close, scanner.at);
  const stop = end < 0 ? scanner.text.length : end;
  const body = scanner.text.slice(scanner.at, stop);
  scanner.line += (body.match(/\n/g) ?? []).length;
  scanner.at = end < 0 ? stop : stop + close.length;
  return { text: body.trim(), kind: 'block', lang: lang || 'md' };
}
