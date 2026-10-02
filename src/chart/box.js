// 상자 차트: 최소-최대 수염, q1-q3 상자, 가운데 값 선
import { measure } from '../measure/fonts.js';
import { roundCoord as r } from '../text.js';
import { values } from '../tokens.js';
import { finishRowChart, rowValueScale } from './axis.js';
import { inkGroup, labelText, valueText } from './labels.js';
import { BAR, ROW, SPACE, TEXT } from './metrics.js';
import { valueFormat } from './scale.js';

// 상자 높이(막대 두께의 두 배)와 q1과 q3가 같을 때도 보이는 최소 너비
const BOX_H = BAR * 2;
const BOX_MIN_W = SPACE['0-5'];
// 값 글자 앞에 붙여 무엇의 값인지 알리는 글. 글자가 수염 끝 옆에 있어 최댓값으로 읽히기 때문이다.
export const MEDIAN_LABEL = '중앙';

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 행 수
// basis: estimate
// 값 글자. "중앙 230"처럼 중앙값임을 붙이고, 숫자는 모든 행이 같은 소수 자릿수다.
function medianTexts(chart) {
  const format = valueFormat(chart.rows.map((row) => row.values.median), chart.decimals);
  return chart.rows.map((row) => `${MEDIAN_LABEL} ${format(row.values.median)}`);
}

// cost: time O(r), heap O(1), stack O(1)
// vars: r = 행 수
// basis: estimate
// 값 축 범위와 길이. 가운데 값 글자가 수염 끝 옆에 놓이므로 그 폭만큼 오른쪽을 남긴다.
function boxScale(chart) {
  const all = chart.rows.flatMap((row) => [row.values.min, row.values.max]);
  const ruled = [...all, ...chart.rules.map((x) => x.value)];
  const texts = medianTexts(chart);
  const reaches = () => chart.rows.map((row, k) => ({ value: row.values.max, extra: SPACE['3'] + measure(texts[k], TEXT['11'], 'num') }));
  return rowValueScale(chart, { kind: chart.scale, min: Math.min(...ruled), max: Math.max(...ruled), reaches });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 행 k의 SVG: 수염, 상자, 가운데 값 선, 그리고 이름과 가운데 값 글자
function boxRow(ctx, row, k) {
  const { scale, cy, text } = ctx;
  const v = row.values;
  const [a, q1, m, q3, b] = [v.min, v.q1, v.median, v.q3, v.max].map(scale.at);
  const texts = inkGroup(k, labelText(row.label, cy, 'chart-label') + valueText({ x: b + SPACE['3'], cy }, text, 'chart-value late'));
  return (
    `<g class="cr-${k}"><line x1="${r(a)}" x2="${r(b)}" y1="${r(cy)}" y2="${r(cy)}" class="chart-whisker"/>` +
    `<rect x="${r(q1)}" y="${r(cy - BAR)}" width="${r(Math.max(BOX_MIN_W, q3 - q1))}" height="${BOX_H}" rx="${values.radius.sm}" class="chart-box grow"/>` +
    `<line x1="${r(m)}" x2="${r(m)}" y1="${r(cy - BAR)}" y2="${r(cy + BAR)}" class="chart-median"/></g>` +
    texts
  );
}

// cost: time O(r + t), heap O(out), stack O(1)
// vars: r = 행 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
export function drawBoxes(figure, top) {
  const { chart } = figure;
  const { scale } = boxScale(chart);
  const texts = medianTexts(chart);
  const parts = chart.rows.map((row, k) => boxRow({ scale, cy: top + k * ROW + ROW / 2, text: texts[k] }, row, k));
  return finishRowChart(chart, { parts, scale, top, bottom: top + chart.rows.length * ROW });
}
