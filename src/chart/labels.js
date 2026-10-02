// 차트의 제목, 범례, 행 이름, 값 글자. 종류마다 같은 글자 규칙을 한 곳에 둔다.
import { measure } from '../measure/fonts.js';
import { centerBaseline, renderRich, roundCoord as r } from '../text.js';
import { values } from '../tokens.js';
import { BAR, PAD, SIZE, SPACE, TEXT, seriesColor } from './metrics.js';

const LABEL_W = SIZE.chart.label;
const LABEL_MAX = SIZE.chart['label-max'];
const LABEL_GAP = SPACE['6'];
// 차트 항목 이름이 칸에 들어가는 최대 폭
const LABEL_ROOM = LABEL_MAX - LABEL_GAP;

// cost: time O(r·n), heap O(1), stack O(1)
// vars: r = 항목 수, n = 이름 글자 수
// basis: estimate
/** 항목 이름 칸 너비. 가장 긴 이름에 맞추되 LABEL_W와 LABEL_MAX 사이다. 넘는 이름은 그림 검사 1번이 알린다. */
export function labelColumn(names) {
  return Math.min(LABEL_MAX, Math.max(LABEL_W, ...names.map((name) => measure(name, TEXT['13'], 'medium') + LABEL_GAP)));
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 이름 글자 수
// basis: estimate
/** 항목 이름이 이름 칸에 들어가야 한다는 그림 검사 항목 */
export function labelFit(name, line) {
  return { text: name, width: measure(name, TEXT['13'], 'medium'), room: LABEL_ROOM, line, what: 'item name' };
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

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 값 글자. at.x에서 시작하거나 className의 `end`로 at.x가 오른쪽 끝이고, 세로 가운데 at.cy에 맞춘다. */
export function valueText({ x, cy }, text, className) {
  return `<text x="${r(x)}" y="${r(centerBaseline(cy, TEXT['11']))}" class="${className}">${text}</text>`;
}

// cost: time O(s log s), heap O(s), stack O(1)
// vars: s = 계열 수
// basis: estimate
// 범례 순서: main이 먼저다. 계열 번호는 그대로 둬 재생이 같은 번호로 보임을 건다.
function legendOrder(series) {
  return series.map((s, i) => ({ s, i })).sort((a, b) => Number(b.s.role === 'main') - Number(a.s.role === 'main'));
}

// cost: time O(s·n), heap O(out), stack O(1)
// vars: s = 계열 수, n = 계열 이름 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 계열 범례 한 줄과 그 아래 y. 범례는 계열을 드러내기 전에도 보인다(`cs-` 묶음 밖). 드러나지 않은 계열의 범례만 빠지면 왼쪽이 비어 어긋나 보인다.
function drawLegend(chart, y) {
  let x = PAD;
  const items = legendOrder(chart.series).map(({ s, i }) => {
    const item = `<rect x="${x}" y="${r(y + SPACE['2'])}" width="${BAR}" height="${BAR}" rx="${values.radius.sm}" fill="${seriesColor(chart, i)}"/>` + `<text x="${x + BAR + SPACE['3']}" y="${r(y + BAR)}" class="chart-legend">${renderRich(s.label)}</text>`;
    x += BAR + SPACE['3'] + measure(s.label, TEXT['11']) + SPACE['9'];
    return item;
  });
  return { svg: items, bottom: y + BAR + SPACE['6'] };
}

// cost: time O(s·n), heap O(out), stack O(1)
// vars: s = 계열 수, n = 계열 이름 글자 수, out = 만든 SVG 글자 수
// basis: estimate
/** 제목, 부제, 계열 범례. bottom은 그림 영역이 시작하는 y다. */
export function drawHeader(figure) {
  const parts = [];
  let y = PAD;
  if (figure.title) {
    parts.push(`<text x="${PAD}" y="${r(y + TEXT['15'])}" class="chart-title">${renderRich(figure.title)}</text>`);
    y += TEXT['15'] + SPACE['4'];
  }
  if (figure.subtitle) {
    parts.push(`<text x="${PAD}" y="${r(y + TEXT['11'])}" class="chart-sub">${renderRich(figure.subtitle)}</text>`);
    y += TEXT['11'] + SPACE['5'];
  }
  if (figure.chart.series.length) {
    const legend = drawLegend(figure.chart, y);
    parts.push(...legend.svg);
    y = legend.bottom;
  }
  return { svg: parts.join('\n'), bottom: y + SPACE['6'] };
}
