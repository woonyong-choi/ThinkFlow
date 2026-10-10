// 증감 막대는 직전 누계에서 시작하고, 합계 막대는 0에서 현재 누계까지 그린다.
import { categoryPaint } from '../chart-palette.js';
import { measure, wrap } from '../measure/fonts.js';
import { escapeXml, roundCoord as r } from '../text.js';
import { tokens, values } from '../vendor/theme/tokens.js';
import { drawRules, finishRowChart, rowValueScale } from './axis.js';
import { COPY } from './copy.js';
import { inkGroup, rowLabelLayout, rowName, valueText } from './labels.js';
import { markAttrs, markId } from './marks.js';
import { BAR, PAD, ROW, SPACE, TEXT } from './metrics.js';
import { valueFormat } from './scale.js';
import { barRadius } from './shape.js';

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 행 수
// basis: estimate
// 알 수 없는 누계(null)는 숫자로 쓰지 않는다: 빠진 증감과 알 수 없는 합계는 `값 없음`, 누계를 모르는 뒤 증감은 증감 자신만(`+5`, `=`와 누계 없음)이다.
function rowTexts(chart) {
  const format = valueFormat(chart.ledger.flatMap((row) => [row.to, row.change ?? row.to]).filter((value) => value !== null), chart.decimals);
  const number = (value) => format(value).replace(/^-/, '−');
  return chart.ledger.map((row) => {
    if (row.total) return row.to === null ? COPY.noData : `= ${number(row.to)}`;
    if (row.change === null) return COPY.noData;
    const sign = row.change < 0 ? '−' : '+';
    return row.from === null ? `${sign}${number(Math.abs(row.change))}` : `${number(row.from)} ${sign} ${number(Math.abs(row.change))} = ${number(row.to)}`;
  });
}

// 장부 행의 알려진 끝점. 모두 모르면 빈 목록이다.
const knownEnds = (row) => [row.from, row.to].filter((value) => value !== null);

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 행 수
// basis: estimate
function waterfallScale(chart, texts) {
  const endpoints = chart.ledger.flatMap(knownEnds);
  const ruled = [...endpoints, ...chart.rules.map((rule) => rule.value)];
  const reaches = () => chart.layout ? [] : chart.ledger.map((row, i) => ({ value: Math.max(0, ...knownEnds(row)), extra: SPACE["1-5"] + measure(texts[i], TEXT['11'], row.total ? 'numSemibold' : 'num') }));
  return rowValueScale(chart, { kind: 'linear', min: Math.min(0, ...ruled), max: Math.max(0, ...ruled), reaches });
}

// cost: time O(r·(n² + q) + t), heap O(out), stack O(1)
// vars: r = 행 수, n = 이름과 계산식 글자 수, q = 기준선 수, t = 눈금 수, out = SVG 글자 수
// basis: estimate
export function drawWaterfall(figure, top) {
  const { chart } = figure;
  const texts = rowTexts(chart);
  const { scale } = waterfallScale(chart, texts);
  const names = rowLabelLayout(chart);
  const lines = chart.layout ? texts.map((text, i) => wrap(text, chart.layout.width - PAD * 2, { size: TEXT['11'], face: chart.ledger[i].total ? 'numSemibold' : 'num' })) : undefined;
  const lineHeight = TEXT['11'] * values.leading.normal;
  const pitch = chart.layout ? names.space + BAR + SPACE["1-5"] + Math.max(...lines.map((row) => row.length)) * lineHeight + SPACE["5-5"] : ROW;
  const bottom = top + chart.rows.length * pitch;
  // 0선: 넓은 배치는 전체 높이 한 줄이다. 좁은 배치는 이름과 계산식 줄의 글 가림 면이 행 사이를 덮어 눈금처럼 끊겨 보이므로 행마다 막대 높이 안에만 긋는다(기준선과 같다).
  const zeroLine = (y1, y2) => `<line x1="${r(scale.at(0))}" x2="${r(scale.at(0))}" y1="${r(y1)}" y2="${r(y2)}" class="chart-zero"/>`;
  const zero = chart.layout ? chart.rows.map((_, index) => zeroLine(top + index * pitch + names.space, top + index * pitch + names.space + BAR)).join('') : zeroLine(top, bottom);
  const rows = chart.rows.map((row, index) => waterfallRow(row, chart.ledger[index], { chart, names, top: top + index * pitch, pitch, scale, index, cy: top + index * pitch + (chart.layout ? names.space + BAR / 2 : ROW / 2), text: texts[index], lines: lines?.[index], lineHeight, next: chart.ledger[index + 1] }));
  const parts = chart.layout ? [zero, ...rows.map((row) => row.connector), ...rows.map((row) => row.mark)] : [zero, ...rows.map((row) => row.mark + row.connector)];
  return finishRowChart(chart, { parts, over: rows.map((row) => row.text), scale, top, bottom });
}

