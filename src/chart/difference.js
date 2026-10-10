// 차이 차트: 행마다 차이 값 점 하나와 신뢰구간 가로선. 0이 기준이라 음수와 모두 0인 값도 그린다.
// 길이로 값을 보이는 막대와 달리 위치로 보이므로 0 시작 제약이 없고, 0 자리에 세로선을 긋는다.
import { measure } from '../measure/fonts.js';
import { roundCoord as r } from '../text.js';
import { values } from '../vendor/theme/tokens.js';
import { drawRules, finishRowChart, rowValueScale } from './axis.js';
import { inkGroup, rowLabelLayout, rowName, valueText } from './labels.js';
import { dotAttrs } from './legend.js';
import { markAttrs, markId } from './marks.js';
import { CAP, DOT, ROW, SPACE, TEXT, seriesPaint, seriesStroke } from './metrics.js';
import { valueFormat } from './scale.js';
import { markShape } from './shape.js';

// 모두 0일 때 0이 가운데에 오도록 잡는 값 축 범위의 한쪽 길이
const FLAT_SPAN = 1;
// 값이 0의 한쪽에만 있을 때 반대쪽에 더하는 여백(값 범위 대비). 0이 축 끝에 붙지 않고 눈금 한 칸 이상 안쪽에 서게 한다.
const ZERO_MARGIN = 0.15;

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 행 수
// basis: estimate
// 값 글자를 만드는 함수. 양수는 +, 음수는 −를 붙여 부호가 눈에 띄게 하고 0은 부호가 없다. 소수 자릿수는 모든 행이 같다.
function signedFormat(chart) {
  const id = chart.series[0].id;
  const format = valueFormat(chart.rows.map((row) => row.values[id]), chart.decimals);
  return (value) => {
    if (value > 0) return `+${format(value)}`;
    return value < 0 ? `−${format(-value)}` : format(value);
  };
}

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 행 수
// basis: estimate
// 값 축 범위와 길이. 값 글자가 가장 멀리 닿는 요소(점이나 구간 끝) 옆에 놓이므로 그 폭만큼 오른쪽을 남긴다.
function differenceScale(chart, format) {
  const id = chart.series[0].id;
  const all = chart.rows.flatMap((row) => [row.values[id], row.values[`${id}.low`], row.values[`${id}.high`]]).filter((v) => v !== undefined);
  const ruled = [...all, ...chart.rules.map((x) => x.value)];
  const [low, high] = [Math.min(0, ...ruled), Math.max(0, ...ruled)];
  const margin = (high - low) * ZERO_MARGIN;
  const [min, max] = high === low ? [-FLAT_SPAN, FLAT_SPAN] : [low === 0 ? -margin : low, high === 0 ? margin : high];
  // 값 글자는 max(점 오른쪽 끝, 구간 끝) 뒤에 놓인다(differenceRow). 그 최댓값은 점과 구간 끝 가운데 하나라, 닿는 거리를 둘로 나누어 각각 잰다: 점은 반지름만큼 더 나가고 구간 끝은 나가지 않는다.
  const reaches = () => chart.rows.flatMap((row) => {
    const text = SPACE["1-5"] + measure(format(row.values[id]), TEXT['11'], 'numSemibold');
    const high = row.values[`${id}.high`];
    return chart.layout ? [{ value: Math.max(row.values[id], high ?? row.values[id]), extra: DOT }] : [{ value: row.values[id], extra: DOT + text }, ...(high === undefined ? [] : [{ value: high, extra: text }])];
  });
  return rowValueScale(chart, { kind: 'linear', min, max, reaches });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 신뢰구간: low와 high 사이 가로선과 양 끝 캡. 점 뒤에 깔리고 점은 바탕색 테두리로 선 위에서 갈린다.
function intervalMark(ctx, row) {
  const { chart, scale, cy } = ctx;
  const id = chart.series[0].id;
  const [low, high] = [row.values[`${id}.low`], row.values[`${id}.high`]];
  if (high === undefined) return '';
  const [x1, x2] = [scale.at(low), scale.at(high)];
  const cap = (x) => `M ${r(x)} ${r(cy - CAP / 2)} V ${r(cy + CAP / 2)}`;
  const d = `M ${r(x1)} ${r(cy)} H ${r(x2)} ${cap(x1)} ${cap(x2)}`;
  const raw = `${row.values[`${id}.low`]}~${row.values[`${id}.high`]}`;
  return `<path d="${d}" fill="none" stroke="${seriesStroke(chart, 0)}" stroke-width="${values["border-width"].strong}" class="grow"${markAttrs(chart, markId(chart, 0, ctx.k, '.i'), { raw, paint: seriesPaint(chart, 0) })}/>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 행 k의 SVG: 이름, 신뢰구간과 점(계열 0), 값 글자. 값 글자는 점과 구간 끝 가운데 더 오른쪽 옆에 둔다.
function differenceRow(ctx, row, k) {
  const { chart, scale, cy, format, labels, top } = ctx;
  const id = chart.series[0].id;
  const [value, high] = [row.values[id], row.values[`${id}.high`]];
  const dotX = scale.at(value);
  const textX = Math.max(dotX + DOT, high === undefined ? -Infinity : scale.at(high)) + SPACE["1-5"];
  const dot = markShape({ shape: seriesPaint(chart, 0).shape, cx: dotX, cy, radius: DOT, attrs: dotAttrs(chart, 0, ` class="chart-after pop"${markAttrs(chart, markId(chart, 0, k), { raw: value, paint: seriesPaint(chart, 0) })}`) });
  const marks = `<g class="cr-${k}"><g class="cs-0">${intervalMark({ ...ctx, k }, row)}${dot}</g></g>`;
  const name = rowName(row.label, { layout: labels, k, top, cy });
  const at = chart.layout ? { x: scale.start, cy: cy + DOT + SPACE["3"] } : { x: textX, cy };
  const guides = chart.layout ? drawRules(chart.rules, scale, { axis: 'x', from: cy - DOT, to: cy + DOT, labels: false }) + zeroLine(scale, cy - SPACE["3"], cy + SPACE["3"]) : '';
  return inkGroup(k, name) + guides + marks + inkGroup(k, valueText(at, format(value), 'chart-value ours late', { chart, id: markId(chart, 0, k), raw: value, paint: seriesPaint(chart, 0) }), 0);
}

// cost: time O(r + t), heap O(out), stack O(1)
// vars: r = 행 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
export function drawDifferences(figure, top) {
  const { chart } = figure;
  const format = signedFormat(chart);
  const { scale } = differenceScale(chart, format);
  const labels = rowLabelLayout(chart);
  const pitch = labels.space + ROW + (chart.layout ? SPACE["3"] : 0);
  const bottom = top + chart.rows.length * pitch;
  const zero = chart.layout ? '' : zeroLine(scale, top - SPACE["1-5"], bottom + SPACE["2"]);
  const rows = chart.rows.map((row, k) => differenceRow({ chart, scale, labels, top: top + k * pitch, cy: top + k * pitch + (chart.layout ? labels.space + DOT : ROW / 2), format }, row, k));
  return finishRowChart(chart, { parts: [zero, ...rows], scale, top, bottom });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 영점 기준은 모바일에서 도형 줄에만 걸쳐 이름과 값 글자를 가르지 않는다.
function zeroLine(scale, top, bottom) {
  return `<line x1="${r(scale.at(0))}" x2="${r(scale.at(0))}" y1="${r(top)}" y2="${r(bottom)}" class="chart-zero"/>`;
}
