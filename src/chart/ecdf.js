// 누적분포 차트(ECDF): 표본을 오름차순으로 세어 고유값마다 `count(≤v) / n`까지 오르는 계단. 세로축은 0~1로 고정이다.
// 결측 표본은 세지 않는다(0으로 넣지 않는다). 곡선은 그림 영역 왼쪽 끝 0에서 시작해 마지막 값에서 1에 닿은 뒤 오른쪽 끝까지 이어진다.
// 표식은 고유값마다 채운 점이고, 계열이 둘 이상이면 끝 이름이 붙는다. 표식 이름은 `계열:v값`이며 계열의 표본이 아닌 값 자리는 숨은 표식으로 남는다.
import { curveOf, timeAt } from '../easing.js';
import { roundToScale } from '../format.js';
import { values } from '../vendor/theme/tokens.js';
import { drawRules } from './axis.js';
import { ecdfGroups, ecdfVertices, hvPath, lengthFractions, spanFractions } from './data.js';
import { endLabelBoxes, endLabelHeight, endLabelMarks, endLabelRoom, endLabelX, hasEndLabels, placeEndLabels } from './end-labels.js';
import { dotAttrs } from './legend.js';
import { markAttrs, markId } from './marks.js';
import { DOT, isReference, seriesPaint, seriesStroke } from './metrics.js';
import { noDataNote, plotFrame } from './plot-frame.js';
import { markShape } from './shape.js';

const REVEAL = curveOf('reveal');
const AT_PRECISION = 1000;
const arrival = (fraction) => roundToScale(timeAt(REVEAL, fraction), AT_PRECISION);

// cost: time O(g·p), heap O(p), stack O(1)
// vars: g = 계열 수, p = 고유값 수
// basis: estimate
// 표식 자리(고유값)의 오름차순 목록. 프레임마다 값이 달라지는 차트는 모든 프레임의 고유값을 합친 집합(chart.slotValues)을 함께 쓴다.
function slotsOf(chart, groups) {
  return [...new Set([...groups.flatMap((group) => group.points.map((p) => p.value)), ...(chart.slotValues ?? [])])].sort((a, b) => a - b);
}

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 고유값 수
// basis: estimate
// 값 v에서 누적분포가 서 있는 높이(v 이하 표본의 비율). 표본보다 왼쪽이면 0이다.
const heightAt = (points, v) => points.findLast((point) => point.value <= v)?.p ?? 0;

