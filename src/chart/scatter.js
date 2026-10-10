// 산점도: 같은 크기 점, 이름 글자, link 화살표. 계열이 있으면 계열 색이다. 신뢰구간은 받지 않는다.
// 계열이 둘 이상이면 점 이름 앞에 그 점 계열의 번호 키(`3 검색 전`)를 붙인다. 번호는 계열 목록 순서이고 범례의 번호와 같다.
import { centerBaseline, renderRich, roundCoord as r } from '../text.js';
import { CHART_ARROW, headReach, roleArrow } from '../draw/arrow.js';
import { values } from '../vendor/theme/tokens.js';
import { drawRules } from './axis.js';
import { inkGroup } from './labels.js';
import { dotAttrs, isKeyed } from './legend.js';
import { markAttrs, markId } from './marks.js';
import { DOT, NAME_OFFSET, PAD, SPACE, TEXT, seriesPaint } from './metrics.js';
import { plotFrame } from './plot-frame.js';
import { markShape } from './shape.js';
import { NAME_STEP, placeNames } from './scatter-names.js';

// 화살 끝을 당길 때 한 번에 움직이는 거리(px)
const TIP_STEP = 1;
const ARROW = roleArrow(CHART_ARROW.scatter);

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 점 p의 계열 목록 번호(0부터). 계열이 없는 점은 0이다.
const seriesOf = (chart, p) => Math.max(0, chart.series.findIndex((s) => s.id === p.values.series));

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 화살표가 끝 점에서 tip만큼 떨어져 끝날 때 화살촉(보이는 꼭지에서 시작 쪽으로 뻗은 삼각형)이 글자 상자 box와 겹치는가. end는 화살촉의 보이는 꼭지 좌표, dir은 시작 점에서 끝 점으로 향하는 단위 방향이다.
// 화살촉은 선 굵기에 비례하는 크기다(draw/arrow.js headReach). 꼭지, 뒤쪽 양 끝, 뒤쪽 가운데, 가운데를 상자에 간격 `space.2`를 더해 본다.
function arrowheadHits(end, dir, box) {
  const { length, half } = headReach(values["border-width"].strong);
  const [bx, by] = [end.x - dir.ux * length, end.y - dir.uy * length];
  const [px, py] = [-dir.uy * half, dir.ux * half];
  const points = [[end.x, end.y], [bx + px, by + py], [bx - px, by - py], [bx, by], [(end.x + bx) / 2, (end.y + by) / 2]];
  const pad = SPACE["1"];
  return points.some(([x, y]) => x >= box.x0 - pad && x <= box.x1 + pad && y >= box.y0 - pad && y <= box.y1 + pad);
}

