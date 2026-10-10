// 끝 이름: 선, 계단, 면적, 누적분포가 두 계열 이상이면 계열마다 이름을 그림 영역 오른쪽 한 줄 열에 직접 적고, 끝 점에서 이름까지 가는 선(안내선)을 긋는다.
// 파랑과 보라, 빨강과 초록처럼 색각 이상에서 가까운 쌍이 첫 판 안에도 있으므로 색 수와 상관없이 쓴다.
// 이름 상자의 크기(줄 수와 높이)는 계열 이름과 폭만으로 정해 모든 프레임이 같다. 그림 영역이 모든 이름 높이의 합만큼 자라므로 이름이 몇이든 겹치지 않고 글자를 줄이거나 숨기지 않는다.
import { measure, wrap } from '../measure/fonts.js';
import { centerBaseline, renderRich, roundCoord as r } from '../text.js';
import { values } from '../vendor/theme/tokens.js';
import { COPY } from './copy.js';
import { markAttrs, markId } from './marks.js';
import { DOT, SIZE, SPACE, TEXT, seriesPaint, seriesStroke } from './metrics.js';

// 끝 이름을 다는 차트 종류
const TYPES = new Set(['line', 'step', 'area', 'ecdf']);
// 이름 상자 사이의 틈
const GAP = SPACE["0-5"];
// 끝 점에서 이름 열까지 안내선이 비스듬히 꺾여 가는 가로 폭
const LEADER_RUN = SPACE["3"];

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 끝 이름을 다는 차트인가: 선, 계단, 면적, 누적분포이고 계열이 둘 이상이다. */
export const hasEndLabels = (figure) => TYPES.has(figure.chartType) && figure.chart.series.length >= 2;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
const lineHeightOf = () => TEXT['11'] * values.leading.normal;

// cost: time O(s·n), heap O(s), stack O(1)
// vars: s = 계열 수, n = 이름 글자 수
// basis: estimate
// 이름 한 줄의 최대 폭. 넓은 배치는 이름 칸 기준(size.chart.label), 좁은 배치는 그 절반이다. 가장 긴 이름이 이보다 짧으면 그 이름까지만 비운다.
function labelWidth(chart, empty) {
  const cap = chart.layout ? SIZE.chart.label / 2 : SIZE.chart.label;
  return Math.min(cap, Math.max(...chart.series.map((s, i) => measure(textOf(s, i, empty), TEXT['11']))));
}

// 이름 글: 값이 하나도 없는 계열은 뒤에 `COPY.noData`가 붙는다.
const textOf = (series, i, empty) => (empty.has(i) ? `${series.label} ${COPY.noData}` : series.label);

