// 도형, 카드, 선 라벨 크기를 정한다. 여기서 정한 크기를 배치에 넘기고 그대로 그린다(docs/design/layout.md 도형 크기와 연결점).
import { values } from '../tokens.js';
import { measure, wrap } from './fonts.js';
import { layoutMiniGraph } from './minigraph.js';

const SPACE = values.space;
const TEXT = values.size.text;
const LINE = values.size.line;
const SIZE = values.size;

/** 글 모양. 크기, 글꼴, 줄 높이 */
export const STYLE = Object.freeze({
  label: { size: TEXT['14'], face: 'medium', line: LINE['18'] },
  sub: { size: TEXT['12'], face: 'regular', line: LINE['15'] },
  row: { size: TEXT['11'], face: 'regular', line: LINE['15'] },
  mono: { size: TEXT['10-5'], face: 'mono', line: LINE['15'] },
  tag: { size: TEXT['9'], face: 'semibold' },
  mark: { size: TEXT['11'], face: 'semibold' },
  pill: { size: TEXT['11'], face: 'mono' },
  group: { size: TEXT['11'], face: 'semibold' },
  chip: { size: TEXT['11-5'], face: 'regular', line: LINE['15'] },
  cell: { size: TEXT['11-5'], face: 'regular' },
  type: { size: TEXT['10-5'], face: 'mono' },
});

/** 카드 안쪽 간격 */
export const CARD = Object.freeze({ pad: SPACE['3'], side: SPACE['4'], gap: SPACE['2'], margin: SPACE['5'] });
const INNER_X = SPACE['9'];
const INNER_Y = SPACE['6'];

// cost: time O(k·r·n²), heap O(k·r), stack O(1)
// vars: k = 카드 내용 수, r = 카드 줄 수, n = 줄 글자 수
// basis: estimate
/**
 * 도형 하나의 크기. box는 배치에 넘기는 사각형, margin은 배치 바깥 여백(위, 아래)이다.
 * @param node 그림 모형의 도형. shape: person, box, external, store, decision, state, table, start, final
 * @param contents 시간 흐름에서 이 도형 카드에 보일 내용 목록. 내용은 카드 줄 목록이다
 * @param lineCounts 사람 몸통 높이를 정할 선 수. { out: 나가는 선 수, in: 들어오는 선 수 }
 * @returns { w, h, marginTop, marginBottom, marginSide?, labelLines, subLines, card?: { w, h, layouts } }
 */
export function sizeNode(node, contents = [], lineCounts = { out: 0, in: 0 }) {
  if (node.shape === 'person') return sizePerson(node, contents, lineCounts);
  if (node.shape === 'table') return sizeTable(node, contents);
  if (node.shape === 'start' || node.shape === 'final') return { w: SIZE['state-dot'], h: SIZE['state-dot'], marginTop: 0, marginBottom: 0, labelLines: [], subLines: [] };
  const maxInner = SIZE['node-max'] - INNER_X * 2;
  const labelLines = wrap(node.label, maxInner, STYLE.label.size, STYLE.label.face);
  const subLines = node.sub ? wrap(node.sub, maxInner, STYLE.sub.size, STYLE.sub.face) : [];
  const textW = Math.max(...labelLines.map((l) => measure(l, STYLE.label.size, STYLE.label.face)), ...subLines.map((l) => measure(l, STYLE.sub.size)));
  let w = Math.min(SIZE['node-max'], Math.max(SIZE['node-min'], textW + INNER_X * 2));
  if (contents.length) w = Math.max(w, SIZE.card);
  const textH = labelLines.length * STYLE.label.line + subLines.length * STYLE.sub.line;
  if (node.shape === 'decision') {
    // 마름모 안에 글 사각형이 들어가려면 가로세로가 글의 두 배쯤 필요하다(마름모 내접 사각형 비율).
    return { w: Math.max(w, (textW + INNER_X) * 2), h: (textH + INNER_Y) * 2, marginTop: 0, marginBottom: 0, labelLines, subLines };
  }
  const card = contents.length ? sizeCard(contents, w - CARD.margin * 2) : undefined;
  const h = Math.max(SIZE['node-min-h'], INNER_Y * 2 + textH + (card ? card.h + CARD.margin : 0));
  const cap = node.shape === 'store' ? SIZE['store-cap'] : 0;
  return { w, h, marginTop: cap, marginBottom: cap, labelLines, subLines, card };
}

