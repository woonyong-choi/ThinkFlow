// 파일 글에서 하드코딩을 찾는 함수들. check-tokens.mjs가 쓴다.
import { AT_CONDITION, BARE_VALUE, COLOR_FUNCTION, COMMENT, CONDITION_VALUE, CSS_EXTS, CUSTOM_PROPERTY, FONT_FAMILY, FREE_LENGTHS, FREE_NUMBERS, HEX_COLOR, JS_COMMENT_OR_STRING, JS_PATH_PART, JS_TOKEN_PATH, LENGTH, LOOKS_STYLED, PLAIN_STRING, STRING, STYLE_OBJECT_NUMBER, STYLE_OBJECT_START, THEME_BRANCH, UNITLESS_ATTRIBUTE, UNITLESS_PROPERTY, VAR_REFERENCE } from './tokens-patterns.mjs';

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 줄바꿈만 남기고 같은 길이의 공백으로 바꾼다. 줄 번호와 위치를 지키기 위해서다. */
function blank(text) {
  return text.replace(/[^\n]/g, ' ');
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 검사할 조각 목록. isStyled가 false면 색 규칙만 적용한다. */
export function findSegments(text, ext) {
  const plain = text.replace(COMMENT, blank);
  if (CSS_EXTS.has(ext)) return [{ offset: 0, segment: plain, isStyled: true }];
  return Array.from(plain.matchAll(STRING), (m) => ({ offset: m.index, segment: m[0], isStyled: isStyledString(m[0]) }));
}

/** CSS나 마크업으로 보이거나 값 하나뿐인 문자열인지 본다. */
function isStyledString(literal) {
  return LOOKS_STYLED.test(literal) || BARE_VALUE.test(literal);
}

// cost: time O(n·k), heap O(f), stack O(1)
// vars: n = 조각 글자 수, f = 찾은 수, k = 건너뛸 구간 수
// basis: estimate
/** 조각 안 하드코딩. `{ position, rule, snippet }` 목록. 한 자리는 한 번만 보고한다. */
export function findHardcoded(segment, info, isStyled) {
  const hits = (pattern, rule, pick = (m) => m[0], keep = () => true) =>
    Array.from(segment.matchAll(pattern))
      .filter(keep)
      .map((m) => ({ position: m.index, rule: typeof rule === 'function' ? rule(m) : rule, snippet: pick(m) }));
  let found = [
    ...hits(HEX_COLOR, 'hex color'),
    ...hits(COLOR_FUNCTION, 'color function'),
    ...hits(VAR_REFERENCE, 'primitive token reference', (m) => m[1], (m) => info.primitiveNames.has(m[1])),
    ...hits(THEME_BRANCH, 'theme branch outside tokens'),
  ];
  if (!isStyled) return found;
  const conditions = Array.from(segment.matchAll(AT_CONDITION))
    .filter((m) => !m[0].includes('prefers-color-scheme'))
    .map((m) => [m.index, m.index + m[0].length]);
  for (const [start, end] of conditions) found.push(...findConditionValues(segment.slice(start, end), start, info.breakpoints));
  const reported = Array.from(segment.matchAll(CUSTOM_PROPERTY))
    .filter((m) => isRawCustomValue(m[2]))
    .map((m) => [m.index, m.index + m[0].length]);
  const skip = [...conditions, ...reported];
  found = found.filter((hit) => !isInside(hit.position, reported));
  found.push(...reported.map(([start, end]) => ({ position: start, rule: 'custom property outside tokens', snippet: trimSpace(segment.slice(start, end)) })));
  found.push(...hits(FONT_FAMILY, 'font family', (m) => trimSpace(m[0]), (m) => !isInside(m.index, skip)));
  found.push(...hits(LENGTH, 'length or time', undefined, (m) => !FREE_LENGTHS.has(m[0]) && !isInside(m.index, skip)));
  for (const pattern of [UNITLESS_PROPERTY, UNITLESS_ATTRIBUTE]) {
    found.push(...hits(pattern, (m) => `${m[1]} number`, undefined, (m) => !FREE_NUMBERS.has(m[2]) && !isInside(m.index, reported)));
  }
  return found;
}

// cost: time O(n), heap O(f), stack O(1)
// vars: n = 조건 글자 수, f = 찾은 수
// basis: estimate
/** `@media`, `@container` 조건의 숫자. px가 아닌 단위와 breakpoint 토큰에 없는 px를 찾는다. */
function findConditionValues(condition, offset, breakpoints) {
  return Array.from(condition.matchAll(CONDITION_VALUE))
    .filter((m) => m[2] !== 'px' || !breakpoints.has(m[1]))
    .map((m) => ({ position: offset + m.index, rule: 'condition not breakpoint token', snippet: m[0] }));
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 값 글자 수
// basis: estimate
/** 토큰 참조만으로 만든 값이 아닌지 본다. `calc(var(--a) * 2)`의 계수 2는 허용한다. */
function isRawCustomValue(value) {
  const rest = value.replace(/var\([^()]*\)/g, '');
  return /#|['"]|\d+(?:px|rem|em|ms|s|%)/.test(rest);
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 구간 수
// basis: estimate
/** 위치가 구간 중 하나 안에 있는지 본다. */
export function isInside(position, spans) {
  return spans.some(([start, end]) => start <= position && position < end);
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 앞뒤 공백을 지운다. 구분 제어 문자(\x1c~\x1f)도 공백으로 본다. */
function trimSpace(text) {
  return text.replace(/^[\s\x1c-\x1f]+|[\s\x1c-\x1f]+$/g, '');
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 파일 글자 수
// basis: estimate
/** 문자열은 두고 `//`, `/* *\/` 주석만 같은 길이의 공백으로 바꾼다. 줄 번호를 지키기 위해서다. */
export function stripJsComments(text) {
  return text.replace(JS_COMMENT_OR_STRING, (whole, literal) => literal || blank(whole));
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 파일 글자 수
// basis: estimate
/** JavaScript 코드의 색·그림자 기본 토큰 경로 참조와 스타일 객체 숫자. 주석은 이미 지운 글자를 받는다. */
export function findScriptValues(text, info) {
  const found = [];
  // 일반 문자열 안 글자는 코드가 아니다. `['600']` 같은 경로 키와 템플릿 문자열은 남긴다.
  const codeAndTemplates = text.replace(PLAIN_STRING, blank);
  for (const m of codeAndTemplates.matchAll(JS_TOKEN_PATH)) {
    const tokenPath = Array.from(m[1].matchAll(JS_PATH_PART), (part) => part[1] || part[2] || '');
    if (info.primitivePaths.has(tokenPath.join('\u0000'))) found.push({ position: m.index, rule: 'primitive token reference', snippet: m[0] });
  }
  const code = text.replace(STRING, blank);
  for (const [start, end] of findStyleObjects(code)) {
    for (const m of code.slice(start, end).matchAll(STYLE_OBJECT_NUMBER)) {
      if (!FREE_NUMBERS.has(m[2])) found.push({ position: start + m.index, rule: `${m[1]} number`, snippet: m[0] });
    }
  }
  return found;
}

// cost: time O(n·s), heap O(s), stack O(1)
// vars: n = 코드 글자 수, s = 스타일 객체 수
// basis: estimate
/** 스타일 객체 중괄호 구간. 여는 중괄호부터 짝이 맞는 닫는 중괄호까지. */
function findStyleObjects(code) {
  const spans = [];
  for (const m of code.matchAll(STYLE_OBJECT_START)) {
    const end = m.index + m[0].length;
    let depth = 0;
    for (let position = end - 1; position < code.length; position += 1) {
      if (code[position] === '{') depth += 1;
      else if (code[position] === '}') depth -= 1;
      if (depth === 0) {
        spans.push([end, position]);
        break;
      }
    }
  }
  return spans;
}

// cost: time O(log l), heap O(1), stack O(1)
// vars: l = 줄 수
// basis: estimate
/** 글자 위치의 줄 번호(1부터). 줄 시작 위치 목록에서 이분 탐색한다. */
export function findLineNumber(lineStarts, position) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (lineStarts[mid] <= position) low = mid;
    else high = mid - 1;
  }
  return low + 1;
}
