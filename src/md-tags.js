// md 명령이 문서 줄을 CommonMark 블록 구조(인용, 목록 항목, HTML 블록, 문단, 들여쓴 코드, 울타리)로 따라가며 읽는 규칙(docs/design/markdown.md 원본 접기 절 사용자 details). 파일은 다루지 않는다.
// 한 번의 걸음이 울타리(코드 블록)와 `<details>` 태그를 함께 읽는다. 들여쓴 코드나 HTML 블록(주석 포함) 안의 울타리는 울타리가 아니고, 4칸 넘게 들여쓴 줄은 닫는 울타리가 아니므로 블록 찾기와 태그 세기가 갈라지지 않는다.
// 줄 단위로 실제 태그만 센다. 코드 span, 여러 줄 HTML 주석, 백슬래시 이스케이프, 울타리와 들여쓴 코드 안의 태그는 세지 않는다.
// 인용과 목록 항목은 `<details>`를 품는 칸이다. 칸이 끝나면 그 안에서 연 태그도 끝난 것으로 보므로 다른 칸의 태그는 블록의 부모가 아니다.
// 지원하지 않는 것: 링크 참조 정의, 표 셀 경계, `<script>` 같은 원문 요소 안 태그의 브라우저 해석 차이. 목록 표시와 같은 줄에서 여는 울타리(`- ```dap`)는 울타리로 읽지 않는다.
import { ATTRIBUTE, ATX, CODE_INDENT, FENCE_START, QUOTE, SETEXT, THEMATIC, closesFence, contextOf, containerStart, dedent, htmlStart, isBlank, openingFence, width } from './md-blocks.js';

