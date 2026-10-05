// md 명령이 줄 시작 모양으로 알아보는 CommonMark 블록(인용, 목록 항목, HTML 블록)의 판별과 들여쓰기 계산. md-tags.js가 쓴다. 파일은 다루지 않는다.
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

