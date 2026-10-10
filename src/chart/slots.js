// 막대 차트 한 행 안 계열 자리(슬롯). 행 이름의 세로 자리를 그리는 쪽과 시간표가 같은 규칙으로 정한다.
import { values } from '../vendor/theme/tokens.js';

const BAR = values.spacing.figure.chart.bar;
const SPACE = values.spacing;

/** 계열 슬롯 하나의 세로 간격: 막대, 그 아래 신뢰구간 줄이 놓일 자리, 다음 막대까지 간격 */
export const STEP = BAR + SPACE["4"];
/** 신뢰구간이 없고 계열이 셋 이상일 때의 슬롯 간격: 막대 사이 한 칸. 계열이 많아도 행 묶음이 화면을 넘게 자라지 않는다. */
const TIGHT_STEP =BAR + SPACE["1-5"];
/** 신뢰구간 줄이 막대 아래에서 떨어진 거리(줄의 세로 가운데) */
export const CI_OFFSET = BAR + SPACE["1-5"];
/** 마지막 슬롯 막대 윗면에서 신뢰구간 수염 끝까지 내려가는 거리 */
export const CI_REACH = CI_OFFSET + SPACE["0-5"];

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 계열 슬롯의 세로 간격. 신뢰구간이 있거나 계열이 둘 이하면 STEP, 아니면 TIGHT_STEP이다. */
export const stepOf = (count, hasInterval) => (hasInterval || count <= 2 ? STEP : TIGHT_STEP);

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 계열 수
// basis: estimate
/** 값이 있는 계열 슬롯 번호. 값이 없는 계열(`-`)은 막대가 없고 안내 글만 있다. 모두 없으면 전체 슬롯이다. */
export function presentSlots(row, series) {
  const present = series.flatMap((s, i) => (row.values[s.id] === null ? [] : [i]));
  return present.length ? present : series.map((_, i) => i);
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 슬롯 수
// basis: estimate
/** 슬롯 묶음의 세로 가운데. 첫 슬롯 막대의 윗면에서 잰다(px). step은 슬롯 간격(stepOf)이다. */
export function slotMiddle(slots, step = STEP) {
  return ((Math.min(...slots) + Math.max(...slots)) * step) / 2;
}