const RAW_TAG = /<!--|<\/?details(?=[\s/>]|$)/gi;
const INLINE_TAG = new RegExp(String.raw`<(\/?)details(?:${ATTRIBUTE})*\s*\/?>`, 'iy');
const ESCAPABLE = /[!-/:-@[-`{-~]/;

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 글자 수
// basis: estimate
// 위치 from에서 시작한 HTML 주석이 끝나는 위치(끝 표시 뒤). 닫히지 않으면 -1이다.
function commentEnd(text, from) {
  if (text.startsWith('>', from + 4)) return from + 5;
  if (text.startsWith('->', from + 4)) return from + 6;
  const end = text.indexOf('-->', from + 4);
  return end < 0 ? -1 : end + 3;
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 글자 수
// basis: estimate
// 위치 from의 백틱 묶음이 여는 코드 span이 끝나는 위치. 길이가 같은 닫는 묶음이 없으면 백틱 자체가 글자라 묶음 뒤 위치다.
function codeEnd(text, from) {
  let length = 0;
  while (text[from + length] === '`') length++;
  const runs = /`+/g;
  runs.lastIndex = from + length;
  for (let found = runs.exec(text); found; found = runs.exec(text)) if (found[0].length === length) return found.index + length;
  return from + length;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 태그 하나를 사건으로 적는다. 몇 개나 열려 있는지는 이 도구가 만든 감싸기 줄을 알고 나서 detailsBefore가 센다.
function count(s, line, kind) {
  s.events.push({ kind, line, container: s.containers.at(-1)?.id ?? 0 });
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 줄 글자 수
// basis: estimate
// HTML 블록 줄 하나의 태그를 센다. 원문이라 코드 span과 이스케이프는 없고 주석만 가린다. 주석이 줄을 넘으면 s.comment가 이어 받는다.
function scanRaw(s, text, line) {
  let from = 0;
  while (from < text.length) {
    if (s.comment) {
      const end = text.indexOf('-->', from);
      if (end < 0) return;
      [s.comment, from] = [false, end + 3];
      continue;
    }
    RAW_TAG.lastIndex = from;
    const found = RAW_TAG.exec(text);
    if (!found) return;
    const close = found[0] === '<!--' ? commentEnd(text, found.index) : found.index + found[0].length;
    if (found[0] === '<!--') s.comment = close < 0;
    else count(s, line, found[0][1] === '/' ? 'close' : 'open');
    if (close < 0) return;
    from = close;
  }
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 문단 글자 수
// basis: estimate
// 문단 글에서 위치 at의 한 글자나 한 덩어리를 건너뛰고 다음 위치를 준다. 태그를 만나면 세고 지나간다.
function stepInline(s, para, at) {
  const { text, lineAt } = para;
  const c = text[at];
  if (c === '\\') return ESCAPABLE.test(text[at + 1] ?? '') ? at + 2 : at + 1;
  if (c === '`') return codeEnd(text, at);
  if (c !== '<') return at + 1;
  if (text.startsWith('<!--', at)) {
    const end = commentEnd(text, at);
    return end < 0 ? at + 1 : end;
  }
  INLINE_TAG.lastIndex = at;
  const tag = INLINE_TAG.exec(text);
  if (!tag) return at + 1;
  count(s, lineAt(at), tag[1] ? 'close' : 'open');
  return at + tag[0].length;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 문단 글자 수
// basis: estimate
// 문단 하나를 앞에서부터 읽어 실제 태그만 센다. 코드 span과 주석은 가장 왼쪽에서 시작한 것이 이긴다.
function flush(s) {
  const { para } = s;
  if (!para) return;
  s.para = undefined;
  const starts = [];
  let offset = 0;
  for (const { text } of para.parts) {
    starts.push(offset);
    offset += text.length + 1;
  }
  const text = para.parts.map((part) => part.text).join('\n');
  const lineAt = (at) => para.parts[starts.findLastIndex((start) => start <= at)].line;
  for (let at = 0; at < text.length; ) at = stepInline(s, { text, lineAt }, at);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 줄이 문단에 이어 붙는다.
function addText(s, text, line) {
  s.para ??= { parts: [] };
  s.para.parts.push({ text, line });
}

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 닫는 칸 수
// basis: estimate
// 앞에서 kept개만 남기고 칸을 닫는다. 닫는 칸에서 연 태그도 끝난다(사건 end). 문단과 HTML 블록도 끝난다.
function closeFrom(s, kept) {
  if (kept >= s.containers.length) return;
  flush(s);
  s.html = undefined;
  while (s.containers.length > kept) s.events.push({ kind: 'end', container: s.containers.pop().id });
}

// cost: time O(c·n), heap O(n), stack O(1)
// vars: c = 열린 칸 수, n = 줄 글자 수
// basis: estimate
// 열린 칸마다 줄이 그 칸에 이어지는지 본다. 이어진 칸 수와 칸 표시를 뗀 나머지 글을 준다.
function matchContainers(s, line) {
  let rest = line;
  let matched = 0;
  for (const node of s.containers) {
    if (node.quote) {
      const mark = QUOTE.exec(rest);
      if (!mark) break;
      rest = rest.slice(mark[0].length);
    } else if (!isBlank(rest)) {
      if (width(rest) < node.col) break;
      rest = dedent(rest, node.col);
    }
    matched++;
  }
  return { rest, matched };
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 줄 글자 수
// basis: estimate
// 인용이나 항목에 이어지지 않은 줄이 앞 문단에 이어 붙는지(lazy continuation). 새 칸이나 블록(울타리 포함)을 여는 줄은 이어 붙지 않는다.
function isLazy(s, rest) {
  if (!s.para || isBlank(rest) || containerStart(rest, true) || ATX.test(rest) || THEMATIC.test(rest) || FENCE_START.test(rest) || htmlStart(rest, true)) return false;
  return true;
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 줄 글자 수
// basis: estimate
// HTML 블록 안 줄 하나. 빈 줄에서 끝나는 블록은 빈 줄에서 닫고, 끝 조건이 있는 블록은 그 줄까지 담는다.
function rawLine(s, text, line) {
  if (!s.html.end && isBlank(text)) {
    s.html = undefined;
    return;
  }
  s.raw.add(line);
  if (s.html.scan) scanRaw(s, text, line);
  if (s.html.end?.test(text)) s.html = undefined;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 줄 글자 수
// basis: estimate
// 칸을 정리한 뒤 남은 글 하나를 블록 종류에 따라 처리한다.
function leaf(s, rest, line) {
  if (isBlank(rest)) return flush(s);
  if (s.para && (SETEXT.test(rest) || THEMATIC.test(rest))) return flush(s);
  if (THEMATIC.test(rest)) return undefined;
  if (ATX.test(rest)) {
    flush(s);
    addText(s, rest, line);
    return flush(s);
  }
  const html = htmlStart(rest, Boolean(s.para));
  if (html) {
    flush(s);
    s.html = html;
    return rawLine(s, rest, line);
  }
  if (width(rest) >= CODE_INDENT && !s.para) {
    s.code.add(line);
    s.raw.add(line);
    return undefined;
  }
  return addText(s, rest, line);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 울타리 줄 하나를 코드 줄로 적는다.
function markFenced(s, line) {
  for (const set of [s.code, s.raw]) set.add(line);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 열려 있는 울타리가 이 줄을 담으면 true. 담지 않으면(인용이 끝났다) 울타리를 끝내고 false다. 닫는 울타리 줄이면 울타리를 닫는다.
function continuesFence(s, line) {
  const { fence } = s;
  if (fence.ctx.rest(s.lines[line]) === undefined) {
    s.fences.push({ ...fence, end: 'quote' });
    s.fence = undefined;
    return false;
  }
  markFenced(s, line);
  if (closesFence(s.lines[line], fence)) {
    s.fences.push({ ...fence, end: 'closed', close: line });
    s.fence = undefined;
  }
  return true;
}

// cost: time O(c·n), heap O(n), stack O(1)
// vars: c = 열린 칸 수, n = 줄 글자 수
// basis: estimate
// 줄 하나를 읽는다. 열린 울타리 안 줄은 울타리가 가져가고, 그 밖의 줄은 칸을 정리한 뒤 울타리를 여는 줄이거나 블록 한 줄이다.
// 울타리를 여는 줄은 칸만 갱신하고 블록 앞 상태를 사건 block으로 남긴다.
function feed(s, line) {
  if (s.fence && continuesFence(s, line)) return undefined;
  const { rest, matched } = matchContainers(s, s.lines[line]);
  const all = matched === s.containers.length;
  if (s.html && all) return rawLine(s, rest, line);
  if (!all && isLazy(s, rest)) return addText(s, rest, line);
  closeFrom(s, matched);
  let remainder = rest;
  for (let start = containerStart(remainder, Boolean(s.para)); start; start = containerStart(remainder, Boolean(s.para))) {
    flush(s);
    s.containers.push({ ...start.node, id: ++s.ids });
    remainder = start.rest;
  }
  const open = openingFence(s.lines[line], s.quotes);
  if (!open || width(remainder) >= CODE_INDENT) return leaf(s, remainder, line);
  flush(s);
  s.html = undefined;
  markFenced(s, line);
  s.events.push({ kind: 'block', line });
  s.fence = { ...open, at: line, ctx: contextOf(open), base: Math.max(0, width(open.indent) - width(remainder)) };
  return undefined;
}

// cost: time O(n·c), heap O(n), stack O(1)
// vars: n = 문서 줄 수, c = 열린 칸 수
// basis: estimate
/**
 * 문서 줄을 한 번 따라가며 울타리와 `<details>` 태그를 읽는다. quotes가 false면 인용(`>`) 안 울타리는 울타리가 아니다.
 * 인용 안 울타리는 인용이 끝나기 전에 닫혀야 한다. 인용 표시 없는 줄을 만나면 울타리가 거기서 끝난다.
 * @returns { fences, code, raw, events }. fences는 울타리마다 { at, close?, end, leader, quote, indent, char, length, info, ctx, base }(base는 목록 칸이 차지한 칸 수, at, close는 0부터 센 줄 번호, end는 'closed', 'quote'(인용이 먼저 끝남), 'eof'(문서 끝까지 안 닫힘)),
 *   code는 코드로 읽는 줄 번호 집합(울타리 줄과 들여쓴 코드), raw는 거기에 HTML 블록 줄을 더한 집합(이 도구가 읽거나 바꾸지 않는 줄), events는 detailsBefore가 읽는 태그와 칸 사건이다
 */
export function scanDocument(lines, quotes) {
  const s = { lines, quotes, containers: [], ids: 0, fence: undefined, fences: [], events: [], code: new Set(), raw: new Set(), comment: false };
  for (let line = 0; line < lines.length; line++) feed(s, line);
  if (s.fence) s.fences.push({ ...s.fence, end: 'eof' });
  return { fences: s.fences, code: s.code, raw: s.raw, events: s.events };
}

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 사건 수
// basis: estimate
/**
 * 블록마다 그 앞까지 열려 있는 사용자 `<details>` 깊이를 읽는다.
 * @param events scanDocument의 events(인용 안 울타리까지 읽은 걸음이어야 한다)
 * @param wanted { blocks, skip }. blocks는 깊이를 알고 싶은 블록의 여는 울타리 줄 번호 집합, skip은 이 도구가 만든 감싸기 태그 줄 번호 집합이다
 * @returns 여는 울타리 줄 번호에서 { depth, broken, brokenAt }로. broken은 앞에서 짝 없는 `</details>`를 만났다는 뜻이고 brokenAt은 그 첫 줄 번호(1부터)다
 */
export function detailsBefore(events, { blocks, skip }) {
  const open = [];
  const seen = new Map();
  let broken = false;
  let brokenAt = 0;
  for (const event of events) {
    if (event.kind === 'end') while (open.at(-1) === event.container) open.pop();
    else if (event.kind === 'block') {
      if (blocks.has(event.line)) seen.set(event.line, { depth: open.length, broken, brokenAt });
    } else if (skip.has(event.line)) continue;
    else if (event.kind === 'open') open.push(event.container);
    else if (open.length) open.pop();
    else if (!broken) [broken, brokenAt] = [true, event.line + 1];
  }
  return seen;
}
