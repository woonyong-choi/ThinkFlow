// 상자 차트: 최소-최대 수염(양끝 눈금), q1-q3 상자(주 계열의 옅은 면), 가운데 값 선(주 계열의 굵은 선)과 그 값 글자
import { measure } from '../measure/fonts.js';
import { VALUES } from '../source/grammar.js';
import { escapeXml, roundCoord as r } from '../text.js';
import { values } from '@woonyong-choi/design-tokens/tokens.js';
import { drawRules, finishRowChart, rowValueScale } from './axis.js';
import { COPY } from './copy.js';
import { valueRange } from './extent.js';
import { inkGroup, rowLabelLayout, rowName, valueText } from './labels.js';
import { BAR, ROW, SPACE, TEXT } from './metrics.js';
import { categoryPaint } from '../chart-palette.js';
import { tokens } from '@woonyong-choi/design-tokens/tokens.js';
import { valueFormat } from './scale.js';

const BOX_KEYS = VALUES.chartType.items.box.valueKeys;
const BOX_NAMES = { min: '최솟값', q1: '제1사분위', median: '중앙값', q3: '제3사분위', max: '최댓값' };

// 상자 높이(막대 두께의 두 배)와 q1과 q3가 같을 때도 보이는 최소 너비
const BOX_H = BAR * 2;
const BOX_MIN_W = SPACE["0-25"];
// 중앙값 글자는 상자 위 한 줄에 중앙선 바로 오른쪽에서 시작한다. 글자 줄이 상자 위에 차지하는 높이와 중앙선에서 띄운 거리다.
const LABEL_RISE = TEXT['11'] + SPACE["1"];
const LABEL_SHIFT = SPACE["1"];
// 값 글자 앞에 붙여 무엇의 값인지 알리는 글. 글자가 수염 끝 옆에 있어 최댓값으로 읽히기 때문이다.
export const MEDIAN_LABEL = '중앙값';

// 다섯 값이 모두 있어야 상자 그림 모양을 그린다. 하나라도 빠진 행은 모양 없이 적힌 숫자만 보인다(빠진 값을 0이나 이웃 값으로 채우지 않는다).
const isComplete = (row) => BOX_KEYS.every((key) => typeof row.values[key] === 'number');
const presentOf = (row) => BOX_KEYS.map((key) => row.values[key]).filter((value) => typeof value === 'number');
// 값 글자가 놓이는 기준 위치: 적힌 값 가운데 가장 큰 값(수염 끝). 적힌 값이 없으면 undefined다.
const tipOf = (row) => (presentOf(row).length ? Math.max(...presentOf(row)) : undefined);

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 행 수
// basis: estimate
// 값 글자. 다섯 값이 있는 행은 "중앙 230"처럼 중앙값임을 붙이고, 빠진 값이 있는 행은 다섯 값을 순서대로(최솟값부터 최댓값까지) 적고 빠진 자리는 `−`다. 숫자는 모든 행이 같은 소수 자릿수다.
function medianTexts(chart) {
  const format = valueFormat(chart.rows.flatMap(presentOf), chart.decimals);
  return chart.rows.map((row) => (isComplete(row) ? `${MEDIAN_LABEL} ${format(row.values.median)}` : BOX_KEYS.map((key) => (typeof row.values[key] === 'number' ? format(row.values[key]) : COPY.dash)).join(' · ')));
}

