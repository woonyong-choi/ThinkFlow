// 누적 막대와 퍼센트 누적 막대: 계열을 값 축 위에 이어 붙이고, 조각 값은 조각 안에, 행 합계는 막대 끝 옆에 적는다. 계열 수에 상한이 없다.
// 누적은 부호가 있다: 양수는 0에서 오른쪽으로, 음수는 0에서 왼쪽으로 각각 쌓고 값 축은 양쪽 합을 덮는다. 퍼센트는 행을 합으로 나눠 0~100에 고정한다.
// 행에 결측이 있거나(퍼센트는 합이 0이어도) 막대는 그리지 않고 칸의 표식은 길이 0으로 남긴다. 0%로 그리지 않는다.
// 조각 값 글자는 조각 안에 들어갈 때만 보인다. 작은 계열은 기타 하나의 중립색으로 묶어(other.js) 범례에도 기타 하나만 둔다.
import { measure } from '../measure/fonts.js';
import { centerBaseline, escapeXml, roundCoord as r } from '../text.js';
import { drawRules, finishRowChart, rowValueScale } from './axis.js';
import { COPY, MISSING } from './copy.js';
import { isValue, percentRows, stackExtent, stackRows } from './data.js';
import { inkGroup, insideText, rowLabelLayout, rowName, valueText } from './labels.js';
import { markAttrs, markId } from './marks.js';
import { SIZE, SPACE, TEXT, seriesPaint } from './metrics.js';
import { groupedSeries, memberPaint, stackOrder } from './other.js';
import { patternRect } from './pattern.js';
import { SHARE_PLACES, valueFormat } from './scale.js';

