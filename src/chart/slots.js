// 막대 차트 한 행 안 계열 자리(슬롯). 행 이름의 세로 자리를 그리는 쪽과 시간표가 같은 규칙으로 정한다.
import { maxOf, minOf } from '../extremes.js';
import { values } from '@woonyong-choi/design-tokens/tokens.js';

const BAR = values.spacing.figure.chart.bar;
const SPACE = values.spacing;

/** 계열 슬롯 하나의 세로 간격: 막대와 다음 막대까지 한 칸. 신뢰구간은 막대 끝 위에 겹쳐 그려 따로 줄을 차지하지 않는다. */
export const STEP = BAR + SPACE["1-5"];

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 계열 수
// basis: estimate
/** 값이 있는 계열 슬롯 번호. 값이 없는 계열(`-`)은 막대가 없고 안내 글만 있다. 모두 없으면 전체 슬롯이다. */
export function presentSlots(row, series) {
  const slots = slotIndex(series);
  const own = series.flatMap((s, i) => (slots[i] === undefined ? [] : [i]));
  const present = own.filter((i) => row.values[series[i].id] !== null).map((i) => slots[i]);
  if (present.length) return present;
  return own.length ? own.map((i) => slots[i]) : [0];
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 계열 수
// basis: estimate
/** 계열 번호 → 슬롯 번호. 기대값(reference) 계열은 슬롯을 차지하지 않고 행 막대 묶음 위의 세로 눈금이다(undefined). */
export function slotIndex(series) {
  let next = 0;
  return series.map((s) => (s.role === 'reference' ? undefined : next++));
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 슬롯 수
// basis: estimate
/** 슬롯 묶음의 세로 가운데. 첫 슬롯 막대의 윗면에서 잰다(px). step은 슬롯 간격(stepOf)이다. */
export function slotMiddle(slots, step = STEP) {
  return ((minOf(slots) + maxOf(slots)) * step) / 2;
}
