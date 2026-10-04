// 산점도와 선 차트의 그림 영역: 두 축, 격자, 눈금, 축 제목
import { measure } from '../measure/fonts.js';
import { centerBaseline, renderRich, roundCoord as r } from '../text.js';
import { axisEnd, axisLabels, fitLength, tickReach } from './axis.js';
import { DOT, PAD, SIZE, SPACE, TEXT, WIDTH } from './metrics.js';
import { makeScale } from './scale.js';

// 세로축 제목은 그림 영역 위 한 줄에 둔다. 맨 위 눈금 글자와 겹치지 않게 그만큼 내린다.
const Y_TITLE_H = TEXT['11'] + SPACE['8'];

// 잘린 값 축의 끝 격자선 왼쪽에 그리는 지그재그(잘림 표시): 걸음 수, 걸음 가로 폭, 위아래 흔들림
const BREAK_STEPS = 4;
const BREAK_STEP = SPACE['3'];
const BREAK_AMP = SPACE['2'];

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
      return `${line}${isCut ? breakMark(sy.at(t), left) : ''}<text x="${r(left - SPACE['3'])}" y="${r(centerBaseline(sy.at(t), TEXT['11']))}" class="chart-tick end">${sy.labels[i]}</text>`;
    })
    .join('');
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 세로축 제목: 그림 영역 위 한 줄
function yAxisTitle(chart, plotTop) {
  return chart.y ? `<text x="${PAD}" y="${r(plotTop - Y_TITLE_H + TEXT['11'])}" class="chart-unit start">${renderRich(chart.y)}</text>` : '';
}

// cost: time O(t), heap O(out), stack O(1)
// vars: t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 산점도와 선 차트의 그림 영역.
 * @param data { xs, ys }. 가로와 세로 값(범위를 정하는 데 쓴다)
 * @returns { sx, sy, frame, top, right, bottom }. top은 그림 영역 윗면, right는 내용의 오른쪽 끝, bottom은 축 글자까지 포함한 내용의 아래 끝이다
 */
export function plotFrame(figure, top, { xs, ys }) {
  const { chart } = figure;
  const left = PAD + SIZE.chart.axis;
  const plotH = SIZE.chart['plot-h'];
  const plotTop = top + (chart.y ? Y_TITLE_H : 0);
  const xKind = figure.chartType === 'scatter' ? chart.scale : 'linear';
  // 선 차트 가로축은 값 축이 아니라 0에서 시작하지 않는다(docs/design/charts.md 값 축 표).
  const xRange = { min: Math.min(...xs), max: Math.max(...xs), fromZero: figure.chartType === 'scatter' };
  // 기준선은 세로 값 축에 긋는다. 기준선이 그림 밖에 그려지지 않게 값 범위에 넣는다.
  const ruledYs = [...ys, ...chart.rules.map((x) => x.value)];
  const yScale = makeScale(chart.scale, { min: Math.min(...ruledYs), max: Math.max(...ruledYs), start: 0, length: plotH, fromZero: chart.zero !== 'off' });
  const sy = { ...yScale, at: (v) => plotTop + plotH - yScale.at(v) };
  // 내용의 왼쪽 끝은 제목, 범례, 세로축 제목이 있으면 PAD, 없으면 세로축 눈금 글자의 왼쪽 끝이다. 오른쪽 끝은 그만큼 남긴다.
  const tickW = Math.max(...yScale.labels.map((label) => measure(label, TEXT['11'], 'num')));
  const hasHeader = Boolean(figure.title || figure.subtitle || chart.series.length || chart.y);
  const right = WIDTH - Math.min(hasHeader ? PAD : Infinity, left - SPACE['3'] - tickW);
  const unitX = makeScale(xKind, { ...xRange, start: 0, length: 1 });
  const plotW = fitLength(unitX, [...tickReach(unitX), ...xs.map((value) => ({ value, extra: DOT }))], { start: left, right });
  const sx = makeScale(xKind, { ...xRange, start: left, length: plotW });
  const frame = yGrid(sy, { left, plotW, cut: cutTick(chart, yScale.ticks) }) + axisLabels(sx, plotTop + plotH, chart.x) + yAxisTitle(chart, plotTop);
  return { sx, sy, frame, top: plotTop, right, bottom: axisEnd(plotTop + plotH, Boolean(chart.x)) };
}
