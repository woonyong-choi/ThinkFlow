// 마크다운 안의 ```dap 블록 찾기와 블록 아래 이미지 줄 넣기. 파일은 다루지 않는다(계약은 docs/design/markdown.md).
import { scanDocument } from './md-tags.js';

// 이미지 줄 끝의 표시. 이 표시가 붙은 줄만 이 도구가 만든 줄로 보고 갱신하거나 지운다.
const IMAGE_MARK = '<!-- dap -->';
// 다른 표시가 붙은 이미지 줄은 사용자 줄이다. 이 도구가 갱신하거나 지우지 않는다.
const MARKED_IMAGE = /^\s*!\[.*\]\(.*\)<!-- dap -->\s*$/;
const BLOCK_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 이 도구가 만든 이미지 줄이면 true. 인용 표시가 앞에 있어도 된다. */
export const isMarkedImage = (line) => MARKED_IMAGE.test(line);

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 설명 글자의 낱말 수
// basis: estimate
// `dap name=flow` 설명 글자를 읽는다. dap 울타리가 아니면 undefined, 형식이 틀리면 { error }다. fence는 쓴 언어 이름이다.
function parseInfo(info) {
  const [first, ...options] = info.split(/\s+/);
  if (first !== 'dap') return undefined;
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
// 울타리 하나를 블록이나 오류로 모은다. 안 닫힌 dap 울타리는 오류다.
function addBlock(found, lines, fence) {
  const info = parseInfo(fence.info);
  if (!info) return;
  const { at, close, end, leader, quote, indent } = fence;
  if (end === 'quote') found.errors.push({ line: at + 1, message: 'the dap fence inside a block quote ends before its closing fence. Close the fence on a line that still has the quote mark', quote: true });
  else if (end === 'eof') found.errors.push({ line: at + 1, message: `the ${info.fence ?? fence.info.split(/\s+/)[0]} fence is never closed` });
  else if (info.error) found.errors.push({ line: at + 1, message: info.error });
  else found.blocks.push({ name: info.name, source: dedent(lines.slice(at + 1, close), fence.ctx), open: at, close, indent, leader, quote });
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 문서 줄 수
// basis: estimate
/**
 * 문서에서 dap 코드 블록을 찾는다. 다른 울타리(`text` 등) 안의 dap 줄, 들여쓴 코드와 HTML 블록(주석 포함) 안의 울타리는 블록이 아니다(걸음은 md-tags.js).
 * quotes가 true일 때만 인용(`>`) 안 울타리를 읽는다(false면 인용 안 울타리는 울타리로도 보지 않는다). 인용 안 울타리는 인용이 끝나기 전에 닫혀야 한다. 인용 표시 없는 줄을 만나면 울타리를 닫은 것으로 읽지 않고 dap 울타리는 오류로 알린다.
 * @returns { blocks, errors, code, raw, events, quotes }. blocks는 { name?, source, open, close, indent, leader, quote }(open, close는 0부터 센 줄 번호, leader는 인용 표시를 포함한 앞머리, quote는 인용 깊이),
 *   errors는 { line, message }(1부터 센 줄), code는 코드로 읽는 줄 번호 집합(울타리 줄과 들여쓴 코드), raw는 거기에 HTML 블록 줄을 더한 집합(이 도구가 읽거나 바꾸지 않는 줄), events는 사용자 details를 세는 사건이다
 */
export function findBlocks(lines, quotes = false) {
  const { fences, code, raw, events } = scanDocument(lines, quotes);
  const found = { blocks: [], errors: [], code, raw, events, quotes };
  for (const fence of fences) addBlock(found, lines, fence);
  return found;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 이미지 줄 하나. wrap은 줄 앞머리(인용 표시와 들여쓰기)다. 대체 글의 줄 바꿈과 대괄호는 이미지 문법을 깨므로 바꾼다. */
export function imageLine(wrap, alt, href) {
  const safeAlt = alt.replace(/\s+/g, ' ').replace(/[[\]\\]/g, (c) => `\\${c}`).trim();
  return `${wrap}![${safeAlt}](${href})${IMAGE_MARK}`;
}
