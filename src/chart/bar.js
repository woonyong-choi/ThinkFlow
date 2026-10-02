// 막대 차트: 행마다 계열 막대를 쌓고, 신뢰구간 막대기와 값 글자를 붙인다.
import { measure } from '../measure/fonts.js';
import { renderRich, centerBaseline, roundCoord as r } from '../text.js';
import { values } from '../tokens.js';
import { finishRowChart, rowValueScale } from './axis.js';
import { inkGroup, labelText, valueText } from './labels.js';
import { BAR, SPACE, TEXT, seriesColor } from './metrics.js';
import { valueFormat } from './scale.js';
import { presentSlots, slotMiddle } from './slots.js';

// cost: time O(r·s), heap O(r·s), stack O(1)
// vars: r = 행 수, s = 계열 수
// basis: estimate
// 값 글자가 가장 멀리 닿는 막대 끝(신뢰구간 high가 있으면 그 끝)과 값 글자 폭
function valueReaches(chart) {
  const formats = seriesFormats(chart);
  return chart.rows.flatMap((row) =>
    chart.series.flatMap((s, i) => {
      const v = row.values[s.id];
      if (typeof v !== 'number') return [];
      return [{ value: Math.max(v, row.values[`${s.id}.high`] ?? 0), extra: SPACE['3'] + measure(formats[i](v), TEXT['11'], i === 0 ? 'numSemibold' : 'num') }];
    }),
  );
}

// cost: time O(r·s), heap O(s), stack O(1)
// vars: r = 행 수, s = 계열 수
// basis: estimate
// 계열마다 값 글자 만드는 함수. 계열 안은 같은 소수 자릿수다.
function seriesFormats(chart) {
  return chart.series.map((s) => valueFormat(chart.rows.map((row) => row.values[s.id]).filter((v) => typeof v === 'number'), chart.decimals));
}

// cost: time O(r·s), heap O(1), stack O(1)
// vars: r = 행 수, s = 계열 수
// basis: estimate
// 값 축 범위와 길이. 값 글자가 가장 멀리 닿는 막대 끝에서 오른쪽 여백이 왼쪽 여백(PAD)과 같아지게 한다.
function barScale(chart) {
  const all = chart.rows.flatMap((row) => chart.series.flatMap((s) => [row.values[s.id], row.values[`${s.id}.high`]])).filter((v) => typeof v === 'number');
  const max = Math.max(...all, ...chart.rules.map((x) => x.value));
  return rowValueScale(chart, { kind: 'linear', min: 0, max, reaches: () => valueReaches(chart) });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 값이 없는 계열 슬롯: 막대 없이 안내 글만 둔다.
function missingMark(chart, plotX, { k, i, cy }) {
  return inkGroup(k, `<text x="${r(plotX)}" y="${r(centerBaseline(cy, TEXT['11']))}" class="chart-missing">${renderRich(chart.missing ?? '비교 없음')}</text>`, i);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 신뢰구간 선. 막대 위에 얹히므로 바탕색 테두리(casing)를 먼저 깔아 막대 색과 선이 갈리게 한다.
function confidenceLine({ x1, x2, cy }) {
  const at = `x1="${r(x1)}" x2="${r(x2)}" y1="${r(cy)}" y2="${r(cy)}"`;
  return `<line ${at} class="chart-ci-casing late"/><line ${at} class="chart-ci late"/>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 계열 s 막대 하나의 막대와 신뢰구간 막대기 조각, 값 글자 조각 */
function barMark(ctx, row, at) {
  const { chart, scale, plotX, formats } = ctx;
  const { k, i, by } = at;
  const cy = by + BAR / 2;
  const s = chart.series[i];
  const v = row.values[s.id];
  if (v === null) return { mark: missingMark(chart, plotX, { k, i, cy }) };
  const end = scale.at(v);
  const [low, high] = [row.values[`${s.id}.low`], row.values[`${s.id}.high`]];
  const reach = high !== undefined ? scale.at(high) : end;
  const ci = high !== undefined ? confidenceLine({ x1: scale.at(low), x2: reach, cy }) : '';
  const rect = `<rect x="${r(plotX)}" y="${r(by)}" width="${r(Math.max(SPACE['1'], end - plotX))}" height="${BAR}" rx="${values.radius.sm}" fill="${seriesColor(chart, i)}" class="grow"/>`;
  const text = valueText({ x: Math.max(end, reach) + SPACE['3'], cy }, formats[i](v), `chart-value${i === 0 ? ' ours' : ''} late`);
  return { mark: `<g class="cr-${k}"><g class="cs-${i}">${rect}${ci}</g></g>`, value: inkGroup(k, text, i) };
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 계열 수
// basis: estimate
// 행 k: 이름, 계열 막대들. 이름은 값이 있는 막대 묶음의 세로 가운데에 둔다. 값이 없는 계열 슬롯(비교 없음 글)은 묶음에 넣지 않아 이름이 막대와 나란하다.
// 계열을 하나씩 드러내는 동안은 시간표의 labelShifts만큼 옮겨 보이는 막대에 맞춘다(timeline.js).
function barRow(ctx, row, k) {
  const { chart, top } = ctx;
  const y = top + k * ctx.pitch;
  const middle = BAR / 2 + slotMiddle(presentSlots(row, chart.series));
  const label = inkGroup(k, labelText(row.label, y + middle, 'chart-label shift'));
  const bars = chart.series.map((_, i) => barMark(ctx, row, { k, i, by: y + i * (BAR + SPACE['2']) }));
  return { marks: [label, ...bars.map((b) => b.mark)], values: bars.flatMap((b) => (b.value ? [b.value] : [])) };
}

// cost: time O(r·s + t), heap O(out), stack O(1)
// vars: r = 행 수, s = 계열 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 값 글자는 기준선에 걸려도 비키지 않고 막대 끝 옆에 둔다. 기준선보다 위에 그려 글자의 바탕색 테두리(halo)가 점선을 가리므로 막대, 기준선, 값 글자 순으로 쌓는다.
export function drawBars(figure, top) {
  const { chart } = figure;
  const { scale, plotX } = barScale(chart);
  const groupH = chart.series.length * BAR + (chart.series.length - 1) * SPACE['2'];
  const ctx = { chart, scale, plotX, top, pitch: groupH + SPACE['11'], formats: seriesFormats(chart) };
  const rows = chart.rows.map((row, k) => barRow(ctx, row, k));
  const bottom = top + chart.rows.length * ctx.pitch - SPACE['11'];
  return finishRowChart(chart, { parts: rows.flatMap((x) => x.marks), over: rows.flatMap((x) => x.values), scale, top, bottom });
}
