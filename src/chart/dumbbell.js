// 덤벨 차트: 첫 계열 값(compare 빈 점)에서 둘째 계열 값(main 채운 점)으로 이은 한 줄과 오른쪽 바뀐 비율.
import { measure } from '../measure/fonts.js';
import { centerBaseline, roundCoord as r } from '../text.js';
import { finishRowChart, rowValueScale } from './axis.js';
import { inkGroup, labelText, valueText } from './labels.js';
import { DOT, ROW, SIZE, SPACE, TEXT, WIDTH, PAD, seriesColor } from './metrics.js';
import { formatChange, seriesFormats } from './scale.js';

const ARROW_MIN = SIZE.chart['arrow-min'];

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 계열 s의 신뢰구간 값(low, high). 없으면 빈 목록이다.
function boundsOf(row, s) {
  return [`${s.id}.low`, `${s.id}.high`].map((key) => row.values[key]).filter((v) => v !== undefined);
}

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 행 수
// basis: estimate
// 덤벨 행마다 오른쪽 끝에 닿는 요소. 값 글자는 두 점과 두 범위 바깥 끝 옆에 놓이고, 그 오른쪽에 바뀐 비율 글자가 오른쪽 끝에 붙는다. 값 글자와 비율 글자 사이는 한 칸 띄운다.
function dumbbellReach(chart, unit) {
  const [first, second] = chart.series;
  const [formatFirst, formatSecond] = seriesFormats(chart);
  return chart.rows.flatMap((row) => {
    const [before, after] = [row.values[first.id], row.values[second.id]];
    const change = formatChange(before, after);
    const isAfterRight = unit.at(after) >= unit.at(before);
    const rightText = measure((isAfterRight ? formatSecond(after) : formatFirst(before)), TEXT['11'], isAfterRight ? 'numSemibold' : 'num');
    const tail = SPACE['3'] + rightText + (change ? SPACE['6'] + measure(change, TEXT['13'], 'numSemibold') : 0);
    const bounds = [first, second].flatMap((s) => boundsOf(row, s));
    return [...[before, after].map((value) => ({ value, extra: DOT + tail })), ...bounds.map((value) => ({ value, extra: tail }))];
  });
}

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 행 수
// basis: estimate
// 값 축 범위와 길이
function dumbbellScale(chart) {
  const [first, second] = chart.series;
  const all = chart.rows.flatMap((row) => [first, second].flatMap((s) => [row.values[s.id], row.values[`${s.id}.low`], row.values[`${s.id}.high`]])).filter((v) => typeof v === 'number');
  const ruled = [...all, ...chart.rules.map((x) => x.value)];
  return rowValueScale(chart, { kind: chart.scale, min: Math.min(...ruled), max: Math.max(...ruled), reaches: (unit) => dumbbellReach(chart, unit) });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 계열 s의 신뢰구간 범위 막대기. 신뢰구간이 없으면 빈 글이다.
function rangeBar(ctx, row, i) {
  const { chart, scale, cy } = ctx;
  const [low, high] = [row.values[`${chart.series[i].id}.low`], row.values[`${chart.series[i].id}.high`]];
  return low === undefined ? '' : `<line x1="${r(scale.at(low))}" x2="${r(scale.at(high))}" y1="${r(cy)}" y2="${r(cy)}" stroke="${seriesColor(chart, i)}" stroke-width="${SIZE.chart.range}" class="chart-range pop"/>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 끝점과 연결 화살표. 끝점은 거리와 상관없이 main 색 채운 점 하나로 모든 행이 같다.
// 화살표는 두 점 가장자리(점 반지름과 한 칸 간격 밖) 사이가 ARROW_MIN 이상일 때만 그리고, 모자라면 화살표만 뺀다.
function endMark(ctx, [x1, x2]) {
  const { chart, cy } = ctx;
  const dir = x2 >= x1 ? 1 : -1;
  const edge = DOT + SPACE['1'];
  const dot = `<circle cx="${r(x2)}" cy="${r(cy)}" r="${DOT}" fill="${seriesColor(chart, 1)}" class="chart-after pop"/>`;
  if (Math.abs(x2 - x1) - 2 * edge < ARROW_MIN) return dot;
  return `<line x1="${r(x1 + dir * edge)}" y1="${r(cy)}" x2="${r(x2 - dir * edge)}" y2="${r(cy)}" pathLength="1" class="chart-arrow draw" marker-end="url(#fl-arrow-main)"/>${dot}`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 값 글자 자리: 두 점과 두 범위를 모두 덮는 구간의 바깥이다. 한 점의 범위가 다른 점의 글자 자리까지 뻗어도 겹치지 않게 하기 위해서다.
function valueTextEdges(ctx, row, [x1, x2]) {
  const { chart, scale } = ctx;
  const ends = chart.series.flatMap((s, i) => {
    const x = i ? x2 : x1;
    return [x - DOT, x + DOT, ...boundsOf(row, s).map(scale.at)];
  });
  return [Math.min(...ends) - SPACE['3'], Math.max(...ends) + SPACE['3']];
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 행 k의 SVG: 이름, 두 계열의 도형(범위, 점, 화살표), 두 계열의 글자(값, 바뀐 비율). 글자가 도형 위에 얹힌다.
function dumbbellRow(ctx, row, k) {
  const { chart, scale, cy, formats } = ctx;
  const [first, second] = chart.series;
  const [before, after] = [row.values[first.id], row.values[second.id]];
  const xs = [scale.at(before), scale.at(after)];
  const [left, right] = valueTextEdges(ctx, row, xs);
  const [firstX, secondX] = xs[0] < xs[1] ? [left, right] : [right, left];
  const side = (x) => (x === left ? 'end' : 'start');
  const ratio = `<text x="${WIDTH - PAD}" y="${r(centerBaseline(cy, TEXT['13']))}" class="chart-ratio late">${formatChange(before, after)}</text>`;
  const marks = `<g class="cr-${k}"><g class="cs-0">${rangeBar(ctx, row, 0)}<circle cx="${r(xs[0])}" cy="${r(cy)}" r="${DOT}" class="chart-before pop"/></g><g class="cs-1">${rangeBar(ctx, row, 1)}${endMark(ctx, xs)}</g></g>`;
  const texts = `<g class="cr-${k} ink"><g class="cs-0">${valueText({ x: firstX, cy }, formats[0](before), `chart-value first late ${side(firstX)}`)}</g><g class="cs-1">${valueText({ x: secondX, cy }, formats[1](after), `chart-value second late ${side(secondX)}`)}${ratio}</g></g>`;
  return inkGroup(k, labelText(row.label, cy, 'chart-label')) + marks + texts;
}

// cost: time O(r + t), heap O(out), stack O(1)
// vars: r = 행 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 신뢰구간은 점 뒤에 같은 줄로 깔리는 옅은 범위 막대기다. 값 글자는 두 범위의 바깥 끝 밖에 두어 막대기, 점, 화살표와 겹치지 않는다.
export function drawDumbbells(figure, top) {
  const { chart } = figure;
  const { scale } = dumbbellScale(chart);
  const formats = seriesFormats(chart);
  const parts = chart.rows.map((row, k) => dumbbellRow({ chart, scale, cy: top + k * ROW + ROW / 2, formats }, row, k));
  return finishRowChart(chart, { parts, scale, top, bottom: top + chart.rows.length * ROW });
}
