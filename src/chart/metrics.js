// 차트 그리기가 함께 쓰는 크기 상수와 색. 값은 모두 토큰에서 온다.
import { tokens, values } from '../tokens.js';

export const SPACE = values.space;
export const SIZE = values.size;
export const TEXT = values.size.text;
export const WIDTH = SIZE.chart.width;
export const BAR = SIZE.chart.bar;
export const ROW = SIZE.chart.row;
export const DOT = SIZE.chart.dot;
export const PAD = SPACE['14'];
export const CAP = SIZE.chart.cap;
// 내용이 닿는 오른쪽 끝. 왼쪽 여백(PAD)과 같은 여백을 오른쪽에도 둔다.
export const RIGHT = WIDTH - PAD;

// 산점도 점 가운데에서 이름 글자까지 거리
export const NAME_OFFSET = DOT + SPACE['3'];

const ROLE_COLOR = { main: tokens.color.data.main, compare: tokens.color.data.compare };

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 계열 번호 i의 색. 계열이 없는 차트(산점도 점)는 main 색이다. */
export function seriesColor(chart, i) {
  return ROLE_COLOR[chart.series[i]?.role ?? 'main'];
}