// cost: time O(p·n), heap O(1), stack O(1)
// vars: p = 점 수, n = 끝 당김 걸음 수
// basis: estimate
// link 화살표 한 줄. 두 점의 테두리에서 끊어 화살촉이 끝 점에 가려 방향이 안 보이는 일을 막고, 끝은 화살촉이 어느 점의 이름 글자 상자와도 겹치지 않을 때까지 시작 점 쪽으로 더 당긴다.
function linkArrow(ctx, link) {
  const { chart, at, names } = ctx;
  const [a, b] = [at.get(link.from), at.get(link.to)];
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const dir = { ux: (b.x - a.x) / length, uy: (b.y - a.y) / length };
  const gap = DOT + SPACE["1"];
  const endAt = (tip) => ({ x: b.x - dir.ux * tip, y: b.y - dir.uy * tip });
  let tip = gap;
  while (tip < length / 2 && names.some(({ box }) => arrowheadHits(endAt(tip), dir, box))) tip += TIP_STEP;
  // 선은 화살촉의 보이는 꼭지보다 둥근 끝 반지름만큼 앞에서 끝난다. 둥근 끝이 꼭지 밖으로 나오지 않게 하기 위해서다.
  const { cap } = headReach(values["border-width"].strong);
  const [x1, y1, x2, y2] = [a.x + dir.ux * gap, a.y + dir.uy * gap, endAt(tip).x - dir.ux * cap, endAt(tip).y - dir.uy * cap];
  const series = seriesOf(chart, b.p);
  return `<g class="cr-${chart.rows.indexOf(a.p)}"><g class="cs-${series}"><line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" class="chart-link ${ARROW.cls} pop"${ARROW.end}/></g></g>`;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 점 이름 글자 수
// basis: estimate
// 점 하나와 이름
function pointMark(ctx, { p, text, toLeft, shift, lines, box }, k) {
  const { chart, at } = ctx;
  const { x, y } = at.get(p.label);
  const i = seriesOf(chart, p);
  const label = chart.layout ? lines.map((line, i) => `<tspan x="${r(toLeft ? x - NAME_OFFSET : x + NAME_OFFSET)}" dy="${i ? NAME_STEP : -(lines.length - 1) * NAME_STEP / 2}">${i ? ' ' : ''}${renderRich(line)}</tspan>`).join('') : renderRich(text);
  const name = `<text x="${r(toLeft ? x - NAME_OFFSET : x + NAME_OFFSET)}" y="${r(centerBaseline(y + shift * NAME_STEP, TEXT['11']))}" class="chart-name late${toLeft ? ' end' : ''}">${label}</text>`;
  const pad = SPACE["0-25"];
  const back = `<rect x="${r(box.x0 - pad)}" y="${r(box.y0 - pad)}" width="${r(box.x1 - box.x0 + pad * 2)}" height="${r(box.y1 - box.y0 + pad * 2)}" class="chart-text-bg late"/>`;
  const dot = markShape({ shape: seriesPaint(chart, i).shape, cx: x, cy: y, radius: DOT, attrs: dotAttrs(chart, i, ` class="pop"${markAttrs(chart, markId(chart, i, k), { raw: `${p.values.x},${p.values.y}`, paint: seriesPaint(chart, i) })}`) });
  return `<g class="cr-${k}"><g class="cs-${i}">${dot}</g></g>${inkGroup(k, back + name, i)}`;
}

// cost: time O(p²·n + t), heap O(out), stack O(1)
// vars: p = 점 수, n = 끝 당김 걸음 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
export function drawScatter(figure, top) {
  const { chart } = figure;
  const { sx, sy, frame, right, bottom, top: plotTop } = plotFrame(figure, top, { xs: chart.rows.map((p) => p.values.x), ys: chart.rows.map((p) => p.values.y) });
  const at = new Map(chart.rows.map((p) => [p.label, { x: sx.at(p.values.x), y: sy.at(p.values.y), p }]));
  const keyed = isKeyed(figure);
  const { names, clashes } = placeNames(chart.rows.map((p) => ({ ...at.get(p.label), p, text: keyed ? `${seriesOf(chart, p) + 1} ${p.label}` : p.label })), right, chart.layout ? { left: sx.start, top: plotTop, bottom: plotTop + sy.length } : undefined);
  const ctx = { chart, at, names };
  const fits = names.map(({ p, nameW, fitsBounds }) => {
    const { x } = at.get(p.label);
    return { text: p.label, width: nameW, room: fitsBounds ? Math.max(right - x, x - PAD) - NAME_OFFSET : 0, line: p.line, what: 'point name' };
  });
  const parts = [frame, ...chart.links.map((link) => linkArrow(ctx, link)), ...names.map((name, k) => pointMark(ctx, name, k))];
  const occupied = [...names.map(({ box }) => ({ x0: box.x0, x1: box.x1, y0: box.y0, y1: box.y1 })), ...[...at.values()].map(({ x, y }) => ({ x0: x - DOT, x1: x + DOT, y0: y - DOT, y1: y + DOT }))];
  parts.push(drawRules(chart.rules, sy, { axis: 'y', from: sx.at(sx.ticks[0]), to: sx.at(sx.ticks.at(-1)), occupied, labels: !chart.layout }));
  return { svg: parts.join('\n'), bottom, rowKeys: chart.rows.map((p) => p.label), fits, clashes: clashes.map(([a, b]) => ({ a: a.label, b: b.label, line: b.line })) };
}
