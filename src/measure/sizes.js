// 도형, 카드, 선 라벨 크기를 정한다. 여기서 정한 크기를 배치에 넘기고 그대로 그린다(docs/design/layout.md 도형 크기와 연결점).
import { values } from '../tokens.js';
import { BADGE_STYLE, DECOR, STACK_STEP, groupDecor, nodeDecor } from './decor.js';
import { measure, wrap } from './fonts.js';
import { planGridLinks } from './grid-links.js';
import { layoutMiniGraph } from './minigraph.js';
import { sizeQueue } from './queue.js';

const SPACE = values.space;
const TEXT = values.size.text;
const SNUG = values.leading.snug;
const SIZE = values.size;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 글자 크기에 줄 높이 비율을 곱해 반올림한 줄 높이 */
export const lineHeight = (size, leading) => Math.round(size * leading);

/** 글 모양. 크기, 글꼴, 줄 높이 */
export const STYLE = Object.freeze({
  label: { size: TEXT['13'], face: 'medium', line: lineHeight(TEXT['13'], SNUG) },
  sub: { size: TEXT['11'], face: 'regular', line: lineHeight(TEXT['11'], SNUG) },
  row: { size: TEXT['11'], face: 'regular', line: lineHeight(TEXT['11'], SNUG) },
  mono: { size: TEXT['11'], face: 'mono', line: lineHeight(TEXT['11'], SNUG) },
  tag: { size: TEXT['9'], face: 'semibold' },
  mark: { size: TEXT['11'], face: 'semibold' },
  pill: { size: TEXT['11'], face: 'regular' },
  group: { size: TEXT['11'], face: 'semibold' },
  chip: { size: TEXT['11'], face: 'regular', line: lineHeight(TEXT['11'], SNUG) },
  cell: { size: TEXT['13'], face: 'regular' },
  item: { size: TEXT['13'], face: 'regular', line: lineHeight(TEXT['13'], SNUG) },
  type: { size: TEXT['11'], face: 'mono' },
});

/** 카드 안쪽 간격 */
export const CARD = Object.freeze({ pad: SPACE['3'], side: SPACE['4'], gap: SPACE['2'], margin: SPACE['5'] });
const INNER_X = SPACE['9'];
const INNER_Y = SPACE['6'];

/** 칸 격자 안쪽 간격. pad는 칸 묶음과 틀 사이, cellPadX, cellPadY는 칸 안 글 둘레, titlePad는 제목 줄 위아래, textMax는 칸 글 한 줄의 가장 긴 너비다. */
export const GRID = Object.freeze({ pad: SPACE['6'], cellPadX: SPACE['4'], cellPadY: SPACE['3'], titlePad: SPACE['3'], textMax: SIZE.node['max-width'] - INNER_X * 2 });

// cost: time O(k·r·n²), heap O(k·r), stack O(1)
// vars: k = 카드 내용 수, r = 카드 줄 수, n = 줄 글자 수
// basis: estimate
/**
 * 도형 하나의 크기. box는 배치에 넘기는 사각형, margin은 배치 바깥 여백(위, 아래)이다.
 * @param node 그림 모형의 도형. shape: person, box, external, store, queue, decision, state, table, grid, start, final
 * @param contents 시간 흐름에서 이 도형 카드에 보일 내용 목록. 내용은 카드 줄 목록이다
 * @param lineCounts 사람 몸통 높이를 정할 선 수 { out: 나가는 선 수, in: 들어오는 선 수 }와, 격자 칸에 이은 선 끝 cells(grid-links.js의 links)
 * @returns { w, h, marginTop, marginBottom, marginSide?, labelLines, subLines, card?: { w, h, layouts }, cells?, empties?, titleH? }. 격자의 cells는 { id, kind, x, y, w, h, lines, ... } 칸 목록이고 좌표는 격자 왼쪽 위가 원점이다
 */
