// 산점도: 같은 크기 점, 이름 글자, link 화살표. 계열이 있으면 계열 색이다. 신뢰구간은 받지 않는다.
import { measure } from '../measure/fonts.js';
import { centerBaseline, renderRich, roundCoord as r } from '../text.js';
import { values } from '../tokens.js';
import { drawRules } from './axis.js';
import { inkGroup } from './labels.js';
import { DOT, NAME_OFFSET, PAD, SIZE, SPACE, TEXT, seriesColor } from './metrics.js';
import { plotFrame } from './plot-frame.js';

// 화살촉 삼각형의 반폭 비율(길이 대비)
const HEAD_HALF_WIDTH = 0.4;
// 화살 끝을 당길 때 한 번에 움직이는 거리(px)
const TIP_STEP = 1;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 화살표가 끝 점에서 tip만큼 떨어져 끝날 때 화살촉(끝에서 시작 쪽으로 뻗은 삼각형)이 글자 상자 box와 겹치는가. end는 화살촉 끝 좌표, dir은 시작 점에서 끝 점으로 향하는 단위 방향이다.
// 화살촉은 선 굵기 곱 토큰 크기라 선 굵기가 두꺼우면 크다. 삼각형의 세 꼭짓점과 가운데를 상자에 간격 `space.2`를 더해 본다.
function arrowheadHits(end, dir, box) {
  const length = SIZE.marker * values.border.strong;
  const [bx, by] = [end.x - dir.ux * length, end.y - dir.uy * length];
  const [px, py] = [-dir.uy * length * HEAD_HALF_WIDTH, dir.ux * length * HEAD_HALF_WIDTH];
  const points = [[end.x, end.y], [bx + px, by + py], [bx - px, by - py], [bx, by], [(end.x + bx) / 2, (end.y + by) / 2]];
  const pad = SPACE['2'];
  return points.some(([x, y]) => x >= box.x0 - pad && x <= box.x1 + pad && y >= box.y0 - pad && y <= box.y1 + pad);
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 점 수
// basis: estimate
// 점 이름 자리: 점 오른쪽에 두고, 그림 오른쪽 끝을 넘으면 점 왼쪽으로 옮긴다. 화살촉이 이름을 피하게 하려고 이름 글자 상자를 먼저 구한다.
function pointNames(chart, at, right) {
  return chart.rows.map((p) => {
    const { x, y } = at.get(p.label);
    const nameW = measure(p.label, TEXT['12']);
    const toLeft = x + NAME_OFFSET + nameW > right;
    const width = measure(p.label, TEXT['11']);
    return { p, nameW, toLeft, box: { x0: toLeft ? x - NAME_OFFSET - width : x + NAME_OFFSET, x1: toLeft ? x - NAME_OFFSET : x + NAME_OFFSET + width, y0: y - TEXT['11'] / 2, y1: y + TEXT['11'] / 2 } };
  });
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
  const gap = DOT + SPACE['2'];
  const endAt = (tip) => ({ x: b.x - dir.ux * tip, y: b.y - dir.uy * tip });
  let tip = gap;
  while (tip < length / 2 && names.some(({ box }) => arrowheadHits(endAt(tip), dir, box))) tip += TIP_STEP;
  const [x1, y1, x2, y2] = [a.x + dir.ux * gap, a.y + dir.uy * gap, endAt(tip).x, endAt(tip).y];
  const series = Math.max(0, chart.series.findIndex((s) => s.id === b.p.values.series));
  return `<g class="cr-${chart.rows.indexOf(a.p)}"><g class="cs-${series}"><line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" pathLength="1" class="chart-link draw" marker-end="url(#fl-arrow)"/></g></g>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 점 하나와 이름
function pointMark(ctx, { p, toLeft }, k) {
  const { chart, at } = ctx;
  const { x, y } = at.get(p.label);
  const i = Math.max(0, chart.series.findIndex((s) => s.id === p.values.series));
  const name = `<text x="${r(toLeft ? x - NAME_OFFSET : x + NAME_OFFSET)}" y="${r(centerBaseline(y, TEXT['11']))}" class="chart-name late${toLeft ? ' end' : ''}">${renderRich(p.label)}</text>`;
  return `<g class="cr-${k}"><g class="cs-${i}"><circle cx="${r(x)}" cy="${r(y)}" r="${DOT}" fill="${seriesColor(chart, i)}" class="pop"/></g></g>${inkGroup(k, name, i)}`;
}

// cost: time O(p²·n + t), heap O(out), stack O(1)
// vars: p = 점 수, n = 끝 당김 걸음 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
export function drawScatter(figure, top) {
  const { chart } = figure;
  const { sx, sy, frame, right, bottom } = plotFrame(figure, top, { xs: chart.rows.map((p) => p.values.x), ys: chart.rows.map((p) => p.values.y) });
  const at = new Map(chart.rows.map((p) => [p.label, { x: sx.at(p.values.x), y: sy.at(p.values.y), p }]));
  const names = pointNames(chart, at, right);
  const ctx = { chart, at, names };
  const fits = names.map(({ p, nameW }) => {
    const { x } = at.get(p.label);
    return { text: p.label, width: nameW, room: Math.max(right - x, x - PAD) - NAME_OFFSET, line: p.line, what: 'point name' };
  });
  const parts = [frame, ...chart.links.map((link) => linkArrow(ctx, link)), ...names.map((name, k) => pointMark(ctx, name, k))];
  const occupied = [...names.map(({ box }) => ({ x0: box.x0, x1: box.x1, y0: box.y0, y1: box.y1 })), ...[...at.values()].map(({ x, y }) => ({ x0: x - DOT, x1: x + DOT, y0: y - DOT, y1: y + DOT }))];
  parts.push(drawRules(chart.rules, sy, { axis: 'y', from: sx.at(sx.ticks[0]), to: sx.at(sx.ticks.at(-1)), occupied }));
  return { svg: parts.join('\n'), bottom, rowKeys: chart.rows.map((p) => p.label), fits };
}
