// 막대 차트 한 행 안 계열 자리(슬롯). 행 이름의 세로 자리를 그리는 쪽과 시간표가 같은 규칙으로 정한다.
import { values } from '../tokens.js';

const STEP = values.size.chart.bar + values.space['2'];

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
/** 슬롯 묶음의 세로 가운데. 첫 슬롯 막대의 윗면에서 잰다(px). */
export function slotMiddle(slots) {
  return ((Math.min(...slots) + Math.max(...slots)) * STEP) / 2;
}
