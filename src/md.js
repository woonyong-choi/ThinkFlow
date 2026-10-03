// 마크다운 안의 ```muto 블록 찾기와 블록 아래 이미지 줄 넣기. 파일은 다루지 않는다(계약은 docs/design/markdown.md).

/** 이미지 줄 끝의 표시. 이 표시가 붙은 줄만 이 도구가 만든 줄로 보고 갱신하거나 지운다. */
export const IMAGE_MARK = '<!-- muto -->';
const MARKED_IMAGE = /^\s*!\[.*\]\(.*\)<!-- muto -->\s*$/;
const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})(.*)$/;
const BLOCK_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 여는 울타리 줄. 백틱 울타리의 설명 글자에는 백틱이 없다(CommonMark).
function openingFence(line) {
  const match = FENCE_OPEN.exec(line);
  if (!match || (match[2][0] === '`' && match[3].includes('`'))) return undefined;
  return { indent: match[1], char: match[2][0], length: match[2].length, info: match[3].trim() };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 닫는 울타리 줄이면 true. 같은 글자로 열 때보다 길거나 같고 뒤에는 공백만 있다.
function closesFence(line, open) {
  const match = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
  return Boolean(match) && match[1][0] === open.char && match[1].length >= open.length;
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 설명 글자의 낱말 수
// basis: estimate
// `muto name=flow` 설명 글자를 읽는다. muto 울타리가 아니면 undefined, 형식이 틀리면 { error }다.
function parseInfo(info) {
  const [first, ...options] = info.split(/\s+/);
  if (first !== 'muto') return undefined;
  let name;
  for (const option of options) {
    const value = /^name=(.+)$/.exec(option)?.[1];
    if (value === undefined) return { error: `unknown option "${option}" in the muto fence. Use name=<id>` };
    if (!BLOCK_NAME.test(value)) return { error: `block name "${value}" must be lowercase letters, digits, and "-"` };
    name = value;
  }
  return { name };
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 본문 줄 수
// basis: estimate
// 울타리 들여쓰기만큼 본문 줄 앞의 공백을 뗀다. 목록 안 블록도 같은 원본이 된다.
const dedent = (lines, indent) => lines.map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line.trimStart())).join('\n');

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 문서 줄 수
// basis: estimate
/**
 * 문서에서 muto 코드 블록을 찾는다. 다른 울타리(`text` 등) 안의 muto 줄은 블록이 아니다.
 * @returns { blocks, errors, fenced }. blocks는 { name?, source, open, close, indent }(open, close는 0부터 센 줄 번호),
 *   errors는 { line, message }(1부터 센 줄), fenced는 울타리에 든 줄 번호 집합이다
 */
export function findBlocks(lines) {
  const blocks = [];
  const errors = [];
  const fenced = new Set();
  let open;
  let openAt = 0;
  lines.forEach((line, index) => {
    if (!open) {
      open = openingFence(line);
      openAt = index;
      if (open) fenced.add(index);
      return;
    }
    fenced.add(index);
    if (!closesFence(line, open)) return;
    const info = parseInfo(open.info);
    if (info?.error) errors.push({ line: openAt + 1, message: info.error });
    else if (info) blocks.push({ name: info.name, source: dedent(lines.slice(openAt + 1, index), open.indent), open: openAt, close: index, indent: open.indent });
    open = undefined;
  });
  if (open && parseInfo(open.info)) errors.push({ line: openAt + 1, message: 'the muto fence is never closed' });
  return { blocks, errors, fenced };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 이미지 줄 하나. 대체 글의 줄 바꿈과 대괄호는 이미지 문법을 깨므로 바꾼다. */
export function imageLine(indent, alt, href) {
  const safeAlt = alt.replace(/\s+/g, ' ').replace(/[[\]\\]/g, (c) => `\\${c}`).trim();
  return `${indent}![${safeAlt}](${href})${IMAGE_MARK}`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 닫는 울타리 뒤에 있던 이 도구의 이미지 줄(앞에 빈 줄 하나가 있어도 된다)이 차지한 줄 수. 없으면 0이다.
function oldImageSpan(lines, from) {
  if (MARKED_IMAGE.test(lines[from] ?? '')) return 1;
  return lines[from]?.trim() === '' && MARKED_IMAGE.test(lines[from + 1] ?? '') ? 2 : 0;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 문서 줄 수
// basis: estimate
/**
 * 블록마다 닫는 울타리 아래에 이미지 줄을 넣거나 바꾼다. 이미지 줄은 빈 줄 하나를 사이에 두고 붙고, 뒤에 글이 바로 이어지면 빈 줄을 하나 더 둔다.
 * 블록이 없어진 이미지 줄(표시가 있고 울타리 밖)은 지운다.
 * @param images 블록 순서대로 { alt, href }
 * @returns 새 줄 목록. 이미 맞으면 같은 내용이다(멱등)
 */
export function applyImages(lines, { blocks, fenced }, images) {
  const byClose = new Map(blocks.map((block, k) => [block.close, { indent: block.indent, ...images[k] }]));
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const hit = byClose.get(i);
    if (!hit) {
      if (fenced.has(i) || !MARKED_IMAGE.test(lines[i])) out.push(lines[i]);
      continue;
    }
    out.push(lines[i], '', imageLine(hit.indent, hit.alt, hit.href));
    i += oldImageSpan(lines, i + 1);
    if ((lines[i + 1] ?? '').trim() !== '') out.push('');
  }
  return out;
}
