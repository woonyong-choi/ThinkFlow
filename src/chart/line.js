// 선 차트: 계열마다 선과 점. x 순서대로 잇는다. 신뢰구간은 계열 색의 옅은 띠(low~high)이고 선과 점은 띠 위에 그린다.
// 신뢰구간이 이어진 점이 하나뿐이면 띠가 면이 못 되므로 세로 오차 막대로 그린다.
import { roundCoord as r } from '../text.js';
import { values } from '../tokens.js';
import { curveOf, timeAt } from '../easing.js';
import { drawRules } from './axis.js';
import { CAP, DOT, SPACE, seriesColor } from './metrics.js';
import { plotFrame } from './plot-frame.js';

const REVEAL = curveOf('reveal');
// 점이 나타나는 시각 비율을 줄이는 자릿수 배율(소수 셋째 자리)
const AT_PRECISION = 1000;

// cost: time O(p·STEPS), heap O(p), stack O(1)
// vars: p = 점 수, STEPS = timeAt의 이분 탐색 횟수
// basis: estimate
// 선이 점마다 닿는 시각. 선은 왼쪽부터 길이 순서로 그려지고(dashoffset) 길이 비율 f에 닿는 시간 비율은 easing.reveal을 거꾸로 푼 timeAt(f)이다.
// 값은 자라는 시간 대비 비율이고 소수 셋째 자리로 줄인다. 재생기와 움직이는 SVG가 이 값에 자라는 시간을 곱해 쓴다.
function arrivals(xy) {
  const lengths = [0];
  for (let k = 1; k < xy.length; k++) lengths.push(lengths[k - 1] + Math.hypot(xy[k][0] - xy[k - 1][0], xy[k][1] - xy[k - 1][1]));
  const total = lengths.at(-1) || 1;
  return lengths.map((length) => Math.round(timeAt(REVEAL, length / total) * AT_PRECISION) / AT_PRECISION);
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 점 수
// basis: estimate
// x 순서 점 가운데 신뢰구간이 있는 점의 이어진 묶음들
function intervalRuns(points, id) {
  const runs = [];
  let run = [];
  for (const p of points) {
    if (p.values[`${id}.high`] !== undefined) run.push(p);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 묶음의 점 수
// basis: estimate
// 띠: high를 왼쪽에서 오른쪽으로, low를 오른쪽에서 왼쪽으로 이은 면. 계열이 자랄 때 왼쪽부터 드러난다(wipe).
function bandPath(run, id, { sx, sy, color }) {
  const edge = (p, key) => `${r(sx.at(p.values.x))} ${r(sy.at(p.values[`${id}.${key}`]))}`;
  const d = [...run.map((p) => edge(p, 'high')), ...[...run].reverse().map((p) => edge(p, 'low'))].map((xy, k) => `${k ? 'L' : 'M'} ${xy}`).join(' ');
  return `<path d="${d} Z" fill="${color}" class="chart-band wipe"/>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선 차트에서 신뢰구간이 한 점뿐일 때 쓰는 세로 오차 막대. 점과 같은 시각 at에 나타난다. 경로는 구간 선과 양 끝 캡이고, 흰 바탕 위라서 보조 글자 색 가는 선으로 점보다 앞서지 않게 한다. yLow, yHigh는 화면 좌표다.
function pointInterval({ x, yLow, yHigh }, at) {
  const d = `M ${r(x - CAP / 2)} ${r(yLow)} H ${r(x + CAP / 2)} M ${r(x)} ${r(yLow)} V ${r(yHigh)} M ${r(x - CAP / 2)} ${r(yHigh)} H ${r(x + CAP / 2)}`;
  return `<path d="${d}" class="chart-interval dot" data-at="${at}"/>`;
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 점 수
// basis: estimate
// 계열 i의 신뢰구간 조각들. 이어진 묶음은 띠, 하나뿐인 점은 세로 오차 막대다.
function intervalMarks(ctx, s, i) {
  const { chart, points, sx, sy, ats, order } = ctx;
  return intervalRuns(points, s.id).map((run) => {
    if (run.length > 1) return bandPath(run, s.id, { sx, sy, color: seriesColor(chart, i) });
    const p = run[0];
    return pointInterval({ x: sx.at(p.values.x), yLow: sy.at(p.values[`${s.id}.low`]), yHigh: sy.at(p.values[`${s.id}.high`]) }, ats[i][order.get(p)]);
  });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 두 점 사이 계열 값(key가 value, low, high)을 x에서 보간한 값. 두 점 가운데 하나라도 값이 없으면 없다.
function valueBetween([a, b], key, { x, sx }) {
  const [va, vb] = [a.values[key], b.values[key]];
  if (va === undefined || vb === undefined) return undefined;
  const [xa, xb] = [sx.at(a.values.x), sx.at(b.values.x)];
  return va + ((vb - va) * (x - xa)) / (xb - xa || 1);
}

// cost: time O(s·w·p + p·s), heap O(s·w + p·s), stack O(1)
// vars: s = 계열 수, w = 그림 너비를 샘플 간격으로 나눈 수, p = 점 수
// basis: estimate
// 선, 띠, 점이 차지한 자리. 선과 띠는 가로로 샘플 간격(space.2)마다 선 값과 신뢰구간 값이 닿는 세로 구간을 모으고, 점은 반지름까지 모은다. 기준선 라벨이 피할 때 쓴다.
function occupiedRects(ctx) {
  const { chart, points, sx, sy } = ctx;
  const step = SPACE['2'];
  const rects = [];
  for (let k = 1; k < points.length; k++) {
    const pair = [points[k - 1], points[k]];
    for (let x = sx.at(pair[0].values.x); x < sx.at(pair[1].values.x); x += step) {
      for (const s of chart.series) {
        const ys = ['', '.low', '.high'].map((suffix) => valueBetween(pair, `${s.id}${suffix}`, { x, sx })).filter((v) => v !== undefined).map(sy.at);
        rects.push({ x0: x, x1: x + step, y0: Math.min(...ys), y1: Math.max(...ys) });
      }
    }
  }
  for (const p of points) for (const s of chart.series) rects.push({ x0: sx.at(p.values.x) - DOT, x1: sx.at(p.values.x) + DOT, y0: sy.at(p.values[s.id]) - DOT, y1: sy.at(p.values[s.id]) + DOT });
  return rects;
}

// cost: time O(p·s), heap O(out), stack O(1)
// vars: p = 점 수, s = 계열 수, out = 만든 SVG 글자 수
// basis: estimate
// 계열마다 띠, 선, 그리고 점 순서의 SVG 조각
function seriesMarks(ctx) {
  const { chart, points, sx, sy, ats, order } = ctx;
  const parts = [];
  chart.series.forEach((s, i) => {
    const bands = intervalMarks(ctx, s, i);
    if (bands.length) parts.push(`<g class="cs-${i}">${bands.join('')}</g>`);
  });
  chart.series.forEach((s, i) => {
    const d = points.map((p, k) => `${k ? 'L' : 'M'} ${r(sx.at(p.values.x))} ${r(sy.at(p.values[s.id]))}`).join(' ');
    parts.push(`<g class="cs-${i}"><path d="${d}" fill="none" stroke="${seriesColor(chart, i)}" stroke-width="${values.border.strong}" pathLength="1" class="draw"/></g>`);
  });
  chart.rows.forEach((p, k) => {
    for (const [i, s] of chart.series.entries()) parts.push(`<g class="cr-${k}"><g class="cs-${i}"><circle cx="${r(sx.at(p.values.x))}" cy="${r(sy.at(p.values[s.id]))}" r="${DOT}" fill="${seriesColor(chart, i)}" class="dot" data-at="${ats[i][order.get(p)]}"/></g></g>`);
  });
  return parts;
}

// cost: time O(p·s·STEPS + t), heap O(out), stack O(1)
// vars: p = 점 수, s = 계열 수, STEPS = timeAt의 이분 탐색 횟수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
export function drawLine(figure, top) {
  const { chart } = figure;
  const points = [...chart.rows].sort((a, b) => a.values.x - b.values.x);
  const ys = points.flatMap((p) => chart.series.flatMap((s) => [p.values[s.id], p.values[`${s.id}.low`], p.values[`${s.id}.high`]])).filter((v) => v !== undefined);
  const { sx, sy, frame, bottom } = plotFrame(figure, top, { xs: points.map((p) => p.values.x), ys });
  const order = new Map(points.map((p, k) => [p, k]));
  const ats = chart.series.map((s) => arrivals(points.map((p) => [sx.at(p.values.x), sy.at(p.values[s.id])])));
  const ctx = { chart, points, sx, sy, ats, order };
  const parts = [frame, ...seriesMarks(ctx)];
  parts.push(drawRules(chart.rules, sy, { axis: 'y', from: sx.at(sx.ticks[0]), to: sx.at(sx.ticks.at(-1)), occupied: occupiedRects(ctx) }));
  return { svg: parts.join('\n'), bottom, rowKeys: chart.rows.map((p) => `x=${p.values.x}`), dotAts: [...new Set(ats.flat())].sort((a, b) => a - b) };
}
