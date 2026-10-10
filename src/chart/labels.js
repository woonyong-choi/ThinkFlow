// 차트의 제목, 범례, 행 이름, 값 글자. 종류마다 같은 글자 규칙을 한 곳에 둔다.
import { textMarkup } from '../draw/texts.js';
import { measure, wrap } from '../measure/fonts.js';
import { STYLE, stackTexts } from '../measure/texts.js';
import { centerBaseline, plainText, renderRich, roundCoord as r } from '../text.js';
import { values } from '../vendor/theme/tokens.js';
import { COPY } from './copy.js';
import { ecdfGroups } from './data.js';
import { drawLegend } from './legend.js';
import { markAttrs } from './marks.js';
import { PAD, SIZE, SPACE, TEXT, WIDTH } from './metrics.js';
import { formatNumber } from './scale.js';

const LABEL_W = SIZE.chart.label;
const LABEL_MAX = SIZE.chart['label-max'];
const LABEL_GAP = SPACE["3"];
// 차트 항목 이름이 칸에 들어가는 최대 폭
const LABEL_ROOM = LABEL_MAX - LABEL_GAP;

// cost: time O(r·n), heap O(1), stack O(1)
// vars: r = 항목 수, n = 이름 글자 수
// basis: estimate
/** 항목 이름 칸 너비. 가장 긴 이름에 맞추되 LABEL_W와 LABEL_MAX 사이다. 넘는 이름은 그림 검사 1번이 알린다. */
export function labelColumn(names) {
  return Math.min(LABEL_MAX, Math.max(LABEL_W, ...names.map((name) => measure(name, TEXT['13'], 'regular') + LABEL_GAP)));
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 이름 글자 수
// basis: estimate
/** 항목 이름이 이름 칸에 들어가야 한다는 그림 검사 항목 */
export function labelFit(name, line) {
  return { text: name, width: measure(name, TEXT['13'], 'regular'), room: LABEL_ROOM, line, what: 'item name' };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 행 이름 글자. 왼쪽 여백에서 시작하고 세로 가운데 cy에 맞춘다. */
export function labelText(label, cy, className) {
  return `<text x="${PAD}" y="${r(centerBaseline(cy, TEXT['13']))}" class="${className}">${renderRich(label)}</text>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 행 k의 글자 묶음. 밝히지 않은 행에서 글자는 면(막대, 점)보다 덜 흐려야 읽히므로 `ink` class를 달아 따로 흐린다.
 * 계열 i를 주면 그 계열 묶음(`cs-i`) 안에 둬 계열을 드러낼 때 함께 나타난다.
 */
export function inkGroup(k, inner, i) {
  const body = i === undefined ? inner : `<g class="cs-${i}">${inner}</g>`;
  return `<g class="cr-${k} ink">${body}</g>`;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 값 글자 수
// basis: estimate
/**
 * 값 글자. at.x에서 시작하거나 className의 `end`로 at.x가 오른쪽 끝이고, 세로 가운데 at.cy에 맞춘다.
 * mark가 있으면({ chart, id, raw, paint }) 글과 바탕 면에 프레임 표식 이름이 붙는다. 바탕 면은 `.b`, 글은 `.t`가 id 뒤에 붙는다.
 * 값이 바뀐 효과는 글자 뒤 바탕 면이 받는다: 원자료와 계열 칠(paint)은 바탕 면에만 붙고, 글자는 바뀐 값을 그대로 보인다.
 */
export function valueText({ x, cy }, text, className, mark) {
  const size = TEXT['11'];
  const width = measure(plainText(text), size, /ours|second/.test(className) ? 'numSemibold' : 'num');
  const pad = SPACE["0-25"];
  const left = x - (className.includes('end') ? width : 0);
  const attrs = (suffix, isText) => (mark ? markAttrs(mark.chart, `${mark.id}${suffix}`, isText ? { isText } : { raw: mark.raw, paint: mark.paint }) : '');
  const back = `<rect x="${r(left - pad)}" y="${r(cy - size / 2 - pad)}" width="${r(width + pad * 2)}" height="${size + pad * 2}" class="chart-text-bg${className.includes('late') ? ' late' : ''}"${attrs('.b', false)}/>`;
  return back + `<text x="${r(x)}" y="${r(centerBaseline(cy, size))}" class="${className}"${attrs('.t', true)}>${text}</text>`;
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 키 글자 수
// basis: estimate
/** 번호 키 글자가 차지하는 칸. 글자 폭과 글자 높이에 사방 `space.2` 여백을 더한다. */
export function keyRoom(key) {
  return { w: measure(key, TEXT['11'], 'numSemibold') + SPACE["1"] * 2, h: TEXT['11'] + SPACE["1"] * 2 };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 키 글자 수
// basis: estimate
/**
 * 면 안에 적는 번호 키 글자. 가운데 (x, cy)에 두고 면색 위 글자색과 면색 테두리로 읽힌다. fits가 거짓이면 자리는 두고 숨긴다.
 * 누적 막대 조각과 원·도넛 조각이 함께 쓴다.
 */
export function segmentKey(chart, { key, x, cy, paint, fits, id }) {
  return `<text x="${r(x)}" y="${r(centerBaseline(cy, TEXT['11']))}" text-anchor="middle" fill="${paint.on}" stroke="${paint.fill}" stroke-width="${values["border-width"].casing}" paint-order="stroke" class="chart-seg-key late"${fits ? '' : ' visibility="hidden"'}${markAttrs(chart, id, { isText: true })}>${key}</text>`;
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 계열 수
// basis: estimate
// 누적분포와 히스토그램에서 결측이라 뺀 표본이 있으면 알리는 한 줄(부제 아래). 누적분포는 계열이 있으면 계열 이름이 앞에 붙는다.
function excludedNote(figure) {
  if (figure.chartType === 'histogram') return figure.chart.missingCount ? COPY.excluded(figure.chart.missingCount) : undefined;
  if (figure.chartType !== 'ecdf') return undefined;
  const notes = ecdfGroups(figure.chart).flatMap((group, i) => (group.missing ? [`${figure.chart.series[i] ? `${figure.chart.series[i].label} ` : ''}${COPY.excluded(group.missing)}`] : []));
  return notes.join(' · ') || undefined;
}

// cost: time O(s·n), heap O(out), stack O(1)
// vars: s = 계열 수, n = 계열 이름 글자 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 제목, 부제, 계열 범례. bottom은 그림 영역이 시작하는 y다.
 * 제목은 카드 제목(label), 부제와 덧붙임과 좁은 배치의 기준선 이름은 카드 부제(sub)와 같은 글 역할과 줄 높이로 위에서 아래로 쌓는다. 차트는 플롯 배치라 왼쪽에 맞추고, 긴 글은 어느 폭에서나 그림 폭 안에서 줄을 나눈다.
 */
export function drawHeader(figure) {
  const { layout } = figure.chart;
  const rules = layout ? figure.chart.rules.map((rule) => `${rule.label} ${formatNumber(rule.value)}`) : [];
  const room = (layout?.width ?? WIDTH) - PAD * 2;
  const linesOf = (text, role, style) => wrap(text, room, style).map((line) => ({ role, text: line, style }));
  const lines = [
    ...(figure.title ? linesOf(figure.title, 'label', STYLE.label) : []),
    ...[figure.subtitle, excludedNote(figure), ...rules].filter(Boolean).flatMap((text) => linesOf(text, 'sub', STYLE.sub)),
  ];
  const texts = stackTexts(lines, { x: PAD, top: PAD, anchor: 'start' });
  const parts = texts.map((t) => textMarkup(t, { x: 0, y: 0 }));
  let y = lines.reduce((bottom, line) => bottom + line.style.line, PAD);
  if (figure.chart.series.length) {
    const legend = drawLegend(figure, y);
    parts.push(...legend.svg);
    y = legend.bottom;
  }
  return { svg: parts.join('\n'), bottom: y + SPACE["3"] };
}

// cost: time O(r·n²), heap O(r·n), stack O(1)
// vars: r = 행 수, n = 이름 글자 수
// basis: estimate
/** 좁은 행 차트의 이름 줄과 공통 높이. 모든 행이 같은 막대 시작 위치를 쓴다. */
export function rowLabelLayout(chart) {
  if (!chart.layout) return { space: 0 };
  const lines = chart.rows.map((row) => wrap(row.label, chart.layout.width - PAD * 2, { size: TEXT['13'], face: row.total ? 'semibold' : 'regular' }));
  const lineHeight = TEXT['13'] * values.leading.normal;
  return { lines, lineHeight, space: Math.max(...lines.map((row) => row.length)) * lineHeight + SPACE["3"] };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 이름 글자 수
// basis: estimate
/** 넓은 배치는 행 옆, 좁은 배치는 행 위에 이름을 둔다. */
export function rowName(label, { layout, k, top, cy, className = 'chart-label' }) {
  return layout.lines ? layout.lines[k].map((line, i) => labelText(line, top + TEXT['13'] / 2 + i * layout.lineHeight, className)).join('') : labelText(label, cy, className);
}
