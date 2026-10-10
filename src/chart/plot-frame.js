// 산점도와 선 차트의 그림 영역: 두 축, 격자, 눈금, 축 제목
import { measure, wrap } from '../measure/fonts.js';
import { centerBaseline, renderRich, roundCoord as r } from '../text.js';
import { axisEnd, axisLabels, fitLength, tickReach } from './axis.js';
import { DOT, PAD, SIZE, SPACE, TEXT, WIDTH } from './metrics.js';
import { COPY } from './copy.js';
import { valueRange } from './extent.js';
import { makeScale } from './scale.js';
import { compactAxis } from './compact-axis.js';

// 세로축 제목은 그림 영역 위 한 줄에 둔다. 맨 위 눈금 글자와 겹치지 않게 그만큼 내린다.
const Y_TITLE_H = TEXT['11'] + SPACE["4"];

// 잘린 값 축의 끝 격자선 왼쪽에 그리는 지그재그(잘림 표시): 걸음 수, 걸음 가로 폭, 위아래 흔들림
const BREAK_STEPS = 4;
const BREAK_STEP = SPACE["1-5"];
const BREAK_AMP = SPACE["1"];

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 값 축이 잘린 끝(0이 범위 밖인 쪽의 끝 눈금). 0 시작이 꺼져 있고 범위가 0을 포함하지 않을 때만 있다. 로그 눈금은 0이 없는 축이라 잘림이 아니다.
function cutTick(chart, ticks) {
  if (chart.zero !== 'off' || chart.scale === 'log') return undefined;
  if (ticks[0] > 0) return ticks[0];
  return ticks.at(-1) < 0 ? ticks.at(-1) : undefined;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 잘림 표시: 끝 격자선이 지그재그로 시작한다. 격자선만으로는 잘린 축이 0 시작 축과 구별되지 않기 때문이다.
function breakMark(y, left) {
  const points = Array.from({ length: BREAK_STEPS + 1 }, (_, k) => `${r(left + k * BREAK_STEP)} ${r(y + (k % 2 ? -BREAK_AMP : k ? BREAK_AMP : 0))}`);
  return `<path d="M ${points.join(' L ')}" class="chart-break"/>`;
}

// cost: time O(t), heap O(out), stack O(1)
// vars: t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 세로 눈금: 격자선과 왼쪽 눈금 글자. 잘린 끝 격자선은 지그재그 뒤에서 시작한다.
function yGrid(sy, { left, plotW, cut }) {
  return sy.ticks
    .map((t, i) => {
      const isCut = t === cut;
      const from = isCut ? left + BREAK_STEPS * BREAK_STEP : left;
      const line = `<line x1="${r(from)}" x2="${r(left + plotW)}" y1="${r(sy.at(t))}" y2="${r(sy.at(t))}" class="chart-grid"/>`;
      return `${line}${isCut ? breakMark(sy.at(t), left) : ''}<text x="${r(left - SPACE["1-5"])}" y="${r(centerBaseline(sy.at(t), TEXT['11']))}" class="chart-tick end">${sy.labels[i]}</text>`;
    })
    .join('');
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 축 제목 글자 수
// basis: estimate
// 세로축 제목: 그림 영역 위에서 줄바꿈한 각 줄
function yAxisTitle(lines, top) {
  return lines.map((line, i) => `<text x="${PAD}" y="${r(top + TEXT['11'] + i * Y_TITLE_H)}" class="chart-unit start">${renderRich(line)}</text>`).join('');
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 값이 하나도 없는 선, 계단, 누적분포의 그림 영역 가운데 글. 틀과 축은 대체 범위로 그려지고 표식은 없다(0으로 그리지 않는다). */
export function noDataNote({ sx, top, plotBottom }) {
  return `<text x="${r(sx.start + sx.length / 2)}" y="${r(centerBaseline((top + plotBottom) / 2, TEXT['11']))}" text-anchor="middle" class="chart-missing">${COPY.noData}</text>`;
}

// cost: time O(d + t + n²), heap O(d + out), stack O(1)
// vars: d = 값과 기준선 수, t = 눈금 수, n = 축 제목 글자 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 산점도, 선, 계단, 누적분포 차트의 그림 영역.
 * @param data { xs, ys, endRoom, minPlotH, markReach }. 가로와 세로 값(범위를 정하는 데 쓴다)과, 끝 이름을 위해 오른쪽에 비워 둘 폭과 그림 영역이 가져야 할 최소 높이(end-labels.js), 가로 값의 표식이 값 자리 밖으로 나가는 거리(점은 반지름 `DOT`, 끝 점이 없는 막대는 윤곽 굵기의 절반)
 * @returns { sx, sy, frame, top, right, bottom, plotBottom }. top은 그림 영역 윗면, right는 그림 영역 오른쪽 끝(끝 이름 자리 앞), bottom은 축 글자까지 포함한 내용의 아래 끝, plotBottom은 그림 영역 아랫면이다
 */
export function plotFrame(figure, top, { xs, ys, endRoom = 0, minPlotH = 0, markReach = DOT }) {
  const { chart } = figure;
  // 끝 이름이 많거나 길면 그림 영역이 그 이름들이 겹치지 않고 들어갈 만큼 자란다. 이름을 줄이거나 숨기지 않는다.
  const plotH = Math.max(SIZE.chart['plot-h'], minPlotH);
  const width = chart.layout?.width ?? WIDTH;
  const titleLines = chart.y ? chart.layout ? wrap(chart.y, width - PAD * 2, { size: TEXT['11'] }) : [chart.y] : [];
  const plotTop = top + titleLines.length * Y_TITLE_H;
  // 산점도와 누적분포는 가로축이 값 축이라 scale 줄을 따른다. 선과 계단의 가로축은 위치라 늘 linear다.
  const xKind = ['scatter', 'ecdf'].includes(figure.chartType) ? chart.scale : 'linear';
  // 선 차트 가로축은 값 축이 아니라 0에서 시작하지 않는다(docs/design/charts.md 값 축 표).
  const xRange = { min: Math.min(...xs), max: Math.max(...xs), fromZero: figure.chartType === 'scatter' };
  // 기준선은 세로 값 축에 긋는다. 기준선이 그림 밖에 그려지지 않게 값 범위에 넣는다.
  // 값에 묶인 차트는 모든 프레임이 같은 눈금을 쓰도록 값 범위(extent)를 넣는다.
  const ruledYs = [...ys, ...chart.rules.map((x) => x.value), ...(chart.extent ? [chart.extent.min, chart.extent.max] : [])];
  const range = valueRange(ruledYs, chart.scale);
  const yScale = makeScale(chart.scale, { min: range.min, max: range.max, start: 0, length: plotH, fromZero: chart.zero !== 'off' });
  if (figure.chartType === 'histogram' && (chart.binning.measure ?? 'count') === 'count') {
    const whole = yScale.ticks.map((tick, i) => ({ tick, label: yScale.labels[i] })).filter(({ tick }) => Number.isInteger(tick));
    yScale.ticks = whole.map(({ tick }) => tick);
    yScale.labels = whole.map(({ label }) => label);
  }
  const sy = { ...yScale, at: (v) => plotTop + plotH - yScale.at(v) };
  // 내용의 왼쪽 끝은 제목, 범례, 세로축 제목이 있으면 PAD, 없으면 세로축 눈금 글자의 왼쪽 끝이다. 오른쪽 끝은 그만큼 남긴다.
  const tickW = Math.max(...yScale.labels.map((label) => measure(label, TEXT['11'], 'num')));
  const left = PAD + (chart.layout ? Math.max(SIZE.chart.axis, tickW + SPACE["1-5"]) : SIZE.chart.axis);
  const hasHeader = Boolean(figure.title || figure.subtitle || chart.series.length || chart.y);
  const right = width - Math.min(hasHeader ? PAD : Infinity, left - SPACE["1-5"] - tickW) - endRoom;
  const unitX = makeScale(xKind, { ...xRange, start: 0, length: 1 });
  const plotW = fitLength(unitX, [...tickReach(unitX), ...xs.map((value) => ({ value, extra: markReach }))], { start: left, right });
  const sx = makeScale(xKind, { ...xRange, start: left, length: plotW });
  const axis = chart.layout ? compactAxis(sx, plotTop + plotH, chart.x) : { svg: axisLabels(sx, plotTop + plotH, chart.x), bottom: axisEnd(plotTop + plotH, Boolean(chart.x)) };
  const frame = yGrid(sy, { left, plotW, cut: cutTick(chart, yScale.ticks) }) + axis.svg + yAxisTitle(titleLines, top);
  return { sx, sy, frame, top: plotTop, right, bottom: axis.bottom, plotBottom: plotTop + plotH };
}
