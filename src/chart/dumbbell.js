// 덤벨 차트: 첫 계열 값(compare 노란 점)에서 둘째 계열 값(main 채운 점)으로 이은 한 줄과 오른쪽 바뀐 비율.
import { CHART_ARROW, headReach, roleArrow } from '../draw/arrow.js';
import { measure, wrap } from '../measure/fonts.js';
import { centerBaseline, roundCoord as r } from '../text.js';
import { drawRules, finishRowChart, rowValueScale } from './axis.js';
import { inkGroup, rowLabelLayout, rowName, valueText } from './labels.js';
import { dotAttrs } from './legend.js';
import { markAttrs, markId } from './marks.js';
import { DOT, ROW, SIZE, SPACE, TEXT, WIDTH, PAD, seriesPaint, seriesStroke } from './metrics.js';
import { markShape } from './shape.js';
import { formatChange, seriesFormats } from './scale.js';
import { values } from '../vendor/theme/tokens.js';

const ARROW_MIN = SIZE.chart['arrow-min'];
const ARROW = roleArrow(CHART_ARROW.dumbbell);

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
    const tail = SPACE["1-5"] + rightText + (change ? SPACE["3"] + measure(change, TEXT['13'], 'numSemibold') : 0);
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
  return rowValueScale(chart, { kind: chart.scale, min: Math.min(...ruled), max: Math.max(...ruled), reaches: (unit) => chart.layout ? all.map((value) => ({ value, extra: DOT })) : dumbbellReach(chart, unit) });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 계열 s의 신뢰구간 범위 막대기. 신뢰구간이 없으면 빈 글이다.
