// 선, 계단, 면 차트: 계열마다 선과 점. x 순서대로 잇고 계열 수에 상한이 없다. 신뢰구간은 계열 색의 옅은 띠(low~high)이고 선과 점은 띠 위에 그린다.
// 신뢰구간이 이어진 점이 하나뿐이면 띠가 면이 못 되므로 세로 오차 막대로 그린다.
// 값이 없는 점(`-`)에서 선이 끊긴다. 끊긴 곳에는 점도 `data-at`도 없고 선이 자라는 시간도 쓰지 않는다. 계단은 값이 다음 점까지 이어지는 post 방식이다.
// 기대값(reference) 계열은 점선과 속이 빈 꼭짓점이고 점선은 길이로 드러낼 수 없어 x 위치로 닦아 낸다(wipe).
import { roundCoord as r } from '../text.js';
import { tokens, values } from '../vendor/theme/tokens.js';
import { curveOf, timeAt } from '../easing.js';
import { roundToScale } from '../format.js';
import { drawRules } from './axis.js';
import { definedRuns, isValue, lengthFractions, linePath, spanFractions, stepVertices, hvPath } from './data.js';
import { endLabelBoxes, endLabelHeight, endLabelMarks, endLabelRoom, endLabelX, hasEndLabels, placeEndLabels } from './end-labels.js';
import { dotAttrs } from './legend.js';
import { markAttrs, markId } from './marks.js';
import { CAP, DOT, SPACE, isReference, seriesColor, seriesFill, seriesPaint, seriesStroke } from './metrics.js';
import { noDataNote, plotFrame } from './plot-frame.js';
import { markShape } from './shape.js';

const REVEAL = curveOf('reveal');
// 점이 나타나는 시각 비율을 줄이는 자릿수 배율(소수 셋째 자리)
const AT_PRECISION = 1000;

