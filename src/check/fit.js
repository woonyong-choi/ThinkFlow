// 1번: 글이 자기 칸 안쪽에 들어간다. 크기는 잰 글로 정하므로 구조 그림의 실패는 이 도구의 버그다.
import { measure } from '../measure/fonts.js';
import { CARD, STYLE, groupTitleWidth } from '../measure/sizes.js';
import { values } from '../tokens.js';
import { FIT_SLACK, fits } from './geometry.js';

const SPACE = values.space;
const INNER_X = SPACE['9'];

// cost: time O(s·k·r·n + g + h·l), heap O(1), stack O(1)
// vars: s = 도형 수, k = 도형당 카드 내용 수, r = 카드 줄 수, n = 줄 글자 수, g = 그룹 수, h = 이동 수, l = 글 상자 줄 수
// basis: estimate
export function checkFits({ scene, timeline }, problems) {
  const fail = (line, what, where) => problems.error(line, `[check 1] internal: ${what} does not fit in ${where}. Please report this`);
  for (const it of scene.items) checkItemFits(it, fail);
  for (const g of scene.groups) if (!fits(groupTitleWidth(g.label), g.w)) fail(g.line ?? 1, `group title "${g.label}"`, `group "${g.id}"`);
  for (const seg of timeline.segs) {
    for (const hop of seg.hops) {
      for (const l of hop.data ?? []) if (!fits(measure(l, STYLE.chip.size, STYLE.chip.face), values.size.chip['max-width'])) fail(hop.line ?? 1, `moving text "${l}"`, 'the text box');
    }
  }
}

// cost: time O(k·r·n), heap O(1), stack O(1)
// vars: k = 카드 내용 수, r = 카드 줄 수, n = 줄 글자 수
// basis: estimate
function checkItemFits(it, fail) {
  const room = labelRoom(it);
  for (const l of it.labelLines ?? []) if (!fits(measure(l, STYLE.label.size, STYLE.label.face), room)) fail(it.line, `label "${l}"`, `node "${it.id}"`);
  for (const l of it.subLines ?? []) if (!fits(measure(l, STYLE.sub.size, STYLE.sub.face), room)) fail(it.line, `subtitle "${l}"`, `node "${it.id}"`);
  if (it.shape === 'table') for (const c of it.columns) if (!fits(columnWidth(c), it.w - INNER_X * 2)) fail(it.line, `column "${c.name}"`, `table "${it.id}"`);
  if (it.card) checkCardFits(it, fail);
}

// 이름과 부제가 쓸 수 있는 폭. 사람은 몸통 아래 바깥 여백까지, 마름모는 내접 사각형 비율로 넓힌 만큼이다.
function labelRoom(it) {
  if (it.shape === 'person') return it.w + (it.marginSide ?? 0) * 2;
  if (it.shape === 'decision') return it.w / 2 - INNER_X;
  return it.w - INNER_X * 2;
}

function columnWidth(c) {
  const tagW = c.pk || c.fk || c.unique ? measure('UNQ', STYLE.tag.size, STYLE.tag.face) + SPACE['3'] : 0;
  return measure(c.name, STYLE.cell.size, STYLE.cell.face) + tagW + measure(c.type, STYLE.type.size, STYLE.type.face) + SPACE['8'];
}

// cost: time O(k·r·n), heap O(1), stack O(1)
// vars: k = 카드 내용 수, r = 카드 줄 수, n = 줄 글자 수
// basis: estimate
// 카드 줄: 태그와 표시를 뺀 폭에 글 줄이, 카드 높이에 내용 전체가 들어간다.
function checkCardFits(it, fail) {
  const { card } = it;
  const inner = card.w - CARD.side * 2;
  for (const layout of card.layouts) {
    if (!fits(layout.height, card.h)) fail(it.line, 'card content', `the card of "${it.id}"`);
    for (const rowLayout of layout.rows) checkRowFits(rowLayout, { it, inner }, fail);
  }
}

// cost: time O(r·n), heap O(1), stack O(1)
// vars: r = 줄 수, n = 줄 글자 수
// basis: estimate
function checkRowFits({ row, isHeading, tagW, lines, graph }, { it, inner }, fail) {
  const where = `the card of "${it.id}"`;
  const line = row.line ?? it.line;
  if (graph) {
    if (graph.nodes.some((n) => !fits(n.x + n.w, inner))) fail(line, 'mini graph', where);
    return;
  }
  const markW = row.mark ? measure(row.mark, STYLE.mark.size, STYLE.mark.face) + SPACE['3'] : 0;
  if (isHeading && !fits(measure(row.tag.toUpperCase(), STYLE.tag.size, STYLE.tag.face) + SPACE['4'] + markW, inner)) fail(line, `tag "${row.tag}"`, where);
  const style = row.isMono ? STYLE.mono : STYLE.row;
  lines.forEach((l, li) => {
    const indent = li === 0 && !isHeading ? tagW + markW : 0;
    if (!fits(measure(l, style.size, style.face) + indent, inner)) fail(line, `card text "${l}"`, where);
  });
}

// cost: time O(r·n), heap O(r), stack O(1)
// vars: r = 항목 수, n = 이름 글자 수
// basis: estimate
/** 차트 검사. 차트에는 선과 도형이 없어 1번(항목 이름, 열 이름, 점 이름이 자기 칸에 들어간다)만 해당한다. */
export function checkChartFits(chart, problems) {
  const reported = new Set();
  for (const fit of chart.fits) {
    if (reported.has(fit.text) || fit.width <= fit.room + FIT_SLACK) continue;
    reported.add(fit.text);
    problems.error(fit.line, `[check 1] ${fit.what} "${fit.text}" is wider than its space (${Math.floor(fit.room)}px). Shorten the name`);
  }
}