export function sizeNode(node, contents = [], lineCounts = { out: 0, in: 0 }) {
  if (node.shape === 'person') return sizePerson(node, contents, lineCounts);
  if (node.shape === 'table') return sizeTable(node, contents);
  if (node.shape === 'grid') return sizeGrid(node, lineCounts.cells);
  if (node.shape === 'circle') return sizeCircle(node);
  if (node.shape === 'queue') return sizeQueue(node, STYLE.label);
  if (node.shape === 'start' || node.shape === 'final') return { w: SIZE.node['state-dot'], h: SIZE.node['state-dot'], marginTop: 0, marginBottom: 0, labelLines: [], subLines: [] };
  const maxInner = SIZE.node['max-width'] - INNER_X * 2;
  const labelLines = wrap(node.label, maxInner, STYLE.label);
  const subLines = node.sub ? wrap(node.sub, maxInner, STYLE.sub) : [];
  const textW = Math.max(...labelLines.map((l) => measure(l, STYLE.label.size, STYLE.label.face)), ...subLines.map((l) => measure(l, STYLE.sub.size)));
  const decor = nodeDecor(node);
  const padX = node.tile ? SIZE.node['tile-pad'] : INNER_X;
  let w = Math.min(SIZE.node['max-width'], Math.max(node.tile ? SIZE.node['tile-width'] : SIZE.node['min-width'], textW + padX * 2, (decor?.w ?? 0) + padX * 2));
  if (contents.length) w = Math.max(w, SIZE.node['card-width']);
  const textH = labelLines.length * STYLE.label.line + subLines.length * STYLE.sub.line;
  if (node.shape === 'decision') {
    // 마름모 안에 글 사각형이 들어가려면 가로세로가 글의 두 배쯤 필요하다(마름모 내접 사각형 비율).
    return { w: Math.max(w, (textW + INNER_X) * 2), h: (textH + INNER_Y) * 2, marginTop: 0, marginBottom: 0, labelLines, subLines };
  }
  const card = contents.length ? sizeCard(contents, w - CARD.margin * 2) : undefined;
  const cap = node.shape === 'store' ? SIZE.node['store-cap'] : 0;
  // 윗줄(아이콘, 배지, 개수)은 이름 위에 놓는다. 원통은 뚜껑 곡선 아래에서 시작한다.
  const head = decor ? { ...decor, x: (w - decor.w) / 2, y: INNER_Y + cap, room: cap + decor.h + (node.tile ? SIZE.icon['tile-gap'] : DECOR.rowGap) } : undefined;
  const h = Math.max(SIZE.node['min-height'], INNER_Y * 2 + (head?.room ?? 0) + textH + (card ? card.h + CARD.margin : 0));
  // 개수 요약 상자는 뒤 윤곽 두 겹이 오른쪽 아래로 비쳐 보이도록 그만큼 크고, 이름과 카드는 앞 상자(몸통) 안에 놓인다.
  const stack = node.count === undefined ? 0 : STACK_STEP * 2;
  return { w: w + stack, h: h + stack, stack, marginTop: cap, marginBottom: cap, labelLines, subLines, card, decor: head };
}