// cost: time O(STEPS), heap O(1), stack O(1)
// vars: STEPS = timeAt의 이분 탐색 횟수
// basis: estimate
// 선이 길이 비율 f에 닿는 시간 비율은 easing.reveal을 거꾸로 푼 timeAt(f)이다. 값은 자라는 시간 대비 비율이고 소수 셋째 자리로 줄인다. 재생기와 움직이는 SVG가 이 값에 자라는 시간을 곱해 쓴다.
const arrival = (fraction) => roundToScale(timeAt(REVEAL, fraction), AT_PRECISION);

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
function bandPath(run, id, { sx, sy, color, mark }) {
  const edge = (p, key) => `${r(sx.at(p.values.x))} ${r(sy.at(p.values[`${id}.${key}`]))}`;
  const d = [...run.map((p) => edge(p, 'high')), ...[...run].reverse().map((p) => edge(p, 'low'))].map((xy, k) => `${k ? 'L' : 'M'} ${xy}`).join(' ');
  return `<path d="${d} Z" fill="${color}" class="chart-band wipe"${mark}/>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선 차트에서 신뢰구간이 한 점뿐일 때 쓰는 세로 오차 막대. 점과 같은 시각 at에 나타난다. 경로는 구간 선과 양 끝 캡이고, 흰 바탕 위라서 보조 글자 색 가는 선으로 점보다 앞서지 않게 한다. yLow, yHigh는 화면 좌표다.
function pointInterval({ x, yLow, yHigh }, { at, mark }) {
  const d = `M ${r(x - CAP / 2)} ${r(yLow)} H ${r(x + CAP / 2)} M ${r(x)} ${r(yLow)} V ${r(yHigh)} M ${r(x - CAP / 2)} ${r(yHigh)} H ${r(x + CAP / 2)}`;
  return `<path d="${d}" class="chart-interval dot" data-at="${at}"${mark}/>`;
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 점 수
// basis: estimate
// 계열 i의 신뢰구간 조각들. 이어진 묶음은 띠, 하나뿐인 점은 세로 오차 막대다.
function intervalMarks(ctx, s, i) {
  const { chart, points, sx, sy, layers } = ctx;
  return intervalRuns(points, s.id).map((run, n) => {
    if (run.length > 1) return bandPath(run, s.id, { sx, sy, color: seriesColor(chart, i), mark: markAttrs(chart, markId(chart, i, `band${n}`)) });
    const p = run[0];
    const k = chart.rows.indexOf(p);
    return pointInterval({ x: sx.at(p.values.x), yLow: sy.at(p.values[`${s.id}.low`]), yHigh: sy.at(p.values[`${s.id}.high`]) }, { at: layers[i].ats.get(p) ?? 0, mark: markAttrs(chart, markId(chart, i, k, '.ci')) });
  });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 두 점 사이 계열 값(key가 value, low, high)을 x에서 보간한 값. 두 점 가운데 하나라도 값이 없으면 없다.
function valueBetween([a, b], key, { x, sx }) {
  const [va, vb] = [a.values[key], b.values[key]];
  if (!isValue(va) || !isValue(vb)) return undefined;
  const [xa, xb] = [sx.at(a.values.x), sx.at(b.values.x)];
  return va + ((vb - va) * (x - xa)) / (xb - xa || 1);
}

// cost: time O(s·w·p + p·s), heap O(s·w + p·s), stack O(1)
// vars: s = 계열 수, w = 그림 너비를 샘플 간격으로 나눈 수, p = 점 수
// basis: estimate
// 선, 띠, 점이 차지한 자리. 선과 띠는 가로로 샘플 간격(space.2)마다 선 값과 신뢰구간 값이 닿는 세로 구간을 모으고, 점은 반지름까지 모은다. 기준선 라벨이 피할 때 쓴다.
// 계단은 값이 다음 점까지 수평으로 이어지므로 구간마다 앞 점의 값 하나다. 값이 없는 점 둘레에는 모으지 않는다.
function occupiedRects(ctx) {
  const { chart, points, sx, sy, isStep } = ctx;
  const step = SPACE["1"];
  const rects = [];
  for (let k = 1; k < points.length; k++) {
    const pair = [points[k - 1], points[k]];
    for (let x = sx.at(pair[0].values.x); x < sx.at(pair[1].values.x); x += step) {
      for (const s of chart.series) {
        const keys = ['', '.low', '.high'].map((suffix) => `${s.id}${suffix}`);
        const ys = keys.map((key) => (isStep ? (isValue(pair[0].values[key]) && isValue(pair[1].values[s.id]) ? pair[0].values[key] : undefined) : valueBetween(pair, key, { x, sx }))).filter((v) => v !== undefined).map(sy.at);
        if (ys.length) rects.push({ x0: x, x1: x + step, y0: Math.min(...ys), y1: Math.max(...ys) });
      }
    }
  }
  for (const p of points) for (const s of chart.series) if (isValue(p.values[s.id])) rects.push({ x0: sx.at(p.values.x) - DOT, x1: sx.at(p.values.x) + DOT, y0: sy.at(p.values[s.id]) - DOT, y1: sy.at(p.values[s.id]) + DOT });
  return rects;
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 계열의 점 수
// basis: estimate
// 면적 차트는 x 순서의 값과 0 기준선으로 닫는다. 계열을 더하지 않고 같은 축 위에 겹쳐 비교한다.
function areaMark({ chart, points, sx, sy }, i) {
  const id = chart.series[i].id;
  const xy = points.map((p) => `${r(sx.at(p.values.x))} ${r(sy.at(p.values[id]))}`);
  const bottom = [points.at(-1), points[0]].map((p) => `${r(sx.at(p.values.x))} ${r(sy.at(0))}`);
  return `<g class="cs-${i}"><path d="M ${[...xy, ...bottom].join(' L ')} Z" fill="${seriesFill(chart, i)}" class="chart-area chart-band wipe"${markAttrs(chart, markId(chart, i, 'area'))}/></g>`;
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 점 수
// basis: estimate
// 계열 i의 이어진 묶음(화면 좌표), 경로, 닿는 시각. 점선과 끊긴 선은 x 위치로 닦아 내고, 이어진 실선은 길이로 그려 낸다.
function seriesLayer(ctx, i) {
  const { chart, points, sx, sy, isStep } = ctx;
  const id = chart.series[i].id;
  const runs = definedRuns(points, id).map((run) => run.map((p) => ({ p, x: sx.at(p.values.x), y: sy.at(p.values[id]) })));
  const lists = isStep ? runs.map(stepVertices) : runs;
  const isWipe = isReference(chart, i) || runs.length > 1;
  const fractions = isWipe ? spanFractions(lists) : lengthFractions(lists);
  const ats = new Map();
  runs.forEach((run, n) => run.forEach((v, k) => ats.set(v.p, arrival(fractions[n][isStep && k ? 2 * k : k]))));
  return { i, id, runs, d: isStep ? lists.map(hvPath).filter(Boolean).join(' ') : linePath(runs), isWipe, ats };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 계열 하나의 선 요소. 모든 계열이 같은 굵기의 같은 계열 테두리 색이고, 기대값은 점선이다. 실제값 선에는 점선 속성이 없다.
function lineMark(ctx, layer) {
  const { chart } = ctx;
  const { i, d, isWipe } = layer;
  if (!d) return '';
  const motion = `${isWipe ? 'wipe' : 'draw'}${isReference(chart, i) ? ' chart-dashed' : ''}`;
  const common = `d="${d}" fill="none"${isWipe ? '' : ' pathLength="1"'}`;
  return `<g class="cs-${i}"><path ${common} stroke="${seriesStroke(chart, i)}" stroke-width="${values["border-width"].strong}" class="${motion}"${markAttrs(chart, markId(chart, i, 'path'))}/></g>`;
}

// cost: time O(p·s), heap O(out), stack O(1)
// vars: p = 점 수, s = 계열 수, out = 만든 SVG 글자 수
// basis: estimate
// 행 k의 점들. 값이 없는 칸에는 점이 없다. 꼭짓점 모양은 계열의 범주 번호가 정하고 기대값은 속이 빈 모양이다.
function dotMarks(ctx) {
  const { chart, layers } = ctx;
  return chart.rows.flatMap((p, k) =>
    chart.series.flatMap((s, i) => {
      if (!layers[i].ats.has(p)) return [];
      const at = layers[i].ats.get(p);
      const id = markId(chart, i, k);
      const shape = markShape({ shape: seriesPaint(chart, i).shape, cx: ctx.sx.at(p.values.x), cy: ctx.sy.at(p.values[s.id]), radius: DOT, attrs: dotAttrs(chart, i, ` class="dot" data-at="${at}"${markAttrs(chart, id, { raw: p.values[s.id], paint: seriesPaint(chart, i) })}`) });
      return [`<g class="cr-${k}"><g class="cs-${i}">${shape}</g></g>`];
    }),
  );
}

// cost: time O(p·s), heap O(out), stack O(1)
// vars: p = 점 수, s = 계열 수, out = 만든 SVG 글자 수
// basis: estimate
// 계열마다 띠, 선, 그리고 점 순서의 SVG 조각
function seriesMarks(ctx) {
  const { chart } = ctx;
  const parts = ctx.area ? chart.series.map((_, i) => areaMark(ctx, i)) : [];
  chart.series.forEach((s, i) => {
    const bands = intervalMarks(ctx, s, i);
    if (bands.length) parts.push(`<g class="cs-${i}">${bands.join('')}</g>`);
  });
  parts.push(...ctx.layers.map((layer) => lineMark(ctx, layer)), ...dotMarks(ctx));
  return parts;
}

// cost: time O(s·n), heap O(s), stack O(1)
// vars: s = 계열 수, n = 이름 글자 수
// basis: estimate
// 끝 이름: 한 줄 열에 쌓고 계열의 마지막 정의 점에서 안내선을 긋는다. 값이 하나도 없는 계열은 끝 점이 없어 안내선이 숨는다.
function endLabels(ctx, boxes, { limits, x }) {
  const { figure, layers } = ctx;
  if (!boxes.length) return { svg: [], boxes: [] };
  const anchors = new Map(layers.filter((layer) => layer.runs.length).map((layer) => [layer.i, layer.runs.at(-1).at(-1)]));
  const placed = placeEndLabels(boxes, new Map([...anchors].map(([i, last]) => [i, last.y])), limits);
  return { svg: endLabelMarks(figure.chart, placed, anchors, { x }), boxes: placed };
}

// cost: time O(p·s·STEPS + t), heap O(out), stack O(1)
// vars: p = 점 수, s = 계열 수, STEPS = timeAt의 이분 탐색 횟수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
export function drawLine(figure, top) {
  const { chart } = figure;
  const points = [...chart.rows].sort((a, b) => a.values.x - b.values.x);
  const ys = points.flatMap((p) => chart.series.flatMap((s) => [p.values[s.id], p.values[`${s.id}.low`], p.values[`${s.id}.high`]])).filter(isValue);
  // 값이 하나도 없는 계열은 모든 프레임에서 비어 있다(묶은 값은 늘 숫자다). 그래서 이름 상자의 크기가 프레임마다 같다.
  const empty = new Set(chart.series.flatMap((s, i) => (points.some((p) => isValue(p.values[s.id])) ? [] : [i])));
  const boxes = hasEndLabels(figure) ? endLabelBoxes(chart, empty) : [];
  const { sx, sy, frame, bottom, right, top: plotTop, plotBottom } = plotFrame(figure, top, { xs: points.map((p) => p.values.x), ys, endRoom: endLabelRoom(figure, empty), minPlotH: boxes.length ? endLabelHeight(boxes) : 0 });
  const ctx = { figure, chart, points, sx, sy, isStep: figure.chartType === 'step', area: figure.chartType === 'area' };
  ctx.layers = chart.series.map((_, i) => seriesLayer(ctx, i));
  const column = endLabelX(right);
  const ends = endLabels(ctx, boxes, { limits: { top: plotTop, bottom: plotBottom }, x: column });
  const endRects = ends.boxes.map((box) => ({ x0: column, x1: column + box.width, y0: box.top, y1: box.top + box.height }));
  const isBlank = chart.series.every((_, i) => empty.has(i));
  const parts = [frame, ...seriesMarks(ctx), ...ends.svg, ...(isBlank ? [noDataNote({ sx, top: plotTop, plotBottom })] : [])];
  parts.push(drawRules(chart.rules, sy, { axis: 'y', from: sx.at(sx.ticks[0]), to: sx.at(sx.ticks.at(-1)), occupied: [...occupiedRects(ctx), ...endRects], labels: !chart.layout }));
  const dotAts = [...new Set(ctx.layers.flatMap((layer) => [...layer.ats.values()]))].sort((a, b) => a - b);
  return { svg: parts.join('\n'), bottom, rowKeys: chart.rows.map((p) => `x=${p.values.x}`), dotAts };
}
