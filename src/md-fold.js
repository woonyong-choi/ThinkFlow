// md 명령의 원본 접기: 블록을 `<details>`로 감싸고 그 위에 그림을 두는 배치와, 문서에 이미 있는 감싸기를 알아보는 규칙(docs/design/markdown.md 원본 접기). 파일은 다루지 않는다.
// 접힌 배치(블록 하나)는 다음 줄들이다. 앞머리(인용 표시와 들여쓰기)는 블록의 여는 울타리 줄과 같다.
//   <!-- daphnis fold v1 {id} -->       시작 표식
//   ![대체 글](주소)<!-- dap -->         그림
//   (빈 줄)
//   <details>
//   <summary>그림 원본</summary>
//   (빈 줄)
//   ```dap ...  ```                      원본 블록(한 글자도 바꾸지 않는다)
//   (빈 줄)
//   </details>
//   <!-- /daphnis fold v1 {id} -->       끝 표식
// 접지 않은 배치는 블록 아래 `(빈 줄) 그림`이다. 표식 두 줄과 그 사이 모양이 정확히 맞는 것만 이 도구가 만든 감싸기로 읽고, 그 밖의 `<details>`는 사용자 것이다.
import { contextOf } from './md-blocks.js';
import { findBlocks, imageLine, isMarkedImage } from './md.js';
import { detailsBefore } from './md-tags.js';