// cost: time O(s·n), heap O(s), stack O(1)
// vars: s = 계열 수, n = 이름 글자 수
// basis: estimate
/** 끝 이름을 위해 그림 영역 오른쪽에 비워 둘 폭: 점 반지름, 안내선이 꺾이는 폭, 이름 한 줄의 폭. 끝 이름이 없는 차트는 0이다. 계열 이름만으로 정해져 프레임마다 같다. */
export function endLabelRoom(figure, empty = new Set()) {
  return hasEndLabels(figure) ? DOT + LEADER_RUN + labelWidth(figure.chart, empty) : 0;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 이름 열의 왼쪽 x: 그림 영역 오른쪽 끝(plotFrame의 right)에서 점 반지름과 안내선이 꺾이는 폭만큼 떨어진 곳. */
export const endLabelX = (right) => right + DOT + LEADER_RUN;

// cost: time O(s·n²), heap O(s·l), stack O(1)
// vars: s = 계열 수, n = 이름 글자 수, l = 줄 수
// basis: estimate
/**
 * 모든 계열의 이름 상자(줄 목록과 높이). 이름과 폭만 읽으므로 프레임이 달라도 같다.
 * 값이 하나도 없는 계열은 이름 뒤에 `COPY.noData`를 덧붙인다. 그 계열은 모든 프레임에서 값이 없으므로(묶은 값은 늘 숫자다) 줄 수도 프레임마다 같다.
 * @param empty 값이 하나도 없는 계열 번호 집합
 * @returns { i, lines, height, width }[] 계열 번호 순서
 */
export function endLabelBoxes(chart, empty = new Set()) {
  const room = labelWidth(chart, empty);
  const lineHeight = lineHeightOf();
  return chart.series.map((s, i) => {
    const lines = wrap(textOf(s, i, empty), room, { size: TEXT['11'] });
    return { i, lines, height: lines.length * lineHeight, width: Math.max(...lines.map((line) => measure(line, TEXT['11']))) };
  });
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 계열 수
// basis: estimate
/** 이름 상자들을 틈 없이 쌓은 높이. 그림 영역 높이가 이만큼 자라면 모든 이름이 영역 안에서 겹치지 않는다. */
export const endLabelHeight = (boxes) => boxes.reduce((sum, box) => sum + box.height, 0) + GAP * Math.max(0, boxes.length - 1);

// cost: time O(s log s), heap O(s), stack O(1)
// vars: s = 계열 수
// basis: estimate
/**
 * 끝 이름 자리. 순서를 지키고 서로 겹치지 않는 자리 가운데 끝 점 높이에서 제곱 거리가 가장 작은 자리를 찾는다(인접 위반 병합, PAV). 결정적이고 수를 줄이거나 숨기지 않는다.
 * 순서는 (끝 점 y, 계열 번호)이고 끝 점이 없는 계열은 그 뒤에 계열 번호 순서로 놓는다. 영역을 벗어나는 자리는 영역 안으로 자른다(영역은 모든 이름이 들어가게 자란 높이다).
 * @param anchors Map<계열 번호, 끝 점 y>. 끝 점이 없는 계열은 없다
 * @param limits { top, bottom }. 이름 상자가 놓일 수 있는 세로 범위
 * @returns { i, top, height, lines, width, cy }[] 계열 번호 순서
 */
export function placeEndLabels(boxes, anchors, { top: floor, bottom: ceiling }) {
  const order = [...boxes].sort((a, b) => rank(a, anchors) - rank(b, anchors) || (anchors.get(a.i) ?? 0) - (anchors.get(b.i) ?? 0) || a.i - b.i);
  const offsets = [];
  let sum = 0;
  for (const box of order) {
    offsets.push(sum);
    sum += box.height + GAP;
  }
  const total = sum - GAP;
  const desired = order.map((box, k) => (anchors.has(box.i) ? anchors.get(box.i) - box.height / 2 : ceiling) - offsets[k]);
  const fitted = isotonic(desired);
  const high = Math.max(floor, ceiling - total);
  return order.map((box, k) => {
    const top = Math.min(high, Math.max(floor, fitted[k])) + offsets[k];
    return { ...box, top, cy: top + box.height / 2 };
  }).sort((a, b) => a.i - b.i);
}

// 끝 점이 있는 계열이 먼저다.
const rank = (box, anchors) => (anchors.has(box.i) ? 0 : 1);

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 값 수
// basis: estimate
// 단조 증가로 맞춘 값(평균 병합). 앞 묶음의 평균이 뒤 묶음보다 크면 합친다.
function isotonic(values_) {
  const blocks = [];
  for (const value of values_) {
    blocks.push({ sum: value, count: 1 });
    while (blocks.length > 1 && blocks.at(-2).sum / blocks.at(-2).count > blocks.at(-1).sum / blocks.at(-1).count) {
      const last = blocks.pop();
      blocks.at(-1).sum += last.sum;
      blocks.at(-1).count += last.count;
    }
  }
  return blocks.flatMap((block) => Array(block.count).fill(block.sum / block.count));
}

// cost: time O(s·l), heap O(out), stack O(1)
// vars: s = 계열 수, l = 줄 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 끝 이름 표식. 계열 묶음(`cs-i`) 안에 놓여 그 계열이 드러날 때 함께 나타난다. 모든 프레임에서 표식 목록이 같다:
 * 안내선(`:end.l`), 바탕(`:end.b`), 줄마다 글 하나(`:end.t0..`). 글에는 `tspan`이 없어 끝 점이 움직이면 모든 표식의 속성이 함께 바뀐다. 어느 표식도 원자료가 없어 강조하지 않는다.
 * @param placed placeEndLabels의 결과
 * @param anchors Map<계열 번호, { x, y }>. 끝 점. 끝 점이 없으면 안내선이 숨는다
 * @param column { x }. 이름 열의 왼쪽 x
 */
export function endLabelMarks(chart, placed, anchors, column) {
  const lineHeight = lineHeightOf();
  return placed.map((box) => {
    const pad = SPACE["0-25"];
    const back = `<rect x="${r(column.x - pad)}" y="${r(box.top - pad)}" width="${r(box.width + pad * 2)}" height="${r(box.height + pad * 2)}" class="chart-text-bg"${markAttrs(chart, markId(chart, box.i, 'end', '.b'))}/>`;
    const texts = box.lines.map((line, k) => `<text x="${r(column.x)}" y="${r(centerBaseline(box.top + lineHeight / 2 + k * lineHeight, TEXT['11']))}" fill="${seriesPaint(chart, box.i).ink}" class="chart-end-label"${markAttrs(chart, markId(chart, box.i, 'end', `.t${k}`), { isText: true })}>${renderRich(line)}</text>`);
    return `<g class="cs-${box.i}">${leader(chart, box, anchors.get(box.i), column)}${back}${texts.join('')}</g>`;
  });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 끝 점에서 이름까지 가는 안내선. 같은 계열의 테두리 색, 모든 계열이 같은 가는 굵기다. 끝 점이 없거나 끝 점이 이름과 같은 높이에서 그림 영역 오른쪽 끝에 있으면(거리 0) 숨기되 표식은 남긴다.
function leader(chart, box, anchor, { x }) {
  const end = { x: x - SPACE["0-5"], y: box.cy };
  const start = anchor ? anchor.x + DOT : end.x;
  const elbow = Math.max(start, x - LEADER_RUN);
  const d = anchor ? `M ${r(start)} ${r(anchor.y)} H ${r(elbow)} L ${r(end.x)} ${r(end.y)}` : `M ${r(end.x)} ${r(end.y)}`;
  // 이름이 끝 점과 같은 높이이고 선이 꺾이는 폭 안에서 끝나면 이을 거리가 없다.
  const isHidden = !anchor || (Math.abs(box.cy - anchor.y) <= 0.5 && start >= x - LEADER_RUN - 0.5);
  return `<path d="${d}" fill="none" stroke="${seriesStroke(chart, box.i)}" stroke-width="${values["border-width"].thin}" class="chart-leader"${isHidden ? ' visibility="hidden"' : ''}${markAttrs(chart, markId(chart, box.i, 'end', '.l'))}/>`;
}
