// 누적 막대와 퍼센트 누적 막대: 계열을 값 축 위에 이어 붙이고 구성값과 합계를 막대 아래에 둔다. 계열 수에 상한이 없다.
// 누적은 부호가 있다: 양수는 0에서 오른쪽으로, 음수는 0에서 왼쪽으로 각각 쌓고 값 축은 양쪽 합을 덮는다. 퍼센트는 행을 합으로 나눠 0~100에 고정한다.
// 행에 결측이 있거나(퍼센트는 합이 0이어도) 막대는 그리지 않고 칸의 표식은 길이 0으로 남긴다. 0%로 그리지 않는다.
// 조각은 계열 번호 키(`1`, `2`, ...)를 조각 안에 적고(글자 요소는 labels.js의 segmentKey), 안에 들어가지 않으면 아래 값 목록의 `1: 30`이 키를 잇는다.
import { measure } from '../measure/fonts.js';
import { centerBaseline, escapeXml, roundCoord as r } from '../text.js';
import { values } from '../vendor/theme/tokens.js';
import { drawRules, finishRowChart, rowValueScale } from './axis.js';
import { COPY, MISSING } from './copy.js';
import { isValue, percentRows, stackExtent, stackRows } from './data.js';
import { inkGroup, keyRoom, rowLabelLayout, rowName, segmentKey, valueText } from './labels.js';
import { markAttrs, markId } from './marks.js';
import { BAR, PAD, RIGHT, SPACE, TEXT, seriesFill, seriesOutline, seriesPaint } from './metrics.js';
import { patternRect } from './pattern.js';
import { SHARE_PLACES, valueFormat } from './scale.js';

// 조각 사이에 바탕이 드러나는 틈. 조각마다 이만큼 줄인다(경계선 굵기를 빼고도 틈이 남는다).
const GAP = SPACE["1"];

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 음수 부호를 글자 모양 −로
const signed = (text) => text.replace(/^-/, '−');