// cost: time O(n + q), heap O(out), stack O(1)
// vars: n = 이름과 계산식 글자 수, q = 기준선 수, out = SVG 글자 수
// basis: estimate
function waterfallRow(source, row, { chart, names, top, pitch, scale, index, cy, text, lines, lineHeight, next }) {
  // 끝점을 모르는 행(빠진 증감, 그 뒤 증감, 알 수 없는 합계)은 막대도 0 증감 표시도 연결선도 없다. 값 글자는 알려진 끝점의 바깥에 놓인다.
  const isKnown = row.to !== null;
  const [from, to] = isKnown ? [scale.at(row.from), scale.at(row.to)] : [scale.at(0), scale.at(0)];
  const reach = scale.at(Math.max(0, ...knownEnds(row)));
  const width = Math.abs(to - from);
  const face = { x: Math.min(from, to), y: cy - BAR / 2, w: width, h: BAR, radius: barRadius(width) };
  const decreasing = !row.total && row.change < 0;
  const color = decreasing ? tokens.color.data['compare-outline'] : tokens.color.data.main;
  // 갱신 효과 칠: 오르면 첫 범주 계열, 내리면 비교 색(면 compare-fill, 테두리 compare-outline)이다.
  const paint = decreasing ? { tint: tokens.color.data['compare-fill'], border: color, effect: color } : categoryPaint(0);
  const fill = decreasing ? tokens.color.data['compare-fill'] : paint.fill;
  const name = inkGroup(index, rowName(source.label, { layout: names, k: index, top, cy, className: `chart-label${row.total ? ' chart-waterfall-total' : ''}` }));
  // 칸마다 막대와 0 증감 표시가 둘 다 늘 있다. 변화가 없으면(길이 0) 막대는 그려지지 않고 표시만 굵기를 갖고, 있으면 반대다.
  const raw = row.total ? row.to : row.change;
  const rect = `<rect x="${r(face.x)}" y="${r(face.y)}" width="${r(face.w)}" height="${BAR}" rx="${face.radius}" fill="${fill}" stroke="${color}" stroke-width="${values["border-width"].tag}" class="chart-waterfall-bar"${markAttrs(chart, markId(chart, 0, index), { raw, paint })}/>`;
  const zero = `<line x1="${r(from)}" x2="${r(from)}" y1="${r(face.y)}" y2="${r(face.y + BAR)}" stroke="${color}" stroke-width="${face.w ? 0 : values["border-width"].tag}" class="chart-waterfall-zero"${markAttrs(chart, markId(chart, 0, index, '.z'), { raw, paint })}/>`;
  const ends = [['from', row.from], ['to', row.to]].filter(([, value]) => value !== null).map(([name, value]) => ` data-${name}="${value}"`).join('');
  const mark = `<g class="grow chart-waterfall-growth" style="transform-origin: ${to < from ? 'right' : 'left'} center"><g class="cr-${index}" role="img" aria-label="${escapeXml(`${source.label}: ${text}`)}"${ends}>${isKnown ? rect + zero : ''}</g></g>`;
  const connector = !next || !isKnown || next.to === null ? '' : `<line x1="${r(to)}" x2="${r(to)}" y1="${r(cy + BAR / 2)}" y2="${r(cy + pitch - BAR / 2)}" class="chart-rule chart-waterfall-connector"/>`;
  const className = `chart-value${row.total ? ' ours' : ''} late`;
  const textMark = (n) => ({ chart, id: markId(chart, 0, index, n ? `.${n}` : ''), raw, paint });
  const summary = lines ? lines.map((line, i) => valueText({ x: PAD, cy: cy + BAR / 2 + SPACE["1-5"] + TEXT['11'] / 2 + i * lineHeight }, line, className, textMark(i))).join('') : valueText({ x: reach + SPACE["1-5"], cy }, text, className, textMark(0));
  const masks = lines ? `<rect x="${PAD}" y="${r(top)}" width="${chart.layout.width - PAD * 2}" height="${r(names.space - SPACE["1-5"])}" class="chart-text-bg"/><rect x="${PAD}" y="${r(cy + BAR / 2 + SPACE["1-5"])}" width="${chart.layout.width - PAD * 2}" height="${r(lines.length * lineHeight)}" class="chart-text-bg"/>` : '';
  const guides = chart.layout ? drawRules(chart.rules, scale, { axis: 'x', from: face.y, to: face.y + BAR, labels: false }) : '';
  return { connector, mark: masks + name + mark + guides, text: inkGroup(index, summary) };
}
