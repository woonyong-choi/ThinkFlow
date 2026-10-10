// md 명령이 줄 시작 모양으로 알아보는 CommonMark 블록(인용, 목록 항목, HTML 블록, 울타리)의 판별과 들여쓰기 계산. md-tags.js가 문서를 따라가며 쓰고, 울타리 줄의 문맥은 md.js와 md-fold.js도 쓴다. 파일은 다루지 않는다.
const HTML_BLOCK_NAMES = 'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';
export const ATTRIBUTE = String.raw`\s+[A-Za-z_:][\w:.-]*(?:\s*=\s*(?:[^\s"'=<>\`]+|'[^']*'|"[^"]*"))?`;
const OPEN_TAG = String.raw`<[A-Za-z][A-Za-z0-9-]*(?:${ATTRIBUTE})*\s*\/?>`;
const CLOSE_TAG = String.raw`<\/[A-Za-z][A-Za-z0-9-]*\s*>`;
// 줄 시작에서 HTML 블록을 여는 모양. 1~5번은 끝 조건이 있고 6, 7번은 빈 줄에서 끝난다. scan은 그 블록 안 태그를 세는지 여부다.
const RAW_STARTS = [
  { start: /^<(script|pre|style|textarea)(?=[\s>]|$)/i, end: /<\/(?:script|pre|style|textarea)>/i },
  { start: /^<!--/, end: /-->/, scan: true },
  { start: /^<\?/, end: /\?>/ },
  { start: /^<![A-Za-z]/, end: />/ },
  { start: /^<!\[CDATA\[/, end: /\]\]>/ },
];
const BLOCK_TAG = new RegExp(`^<\\/?(?:${HTML_BLOCK_NAMES})(?=[\\s>]|\\/>|$)`, 'i');
const ANY_TAG_LINE = new RegExp(`^(?:${OPEN_TAG}|${CLOSE_TAG})\\s*$`);
const PLAIN_ELEMENT = /^<\/?(?:script|style|pre|textarea)[\s>]/i;
export const QUOTE = /^ {0,3}> ?/;
const ITEM = /^( {0,3})([-+*]|\d{1,9}[.)])(?:([ \t]+)(?=\S)|[ \t]*$)/;
export const THEMATIC = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
export const ATX = /^ {0,3}#{1,6}(?:[ \t]|$)/;
export const SETEXT = /^ {0,3}(?:=+|-+)[ \t]*$/;
export const CODE_INDENT = 4;
// 인용 표시(`>`)가 앞에 있어도 울타리를 읽는다. 1번 묶음은 인용 표시와 그 뒤 공백 하나, 2번은 목록 들여쓰기다.
const FENCE_OPEN = /^((?:[ \t]*>[ \t]?)*)(\s*)(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^(`{3,}|~{3,})[ \t]*$/;
// 칸을 뗀 줄이 울타리를 여는 모양이면 문단에 이어 붙지 못한다(들여쓴 코드와 달리 울타리는 문단을 끊는다).
export const FENCE_START = /^ {0,3}(?:`{3,}[^`]*|~{3,}.*)$/;

export const isBlank = (text) => text.trim() === '';

// cost: time O(w), heap O(1), stack O(1)
// vars: w = 앞 공백 수
// basis: estimate
// 앞 공백의 너비. 탭은 4칸 단위다.
export function width(text) {
  let w = 0;
  for (const c of text) {
    if (c === ' ') w++;
    else if (c === '\t') w += 4 - (w % 4);
    else break;
  }
  return w;
}

// cost: time O(w), heap O(n), stack O(1)
// vars: w = 뗄 칸 수, n = 줄 글자 수
// basis: estimate
// 줄 앞에서 columns칸만큼 공백을 뗀다.
export function dedent(text, columns) {
  let w = 0;
  let i = 0;
  while (i < text.length && w < columns && (text[i] === ' ' || text[i] === '\t')) w += text[i++] === ' ' ? 1 : 4 - (w % 4);
  return text.slice(i);
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 줄 글자 수
// basis: estimate
// 줄이 새 칸(인용, 목록 항목)을 열면 { node, rest }, 아니면 undefined다. 문단 중이면 비어 있지 않은 항목이고 순서 목록은 1로 시작해야 끼어들 수 있다.
export function containerStart(rest, interrupting) {
  if (width(rest) >= CODE_INDENT || THEMATIC.test(rest)) return undefined;
  const quote = QUOTE.exec(rest);
  if (quote) return { node: { quote: true }, rest: rest.slice(quote[0].length) };
  const item = ITEM.exec(rest);
  if (!item) return undefined;
  const [whole, indent, marker, spaces] = item;
  const startsAtOne = /^0*1[.)]$/.test(marker) || !/^\d/.test(marker);
  if (interrupting && (spaces === undefined || !startsAtOne)) return undefined;
  const gap = spaces && spaces.length <= CODE_INDENT ? spaces.length : 1;
  return { node: { col: indent.length + marker.length + gap }, rest: rest.slice(whole.length) };
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 줄 글자 수
// basis: estimate
// 줄 시작이 HTML 블록을 여는 모양이면 { end, scan }, 아니면 undefined다. 7번(태그 하나만 있는 줄)은 문단에 끼어들지 못한다.
export function htmlStart(rest, interrupting) {
  if (width(rest) >= CODE_INDENT) return undefined;
  const text = rest.trimStart();
  const raw = RAW_STARTS.find(({ start }) => start.test(text));
  if (raw) return { end: raw.end, scan: raw.scan ?? /^<pre/i.test(text) };
  if (BLOCK_TAG.test(text)) return { end: undefined, scan: true };
  return !interrupting && ANY_TAG_LINE.test(text) && !PLAIN_ELEMENT.test(text) ? { end: undefined, scan: true } : undefined;
}


// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 여는 울타리 줄. 백틱 울타리의 설명 글자에는 백틱이 없다(CommonMark). leader는 인용 표시를 포함한 앞머리, quote는 인용 깊이, indent는 인용 뒤 들여쓰기다. quotes가 false면 인용 안 울타리는 울타리가 아니다.
export function openingFence(line, quotes) {
  const match = FENCE_OPEN.exec(line);
  if (!match || (match[1] && !quotes) || (match[3][0] === '`' && match[4].includes('`'))) return undefined;
  const quote = (match[1].match(/>/g) ?? []).length;
  return { leader: match[1], quote, indent: match[2], char: match[3][0], length: match[3].length, info: match[4].trim() };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 블록이 놓인 문맥(인용과 들여쓰기)을 다루는 도구. rest는 인용 표시를 뗀 줄(인용 밖이면 undefined), content는 거기서 들여쓰기까지 뗀 글(들여쓰기가 모자라면 undefined),
 * isBlank는 그 문맥에서 빈 줄인지(줄이 없어도 빈 줄), wrap은 새 줄 앞에 붙일 앞머리, blank는 새 빈 줄(인용 안에서는 `>`)이다.
 */
export function contextOf({ leader, quote, indent }) {
  const strip = quote ? new RegExp(`^(?:[ \\t]*>[ \\t]?){${quote}}`) : undefined;
  const rest = (line) => {
    if (!strip) return line;
    const found = strip.exec(line);
    return found ? line.slice(found[0].length) : undefined;
  };
  const content = (line) => rest(line)?.startsWith(indent) ? rest(line).slice(indent.length) : undefined;
  const isBlank = (line) => line === undefined || (rest(line) ?? line).trim() === '';
  return { rest, content, isBlank, wrap: leader + indent, blank: leader.trimEnd() };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 닫는 울타리 줄이면 true. 같은 글자로 열 때보다 길거나 같고 뒤에는 공백만 있으며, 앞 들여쓰기는 문맥(인용, 목록 칸)을 뗀 뒤 3칸까지다(4칸부터는 울타리 안 들여쓴 글이다). 여는 울타리 자신의 들여쓰기는 떼지 않는다. line은 문서 줄이고 open.ctx는 여는 울타리의 문맥, open.base는 그 목록 칸이 차지한 칸 수다.
export function closesFence(line, open) {
  const rest = open.ctx.rest(line) ?? '';
  const text = width(rest) >= open.base ? dedent(rest, open.base) : rest.trimStart();
  const match = width(text) < CODE_INDENT ? FENCE_CLOSE.exec(text.trimStart()) : null;
  return Boolean(match) && match[1][0] === open.char && match[1].length >= open.length;
}