function rangeBar(ctx, row, i) {
  const { chart, scale, cy } = ctx;
  const [low, high] = [row.values[`${chart.series[i].id}.low`], row.values[`${chart.series[i].id}.high`]];
  if (low === undefined) return '';
  const at = `x1="${r(scale.at(low))}" x2="${r(scale.at(high))}" y1="${r(cy)}" y2="${r(cy)}"`;
  const raw = `${low}~${high}`;
  return `<line ${at} stroke="${seriesStroke(chart, i)}" stroke-width="${SIZE.chart.range}" class="chart-range pop"${markAttrs(chart, markId(chart, i, ctx.k, '.rb'), { raw, paint: seriesPaint(chart, i) })}/>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 끝점과 연결 화살표. 끝점은 거리와 상관없이 main 색 채운 점 하나로 모든 행이 같다.
// 화살표는 두 점 가장자리(점 반지름과 한 칸 간격 밖) 사이가 ARROW_MIN 이상일 때만 보이고, 모자라면 화살표만 숨긴다. 칸은 늘 있어 값이 바뀌어도 그림 구조가 같다.
function endMark(ctx, [x1, x2], { k, raw }) {
  const { chart, cy } = ctx;
  const dir = x2 >= x1 ? 1 : -1;
  const edge = DOT + SPACE["0-5"];
  const dot = markShape({ shape: seriesPaint(chart, 1).shape, cx: x2, cy, radius: DOT, attrs: dotAttrs(chart, 1, ` class="chart-after pop"${markAttrs(chart, markId(chart, 1, k), { raw, paint: seriesPaint(chart, 1) })}`) });
  const hidden = Math.abs(x2 - x1) - 2 * edge < ARROW_MIN ? ' visibility="hidden"' : '';
  return `<line x1="${r(x1 + dir * edge)}" y1="${r(cy)}" x2="${r(x2 - dir * (edge + headReach(values["border-width"].strong).cap))}" y2="${r(cy)}" class="chart-arrow ${ARROW.cls} pop"${ARROW.end}${hidden}${markAttrs(chart, markId(chart, 1, k, '.a'), { raw, paint: seriesPaint(chart, 1) })}/>${dot}`;
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
  return [Math.min(...ends) - SPACE["1-5"], Math.max(...ends) + SPACE["1-5"]];
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 행 k의 SVG: 이름, 두 계열의 도형(범위, 점, 화살표), 두 계열의 글자(값, 바뀐 비율). 글자가 도형 위에 얹힌다.
function dumbbellRow(ctx, row, k) {
  const { chart, scale, cy, formats, names, top } = ctx;
  const [first, second] = chart.series;
  const [before, after] = [row.values[first.id], row.values[second.id]];
  const xs = [scale.at(before), scale.at(after)];
  const [left, right] = valueTextEdges(ctx, row, xs);
  const [firstX, secondX] = xs[0] < xs[1] ? [left, right] : [right, left];
  const side = (x) => (x === left ? 'end' : 'start');
  const ratio = `<text x="${WIDTH - PAD}" y="${r(centerBaseline(cy, TEXT['13']))}" class="chart-ratio late"${markAttrs(chart, markId(chart, 1, k, '.r'), { raw: after, isText: true, paint: seriesPaint(chart, 1) })}>${formatChange(before, after)}</text>`;
  const beforeDot = markShape({ shape: seriesPaint(chart, 0).shape, cx: xs[0], cy, radius: DOT, attrs: dotAttrs(chart, 0, ` class="pop"${markAttrs(chart, markId(chart, 0, k), { raw: before, paint: seriesPaint(chart, 0) })}`) });
  const marks = `<g class="cr-${k}"><g class="cs-0">${rangeBar({ ...ctx, k }, row, 0)}${beforeDot}</g><g class="cs-1">${rangeBar({ ...ctx, k }, row, 1)}${endMark(ctx, xs, { k, raw: after })}</g></g>`;
  const texts = `<g class="cr-${k} ink"><g class="cs-0">${valueText({ x: firstX, cy }, formats[0](before), `chart-value first late ${side(firstX)}`, { chart, id: markId(chart, 0, k), raw: before, paint: seriesPaint(chart, 0) })}</g><g class="cs-1">${valueText({ x: secondX, cy }, formats[1](after), `chart-value second late ${side(secondX)}`, { chart, id: markId(chart, 1, k), raw: after, paint: seriesPaint(chart, 1) })}${ratio}</g></g>`;
  const name = inkGroup(k, rowName(row.label, { layout: names, k, top, cy }));
  const guides = chart.layout ? drawRules(chart.rules, scale, { axis: 'x', from: cy - DOT, to: cy + DOT, labels: false }) : '';
  return name + guides + marks + (chart.layout ? compactTexts(ctx, row, k) : texts);
}

// cost: time O(r + t), heap O(out), stack O(1)
// vars: r = 행 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 신뢰구간은 점 뒤에 같은 줄로 깔리는 옅은 범위 막대기다. 값 글자는 두 범위의 바깥 끝 밖에 두어 막대기, 점, 화살표와 겹치지 않는다.
export function drawDumbbells(figure, top) {
  const { chart } = figure;
  const { scale } = dumbbellScale(chart);
  const formats = seriesFormats(chart);
  const names = rowLabelLayout(chart);
  const summaries = chart.layout ? compactSummaries(chart, formats) : undefined;
  const summaryH = summaries ? Math.max(...summaries.map((lines) => lines.at(-1).dy)) + TEXT['13'] : 0;
  const pitch = chart.layout ? names.space + DOT * 2 + SPACE["3"] + summaryH + SPACE["5-5"] : ROW;
  const parts = chart.rows.map((row, k) => dumbbellRow({ chart, scale, names, summaries, top: top + k * pitch, cy: top + k * pitch + (chart.layout ? names.space + DOT : ROW / 2), formats }, row, k));
  return finishRowChart(chart, { parts, scale, top, bottom: top + chart.rows.length * pitch });
}

// cost: time O(r·s·n²), heap O(r·s·n), stack O(1)
// vars: r = 행 수, s = 계열 수, n = 계열 이름과 값의 글자 수
// basis: estimate
// 값의 계열 이름을 함께 적고 변화율 자리를 남긴다. 긴 이름은 도형 아래에서 줄바꿈한다.
function compactSummaries(chart, formats) {
  const room = chart.layout.width - PAD * 2;
  return chart.rows.map((row) => {
    const change = formatChange(...chart.series.map((s) => row.values[s.id]));
    let dy = 0;
    return chart.series.flatMap((s, i) => {
      const reserve = i && change ? measure(change, TEXT['13'], 'numSemibold') + SPACE["3"] : 0;
      return wrap(`${s.label} ${formats[i](row.values[s.id])}`, room - reserve, { size: TEXT['11'], face: i ? 'numSemibold' : 'num' }).map((text) => {
        const line = { i, text, dy };
        dy += TEXT['11'] * values.leading.normal;
        return line;
      });
    });
  });
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 값 글자 수
// basis: estimate
function compactTexts(ctx, row, k) {
  const { chart, cy, summaries } = ctx;
  const lines = summaries[k];
  const top = cy + DOT + SPACE["3"];
  const parts = lines.map((line, n) => inkGroup(k, valueText({ x: PAD, cy: top + line.dy }, line.text, `chart-value ${line.i ? 'second' : 'first'} late`, { chart, id: markId(chart, line.i, k, `.c${n}`), raw: row.values[chart.series[line.i].id], paint: seriesPaint(chart, line.i) }), line.i));
  const ratio = formatChange(...chart.series.map((s) => row.values[s.id]));
  parts.push(inkGroup(k, `<text x="${chart.layout.width - PAD}" y="${r(centerBaseline(top + lines.at(-1).dy, TEXT['13']))}" class="chart-ratio late"${markAttrs(chart, markId(chart, 1, k, '.r'), { raw: row.values[chart.series[1].id], isText: true, paint: seriesPaint(chart, 1) })}>${ratio}</text>`, 1));
  return parts.join('');
}
