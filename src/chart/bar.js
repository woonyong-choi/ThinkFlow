// 막대 차트: 행마다 계열 막대를 쌓고, 신뢰구간 막대기와 값 글자를 붙인다. 계열 수에 상한이 없다.
// 칸마다 막대(또는 값이 없다는 안내 글)가 늘 하나씩 있다. 값 0은 가장 짧은 막대와 값 글자 `0`이고, 결측은 막대 없이 안내 글이다.
// 막대는 테두리 없는 평평한 면이다. 신뢰구간은 막대 끝 위에 겹쳐 긋고 값 글자는 그 바로 뒤에 둔다.
// 기대값(reference) 계열은 슬롯을 차지하지 않고 행 막대 묶음을 가로지르는 세로 눈금이다. 색 수를 넘는 계열은 막대 위에 무늬가 덮인다.
import { measure } from '../measure/fonts.js';
import { renderRich, centerBaseline, roundCoord as r } from '../text.js';
import { values } from '@woonyong-choi/design-tokens/tokens.js';
import { drawRules, finishRowChart, rowValueScale } from './axis.js';
import { MISSING } from './copy.js';
import { valueRange } from './extent.js';
import { inkGroup, rowLabelLayout, rowName, valueText } from './labels.js';
import { tokens } from '@woonyong-choi/design-tokens/tokens.js';
import { markAttrs, markId } from './marks.js';
import { BAR, SPACE, TEXT, isReference, seriesFill, seriesPaint } from './metrics.js';
import { patternRect } from './pattern.js';
import { formatNumber, seriesFormats } from './scale.js';
import { barRadius } from './shape.js';
import { STEP, presentSlots, slotIndex, slotMiddle } from './slots.js';
import { hasRowRule } from '../source/chart-rules.js';

// 행 기준 표시가 행 막대 묶음 위아래로 나오는 길이
const RULE_OVERHANG = SPACE["1-5"];
// 행 기준 숫자 글자 기준선이 행 윗면에서 올라가는 높이
const RULE_LABEL_RISE = SPACE["2"];

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 행이 자기 기준을 적었으면 그 값, 없으면 undefined(행 줄의 `rule=값`)
const rowRuleOf = (chart, row) => (hasRowRule(chart, 'bar') ? row.values.rule : undefined);

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 행 수
// basis: estimate
// 행 기준 숫자 글자가 닿는 거리(기준선 오른쪽에서 시작한다)
function ruleReaches(chart) {
  return chart.rows.flatMap((row) => {
    const rule = rowRuleOf(chart, row);
    return rule === undefined ? [] : [{ value: rule, extra: SPACE["1"] + measure(formatNumber(rule), TEXT['11']) }];
  });
}

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
      return [{ value: Math.max(v, row.values[`${s.id}.high`] ?? 0), extra: SPACE["1-5"] + measure(formats[i](v), TEXT['11'], i === 0 ? 'numSemibold' : 'num') }];
    }),
  );
}

