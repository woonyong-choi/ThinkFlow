// 차트를 그리는 단계의 실패를 알린다: 구분되는 축이 없는 값은 줄 번호가 있는 입력 진단으로, 그린 결과의 비유한 좌표는 내부 오류로.
import { drawChart } from './draw.js';
import { AxisError } from './scale.js';

// 좌표와 크기를 담는 속성. 이 속성 값에 NaN이나 Infinity가 있으면 그림이 깨진다. 사용자 글의 "NaN"은 걸리지 않는다.
const NUMERIC_ATTRIBUTE = /\s(?:x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|width|height|d|points|transform|style|data-at)="[^"]*(?:NaN|Infinity)/;
// 숫자만 담는 글(눈금, 값, 바뀐 비율). 사용자 글은 이 class를 쓰지 않는다.
const NUMERIC_TEXT = /class="chart-(?:tick|value|ratio)[^"]*"[^>]*>[^<]*(?:NaN|Infinity)/;

// cost: time O(r), heap O(1), stack O(1)
// vars: r = 행과 기준선 수
// basis: estimate
// 값 축 범위를 정한 줄. 범위의 가장 큰 값이 있는 줄이고, 없으면 가장 작은 값이 있는 줄, 그것도 없으면(차이 차트의 덧붙인 여백) 그림 첫 줄이다.
function axisLine(figure, { min, max }) {
  const { rows, rules } = figure.chart;
  const entries = [...rows.map((row) => ({ line: row.line, values: Object.values(row.values) })), ...rules.map((rule) => ({ line: rule.line, values: [rule.value] }))];
  return (entries.find((e) => e.values.includes(max)) ?? entries.find((e) => e.values.includes(min)))?.line ?? figure.line;
}

// cost: time O(out), heap O(1), stack O(1)
// vars: out = 만든 SVG 글자 수
// basis: estimate
/** 장면과 좌표가 모두 유한한지. 입력 진단이 아니라 마지막 방어선이라 걸리면 이 도구의 버그다. */
function assertFinite(chart) {
  const isDrawn = chart.dotAts.every(Number.isFinite) && chart.fits.every(({ width, room }) => Number.isFinite(width) && Number.isFinite(room));
  if (!isDrawn || NUMERIC_ATTRIBUTE.test(chart.body) || NUMERIC_TEXT.test(chart.body) || ![chart.width, chart.height].every(Number.isFinite)) {    throw new Error('a chart coordinate is not a finite number (NaN or Infinity)');
  }
}

// cost: time O(draw), heap O(out), stack O(1)
// vars: draw = 차트를 그리는 비용, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 차트를 그린다. 구분되는 축을 만들 수 없으면 해당 줄의 오류를 쌓고 던진다.
 * @throws FigureError 값이 너무 가까워 축으로 구분할 수 없을 때
 * @throws Error 그린 결과에 비유한 좌표가 있을 때(내부 오류)
 */
export function drawChecked(figure, problems) {
  let chart;
  try {
    chart = drawChart(figure);
  } catch (error) {
    if (!(error instanceof AxisError)) throw error;
    problems.error(axisLine(figure, error), error.message);
    return problems.throwIfAny();
  }
  assertFinite(chart);
  return chart;
}