// cost: time O(r·n²), heap O(r·n), stack O(1)
// vars: r = 카드 줄 수, n = 글자 수
// basis: estimate
// 사람 모양: 배치 사각형은 몸통의 곧은 옆면. 머리와 어깨는 위 여백, 이름표와 카드는 아래 여백이다.
// 몸통 높이는 토큰 기본값이고, 한 면의 연결점 간격이 선 굵기와 틈의 합보다 좁아질 때만 그 면이 필요한 만큼 늘어난다.
function sizePerson(node, contents, lineCounts) {
  const labelLines = wrap(node.label, SIZE.node['max-width'], STYLE.label);
  const labelW = Math.max(...labelLines.map((l) => measure(l, STYLE.label.size, STYLE.label.face)));
  const card = contents.length ? sizeCard(contents, SIZE.node['card-width'] - CARD.margin * 2) : undefined;
  // 배치 사각형은 늘 몸통 너비다. 넓은 이름표와 카드 자리는 좌우 바깥 여백으로 넘긴다.
  const w = SIZE.person.width;
  const wide = Math.max(w, card ? SIZE.node['card-width'] : 0, labelW);
  const below = SPACE['3'] + labelLines.length * STYLE.label.line + (card ? CARD.margin + card.h : 0);
  const h = bodyHeight(Math.max(lineCounts.out, lineCounts.in));
  return { w, h, marginTop: SIZE.person.head + SIZE.person.shoulder + SPACE['1'], marginBottom: below, marginSide: (wide - w) / 2, labelLines, subLines: [], card };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 사람 몸통 높이. 한 면에 선 n개가 서로 닿지 않으려면 연결점 간격이 선 굵기와 틈의 합 이상이어야 하므로 (n + 1) × 간격이 필요하다.
 * @param lines 두 면(오른쪽, 왼쪽) 가운데 선이 더 많은 면의 선 수
 */
export function bodyHeight(lines) {
  return Math.max(SIZE.person.body, (lines + 1) * (values.border.edge + SPACE['0-5']));
}

// cost: time O(n²), heap O(n), stack O(1)
// vars: n = 이름 글자 수
// basis: estimate
// 원: 이름 한 줄을 담는 지름. 이름이 길면 줄을 나누지 않고 지름이 커진다(합류 연산 기호처럼 짧은 글을 쓴다).
function sizeCircle(node) {
  const textW = measure(node.label, STYLE.label.size, STYLE.label.face);
  const d = Math.max(SIZE.node.circle, textW + INNER_X, STYLE.label.line + INNER_Y);
  return { w: d, h: d, marginTop: 0, marginBottom: 0, labelLines: [node.label], subLines: [] };
}

// cost: time O(c + r·n²), heap O(r·n), stack O(1)
// vars: c = 열 수, r = 카드 줄 수, n = 글자 수
// basis: estimate
// 테이블: 머리 칸, 열 칸, 카드 칸이 모두 배치 사각형 안이다.
function sizeTable(node, contents) {
  const rowH = SIZE.node['table-row'];
  const nameW = Math.max(...node.columns.map((c) => measure(c.name, STYLE.cell.size) + (c.pk || c.fk || c.unique ? measure('UNQ', STYLE.tag.size, STYLE.tag.face) + SPACE['3'] : 0)));
  const typeW = Math.max(...node.columns.map((c) => measure(c.type, STYLE.type.size, STYLE.type.face)));
  const titleW = measure(node.label, STYLE.label.size, STYLE.label.face);
  let w = Math.max(SIZE.node['min-width'], nameW + typeW + INNER_X * 2 + SPACE['8'], titleW + INNER_X * 2);
  if (contents.length) w = Math.max(w, SIZE.node['card-width']);
  const card = contents.length ? sizeCard(contents, w - CARD.margin * 2) : undefined;
  const h = rowH * (node.columns.length + 1) + (card ? card.h + CARD.margin * 2 : 0);
  return { w, h, marginTop: 0, marginBottom: 0, labelLines: [node.label], subLines: [], card, rowH };
}

// cost: time O(c·n² + rows·cols + k·c), heap O(c + rows·cols + k), stack O(1)
// vars: c = 칸 수, n = 칸 글자 수, rows·cols = 격자 크기, k = 칸에 이은 선 끝 수
// basis: estimate
// 칸 격자: 제목 줄과 칸 묶음이 모두 배치 사각형 안이다. 칸 단위(가로, 세로)는 모든 칸이 글을 넣을 수 있는 가장 작은 크기이고, 칸은 차지한 단위 수만큼 커진다.
// 칸에 이은 선이 안쪽 칸으로 돌아 나갈 통로가 있으면 행 사이가 벌어진다(grid-links.js).
function sizeGrid(node, links = []) {
  const titleLines = wrap(node.label, GRID.textMax, STYLE.label);
  const titleW = Math.max(...titleLines.map((l) => measure(l, STYLE.label.size, STYLE.label.face)));
  const titleH = titleLines.length * STYLE.label.line + GRID.titlePad * 2;
  const shown = node.cells.map((c) => ({ ...c, text: c.kind === 'gap' ? `${c.label} ×${c.count}` : c.label }));
  const unitW = gridUnitWidth(shown, { cols: node.cols, titleRoom: titleW + INNER_X * 2 - GRID.pad * 2 });
  const lined = shown.map((c) => ({ ...c, lines: wrap(c.text, c.cols * unitW - GRID.cellPadX * 2, STYLE.item) }));
  const unitH = Math.max(SIZE.grid.cell, ...lined.map((c) => Math.ceil((c.lines.length * STYLE.item.line + GRID.cellPadY * 2) / c.rows)));
  const plan = planGridLinks({ rows: node.rows, cols: node.cols, cells: node.cells, links }, { pad: GRID.pad, unitW, unitH, titleH, titleHalf: titleW / 2 });
  const slot = (row, col) => ({ x: GRID.pad + col * unitW, y: plan.rowTop[row], w: unitW, h: unitH });
  const cells = lined.map(({ text, label, ...c }) => ({ ...c, ...slot(c.row, c.col), w: c.cols * unitW, h: c.rows * unitH + (c.rows - 1) * plan.gutter }));
  return { w: plan.w, h: plan.h, marginTop: 0, marginBottom: 0, labelLines: titleLines, subLines: [], cells, empties: emptySlots(node, slot), titleH, cellEnds: plan.ends, cellRoutes: plan.inner };
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 칸 수
// basis: estimate
// 칸 단위 너비: 칸마다 (글 폭 + 안쪽 간격)을 차지한 열 수로 나눈 값의 최댓값. 글이 짧아도 칸 최소 너비보다 좁아지지 않고, 제목이 격자보다 넓으면 제목이 들어갈 만큼 넓어진다.
function gridUnitWidth(cells, { cols, titleRoom }) {
  const need = cells.map((c) => (Math.min(measure(c.text, STYLE.item.size, STYLE.item.face), GRID.textMax) + GRID.cellPadX * 2) / c.cols);
  return Math.ceil(Math.max(SIZE.grid.cell, titleRoom / cols, ...need));
}

// cost: time O(rows·cols + c·a), heap O(rows·cols), stack O(1)
// vars: rows·cols = 격자 크기, c = 칸 수, a = 칸이 차지한 단위 수
// basis: estimate
// 어느 칸에도 속하지 않은 단위 자리. 격자 크기에 비례해 걸리므로 큰 격자는 gap으로 접어 쓴다.
function emptySlots(node, slot) {
  const taken = new Set(node.cells.flatMap((c) => Array.from({ length: c.rows * c.cols }, (_, k) => (c.row + Math.floor(k / c.cols)) * node.cols + c.col + (k % c.cols))));
  return Array.from({ length: node.rows * node.cols }, (_, k) => k).filter((k) => !taken.has(k)).map((k) => slot(Math.floor(k / node.cols), k % node.cols));
}

// cost: time O(k·r·n²), heap O(k·r), stack O(1)
// vars: k = 카드 내용 수, r = 줄 수, n = 줄 글자 수
// basis: estimate
/** 카드 크기. 높이는 내용 가운데 가장 큰 것이다. */
function sizeCard(contents, width) {
  const layouts = contents.map((rows) => layoutCard(rows, width));
  return { w: width, h: Math.max(...layouts.map((l) => l.height)), layouts };
}

// cost: time O(r·n²), heap O(r·n), stack O(1)
// vars: r = 카드 줄 수, n = 줄 글자 수
// basis: estimate
/**
 * 카드 줄을 너비에 맞게 나눈다. 태그가 세 글자를 넘으면 글 위에 따로 선다.
 * @returns { rows: { row, isHeading, tagW, lines, graph?, top, height }[], height }. top은 카드 윗변에서 그 줄이 시작하는 거리, height는 그 줄이 차지한 높이다. 그리는 쪽과 값 글자 자리가 이 값을 그대로 쓴다.
 */
function layoutCard(rows, width) {
  const inner = width - CARD.side * 2;
  if (!rows.length) return { rows: [], height: STYLE.row.line + CARD.pad * 2 };
  const laid = rows.map((row) => {
    if (row.graph) return { row, isHeading: false, tagW: 0, lines: [], graph: layoutMiniGraph(row.graph, inner) };
    const tag = row.tag?.toUpperCase();
    const isHeading = (tag?.length ?? 0) > 3;
    const tagW = tag && !isHeading ? measure(tag, STYLE.tag.size, STYLE.tag.face) + SPACE['4'] + SPACE['2-5'] : 0;
    const markW = row.mark && !isHeading ? measure(row.mark, STYLE.mark.size, STYLE.mark.face) + SPACE['3'] : 0;
    const style = row.isMono ? STYLE.mono : STYLE.row;
    const body = row.text + (row.meta !== undefined ? ` · ${row.meta}` : '');
    return { row, isHeading, tagW, lines: wrap(body, inner - tagW - markW, style) };
  });
  let top = CARD.pad;
  for (const r of laid) {
    r.top = top;
    r.height = (r.isHeading ? STYLE.row.line : 0) + r.lines.length * STYLE.row.line + (r.graph?.height ?? 0);
    top += r.height + CARD.gap;
  }
  return { rows: laid, height: top - CARD.gap + CARD.pad };
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 글자 수
// basis: estimate
/**
 * 선 라벨 알약 크기. 선 번호(no)가 있으면 왼쪽에 번호 원이 붙고, 라벨이 없으면 번호 원만 있다.
 * 번호 원은 알약 높이에서 위아래 안쪽 간격을 뺀 지름이고, 두 자리 이상 번호는 숫자 폭만큼 넓어진다.
 */
export function sizePill(label, no) {
  const h = SIZE.pill.height;
  const textW = label === undefined ? 0 : measure(label, STYLE.pill.size, STYLE.pill.face);
  if (no === undefined) return { w: textW + SPACE['7'], h };
  const numW = numberBadgeWidth(no);
  return { w: label === undefined ? numW + SPACE['1'] * 2 : SPACE['1'] + numW + SPACE['2'] + textW + SPACE['7'] / 2, h, numW, textW };
}

/** 선 번호 원 너비. 한 자리는 지름과 같은 원이고 두 자리 이상은 숫자 폭에 좌우 간격을 더한다. */
export function numberBadgeWidth(no) {
  return Math.max(SIZE.pill.height - SPACE['1'] * 2, measure(String(no), BADGE_STYLE.size, BADGE_STYLE.face) + SPACE['4']);
}

/**
 * 번호만 있는 알약(라벨 없음)을 배치에 자리를 요구하지 않고 선 위에 얹는 선인가. 격자 칸에 이은 선은 끝 구간이 격자 안이라 얹을 자리를 고를 수 없어 배치가 자리를 준다.
 * quiet 선은 선 옆에 두는 자리(besideLabel)를 쓴다.
 */
export const isOnLinePill = (edge) => edge.no !== undefined && edge.label === undefined && !edge.quiet && !edge.fromCell && !edge.toCell;

/** 라벨이나 번호가 있어 알약을 그리는 선인가 */
export const hasPill = (edge) => edge.label !== undefined || edge.no !== undefined;

// cost: time O(g·n), heap O(1), stack O(1)
// vars: g = 그룹 제목 글자 수, n = 1
// basis: estimate
/** 그룹 제목 줄 너비. 그룹이 제목보다 좁아지지 않게 배치에 넘긴다. */
export function groupTitleWidth(group) {
  const head = groupHead(group);
  return head.lead + head.w + INNER_X * 2;
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 그룹 제목 글자 수
// basis: estimate
/**
 * 그룹 제목 줄의 한 덩어리: 제목 글, 배지, 개수 알약. 덩어리 왼쪽 끝이 제목 글 기본 자리(titleDx)이고 선이 가리면 덩어리째 비킨다.
 * 아이콘이 있으면 왼쪽 모서리에 정사각 탭(너비 lead)이 붙고 덩어리는 그 오른쪽에서 시작한다. 탭은 비키지 않는다.
 * @returns { w, textDx, decor, lead }. textDx는 덩어리 왼쪽에서 제목 글까지 거리, decor는 장식 자리(없으면 undefined), lead는 탭 너비(없으면 0)다
 */
export function groupHead(group) {
  const titleW = measure(group.label, STYLE.group.size, STYLE.group.face);
  const decor = groupDecor(group, titleW);
  return { w: decor?.w ?? titleW, textDx: decor?.items.find((i) => i.kind === 'title').x ?? 0, decor, lead: group.iconData ? SIZE.group.title : 0 };
}
