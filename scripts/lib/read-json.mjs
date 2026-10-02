// 정본 JSON을 읽는다. 객체를 키 순서를 지키는 Map으로 읽어 숫자 키(`"600"`)가 앞으로 옮겨지지 않게 한다.
import { readFileSync } from 'node:fs';

const JSON_LITERAL = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y;
const SPACE = /[ \t\n\r]*/y;

// cost: time O(n), heap O(n), stack O(d), io 1
// vars: n = 파일 글자 수, d = 중첩 깊이
// basis: estimate
/** JSON 파일을 읽는다. 객체는 키 순서를 지키는 Map이다. */
export function readJson(path) {
  const state = { text: readFileSync(path, 'utf8'), at: 0 };
  const value = readValue(state);
  skipSpace(state);
  if (state.at < state.text.length) throw new SyntaxError(`${path}: unexpected text at ${state.at}`);
  return value;
}

// cost: time O(n), heap O(n), stack O(d)
// vars: n = 값 글자 수, d = 중첩 깊이
// basis: estimate
function readValue(state) {
  skipSpace(state);
  const char = state.text[state.at];
  if (char === '{') return readObject(state);
  if (char === '[') return readArray(state);
  JSON_LITERAL.lastIndex = state.at;
  const match = JSON_LITERAL.exec(state.text);
  if (!match) throw new SyntaxError(`unexpected character at ${state.at}`);
  state.at = JSON_LITERAL.lastIndex;
  return JSON.parse(match[0]);
}

// cost: time O(n), heap O(n), stack O(d)
// vars: n = 객체 글자 수, d = 중첩 깊이
// basis: estimate
function readObject(state) {
  const map = new Map();
  state.at += 1;
  skipSpace(state);
  if (state.text[state.at] === '}') {
    state.at += 1;
    return map;
  }
  for (;;) {
    const key = readValue(state);
    if (typeof key !== 'string') throw new SyntaxError(`object key must be a string at ${state.at}`);
    readMark(state, ':');
    map.set(key, readValue(state));
    if (readMark(state, ',}') === '}') return map;
  }
}

// cost: time O(n), heap O(n), stack O(d)
// vars: n = 배열 글자 수, d = 중첩 깊이
// basis: estimate
function readArray(state) {
  const list = [];
  state.at += 1;
  skipSpace(state);
  if (state.text[state.at] === ']') {
    state.at += 1;
    return list;
  }
  for (;;) {
    list.push(readValue(state));
    if (readMark(state, ',]') === ']') return list;
  }
}

// cost: time O(w), heap O(1), stack O(1)
// vars: w = 공백 수
// basis: estimate
/** 공백 뒤 글자 하나를 읽는다. `marks` 중 하나가 아니면 오류다. */
function readMark(state, marks) {
  skipSpace(state);
  const char = state.text[state.at];
  if (!char || !marks.includes(char)) throw new SyntaxError(`expected one of ${marks} at ${state.at}`);
  state.at += 1;
  return char;
}

// cost: time O(w), heap O(1), stack O(1)
// vars: w = 공백 수
// basis: estimate
function skipSpace(state) {
  SPACE.lastIndex = state.at;
  SPACE.exec(state.text);
  state.at = SPACE.lastIndex;
}