// cost: time O(g·p), heap O(g·p), stack O(1)
// vars: g = 계열 수, p = 고유값 수
// basis: estimate
// 계열 하나의 곡선 요소: 모든 계열이 같은 굵기의 같은 계열 테두리 색이고 기대값은 점선이다.
function curveMark(chart, i, { d, isWipe }) {
  if (!d) return '';
  const motion = `${isWipe ? 'wipe' : 'draw'}${isReference(chart, i) ? ' chart-dashed' : ''}`;
  const common = `d="${d}" fill="none"${isWipe ? '' : ' pathLength="1"'}`;
  return `<g class="cs-${i}"><path ${common} stroke="${seriesStroke(chart, i)}" stroke-width="${values["border-width"].strong}" class="${motion}"${markAttrs(chart, markId(chart, i, 'path'))}/></g>`;
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 고유값 수
// basis: estimate
// 계열 하나의 표식들. 자리마다 하나이고 이 계열에 없는 값 자리는 숨는다. 표식은 계단 꼭대기에 놓여 선이 닿는 시각에 나타난다.
function dotMarks(ctx, layer) {
  const { chart, slots, sx, sy } = ctx;
  const { i, group, ats } = layer;
  return slots.map((value, k) => {
    const point = group.points.find((p) => p.value === value);
    const raw = point ? `${point.count}/${group.n}` : '-';
    const attrs = dotAttrs(chart, i, ` class="dot" data-at="${ats.get(value) ?? 0}"${point ? '' : ' visibility="hidden"'}${markAttrs(chart, markId(chart, i, `v${value}`), { raw, paint: seriesPaint(chart, i) })}`);
    return `<g class="cr-${k}"><g class="cs-${i}">${markShape({ shape: seriesPaint(chart, i).shape, cx: sx.at(value), cy: sy.at(heightAt(group.points, value)), radius: DOT, attrs })}</g></g>`;
  });
}

// cost: time O(g·p), heap O(g·p), stack O(1)
// vars: g = 계열 수, p = 고유값 수
// basis: estimate
// 계열마다 꼭짓점, 경로, 표식이 닿는 시각
function layerOf(ctx, group, index) {
  const { chart, sx, sy } = ctx;
  const i = chart.series.length ? index : 0;
  const vertices = ecdfVertices(group.points, { left: sx.at(sx.ticks[0]), right: sx.at(sx.ticks.at(-1)), x: sx.at, y: sy.at });
  const isWipe = isReference(chart, i);
  const [fractions] = vertices.length ? (isWipe ? spanFractions([vertices]) : lengthFractions([vertices])) : [[]];
  const ats = new Map(group.points.map((point, k) => [point.value, arrival(fractions[2 * k + 2])]));
  return { i, group, vertices, isWipe, d: hvPath(vertices), ats };
}

// cost: time O(g·n), heap O(g), stack O(1)
// vars: g = 계열 수, n = 이름 글자 수
// basis: estimate
// 끝 이름: 한 줄 열에 쌓고 곡선이 1에 닿는 점(가장 큰 표본의 x, 높이 1)에서 안내선을 긋는다. 모든 곡선이 같은 높이에서 끝나므로 순서는 계열 번호가 가르고, 표본이 없는 계열은 끝 점이 없다.
function endLabels(ctx, layers, boxes, { limits, x }) {
  const { figure, sx, sy } = ctx;
  if (!boxes.length) return { svg: [], boxes: [] };
  const anchors = new Map(layers.filter((layer) => layer.group.n).map((layer) => [layer.i, { x: sx.at(layer.group.points.at(-1).value), y: sy.at(1) }]));
  const placed = placeEndLabels(boxes, new Map([...anchors].map(([i, at]) => [i, at.y])), limits);
  return { svg: endLabelMarks(figure.chart, placed, anchors, { x }), boxes: placed };
}

// cost: time O(g·p + t), heap O(out), stack O(1)
// vars: g = 계열 수, p = 고유값 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
export function drawEcdf(figure, top) {
  const { chart } = figure;
  const groups = ecdfGroups(chart);
  const slots = slotsOf(chart, groups);
  const empty = new Set(groups.flatMap((group, i) => (group.n ? [] : [chart.series.length ? i : 0])));
  const boxes = hasEndLabels(figure) ? endLabelBoxes(chart, empty) : [];
  const { sx, sy, frame, bottom, right, top: plotTop, plotBottom } = plotFrame(figure, top, { xs: slots.length ? slots : [0, 1], ys: [0, 1], endRoom: endLabelRoom(figure, empty), minPlotH: boxes.length ? endLabelHeight(boxes) : 0 });
  const ctx = { figure, chart, slots, sx, sy };
  const layers = groups.map((group, index) => layerOf(ctx, group, index));
  const column = endLabelX(right);
  const ends = endLabels(ctx, layers, boxes, { limits: { top: plotTop, bottom: plotBottom }, x: column });
  const occupied = ends.boxes.map((box) => ({ x0: column, x1: column + box.width, y0: box.top, y1: box.top + box.height }));
  const isBlank = groups.every((group) => !group.n);
  const parts = [frame, ...layers.map((layer) => curveMark(chart, layer.i, layer)), ...layers.flatMap((layer) => dotMarks(ctx, layer)), ...ends.svg, ...(isBlank ? [noDataNote({ sx, top: plotTop, plotBottom })] : [])];
  parts.push(drawRules(chart.rules, sy, { axis: 'y', from: sx.at(sx.ticks[0]), to: sx.at(sx.ticks.at(-1)), occupied, labels: !chart.layout }));
  const dotAts = [...new Set(layers.flatMap((layer) => [...layer.ats.values()]))].sort((a, b) => a - b);
  return { svg: parts.join('\n'), bottom, rowKeys: slots.map((value) => `x=${value}`), dotAts };
}