// 조각 사이에 바탕이 드러나는 틈. 조각마다 이만큼 줄인다.
const GAP = SPACE["0-5"];
// 막대 두께. 조각 안 값 글자(11)가 위아래 여백을 두고 들어가는 높이다.
const BAND = SIZE.chart.bar * 2;
// 막대 끝에서 합계 글자까지
const TOTAL_GAP = SPACE["1-5"];

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 음수 부호를 글자 모양 −로
const signed = (text) => text.replace(/^-/, '−');

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 조각 안 값 글: 퍼센트는 몫, 누적은 크기(부호는 0의 어느 쪽인지가 이미 말한다)
function pieceText(ctx, part) {
  if (!isValue(part.value)) return COPY.dash;
  return ctx.isPercent ? (part.share === undefined ? '' : `${ctx.share(part.share)}%`) : ctx.format(Math.abs(part.value));
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 행 합계 글: 퍼센트는 `합계 84`(건수), 누적은 부호를 붙인 순합이다. 막대가 없는 행은 빈 글이다.
function totalText(ctx, stack) {
  if (stack.state !== 'ok') return '';
  return ctx.isPercent ? `${COPY.total} ${ctx.format(stack.sum)}` : signed(ctx.format(stack.total));
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 합계 글자가 붙는 막대 끝 값(퍼센트는 100, 누적은 양수 끝. 양수가 없으면 0)
const totalAt = (ctx, stack) => (ctx.isPercent ? 100 : Math.max(0, stack.positive ?? 0));

// cost: time O(r·s), heap O(r·s), stack O(1)
// vars: r = 행 수, s = 계열 수
// basis: estimate
// 값 축. 누적은 양쪽 합과 기준선을 덮고, 퍼센트는 0~100에 고정이다. 합계 글자가 막대 끝 옆에 놓이므로 그 폭만큼 오른쪽을 남긴다.
function stackScale(ctx, stacks) {
  const { chart, isPercent } = ctx;
  const reaches = () => stacks.map((stack) => ({ value: totalAt(ctx, stack), extra: TOTAL_GAP + measure(totalText(ctx, stack), TEXT['11'], 'numSemibold') }));
  if (isPercent) return rowValueScale(chart, { kind: 'linear', min: 0, max: 100, reaches });
  const extent = stackExtent(chart.rows, chart.series.map((s) => s.id));
  const ruled = chart.rules.map((rule) => rule.value);
  return rowValueScale(chart, { kind: 'linear', min: Math.min(extent.min, ...ruled), max: Math.max(extent.max, ...ruled), reaches });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 조각 하나(계열 i, 행 k)의 사각형. 틈을 두려고 양쪽을 줄이되 조각이 틈보다 좁으면 그대로 둔다. 값이 없거나 0이면 길이 0이다.
function segmentBox(ctx, part, { y }) {
  const { scale } = ctx;
  const [x1, x2] = [scale.at(part.from), scale.at(part.to)];
  const width = Math.abs(x2 - x1);
  const inset = width > GAP * 2 ? GAP / 2 : 0;
  return { x: Math.min(x1, x2) + inset, y, w: Math.max(0, width - inset * 2), h: BAND, radius: 0 };
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 값 글자 수
// basis: estimate
// 조각 하나의 사각형, 무늬, 조각 안 값 글자. 칸마다 늘 하나씩 있고 값이 없거나 0이면 길이 0이다. 기타로 묶인 계열은 중립색이고 값 글자를 적지 않는다.
function segmentMarks(ctx, part, at) {
  const { chart } = ctx;
  const { i, k, box } = at;
  const isGrouped = ctx.grouped.has(i);
  const paint = memberPaint(i, ctx.grouped, (j) => seriesPaint(chart, j));
  const attrs = markAttrs(chart, markId(chart, i, k), { raw: part.value, paint });
  const rect = `<rect x="${r(box.x)}" y="${r(box.y)}" width="${r(box.w)}" height="${BAND}" fill="${paint.fill}" class="stack-segment grow"${attrs}/>`;
  const overlay = patternRect(paint, box, markAttrs(chart, markId(chart, i, k, '.p')), 'chart-pattern grow');
  const text = pieceText(ctx, part);
  const fits = !isGrouped && part.value !== 0 && text !== '' && box.w >= measure(text, TEXT['11'], 'numSemibold') + SPACE["1"] * 2;
  const label = insideText(chart, { text, x: box.x + box.w / 2, cy: box.y + BAND / 2, paint, fits, id: markId(chart, i, k, '.k') });
  return `<g class="cr-${at.k}"><g class="cs-${i}">${rect}${overlay}${label}</g></g>`;
}

// cost: time O(s), heap O(out), stack O(1)
// vars: s = 계열 수, out = SVG 글자 수
// basis: estimate
// 결측이나 합 0이라 막대가 없는 행의 안내 글. 칸 자리는 늘 있고 막대가 없을 때만 보인다.
function statusMark(ctx, stack, at) {
  const { chart, isPercent } = ctx;
  const hasMissing = chart.series.some((s) => chart.rows[at.k].values[s.id] === null);
  if (!hasMissing && !isPercent) return '';
  const message = hasMissing ? chart.missing ?? MISSING : COPY.zeroSum;
  const hidden = stack.state === 'ok' ? ' visibility="hidden"' : '';
  return inkGroup(at.k, `<text x="${r(ctx.scale.at(0))}" y="${r(centerBaseline(at.y + BAND / 2, TEXT['11']))}" class="chart-missing"${hidden}${markAttrs(chart, markId(chart, 0, at.k, '.s'), { isText: true })}>${escapeXml(message)}</text>`);
}

// cost: time O(s), heap O(out), stack O(1)
// vars: s = 계열 수, out = SVG 글자 수
// basis: estimate
// 행 k: 이름, 조각들, 안내 글, 합계. 합계는 마지막 계열 묶음에 있어 모든 계열이 드러난 뒤 나타난다.
function stackedRow(ctx, stack, k) {
  const { chart, scale, top, pitch, names } = ctx;
  const start = top + k * pitch;
  const y = start + names.space;
  const parts = [inkGroup(k, rowName(chart.rows[k].label, { layout: names, k, top: start, cy: y + BAND / 2 }))];
  if (chart.layout) parts.push(drawRules(chart.rules, scale, { axis: 'x', from: y, to: y + BAND, labels: false }));
  stack.parts.forEach((part, i) => parts.push(segmentMarks(ctx, part, { i, k, box: segmentBox(ctx, part, { y }) })));
  parts.push(statusMark(ctx, stack, { k, y }));
  const last = chart.series.length - 1;
  const total = totalText(ctx, stack);
  const label = valueText({ x: scale.at(totalAt(ctx, stack)) + TOTAL_GAP, cy: y + BAND / 2 }, total, 'chart-value ours late', { chart, id: markId(chart, last, k, '.total'), raw: stack.state === 'ok' ? stack.sum ?? stack.total : null, paint: seriesPaint(chart, last) });
  return { parts, labels: [inkGroup(k, total ? label : '', last)] };
}

// cost: time O(r·s + t), heap O(out), stack O(1)
// vars: r = 행 수, s = 계열 수, t = 눈금 수, out = SVG 글자 수
// basis: estimate
export function drawStacked(figure, top) {
  const { chart } = figure;
  const isPercent = figure.chartType === 'percent';
  const ids = chart.series.map((s) => s.id);
  const grouped = groupedSeries(chart, figure.chartType);
  // 기타로 묶인 계열은 막대 끝 쪽에 이어 쌓고, 조각 목록은 다시 계열 순서로 돌려 칸 번호가 계열 번호와 같게 한다.
  const order = stackOrder(ids.length, grouped).map((i) => ids[i]);
  const stacks = (isPercent ? percentRows(chart.rows, order) : stackRows(chart.rows, order)).map((stack) => ({ ...stack, parts: ids.map((id) => stack.parts.find((part) => part.id === id)) }));
  const finite = chart.rows.flatMap((row) => ids.map((id) => row.values[id])).filter(isValue);
  const sums = stacks.flatMap((stack) => (stack.state === 'missing' ? [] : [Math.abs(stack.total ?? stack.sum)]));
  const ctx = { chart, isPercent, top, grouped, format: valueFormat([...finite.map(Math.abs), ...sums], chart.decimals), share: valueFormat([], chart.decimals ?? SHARE_PLACES), names: rowLabelLayout(chart) };
  ctx.scale = stackScale(ctx, stacks).scale;
  ctx.pitch = ctx.names.space + BAND + SPACE["4"];
  const rows = stacks.map((stack, k) => stackedRow(ctx, stack, k));
  const bottom = top + chart.rows.length * ctx.pitch - SPACE["4"];
  const zero = ctx.scale.ticks[0] < 0 ? `<line x1="${r(ctx.scale.at(0))}" x2="${r(ctx.scale.at(0))}" y1="${r(top - SPACE["1"])}" y2="${r(bottom + SPACE["1"])}" class="chart-zero"/>` : '';
  return finishRowChart(chart, { parts: [zero, ...rows.flatMap((row) => row.parts)], over: rows.flatMap((row) => row.labels), scale: ctx.scale, top, bottom });
}

