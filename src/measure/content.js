// 카드 안에 보이는 내용(`show`와 값 줄)의 크기와 글 자리. 줄마다 태그, 본문, 표시, 값 자리를 한 번 놓고 모든 글을 카드 머리와 같은 text(measure/texts.js)로 담는다.
// 그리는 쪽(draw/content.js, draw/values.js)과 그림 검사(check/fit.js)는 이 글 자리를 그대로 읽고 줄 나누기, 들여쓰기, 흐림 자리, 값 자리를 다시 계산하지 않는다.
// 좌표는 내용 면 왼쪽 위가 원점이다. 내용 면의 도형 안 자리는 draw/content.js의 contentBox가 정한다.
import { plainText } from '../text.js';
import { values } from '../vendor/theme/tokens.js';
import { widestText } from '../value-slots.js';
import { measure, wrap } from './fonts.js';
import { layoutMiniGraph, miniGraphWidth } from './minigraph.js';
import { STYLE, textAt } from './texts.js';

const SPACE = values.spacing;

/**
 * 카드에 보이는 내용(`show`와 값 줄)의 안쪽 간격. 카드 면 안에서 내용이 놓이는 흰 면 하나의 둘레다.
 * pad는 면과 첫·끝 줄 사이, side는 면 가장자리와 글 사이, gap은 줄 사이, margin은 카드 면과 내용 면 사이다.
 */
export const CONTENT = Object.freeze({ pad: SPACE["1-5"], side: SPACE["2"], gap: values.spacing["1-5"], margin: SPACE["2-5"] });

// 카드 안쪽 폭 가운데 값 글자 자리가 가질 수 있는 몫. 나머지는 줄 이름 글이 쓴다.
const VALUE_SHARE = 0.6;
// 태그 알약 안쪽 좌우 합, 알약과 본문 사이, 본문과 오른쪽 표시 사이 간격
const TAG_PAD = SPACE["2"];
const TAG_GAP = SPACE["1-25"];
const MARK_GAP = SPACE["1-5"];

/** 줄 본문: 글 뒤에 덧붙임이 있으면 ` · `로 이어 붙인 글. 크기를 재는 글과 그리는 글이 같다. */
const rowBody = (row) => row.text + (row.meta !== undefined ? ` · ${row.meta}` : '');

// cost: time O(k·g·(n·e + n²)), heap O(g·n), stack O(1)
// vars: k = 카드 내용 수, g = 관계 그래프 줄 수, n = 이름 수, e = 관계 수
// basis: estimate
/**
 * 내용이 있는 카드의 가장 좁은 폭(바깥 폭). 내용이 없으면 0이다. 카드 기본 내용 폭(`size.node.card-width`)과 관계 그래프 줄이 이름을 자르지 않고 놓이는 데 필요한 폭 가운데 넓은 쪽이다.
 * 관계 그래프 같은 구조 내용은 `size.node.max-width`로 자르지 않고 카드를 넓힌다. 그 값은 글 줄바꿈 폭이다. 도형, 머리 있는 카드, 표, API가 모두 이 값을 하한으로 쓴다.
 */
export function contentMinWidth(contents) {
  if (!contents.length) return 0;
  const graphs = contents.flatMap((rows) => rows.filter((row) => row.graph).map((row) => miniGraphWidth(row.graph) + (CONTENT.side + CONTENT.margin) * 2));
  const charts = contents.flatMap((rows) => rows.filter((row) => row.chart).map((row) => row.chart.width + CONTENT.margin * 2));
  return Math.max(values.spacing.figure.node["card-width"], ...graphs, ...charts);
}

// cost: time O(k·r·n²), heap O(k·r), stack O(1)
// vars: k = 카드 내용 수, r = 줄 수, n = 줄 글자 수
// basis: estimate
/** 내용 면의 크기. 높이는 내용 가운데 가장 큰 것이다. */
export function sizeContent(contents, width) {
  const layouts = contents.map((rows) => layoutContent(rows, width));
  return { w: width, h: Math.max(...layouts.map((l) => l.height)), layouts };
}

// cost: time O(r·n²), heap O(r·n), stack O(1)
// vars: r = 카드 줄 수, n = 줄 글자 수
// basis: estimate
/**
 * 내용 줄을 너비에 맞게 나누고 모든 글을 놓는다. 태그가 세 글자를 넘으면 글 위에 따로 선다.
 * @returns { rows, height }. rows는 줄마다 { row, top, height, texts, tag?, graph?, valueSlot? }다.
 * top은 내용 면 윗변에서 그 줄이 시작하는 거리, height는 그 줄이 차지한 높이, texts는 그 줄의 모든 글(태그, 본문 줄, 오른쪽 표시, 관계 그래프 이름)이고,
 * tag는 태그 알약 사각형 { x, center, w, h }, graph는 관계 그래프의 선과 이름 사각형({ at, nodes, edges }), valueSlot은 값 글자 자리다.
 */
function layoutContent(rows, width) {
  if (!rows.length) return { rows: [], height: STYLE.row.line + CONTENT.pad * 2 };
  let top = CONTENT.pad;
  const laid = rows.map((row) => {
    const placed = row.chart ? { row, id: row.chartId, chart: row.chart, top, height: row.chart.height, texts: [] } : row.graph ? placeGraph(row, { width, top }) : placeRow(row, { width, top });
    top += placed.height + CONTENT.gap;
    return placed;
  });
  return { rows: laid, height: top - CONTENT.gap + CONTENT.pad };
}

