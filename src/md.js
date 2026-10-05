// 마크다운 안의 ```dap 블록 찾기와 블록 아래 이미지 줄 넣기. 파일은 다루지 않는다(계약은 docs/design/markdown.md).

/** 이미지 줄 끝의 표시. 이 표시가 붙은 줄만 이 도구가 만든 줄로 보고 갱신하거나 지운다. */
export const IMAGE_MARK = '<!-- dap -->';
// 옛 표시(`<!-- muto -->`)가 붙은 줄도 이 도구가 만든 줄로 보고 새 표시로 고쳐 쓴다.
const MARKED_IMAGE = /^\s*!\[.*\]\(.*\)<!-- (?:dap|muto) -->\s*$/;
/** 옛 울타리 언어 이름. 계속 읽고 폐기 안내를 낸다. */
export const LEGACY_FENCE = 'muto';
// 인용 표시(`>`)가 앞에 있어도 울타리를 읽는다. 1번 묶음은 인용 표시와 그 뒤 공백 하나, 2번은 목록 들여쓰기다.
const FENCE_OPEN = /^((?:[ \t]*>[ \t]?)*)(\s*)(`{3,}|~{3,})(.*)$/;
const BLOCK_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 여는 울타리 줄. 백틱 울타리의 설명 글자에는 백틱이 없다(CommonMark). leader는 인용 표시를 포함한 앞머리, quote는 인용 깊이, indent는 인용 뒤 들여쓰기다.
function openingFence(line, quotes) {
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
/** 이 도구가 만든 이미지 줄이면 true. 인용 표시가 앞에 있어도 된다. */
export const isMarkedImage = (line) => MARKED_IMAGE.test(line);

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 닫는 울타리 줄이면 true. 같은 글자로 열 때보다 길거나 같고 뒤에는 공백만 있다. line은 인용 표시를 뗀 줄이다.
function closesFence(line, open) {
  const match = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
  return Boolean(match) && match[1][0] === open.char && match[1].length >= open.length;
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 설명 글자의 낱말 수
// basis: estimate
// `dap name=flow` 설명 글자를 읽는다. dap(옛 muto) 울타리가 아니면 undefined, 형식이 틀리면 { error }다. fence는 쓴 언어 이름이다.
function parseInfo(info) {
  const [first, ...options] = info.split(/\s+/);
  if (first !== 'dap' && first !== LEGACY_FENCE) return undefined;
  let name;
  for (const option of options) {
    const value = /^name=(.+)$/.exec(option)?.[1];
    if (value === undefined) return { error: `unknown option "${option}" in the ${first} fence. Use name=<id>` };
    if (!BLOCK_NAME.test(value)) return { error: `block name "${value}" must be lowercase letters, digits, and "-"` };
    name = value;
  }
  return { name, fence: first };
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 본문 줄 수
// basis: estimate
// 인용 표시와 울타리 들여쓰기만큼 본문 줄 앞을 뗀다. 목록과 인용 안 블록도 같은 원본이 된다. 들여쓰기가 모자란 줄은 앞 공백을 모두 뗀다.
function dedent(lines, ctx) {
  return lines.map((line) => ctx.content(line) ?? ctx.rest(line).trimStart()).join('\n');
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 본문 줄 수
// basis: estimate
// 닫은 울타리 하나를 블록이나 오류로 모은다.
function addBlock(found, open, { lines, close }) {
  const info = parseInfo(open.info);
  if (info?.error) found.errors.push({ line: open.at + 1, message: info.error });
  else if (info) {
    const { at, leader, quote, indent } = open;
    found.blocks.push({ name: info.name, legacy: info.fence === LEGACY_FENCE, source: dedent(lines.slice(at + 1, close), open.ctx), open: at, close, indent, leader, quote });
  }
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 문서 줄 수
// basis: estimate
/**
 * 문서에서 dap 코드 블록을 찾는다. 다른 울타리(`text` 등) 안의 dap 줄은 블록이 아니다.
 * quotes가 true일 때만 인용(`>`) 안 울타리를 읽는다(false면 인용 안 울타리는 울타리로도 보지 않는다). 인용 안 울타리는 인용이 끝나기 전에 닫혀야 한다. 인용 표시 없는 줄을 만나면 울타리를 닫은 것으로 읽지 않고 dap 울타리는 오류로 알린다.
 * @returns { blocks, errors, fenced, opens }. blocks는 { name?, source, open, close, indent, leader, quote }(open, close는 0부터 센 줄 번호, leader는 인용 표시를 포함한 앞머리, quote는 인용 깊이),
 *   errors는 { line, message }(1부터 센 줄), fenced는 울타리에 든 줄 번호 집합, opens는 그중 여는 울타리 줄 번호 집합이다
 */
export function findBlocks(lines, quotes = false) {
  const found = { blocks: [], errors: [], fenced: new Set(), opens: new Set(), quotes };
  let open;
  for (const [index, line] of lines.entries()) {
    if (open && open.ctx.rest(line) === undefined) {
      if (parseInfo(open.info)) found.errors.push({ line: open.at + 1, message: 'the dap fence inside a block quote ends before its closing fence. Close the fence on a line that still has the quote mark', quote: true });
      open = undefined;
    }
    if (!open) {
      open = openingFence(line, quotes);
      if (open) Object.assign(open, { at: index, ctx: contextOf(open) });
      if (open) found.fenced.add(index);
      if (open) found.opens.add(index);
      continue;
    }
    found.fenced.add(index);
    if (!closesFence(open.ctx.rest(line), open)) continue;
    addBlock(found, open, { lines, close: index });
    open = undefined;
  }
  const unclosed = open && parseInfo(open.info);
  if (unclosed) found.errors.push({ line: open.at + 1, message: `the ${unclosed.fence ?? open.info.split(/\s+/)[0]} fence is never closed` });
  return found;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 이미지 줄 하나. wrap은 줄 앞머리(인용 표시와 들여쓰기)다. 대체 글의 줄 바꿈과 대괄호는 이미지 문법을 깨므로 바꾼다. */
export function imageLine(wrap, alt, href) {
  const safeAlt = alt.replace(/\s+/g, ' ').replace(/[[\]\\]/g, (c) => `\\${c}`).trim();
  return `${wrap}![${safeAlt}](${href})${IMAGE_MARK}`;
}