// cost: time O(r·n²), heap O(r·n), stack O(1)
// vars: r = 카드 줄 수, n = 글자 수
// basis: estimate
// 사람 모양: 배치 사각형은 몸통의 곧은 옆면. 머리와 어깨는 위 여백, 이름표와 카드는 아래 여백이다.
// 몸통 높이는 토큰 기본값이고, 한 면의 연결점 간격이 선 굵기와 틈의 합보다 좁아질 때만 그 면이 필요한 만큼 늘어난다.
function sizePerson(node, contents, lineCounts) {
  const labelLines = wrap(node.label, SIZE['node-max'], STYLE.label.size, STYLE.label.face);
  const labelW = Math.max(...labelLines.map((l) => measure(l, STYLE.label.size, STYLE.label.face)));
  const card = contents.length ? sizeCard(contents, SIZE.card - CARD.margin * 2) : undefined;
  // 배치 사각형은 늘 몸통 너비다. 넓은 이름표와 카드 자리는 좌우 바깥 여백으로 넘긴다.
  const w = SIZE['person-w'];
  const wide = Math.max(w, card ? SIZE.card : 0, labelW);
  const below = SPACE['3'] + labelLines.length * STYLE.label.line + (card ? CARD.margin + card.h : 0);
  const h = bodyHeight(Math.max(lineCounts.out, lineCounts.in));
  return { w, h, marginTop: SIZE['person-head'] + SIZE['person-shoulder'] + SPACE['1'], marginBottom: below, marginSide: (wide - w) / 2, labelLines, subLines: [], card };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 사람 몸통 높이. 한 면에 선 n개가 서로 닿지 않으려면 연결점 간격이 선 굵기와 틈의 합 이상이어야 하므로 (n + 1) × 간격이 필요하다.
 * @param lines 두 면(오른쪽, 왼쪽) 가운데 선이 더 많은 면의 선 수
 */
export function bodyHeight(lines) {
  return Math.max(SIZE['person-body'], (lines + 1) * (values.border.edge + SPACE['0-5']));
}

// cost: time O(c + r·n²), heap O(r·n), stack O(1)
// vars: c = 열 수, r = 카드 줄 수, n = 글자 수
// basis: estimate
// 테이블: 머리 칸, 열 칸, 카드 칸이 모두 배치 사각형 안이다.
function sizeTable(node, contents) {
  const rowH = SIZE['table-row'];
  const nameW = Math.max(...node.columns.map((c) => measure(c.name, STYLE.cell.size) + (c.pk || c.fk || c.unique ? measure('UNQ', STYLE.tag.size, STYLE.tag.face) + SPACE['3'] : 0)));
  const typeW = Math.max(...node.columns.map((c) => measure(c.type, STYLE.type.size, STYLE.type.face)));
  const titleW = measure(node.label, STYLE.label.size, STYLE.label.face);
  let w = Math.max(SIZE['node-min'], nameW + typeW + INNER_X * 2 + SPACE['8'], titleW + INNER_X * 2);
  if (contents.length) w = Math.max(w, SIZE.card);
  const card = contents.length ? sizeCard(contents, w - CARD.margin * 2) : undefined;
  const h = rowH * (node.columns.length + 1) + (card ? card.h + CARD.margin * 2 : 0);
  return { w, h, marginTop: 0, marginBottom: 0, labelLines: [node.label], subLines: [], card, rowH };
}

// cost: time O(k·r·n²), heap O(k·r), stack O(1)
// vars: k = 카드 내용 수, r = 줄 수, n = 줄 글자 수
// basis: estimate
/** 카드 크기. 높이는 내용 가운데 가장 큰 것이다. */
export function sizeCard(contents, width) {
  const layouts = contents.map((rows) => layoutCard(rows, width));
  return { w: width, h: Math.max(...layouts.map((l) => l.height)), layouts };
}

// cost: time O(r·n²), heap O(r·n), stack O(1)
// vars: r = 카드 줄 수, n = 줄 글자 수
// basis: estimate
/**
 * 카드 줄을 너비에 맞게 나눈다. 태그가 세 글자를 넘으면 글 위에 따로 선다.
 * @returns { rows: { row, isHeading, tagW, lines, graph? }[], height }
 */
export function layoutCard(rows, width) {
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
    return { row, isHeading, tagW, lines: wrap(body, inner - tagW - markW, style.size, style.face) };
  });
  const textH = laid.reduce((h, r) => h + (r.isHeading ? STYLE.row.line : 0) + r.lines.length * STYLE.row.line + (r.graph?.height ?? 0), 0);
  return { rows: laid, height: textH + CARD.gap * (laid.length - 1) + CARD.pad * 2 };
}

/** 선 라벨 알약 크기 */
export function sizePill(label) {
  return { w: measure(label, STYLE.pill.size, STYLE.pill.face) + SPACE['7'], h: SIZE.pill };
}

// cost: time O(g·n), heap O(1), stack O(1)
// vars: g = 그룹 제목 글자 수, n = 1
// basis: estimate
/** 그룹 제목 줄 너비. 그룹이 제목보다 좁아지지 않게 배치에 넘긴다. */
export function groupTitleWidth(label) {
  return measure(label, STYLE.group.size, STYLE.group.face) + INNER_X * 2;
}