// 관계 그래프 줄. 이름 글은 text이고, 선과 이름 알약의 사각형은 그래프 왼쪽 위(at)가 원점이다.
function placeGraph(row, { width, top }) {
  const graph = layoutMiniGraph(row.graph, width - CONTENT.side * 2);
  const at = { x: CONTENT.side, y: top };
  const texts = graph.nodes.map((n) => textAt(n.isLit ? 'mini on' : 'mini', n.name, STYLE.mini, { x: at.x + n.x + n.w / 2, center: at.y + n.y + n.h / 2, anchor: 'middle' }));
  return { row, top, height: graph.height, texts, graph: { ...graph, at } };
}

// cost: time O(n²), heap O(n), stack O(1)
// vars: n = 줄 글자 수
// basis: estimate
// 글 줄 하나: 첫 줄 왼쪽의 태그 알약, 오른쪽 끝 표시나 값 자리, 그 사이 본문 줄. 본문은 태그와 오른쪽 자리를 뺀 폭에서 줄을 나눈다.
function placeRow(row, { width, top }) {
  const inner = width - CONTENT.side * 2;
  const tag = row.tag?.toUpperCase();
  const isHeading = (tag?.length ?? 0) > 3;
  const pillW = tag ? measure(tag, STYLE.tag.size, STYLE.tag.face) + TAG_PAD : 0;
  const tagW = tag && !isHeading ? pillW + TAG_GAP : 0;
  // 값 줄의 오른쪽 자리는 그 값이 모든 장면에서 가질 글의 실제 폭이다. 카드가 담을 수 있는 몫을 넘는 글은 이 폭에서 줄을 나눈다.
  const valueSlot = row.isValue ? fitValueSlot(row.valueTexts, Math.floor(inner * VALUE_SHARE), { x: width - CONTENT.side, center: top + STYLE.row.line / 2 }) : undefined;
  const markW = valueSlot ? valueSlot.w + MARK_GAP : row.mark && !isHeading ? measure(row.mark, STYLE.mark.size, STYLE.mark.face) + MARK_GAP : 0;
  const style = row.isMono ? STYLE.mono : STYLE.row;
  const lines = wrap(rowBody(row), inner - tagW - markW, style);
  const first = top + (isHeading ? STYLE.row.line : 0);
  const center = top + STYLE.row.line / 2;
  const mutedAt = row.meta === undefined ? [] : mutedFrom(lines, row, style);
  const texts = [
    ...(tag ? [textAt('tag', tag, STYLE.tag, { x: CONTENT.side + pillW / 2, center, anchor: 'middle' })] : []),
    ...(row.mark && !row.isValue ? [textAt('mark', row.mark, STYLE.mark, { x: width - CONTENT.side, center, anchor: 'end' })] : []),
    ...lines.map((line, k) => textAt(row.isMono ? 'row mono' : 'row', line, style, { x: CONTENT.side + (k === 0 ? tagW : 0), center: first + (k + 0.5) * style.line }, row.meta === undefined ? {} : { mutedFrom: mutedAt[k] })),
  ];
  const height = (isHeading ? STYLE.row.line : 0) + Math.max(lines.length, valueSlot?.lines ?? 0) * STYLE.row.line;
  return { row, top, height, texts, ...(tag ? { tag: { x: CONTENT.side, center, w: pillW, h: values.spacing.figure.tag.height } } : {}), ...(valueSlot ? { valueSlot } : {}) };
}

// cost: time O(l·n), heap O(l), stack O(1)
// vars: l = 줄 수, n = 줄 글자 수
// basis: estimate
// 나눈 줄마다, 덧붙임이 시작하는 표시 글자 자리(줄 안). 덧붙임 전체가 흐리다. 자리는 백틱 표시를 뺀 글자 기준이고 글 줄의 읽는 방식(style.face)을 따른다.
function mutedFrom(lines, row, style) {
  const plainBody = plainText(rowBody(row), style.face);
  const metaAt = plainText(row.text, style.face).length;
  let cursor = 0;
  return lines.map((line) => {
    const plain = plainText(line, style.face);
    const start = Math.max(cursor, plainBody.indexOf(plain, cursor));
    cursor = start + plain.length;
    return Math.max(0, metaAt - start);
  });
}

// cost: time O(t·n²), heap O(t·n), stack O(1)
// vars: t = 값이 가질 글 수, n = 글자 수
// basis: estimate
/**
 * 값 글자 자리. 폭은 값이 가질 글 가운데 가장 넓은 것의 실제 폭이고(올림), 상한(maxW)을 넘으면 상한이다. 줄 수는 그 폭에서 글을 나눈 가장 많은 줄이다.
 * 글마다 그 자리 오른쪽 끝(at.x)에 놓인 text를 함께 담는다(valueText).
 * @returns { w, lines, x, center, texts: Map<글, text> }
 */
function fitValueSlot(texts, maxW, at) {
  const w = Math.min(Math.ceil(widestText(texts)), maxW);
  const slot = { w, lines: 1, ...at, texts: new Map() };
  for (const text of texts) {
    const placed = placeValue(slot, text);
    slot.texts.set(text, placed);
    slot.lines = Math.max(slot.lines, placed.lines?.length ?? 1);
  }
  return slot;
}

/** 값 글자 자리에 놓인 값 글의 text. 자리 폭에서 한 줄에 들면 글 그대로이고, 아니면 나눈 줄을 담는다(lines). */
export function valueText(slot, text) {
  return slot.texts.get(text) ?? placeValue(slot, text);
}

function placeValue(slot, text) {
  const lines = wrap(text, slot.w, STYLE.value);
  return textAt('value', text, STYLE.value, { x: slot.x, center: slot.center, anchor: 'end' }, lines.length > 1 ? { lines } : {});
}
