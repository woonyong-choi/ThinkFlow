// 차이 차트: 행마다 차이 값 점 하나와 신뢰구간 가로선. 0이 기준이라 음수와 모두 0인 값도 그린다.
// 길이로 값을 보이는 막대와 달리 위치로 보이므로 0 시작 제약이 없고, 0 자리에 세로선을 긋는다.
import { measure } from '../measure/fonts.js';
import { roundCoord as r } from '../text.js';
import { values } from '../tokens.js';
import { finishRowChart, rowValueScale } from './axis.js';
import { inkGroup, labelText, valueText } from './labels.js';
import { CAP, DOT, ROW, SPACE, TEXT, seriesColor } from './metrics.js';
import { valueFormat } from './scale.js';

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
    const text = format(value);
    if (value > 0) return `+${text}`;
    return value < 0 ? `−${text.slice(1)}` : text;
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
  const reaches = () => chart.rows.map((row) => ({ value: Math.max(row.values[id], row.values[`${id}.high`] ?? row.values[id]), extra: DOT + SPACE['3'] + measure(format(row.values[id]), TEXT['11'], 'numSemibold') }));
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
  return `<path d="M ${r(x1)} ${r(cy)} H ${r(x2)} ${cap(x1)} ${cap(x2)}" fill="none" stroke="${seriesColor(chart, 0)}" stroke-width="${values.border.strong}" class="grow"/>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 행 k의 SVG: 이름, 신뢰구간과 점(계열 0), 값 글자. 값 글자는 점과 구간 끝 가운데 더 오른쪽 옆에 둔다.
function differenceRow(ctx, row, k) {
  const { chart, scale, cy, format } = ctx;
  const id = chart.series[0].id;
  const [value, high] = [row.values[id], row.values[`${id}.high`]];
  const dotX = scale.at(value);
  const textX = Math.max(dotX + DOT, high === undefined ? -Infinity : scale.at(high)) + SPACE['3'];
  const dot = `<circle cx="${r(dotX)}" cy="${r(cy)}" r="${DOT}" fill="${seriesColor(chart, 0)}" class="chart-after pop"/>`;
  const marks = `<g class="cr-${k}"><g class="cs-0">${intervalMark(ctx, row)}${dot}</g></g>`;
  return inkGroup(k, labelText(row.label, cy, 'chart-label')) + marks + inkGroup(k, valueText({ x: textX, cy }, format(value), 'chart-value ours late'), 0);
}

// cost: time O(r + t), heap O(out), stack O(1)
// vars: r = 행 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
export function drawDifferences(figure, top) {
  const { chart } = figure;
  const format = signedFormat(chart);
  const { scale } = differenceScale(chart, format);
  const bottom = top + chart.rows.length * ROW;
  const zero = `<line x1="${r(scale.at(0))}" x2="${r(scale.at(0))}" y1="${r(top - SPACE['3'])}" y2="${r(bottom + SPACE['4'])}" class="chart-zero"/>`;
  const rows = chart.rows.map((row, k) => differenceRow({ chart, scale, cy: top + k * ROW + ROW / 2, format }, row, k));
  return finishRowChart(chart, { parts: [zero, ...rows], scale, top, bottom });
}
