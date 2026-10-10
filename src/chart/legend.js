// 계열 범례. 막대, 누적, 퍼센트, 선, 계단, 누적분포, 산점도 모두 한 가지 범례 칸(legendSwatch)과 한 가지 줄 배치를 쓴다.
// 막대 종류는 속이 차거나 빈 칸(무늬 포함), 선 종류는 짧은 선분(점선 포함)과 모양 표식, 점 종류는 모양 표식이다.
// 막대 종류와 산점도의 둘 이상의 계열은 `1 이름`처럼 번호 키를 달아 색 없이도 조각과 점 이름에 이어 읽게 한다(번호는 계열 목록 순서다. 원본 해석이 main을 앞에 세우고 나머지는 선언 순서를 지킨다).
import { measure, wrap } from '../measure/fonts.js';
import { renderRich, roundCoord as r } from '../text.js';
import { values } from '../vendor/theme/tokens.js';
import { COPY } from './copy.js';
import { ecdfGroups } from './data.js';
import { BAR, DOT, PAD, SPACE, TEXT, WIDTH, isReference, seriesBoundary, seriesColor, seriesPaint, seriesStroke } from './metrics.js';
import { patternRect } from './pattern.js';
import { markShape } from './shape.js';

// 차트 종류가 범례 칸에 쓰는 모양
const KINDS = { bar: 'fill', stacked: 'fill', percent: 'fill', area: 'fill', line: 'line', step: 'line', ecdf: 'line', scatter: 'dot', dumbbell: 'dot', difference: 'dot' };
// 번호 키를 다는 차트 종류
const KEYED = new Set(['bar', 'stacked', 'percent', 'scatter']);

/** 번호 키를 다는 차트인가: 막대 종류나 산점도이고 계열이 둘 이상이다. */
export const isKeyed = (figure) => KEYED.has(figure.chartType) && figure.chart.series.length >= 2;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 계열 i의 범례 글: 번호 키가 있으면 번호가 앞에 붙고, 표본이 없는 누적분포 계열은 그 사실이 뒤에 붙는다. */
function legendText(figure, i) {
  const { chart, chartType } = figure;
  const note = chartType === 'ecdf' && ecdfGroups(chart)[i]?.n === 0 ? ` · ${COPY.noSample}` : '';
  return `${isKeyed(figure) ? `${i + 1} ` : ''}${chart.series[i].label}${note}`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 범례 칸 너비
const swatchWidth = (kind) => (kind === 'line' ? BAR * 2 : BAR);

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 점 표식의 속성. 기대값 계열은 속이 비어 있고(차트 묶음(.fl-chart)의 color가 싣는 차트가 놓인 면의 색, 선 색 테두리), 실제값은 채워져 있다(밝은 계열은 같은 계열의 경계가 받친다).
export function dotAttrs(chart, i, extra = '') {
  const color = seriesColor(chart, i);
  if (isReference(chart, i)) return ` fill="currentColor" stroke="${color}" stroke-width="${values["border-width"].strong}"${extra}`;
  return ` fill="${color}"${seriesBoundary(chart, i)}${extra}`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 채운 범례 칸. 칸의 왼쪽 위가 (x, y)이고 한 변이 BAR다. 계열 범례와 원·도넛 조각 목록이 같은 칸을 쓴다. */
export function fillSwatch(paint, { x, y }) {
  const box = { x, y, w: BAR, h: BAR, radius: values.radius.sm };
  return `<rect x="${r(x)}" y="${r(y)}" width="${BAR}" height="${BAR}" rx="${box.radius}" fill="${paint.fill}" stroke="${paint.border}" stroke-width="${values["border-width"].tag}"/>${patternRect(paint, box)}`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 범례 칸 하나. 칸의 왼쪽 위가 (x, y)이고 높이는 BAR다.
 * @param kind 'fill' | 'line' | 'dot'
 */
function legendSwatch(chart, i, kind, { x, y }) {
  const paint = seriesPaint(chart, i);
  const cy = y + BAR / 2;
  if (kind === 'fill') {
    if (isReference(chart, i)) return `<rect x="${r(x)}" y="${r(y)}" width="${BAR}" height="${BAR}" rx="${values.radius.sm}" fill="none" stroke="${paint.border}" stroke-width="${values["border-width"].strong}"/>`;
    return fillSwatch(paint, { x, y });
  }
  const marker = markShape({ shape: paint.shape, cx: x + swatchWidth(kind) / 2, cy, radius: DOT, attrs: dotAttrs(chart, i) });
  if (kind === 'dot') return marker;
  const span = `x1="${r(x)}" x2="${r(x + swatchWidth(kind))}" y1="${r(cy)}" y2="${r(cy)}"`;
  const dash = isReference(chart, i) ? ' class="chart-dashed"' : '';
  return `<line ${span} stroke="${seriesStroke(chart, i)}" stroke-width="${values["border-width"].strong}"${dash}/>${marker}`;
}

// cost: time O(s)
// vars: s = 계열 수
// basis: estimate
// 범례 순서: 번호 키가 있으면 선언 순서, 아니면 main이 먼저다. 계열 번호는 그대로 둬 재생이 같은 번호로 보임을 건다.
function legendOrder(figure) {
  const items = figure.chart.series.map((s, i) => ({ s, i }));
  return isKeyed(figure) ? items : items.sort((a, b) => Number(b.s.role === 'main') - Number(a.s.role === 'main'));
}

// cost: time O(s·n), heap O(out), stack O(1)
// vars: s = 계열 수, n = 계열 이름 글자 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 계열 범례 줄들과 그 아래 y. 범례는 계열을 드러내기 전에도 보인다(`cs-` 묶음 밖). 드러나지 않은 계열의 범례만 빠지면 왼쪽이 비어 어긋나 보인다.
 * 칸이 오른쪽 끝을 넘으면 다음 줄로 넘기고, 한 칸 이름이 한 줄 폭보다 길면 칸 안에서 줄바꿈한다.
 */
export function drawLegend(figure, y) {
  const { chart, chartType } = figure;
  const kind = KINDS[chartType] ?? 'fill';
  const limit = (chart.layout?.width ?? WIDTH) - PAD;
  const lineHeight = TEXT['11'] * values.leading.normal;
  const room = limit - PAD - swatchWidth(kind) - SPACE["1-5"];
  const entries = legendOrder(figure).map(({ i }) => {
    const lines = wrap(legendText(figure, i), room, { size: TEXT['11'] });
    return { i, lines, width: swatchWidth(kind) + SPACE["1-5"] + Math.max(...lines.map((line) => measure(line, TEXT['11']))) + SPACE["4-5"] };
  });
  const rows = [];
  let x = PAD;
  for (const entry of entries) {
    if (x > PAD && x + entry.width > limit + SPACE["4-5"]) {
      x = PAD;
      rows.push([]);
    }
    if (!rows.length) rows.push([]);
    rows.at(-1).push({ ...entry, x });
    x += entry.width;
  }
  const svg = [];
  let top = y;
  for (const row of rows) {
    for (const { i, lines, x: left } of row) {
      svg.push(legendSwatch(chart, i, kind, { x: left, y: top + SPACE["1"] }));
      const text = lines.map((line, k) => `<text x="${r(left + swatchWidth(kind) + SPACE["1-5"])}" y="${r(top + BAR + k * lineHeight)}" class="chart-legend">${renderRich(line)}</text>`);
      svg.push(...text);
    }
    top += BAR + SPACE["3"] + (Math.max(...row.map((entry) => entry.lines.length)) - 1) * lineHeight;
  }
  return { svg, bottom: top };
}
