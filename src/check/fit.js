// 1번: 글이 자기 칸 안쪽에 들어간다. 크기는 잰 글로 정하므로 구조 그림의 실패는 이 도구의 버그다.
// 도형의 글은 모두 측정이 놓은 text(measure/texts.js)이고 그리는 쪽과 같은 값이라, 이 검사는 text의 글 사각형(textSpan)이 칸 안에 드는지 한 번에 읽는다.
// 종류마다 다른 것은 칸의 모양(마름모, 원, 격자 칸)과 같은 줄 글끼리 겹치지 않는지(표 열의 이름과 형식, 내용 줄의 태그와 본문과 표시와 값)뿐이다.
import { FIT_SLACK, measure } from '../measure/fonts.js';
import { PAD } from '../measure/card.js';
import { CONTENT } from '../measure/content.js';
import { GRID, groupTitleWidth } from '../measure/sizes.js';
import { TYPE_GAP } from '../measure/table.js';
import { STYLE, textSpan } from '../measure/texts.js';
import { values } from '../vendor/theme/tokens.js';
import { fits } from './geometry.js';

const ORIGIN = { x: 0, y: 0 };

// cost: time O(s·(t + k·r·n) + g + h·l), heap O(1), stack O(1)
// vars: s = 도형 수, t = 도형 text 수, k = 도형당 카드 내용 수, r = 카드 줄 수, n = 줄 글자 수, g = 그룹 수, h = 이동 수, l = 글 상자 줄 수
// basis: estimate
export function checkFits({ scene, timeline }, problems) {
  const fail = (line, what, where) => problems.error(line, `[check 1] internal: ${what} does not fit in ${where}. Please report this`);
  for (const it of scene.items) checkItemFits(it, fail);
  for (const g of scene.groups) if (!fits(groupTitleWidth(g), g.w)) fail(g.line ?? 1, `group title "${g.label}"`, `group "${g.id}"`);
  checkChipFits(timeline, fail);
}

// cost: time O(h·l·n), heap O(h·l), stack O(1)
// vars: h = 이동 수, l = 글 상자 줄 수, n = 줄 글자 수
// basis: estimate
// 이동 글 상자의 줄이 글 상자 최대 폭 안에 드는지 본다.
function checkChipFits(timeline, fail) {
  const hops = timeline.segs.flatMap((seg) => seg.hops);
  for (const hop of hops) {
    for (const l of hop.data ?? []) if (!fits(measure(l, STYLE.chip.size, STYLE.chip.face), values.spacing.figure.chip["max-width"])) fail(hop.line ?? 1, `moving text "${l}"`, 'the text box');
  }
}

// 글 사각형(textSpan)이 가로 구간 [left, right] 안에 드는가
const isInside = (span, { left, right }) => span.x >= left - FIT_SLACK && span.x + span.width <= right + FIT_SLACK;

// 이름과 부제가 앉을 수 있는 가로 구간(도형 왼쪽이 원점). 가운데에 놓인 글의 구간이다: 마름모는 내접 사각형 비율로 넓힌 만큼, 원은 지름에서 안쪽 여백 하나를 뺀 폭이다.
function roomOf(it) {
  const centered = (room) => ({ left: (it.w - room) / 2, right: (it.w + room) / 2 });
  if (it.shape === 'decision') return centered(it.w / 2 - PAD.x);
  if (it.shape === 'circle') return centered(it.w - PAD.x);
  const pad = it.tile ? values.spacing.figure.node["tile-pad"] : PAD.x;
  return { left: pad, right: it.w - pad };
}

// cost: time O(t + k·r·n), heap O(t), stack O(1)
// vars: t = 도형 text 수, k = 카드 내용 수, r = 카드 줄 수, n = 줄 글자 수
// basis: estimate
function checkItemFits(it, fail) {
  const where = `${it.shape} "${it.id}"`;
  const room = roomOf(it);
  const check = (texts, within) => {
    for (const t of texts) if (!isInside(textSpan(ORIGIN, t), within)) fail(it.line, `text "${t.text}"`, where);
  };
  check(it.texts ?? [], room);
  for (const row of it.tableRows ?? []) {
    check(row.texts, room);
    checkColumnGap(row, it, fail);
  }
  for (const cell of it.cells ?? []) check(cell.texts, { left: cell.x + GRID.cellPadX, right: cell.x + cell.w - GRID.cellPadX });
  if (it.content) checkContentFits(it, fail);
}

// 열 이름(키 표시 포함)과 같은 줄의 형식이 서로 겹치지 않고 간격을 지킨다.
function checkColumnGap(row, it, fail) {
  const [name, type] = ['cell', 'cell type'].map((role) => textSpan(ORIGIN, row.texts.find((t) => t.role === role)));
  if (!fits(name.x + name.width + TYPE_GAP, type.x)) fail(it.line, `column "${row.id}"`, `${it.shape} "${it.id}"`);
}

// cost: time O(k·r²), heap O(1), stack O(1)
// vars: k = 카드 내용 수, r = 카드 줄 수
// basis: estimate
// 카드 줄: 카드 높이에 내용 전체가 들어가고, 모든 글이 내용 면 안쪽 구간에 든다.
function checkContentFits(it, fail) {
  const { content } = it;
  const within = { left: CONTENT.side, right: content.w - CONTENT.side };
  for (const layout of content.layouts) {
    if (!fits(layout.height, content.h)) fail(it.line, 'card content', `the card of "${it.id}"`);
    for (const laid of layout.rows) checkRowFits(laid, { it, within }, fail);
  }
}

// cost: time O(t²), heap O(t), stack O(1)
// vars: t = 줄의 text 수
// basis: estimate
// 줄 하나: 태그, 본문, 오른쪽 표시와 값은 안쪽 구간에 들고, 같은 줄에서 왼쪽부터 서로 겹치지 않는다. 관계 그래프는 이름 알약이 안쪽 구간에 든다.
function checkRowFits(laid, { it, within }, fail) {
  const where = `the card of "${it.id}"`;
  const line = laid.row.line ?? it.line;
  if (laid.chart && (!fits(laid.chart.width, it.content.w) || !fits(laid.chart.height, laid.height))) fail(line, 'embedded chart', where);
  if (laid.graph && laid.graph.nodes.some((n) => !isInside({ x: laid.graph.at.x + n.x, width: n.w }, within))) fail(line, 'mini graph', where);
  const spans = laid.texts.map((t) => ({ t, ...textSpan(ORIGIN, t) }));
  const valued = [...(laid.valueSlot?.texts.values() ?? [])].map((t) => ({ t, ...textSpan(ORIGIN, t) }));
  for (const span of [...spans, ...valued]) if (!isInside(span, within)) fail(line, `card text "${span.t.text}"`, where);
  const sameLine = (a, b) => Math.abs(a.center - b.center) < FIT_SLACK;
  for (const [i, a] of spans.entries()) {
    for (const b of spans.slice(i + 1)) {
      const [first, second] = a.x <= b.x ? [a, b] : [b, a];
      if (sameLine(a, b) && !fits(first.x + first.width, second.x)) fail(line, `card text "${second.t.text}"`, where);
    }
    for (const v of valued) if (sameLine(a, v) && !fits(a.x + a.width, v.x)) fail(line, `value of "${a.t.text}"`, where);
  }
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