const FOLD_VERSION = 'v1';
const DEFAULT_TITLE = '그림 원본';
const MARK = /^<!-- (\/?)daphnis fold (v\d+) ((?:name|n)=[a-z0-9-]+) -->$/;
// 표식처럼 보이는 줄. 정확한 모양이 아니어도 고아 표식으로 알리려고 느슨하게 찾는다.
const MARK_LIKE = /^(?:[ \t]*>)*[ \t]*<!--\s*\/?daphnis fold\b/;
const SUMMARY = /^<summary>(.*)<\/summary>$/;
const PRE_LINES = 6;
const POST_LINES = 3;
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 제목 글자 수
// basis: estimate
/** 제목을 HTML 글로 바꾼다. 특수 문자는 문자 참조로 쓴다. */
const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 블록 수
// basis: estimate
// 블록마다 식별자. 이름이 있으면 `name=이름`, 없으면 이름 없는 블록의 순번(1부터)으로 `n=순번`이다. SVG 이름을 정하는 규칙과 같다.
function idsOf(blocks) {
  let unnamed = 0;
  return blocks.map((block) => (block.name ? `name=${block.name}` : `n=${++unnamed}`));
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 표식 글 { end, version, id }. 표식이 아니면 undefined다.
function markOf(text) {
  const found = text === undefined ? null : MARK.exec(text);
  return found ? { end: found[1] === '/', version: found[2], id: found[3] } : undefined;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
const markLine = (wrap, id, end = false) => `${wrap}<!-- ${end ? '/' : ''}daphnis fold ${FOLD_VERSION} ${id} -->`;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 블록 앞뒤가 접힌 배치와 줄 하나하나 맞으면 { start, end, id, summary }(줄 번호, 요약 글은 쓰인 그대로), 아니면 undefined다.
function wrapperAround(lines, block, ctx) {
  const { open, close } = block;
  const [start, end] = [open - PRE_LINES, close + POST_LINES];
  if (start < 0 || end >= lines.length) return undefined;
  const first = markOf(ctx.content(lines[start]));
  const last = markOf(ctx.content(lines[end]));
  const summary = SUMMARY.exec(ctx.content(lines[start + 4]) ?? '');
  const marks = first && last && !first.end && last.end && first.version === FOLD_VERSION && last.version === FOLD_VERSION && first.id === last.id;
  const image = ctx.content(lines[start + 1]) !== undefined && isMarkedImage(ctx.content(lines[start + 1]) ?? '');
  const blanks = [start + 2, open - 1, close + 1].every((i) => ctx.isBlank(lines[i]));
  const tags = ctx.content(lines[start + 3]) === '<details>' && ctx.content(lines[close + 2]) === '</details>';
  return marks && image && blanks && tags && summary ? { start, end, id: first.id, summary: summary[1] } : undefined;
}

// cost: time O(n), heap O(b), stack O(1)
// vars: n = 문서 줄 수, b = 블록 수
// basis: estimate
// 표식처럼 보이지만 어느 감싸기에도 속하지 않는 줄(울타리와 들여쓴 코드 밖)의 오류들.
function strayMarks(lines, { code }, wrappers) {
  const owned = new Set(wrappers.flatMap((w) => (w ? [w.start, w.end] : [])));
  const message = 'this daphnis fold mark is not part of an intact wrapper. A wrapper is the start mark, the image line, a blank line, <details>, <summary>, a blank line, the dap block, a blank line, </details>, and the end mark with the same id, all with the block\'s indentation. Nothing was changed; repair or delete these lines by hand';
  return lines.flatMap((line, i) => (!code.has(i) && !owned.has(i) && MARK_LIKE.test(line) ? [{ line: i + 1, message }] : []));
}

// cost: time O(n·c + b), heap O(n), stack O(1)
// vars: n = 문서 줄 수, c = 열린 인용·목록 칸 수, b = 블록 수
// basis: estimate
// 블록마다 그 앞까지 열려 있는 사용자 `<details>` 깊이 { depth, broken, brokenAt }(docs/design/markdown.md 사용자 details). 이 도구가 만든 감싸기의 태그는 세지 않는다. 세는 규칙은 md-tags.js다.
// broken은 짝 없는 `</details>`를 만났다는 뜻이고 brokenAt은 그 줄 번호(1부터)다.
function userDetails(lines, found, wrappers) {
  const skip = new Set(wrappers.flatMap((w, k) => (w ? [w.start + 3, found.blocks[k].close + 2] : [])));
  const { events } = found.quotes ? found : findBlocks(lines, true);
  const seen = detailsBefore(events, { blocks: new Set(found.blocks.map((block) => block.open)), skip });
  return found.blocks.map((block) => seen.get(block.open));
}

// cost: time O(n + b), heap O(b), stack O(1)
// vars: n = 문서 줄 수, b = 블록 수
// basis: estimate
/**
 * 접기에 필요한 것을 문서에서 읽는다. mode는 'fold', 'unfold', 'keep'이다.
 * @returns { items, errors }. items는 블록마다 { block, wrapper?, user, id, ctx }, errors는 { line, message }다. 오류가 있으면 문서를 고치지 않는다.
 */
export function inspectFold(lines, found, mode) {
  const ids = idsOf(found.blocks);
  const contexts = found.blocks.map(contextOf);
  const wrappers = found.blocks.map((block, k) => wrapperAround(lines, block, contexts[k]));
  const users = userDetails(lines, found, wrappers);
  const errors = strayMarks(lines, found, wrappers);
  const items = found.blocks.map((block, k) => ({ block, wrapper: wrappers[k], user: users[k], id: ids[k], ctx: contexts[k] }));
  for (const { block, wrapper, user } of items) {
    if (mode === 'fold' && !wrapper && user.broken) errors.push({ line: block.open + 1, message: `cannot tell whether this block is inside a <details> written by hand: the </details> on line ${user.brokenAt} has no matching <details> before it. Nothing was changed; fix the tags, or run without --fold` });
  }
  return { items, errors };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 블록 하나가 이번 실행 뒤에 접힌 배치여야 하면 true. 옵션 없음은 지금 상태를 지키고, --fold는 사용자 details 안이 아니면 접고, --unfold는 이 도구가 만든 감싸기를 푼다.
function wantsFold({ wrapper, user }, mode) {
  if (mode === 'unfold') return false;
  if (mode === 'keep') return Boolean(wrapper);
  return Boolean(wrapper) || user.depth === 0;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 닫는 울타리 뒤에 있던 이 도구의 이미지 줄(앞에 빈 줄 하나가 있어도 된다)이 차지한 줄 수. 없으면 0이다. 들여쓴 코드와 HTML 블록(raw) 안의 줄은 사용자 글이다.
function oldImageSpan({ lines, raw }, from, ctx) {
  const marked = (i) => lines[i] !== undefined && !raw.has(i) && ctx.rest(lines[i]) !== undefined && isMarkedImage(ctx.rest(lines[i]));
  if (marked(from)) return 1;
  return ctx.isBlank(lines[from]) && lines[from] !== undefined && marked(from + 1) ? 2 : 0;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 요약 글(HTML). 제목을 받았으면 그 제목, 아니면 이미 있는 감싸기의 글을 지키고, 새 감싸기는 기본 문구다.
const summaryOf = (wrapper, title) => (title === undefined ? (wrapper?.summary ?? escapeHtml(DEFAULT_TITLE)) : escapeHtml(title));

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 블록 하나가 차지하는 줄 범위 { from, to }(그림과 감싸기 포함)와 블록 앞뒤에 새로 쓸 줄들 { before, after }.
function planItem(lines, item, { mode, title, image, raw }) {
  const { block, wrapper, ctx, id } = item;
  const { wrap, blank } = ctx;
  const folded = wantsFold(item, mode);
  const head = [markLine(wrap, id), image, blank, `${wrap}<details>`, `${wrap}<summary>${summaryOf(wrapper, title)}</summary>`, blank];
  const tail = [blank, `${wrap}</details>`, markLine(wrap, id, true)];
  return {
    block,
    ctx,
    from: wrapper ? wrapper.start : block.open,
    to: wrapper ? wrapper.end : block.close + oldImageSpan({ lines, raw }, block.close + 1, ctx),
    before: folded ? head : [],
    after: folded ? tail : [blank, image],
  };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 문서 줄 수
// basis: estimate
/**
 * 접기 계획을 문서 줄에 적용한다. 블록 본문은 한 글자도 바꾸지 않고 원래 줄바꿈 그대로 복사하고, 그림과 감싸기 줄만 새로 쓴다.
 * 이 도구가 만들었지만 블록이 없어진 이미지 줄(울타리 밖)은 지운다. 이미 맞으면 같은 내용이다(멱등).
 * 그림 줄 뒤에 글이 바로 이어지면 빈 줄을 하나 더 둔다.
 * @param doc { lines, ends } 줄 내용과 각 줄의 줄바꿈(마지막 줄은 '')
 * @param inspected inspectFold의 결과 items와 findBlocks의 raw(읽거나 바꾸지 않는 줄)와 quotes
 * @param options { mode, title, images }. images는 블록 순서대로 { alt, href }
 * @returns { text, end? }[]. end가 없는 줄은 새 줄이라 문서의 줄바꿈을 쓴다
 */
export function layoutDocument({ lines, ends }, { items, raw, quotes }, options) {
  const orphan = (line) => isMarkedImage(quotes ? line.replace(/^(?:[ \t]*>[ \t]?)+/, '') : line);
  const plans = new Map(items.map((item, k) => {
    const plan = planItem(lines, item, { ...options, raw, image: imageLine(item.ctx.wrap, options.images[k].alt, options.images[k].href) });
    return [plan.from, plan];
  }));
  const out = [];
  const keep = (i) => out.push({ text: lines[i], end: ends[i] });
  for (let i = 0; i < lines.length; i++) {
    const plan = plans.get(i);
    if (!plan) {
      if (raw.has(i) || !orphan(lines[i])) keep(i);
      continue;
    }
    out.push(...plan.before.map((text) => ({ text })));
    for (let at = plan.block.open; at <= plan.block.close; at++) keep(at);
    out.push(...plan.after.map((text) => ({ text })));
    i = plan.to;
    if (!plan.ctx.isBlank(lines[i + 1])) out.push({ text: plan.ctx.blank });
  }
  return out;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 줄 수
// basis: estimate
/** 줄 목록을 문서 글로 잇는다. 새 줄과 줄바꿈이 없던 줄은 eol을 쓰고, 마지막 줄 뒤에는 아무것도 붙이지 않는다. */
export function joinLines(entries, eol) {
  return entries.map((entry, i) => entry.text + (i === entries.length - 1 ? '' : (entry.end || eol))).join('');
}

// cost: time O(n + b), heap O(b), stack O(1)
// vars: n = 문서 줄 수, b = 블록 수
// basis: estimate
/**
 * 이번 실행이 다룰 블록을 찾는다. 인용(`>`) 안 블록은 --fold나 --unfold를 준 실행이거나 그 블록에 이미 이 도구의 표식(접기 표식, 이미지 줄)이 있을 때만 다룬다.
 * 그 밖의 옵션 없는 실행은 인용 안 블록을 읽지 않으므로 인용 안 블록이 없던 판과 결과가 같다.
 */
export function findForMode(lines, mode) {
  const full = findBlocks(lines, true);
  if (mode !== 'keep') return full;
  const marked = new Set(inspectFold(lines, full, 'keep').items.filter(({ block, wrapper, ctx }) => block.quote && (wrapper || oldImageSpan({ lines, raw: full.raw }, block.close + 1, ctx) > 0)).map(({ block }) => block));
  if (!marked.size) return findBlocks(lines, false);
  return { ...full, blocks: full.blocks.filter((block) => !block.quote || marked.has(block)), errors: full.errors.filter((error) => !error.quote) };
}