// cost: time O(r·s), heap O(r·s), stack O(1)
// vars: r = 행 수, s = 계열 수
// basis: estimate
// 값 축 범위와 길이. 값 글자가 가장 멀리 닿는 막대 끝에서 오른쪽 여백이 왼쪽 여백(PAD)과 같아지게 한다.
function barScale(chart) {
  const all = chart.rows.flatMap((row) => chart.series.flatMap((s) => [row.values[s.id], row.values[`${s.id}.high`]])).filter((v) => typeof v === 'number');
  const rowRules = chart.rows.map((row) => rowRuleOf(chart, row)).filter((v) => v !== undefined);
  const { max } = valueRange([...all, ...chart.rules.map((x) => x.value), ...rowRules]);
  return rowValueScale(chart, { kind: 'linear', min: 0, max, reaches: () => [...valueReaches(chart), ...ruleReaches(chart)] });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 값이 없는 계열 슬롯: 막대 없이 안내 글만 둔다.
function missingMark(chart, plotX, { k, i, cy }) {
  return inkGroup(k, `<text x="${r(plotX)}" y="${r(centerBaseline(cy, TEXT['11']))}" class="chart-missing">${renderRich(chart.missing ?? MISSING)}</text>`, i);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 신뢰구간은 막대 가운데 높이에서 막대 끝 위에 겹쳐 긋고, 양끝 수염은 막대 두께만큼이다. 막대 면과 바탕 어느 쪽에서도 읽히게 흐린 글자색이다.
function confidenceLine({ x1, x2, cy }, mark) {
  const at = `x1="${r(x1)}" x2="${r(x2)}" y1="${r(cy)}" y2="${r(cy)}"`;
  const cap = BAR / 2;
  const look = `stroke="${tokens.color['ui-muted']}" stroke-width="${values["border-width"].tag}" fill="none"`;
  return `<line ${at} ${look} class="late"${mark.line}/><path d="M${r(x1)} ${r(cy - cap)}v${cap * 2}M${r(x2)} ${r(cy - cap)}v${cap * 2}" ${look} class="late"${mark.caps}/>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 막대 면: 범주 색으로 채운 테두리 없는 면
function barFace(ctx, { i, k }, face) {
  const { chart } = ctx;
  const raw = ctx.row.values[chart.series[i].id];
  const attrs = markAttrs(chart, markId(chart, i, k), { raw, paint: seriesPaint(chart, i) });
  const rect = `<rect x="${r(face.x)}" y="${r(face.y)}" width="${r(face.w)}" height="${face.h}" rx="${face.radius}" fill="${seriesFill(chart, i)}" class="grow"${attrs}/>`;
  return rect + patternRect(seriesPaint(chart, i), face, markAttrs(chart, markId(chart, i, k, '.p')), 'chart-pattern grow');
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 값 글자 수
// basis: estimate
// 기대값 계열: 행 막대 묶음을 위아래로 조금 넘는 세로 눈금과 그 위 값 글자. 값이 없으면 자리만 두고 숨긴다.
function referenceTick(ctx, row, { k, i, y }) {
  const { chart, scale, plotX, formats } = ctx;
  const v = row.values[chart.series[i].id];
  const paint = seriesPaint(chart, i);
  const x = typeof v === 'number' ? scale.at(v) : plotX;
  const hidden = typeof v === 'number' ? '' : ' visibility="hidden"';
  const span = `x1="${r(x)}" x2="${r(x)}" y1="${r(y - RULE_OVERHANG)}" y2="${r(y + ctx.groupH + RULE_OVERHANG)}"`;
  const tick = `<line ${span} stroke="${paint.ink}" stroke-width="${values["border-width"].strong}" stroke-linecap="round" class="pop"${hidden}${markAttrs(chart, markId(chart, i, k), { raw: v, paint })}/>`;
  // 행 기준의 숫자 글자가 같은 줄 오른쪽에 있으면 겹치지 않게 눈금 왼쪽으로 적는다.
  const rule = rowRuleOf(chart, row);
  const label = typeof v === 'number' ? formats[i](v) : '';
  const ruleX = rule === undefined ? undefined : scale.at(rule);
  const isLeft = ruleX !== undefined && ruleX >= x && ruleX - x < measure(label, TEXT['11']) + SPACE["2"];
  const text = `<text x="${r(isLeft ? x - SPACE["1"] : x + SPACE["1"])}" y="${r(y - RULE_LABEL_RISE)}" class="chart-rule-label${isLeft ? ' end' : ''} late"${hidden}${markAttrs(chart, markId(chart, i, k, '.t'), { isText: true })}>${label}</text>`;
  return { mark: `<g class="cr-${k}"><g class="cs-${i}">${tick}</g></g>`, value: inkGroup(k, text, i) };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 계열 s 막대 하나의 막대와 신뢰구간 막대기 조각, 값 글자 조각 */
function barMark(ctx, row, at) {
  const { chart, scale, plotX, formats } = ctx;
  const { k, i, by } = at;
  if (isReference(chart, i)) return referenceTick(ctx, row, { k, i, y: at.y });
  const cy = by + BAR / 2;
  const s = chart.series[i];
  const v = row.values[s.id];
  if (v === null) return { mark: missingMark(chart, plotX, { k, i, cy }) };
  const end = scale.at(v);
  const [low, high] = [row.values[`${s.id}.low`], row.values[`${s.id}.high`]];
  const reach = high !== undefined ? scale.at(high) : end;
  const raw = `${low}~${high}`;
  const mark = { line: markAttrs(chart, markId(chart, i, k, '.ci'), { raw, paint: seriesPaint(chart, i) }), caps: markAttrs(chart, markId(chart, i, k, '.cc'), { raw, paint: seriesPaint(chart, i) }) };
  const ci = high !== undefined ? confidenceLine({ x1: scale.at(low), x2: reach, cy }, mark) : '';
  const width = Math.max(SPACE["0-5"], end - plotX);
  const face = { x: plotX, y: by, w: width, h: BAR, radius: barRadius(width) };
  const text = valueText({ x: Math.max(end, reach) + SPACE["1-5"], cy }, formats[i](v), `chart-value${i === 0 ? ' ours' : ''} late`, { chart, id: markId(chart, i, k), raw: v, paint: seriesPaint(chart, i) });
  return { mark: `<g class="cr-${k}"><g class="cs-${i}">${barFace({ ...ctx, row }, { i, k }, face)}${ci}</g></g>`, value: inkGroup(k, text, i) };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 행 기준: 그 행 막대 묶음에만 걸치는 점선과 위쪽 숫자 글자. 다른 행에는 그려지지 않아 행마다 다른 기준이 섞이지 않는다. 점선은 행 묶음(cr-k)에 속해 밝히지 않은 행에서 함께 흐려진다.
// 막대 위에 얹히므로 바탕색 테두리(casing)를 먼저 깔아 막대 색과 점선이 갈리게 한다.
function rowRuleMarks(ctx, row, at) {
  const { chart, scale } = ctx;
  const { k, y, height } = at;
  const rule = rowRuleOf(chart, row);
  if (rule === undefined) return [];
  const x = scale.at(rule);
  const span = `x1="${r(x)}" x2="${r(x)}" y1="${r(y - RULE_OVERHANG)}" y2="${r(y + height + RULE_OVERHANG)}"`;
  const line = `<g class="cr-${k}"><line ${span} class="chart-rule-casing"/><line ${span} class="chart-rule"/></g>`;
  return [line, inkGroup(k, `<text x="${r(x + SPACE["1"])}" y="${r(y - RULE_LABEL_RISE)}" class="chart-rule-label">${formatNumber(rule)}</text>`)];
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 계열 수
// basis: estimate
// 행 k: 이름, 계열 막대들. 이름은 값이 있는 막대 묶음의 세로 가운데에 둔다. 값이 없는 계열 슬롯(비교 없음 글)은 묶음에 넣지 않아 이름이 막대와 나란하다.
// 계열을 하나씩 드러내도 이름 자리는 고정한다.
function barRow(ctx, row, k) {
  const { chart, top } = ctx;
  const start = top + k * ctx.pitch;
  const y = start + ctx.labels.space;
  const middle = BAR / 2 + slotMiddle(presentSlots(row, chart.series), STEP);
  const label = inkGroup(k, rowName(row.label, { layout: ctx.labels, k, top: start, cy: y + middle, className: 'chart-label' }));
  const bars = chart.series.map((_, i) => barMark(ctx, row, { k, i, y, by: y + (ctx.slots[i] ?? 0) * STEP }));
  const rule = rowRuleMarks(ctx, row, { k, y, height: ctx.groupH });
  const guides = chart.layout ? drawRules(chart.rules, ctx.scale, { axis: 'x', from: y, to: y + ctx.groupH, labels: false }) : '';
  return { marks: [label, ...bars.map((b) => b.mark), ...rule, guides], values: bars.flatMap((b) => (b.value ? [b.value] : [])) };
}

// cost: time O(r·s + t), heap O(out), stack O(1)
// vars: r = 행 수, s = 계열 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 값 글자는 기준선에 걸려도 비키지 않고 막대 끝 옆에 둔다. 기준선보다 위에 그려 글자 뒤의 바탕 면이 점선을 가리므로 막대, 기준선, 값 글자 순으로 쌓는다.
export function drawBars(figure, top) {
  const { chart } = figure;
  const { scale, plotX } = barScale(chart);
  const slots = slotIndex(chart.series);
  const count = Math.max(1, ...slots.filter((x) => x !== undefined).map((x) => x + 1));
  const groupH = (count - 1) * STEP + BAR;
  const labels = rowLabelLayout(chart);
  // 기대값 눈금의 값 글자가 행 위로 올라오므로 행 사이에 그만큼 띄운다.
  const hasReference = slots.includes(undefined);
  const gap = hasReference ? SPACE["6"] : SPACE["4"];
  const ctx = { chart, scale, plotX, top: top + (hasReference ? SPACE["3"] : 0), groupH, slots, labels, pitch: labels.space + groupH + gap, formats: seriesFormats(chart) };
  const rows = chart.rows.map((row, k) => barRow(ctx, row, k));
  const bottom = ctx.top + chart.rows.length * ctx.pitch - gap;
  return finishRowChart(chart, { parts: rows.flatMap((x) => x.marks), over: rows.flatMap((x) => x.values), scale, top, bottom });
}