// cost: time O(r), heap O(1), stack O(1)
// vars: r = 행 수
// basis: estimate
// 값 축 범위와 길이. 가운데 값 글자가 수염 끝 옆에 놓이므로 그 폭만큼 오른쪽을 남긴다. 값이 하나도 없으면 valueRange의 대체 범위다(어떤 표식에도 값을 주지 않는다).
function boxScale(chart) {
  const ruled = [...chart.rows.flatMap(presentOf), ...chart.rules.map((x) => x.value)];
  const texts = medianTexts(chart);
  const { min, max } = valueRange(ruled, chart.scale);
  // 다섯 값이 있는 행의 값 글자는 중앙선 위에서 오른쪽으로, 빠진 값이 있는 행은 수염 끝 옆에 놓인다.
  const reaches = () => chart.rows.flatMap((row, k) => {
    const extra = measure(texts[k], TEXT['11'], 'num');
    if (isComplete(row)) return [{ value: row.values.median, extra: LABEL_SHIFT + extra }];
    return chart.layout ? [] : [{ value: tipOf(row) ?? min, extra: SPACE["1-5"] + extra }];
  });
  return rowValueScale(chart, { kind: chart.scale, min, max, reaches });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 행 k의 SVG: 수염, 상자, 가운데 값 선, 그리고 이름과 가운데 값 글자
function boxRow(ctx, row, k) {
  const { chart, scale, cy, text, labels, top, format } = ctx;
  const v = row.values;
  const name = rowName(row.label, { layout: labels, k, top, cy });
  const tip = tipOf(row);
  const besideTip = chart.layout ? { x: scale.start, cy: cy + BAR + SPACE["3"] } : { x: (tip === undefined ? scale.start : scale.at(tip)) + SPACE["1-5"], cy };
  const value = isComplete(row) ? { x: scale.at(v.median) + LABEL_SHIFT, cy: cy - BAR - LABEL_RISE / 2 } : besideTip;
  const texts = inkGroup(k, name + valueText(value, text, 'chart-value late'));
  const guides = chart.layout ? drawRules(chart.rules, scale, { axis: 'x', from: cy - BAR, to: cy + BAR, labels: false }) : '';
  if (!isComplete(row)) {
    // 모양이 없는 행도 읽을 수 있게 적힌 값과 빠진 값을 이름 붙여 알린다.
    const label = BOX_KEYS.map((key) => `${BOX_NAMES[key]} ${typeof v[key] === 'number' ? format(v[key]) : COPY.dash}`).join(', ');
    return `<g class="cr-${k}" role="img" aria-label="${escapeXml(`${row.label}: ${label}`)}"></g>${guides}${texts}`;
  }
  const [a, q1, m, q3, b] = [v.min, v.q1, v.median, v.q3, v.max].map(scale.at);
  const paint = categoryPaint(0);
  const whisker = `stroke="${tokens.color['ui-muted']}" stroke-width="${values["border-width"].thin}"`;
  const cap = BAR / 2;
  return (
    `<g class="cr-${k} pop"><line x1="${r(a)}" x2="${r(b)}" y1="${r(cy)}" y2="${r(cy)}" ${whisker}/>` +
    `<path d="M${r(a)} ${r(cy - cap)}v${cap * 2}M${r(b)} ${r(cy - cap)}v${cap * 2}" fill="none" ${whisker}/>` +
    `<rect x="${r(q1)}" y="${r(cy - BAR)}" width="${r(Math.max(BOX_MIN_W, q3 - q1))}" height="${BOX_H}" rx="${values.radius.sm}" fill="${paint.tint}" stroke="${paint.fill}" stroke-width="${values["border-width"].thin}"/>` +
    `<line x1="${r(m)}" x2="${r(m)}" y1="${r(cy - BAR)}" y2="${r(cy + BAR)}" stroke="${paint.border}" stroke-width="${values["border-width"].strong}"/></g>` +
    guides + texts
  );
}

// cost: time O(r + t), heap O(out), stack O(1)
// vars: r = 행 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
export function drawBoxes(figure, top) {
  const { chart } = figure;
  const format = valueFormat(chart.rows.flatMap(presentOf), chart.decimals);
  const { scale } = boxScale(chart);
  const texts = medianTexts(chart);
  const labels = rowLabelLayout(chart);
  const pitch = chart.layout ? labels.space + LABEL_RISE + BOX_H + SPACE["3"] + TEXT['11'] + SPACE["5-5"] : ROW + LABEL_RISE;
  const parts = chart.rows.map((row, k) => boxRow({ chart, scale, labels, format, top: top + k * pitch, cy: top + k * pitch + (chart.layout ? labels.space + LABEL_RISE + BAR : LABEL_RISE + ROW / 2), text: texts[k] }, row, k));
  return finishRowChart(chart, { parts, scale, top, bottom: top + chart.rows.length * pitch });
}