// cost: time O(r·s), heap O(r·s), stack O(1)
// vars: r = 행 수, s = 계열 수
// basis: estimate
// 값 목록의 조각 글. 조각 하나는 한 계열의 값이고(번호 키가 앞에 붙는다) 마지막에 합계 조각이 붙을 수 있다.
// 누적은 `1: 30`, `+ 2: 20 = 50`, 음수는 `− 2: 5`로 쓰고, 퍼센트는 `1: 42.1% (30)`, 행 끝에 `합계 71`을 쓴다. 반올림한 퍼센트의 합을 100으로 맞추지 않는다.
function pieceTexts(ctx, stack, parts) {
  const { chart, format, share, isPercent } = ctx;
  const last = parts.length - 1;
  const items = parts.map((part, i) => {
    const value = isValue(part.value) ? format(Math.abs(part.value)) : COPY.dash;
    if (isPercent) return { i, text: `${i + 1}: ${part.share === undefined ? value : `${share(part.share)}% (${value})`}`, raw: part.value };
    const sign = isValue(part.value) && part.value < 0 ? '−' : i ? '+' : '';
    const total = i === last && i > 0 && stack.state === 'ok' ? ` = ${signed(format(stack.total))}` : '';
    return { i, text: `${sign ? `${sign} ` : ''}${i + 1}: ${value}${total}`, raw: part.value };
  });
  const hasTotal = isPercent && stack.state !== 'missing';
  return hasTotal ? [...items, { i: last, text: `${COPY.total} ${format(stack.sum)}`, raw: stack.sum, total: true }] : items;
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 조각 수
// basis: estimate
// 조각 글을 줄에 흘려 놓는다. 조각은 쪼개지 않고, 한 줄에 다 들어가지 않으면 다음 줄로 넘긴다. dx, dy는 글 시작 자리에서 잰 거리다.
function flow(pieces, { room, lineHeight }) {
  let [dx, dy] = [0, 0];
  return pieces.map((piece) => {
    const width = measure(piece.text, TEXT['11'], piece.total ? 'numSemibold' : 'num');
    if (dx && dx + width > room) [dx, dy] = [0, dy + lineHeight];
    const at = { ...piece, dx, dy, width };
    dx += width + SPACE["1-5"];
    return at;
  });
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 계열 수
// basis: estimate
// 값 글자가 가질 수 있는 가장 넓은 모양의 행. 값에 묶인 차트는 프레임마다 글자 폭이 달라 줄 수가 달라질 수 있어, 값 범위 끝의 글자로 줄 수를 미리 잡아 카드가 프레임 사이에서 흔들리지 않게 한다.
function widestStack(ctx) {
  const { chart, format, isPercent } = ctx;
  if (!chart.extent) return undefined;
  const widest = [chart.extent.min, chart.extent.max].map(Math.abs).sort((a, b) => measure(format(b), TEXT['11'], 'num') - measure(format(a), TEXT['11'], 'num'))[0];
  const parts = chart.series.map((s) => ({ id: s.id, value: widest, share: isPercent ? 100 : undefined }));
  return { stack: { state: 'ok', total: widest * parts.length, sum: widest * parts.length }, parts };
}

// cost: time O(r·s), heap O(r·s), stack O(1)
// vars: r = 행 수, s = 계열 수
// basis: estimate
// 행마다 조각 글의 배치와, 모든 행 가운데 가장 많은 줄의 아래 끝(첫 줄 글자 가운데에서 잰 dy)
function summaryLayout(ctx, stacks) {
  const { chart } = ctx;
  const layout = { room: chart.layout ? chart.layout.width - PAD * 2 : RIGHT - ctx.scale.at(0), lineHeight: TEXT['11'] * values.leading.normal };
  const rows = stacks.map((stack) => flow(pieceTexts(ctx, stack, stack.parts), layout));
  const wide = widestStack(ctx);
  const reserve = wide ? flow(pieceTexts(ctx, wide.stack, wide.parts), layout) : [];
  return { rows, room: layout.room, depth: Math.max(...[...rows, reserve].map((row) => row.at(-1)?.dy ?? 0)) };
}

// cost: time O(r·s), heap O(r·s), stack O(1)
// vars: r = 행 수, s = 계열 수
// basis: estimate
// 값 축. 누적은 양쪽 합과 기준선을 덮고, 퍼센트는 0~100에 고정이다.
function stackScale(ctx, stacks) {
  const { chart, isPercent } = ctx;
  if (isPercent) return rowValueScale(chart, { kind: 'linear', min: 0, max: 100, reaches: () => [] });
  const extent = stackExtent(chart.rows, chart.series.map((s) => s.id));
  const ruled = chart.rules.map((rule) => rule.value);
  return rowValueScale(chart, { kind: 'linear', min: Math.min(extent.min, ...ruled), max: Math.max(extent.max, ...ruled), reaches: () => [] });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 조각 하나(계열 i, 행 k)의 사각형. 틈을 두려고 양쪽을 줄이되 조각이 틈보다 좁으면 그대로 둔다. 값이 없거나 0이면 길이 0이다.
function segmentBox(ctx, part, { y }) {
  const { scale } = ctx;
  const [x1, x2] = [scale.at(part.from), scale.at(part.to)];
  const width = Math.abs(x2 - x1);
  const inset = width > GAP * 2 ? GAP / 2 : 0;
  return { x: Math.min(x1, x2) + inset, y, w: Math.max(0, width - inset * 2), h: BAR, radius: 0 };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 조각 하나의 사각형, 무늬, 번호 키. 칸마다 늘 하나씩 있고 값이 없거나 0이면 길이 0이다. 번호 키는 조각 안에 들어갈 때만 보인다.
function segmentMarks(ctx, part, at) {
  const { chart } = ctx;
  const { i, k, box } = at;
  const paint = seriesPaint(chart, i);
  const id = markId(chart, i, k);
  const attrs = markAttrs(chart, id, { raw: part.value, paint });
  const rect = `<rect x="${r(box.x)}" y="${r(box.y)}" width="${r(box.w)}" height="${BAR}" fill="${seriesFill(chart, i)}" stroke="${seriesOutline(chart, i)}" stroke-width="${values["border-width"].tag}" class="stack-segment grow"${attrs}/>`;
  const overlay = patternRect(paint, box, markAttrs(chart, markId(chart, i, k, '.p')), 'chart-pattern grow');
  const key = String(i + 1);
  const text = segmentKey(chart, { key, x: box.x + box.w / 2, cy: box.y + BAR / 2, paint, fits: box.w >= keyRoom(key).w, id: markId(chart, i, k, '.k') });
  return `<g class="cr-${at.k}"><g class="cs-${i}">${rect}${overlay}${text}</g></g>`;
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
  return inkGroup(at.k, `<text x="${r(ctx.scale.at(0))}" y="${r(centerBaseline(at.y + BAR / 2, TEXT['11']))}" class="chart-missing"${hidden}${markAttrs(chart, markId(chart, 0, at.k, '.s'), { isText: true })}>${escapeXml(message)}</text>`);
}

// cost: time O(s), heap O(out), stack O(1)
// vars: s = 계열 수, out = SVG 글자 수
// basis: estimate
// 행 k: 이름, 조각들, 안내 글, 값 목록
function stackedRow(ctx, stack, k) {
  const { chart, scale, top, pitch, names, summary } = ctx;
  const start = top + k * pitch;
  const y = start + names.space;
  const parts = [inkGroup(k, rowName(chart.rows[k].label, { layout: names, k, top: start, cy: y + BAR / 2 }))];
  if (chart.layout) parts.push(drawRules(chart.rules, scale, { axis: 'x', from: y, to: y + BAR, labels: false }));
  stack.parts.forEach((part, i) => parts.push(segmentMarks(ctx, part, { i, k, box: segmentBox(ctx, part, { y }) })));
  parts.push(statusMark(ctx, stack, { k, y }));
  const pieces = summary.rows[k];
  const textX = chart.layout ? PAD : scale.at(0);
  const labels = pieces.map((piece) => inkGroup(k, valueText({ x: textX + piece.dx, cy: y + BAR + SPACE["1-5"] + TEXT['11'] / 2 + piece.dy }, piece.text, `chart-value late${piece.total ? ' ours' : ''}`, { chart, id: markId(chart, piece.i, k, piece.total ? '.total' : ''), raw: piece.raw, paint: seriesPaint(chart, piece.i) }), piece.i));
  const width = Math.max(...pieces.map((piece) => piece.dx + piece.width));
  return { parts, labels, fit: { text: chart.rows[k].label, width, room: summary.room, line: chart.rows[k].line, what: 'stack values' } };
}

// cost: time O(r·s + t), heap O(out), stack O(1)
// vars: r = 행 수, s = 계열 수, t = 눈금 수, out = SVG 글자 수
// basis: estimate
export function drawStacked(figure, top) {
  const { chart } = figure;
  const isPercent = figure.chartType === 'percent';
  const ids = chart.series.map((s) => s.id);
  const stacks = (isPercent ? percentRows(chart.rows, ids) : stackRows(chart.rows, ids));
  const finite = chart.rows.flatMap((row) => ids.map((id) => row.values[id])).filter(isValue);
  const sums = stacks.flatMap((stack) => (stack.state === 'missing' ? [] : [Math.abs(stack.total ?? stack.sum)]));
  const ctx = { chart, isPercent, top, format: valueFormat([...finite.map(Math.abs), ...sums], chart.decimals), share: valueFormat([], chart.decimals ?? SHARE_PLACES), names: rowLabelLayout(chart) };
  ctx.scale = stackScale(ctx, stacks).scale;
  ctx.summary = summaryLayout(ctx, stacks);
  ctx.pitch = ctx.names.space + BAR + ctx.summary.depth + TEXT['11'] + SPACE["5-5"];
  const rows = stacks.map((stack, k) => stackedRow(ctx, stack, k));
  const bottom = top + chart.rows.length * ctx.pitch - SPACE["3"];
  const zero = ctx.scale.ticks[0] < 0 ? `<line x1="${r(ctx.scale.at(0))}" x2="${r(ctx.scale.at(0))}" y1="${r(top)}" y2="${r(bottom)}" class="chart-zero"/>` : '';
  const plot = finishRowChart(chart, { parts: [zero, ...rows.flatMap((row) => row.parts)], over: rows.flatMap((row) => row.labels), scale: ctx.scale, top, bottom });
  plot.fits.push(...rows.map((row) => row.fit));
  return plot;
}
