// 작은 몫 묶기: 원·도넛 조각과 누적·퍼센트 계열 가운데 작은 것을 "기타" 하나로 읽게 한다.
// 묶인 항목도 자기 표식(조각, 막대 조각)과 행·계열 묶음(`cr-k`, `cs-i`)을 그대로 가진다. 그래서 장면의 밝히기·드러내기와 프레임 구조는 바뀌지 않고,
// 칠만 중립색으로 같아지고 이름 글은 "기타" 하나가 맡는다. 값에 묶인 차트(프레임마다 값이 달라지는 차트)는 묶지 않는다. 묶음이 프레임마다 달라지면 범례와 이름 글의 구조가 흔들리기 때문이다.
import { tokens } from '@woonyong-choi/design-tokens/tokens.js';
import { PALETTE, categoryPaint } from '../chart-palette.js';
import { COPY } from './copy.js';

/** 묶음의 이름 */
export const OTHER = COPY.other;

// 전체에서 차지하는 몫이 이보다 작으면 묶음 후보다. 색 수(1판 팔레트 길이)를 넘는 항목은 몫과 상관없이 작은 쪽부터 묶어 무늬가 생기지 않게 한다.
const SMALL_SHARE = 0.05;

/** 기타 묶음의 칠. 데이터의 중립 역할(기준값과 같은 회색 면)이고 글자는 본문 글자색이다. */
export const OTHER_PAINT = Object.freeze({
  index: -1,
  tier: 0,
  family: 'other',
  fill: tokens.color.data.reference,
  border: tokens.color.data.reference,
  on: tokens.color.ink,
  ink: tokens.color['ui-muted'],
  effect: tokens.color.data.reference,
  tint: tokens.color.data.reference,
  pattern: 'solid',
  spacing: 1,
  shape: 'circle',
  needsLabel: false,
});

// cost: time O(n·log n), heap O(n), stack O(1)
// vars: n = 항목 수
// basis: estimate
/**
 * 묶을 항목 번호 집합. sizes[k]는 항목 k의 크기(0 이상)다.
 * 몫이 SMALL_SHARE보다 작은 항목과, 색 수를 넘는 꼬리(작은 쪽부터)를 묶는다. 묶일 항목이 둘 미만이면 묶지 않는다(하나만 "기타"로 바꾸면 이름만 잃는다).
 * 값이 0인 항목은 그릴 것이 없어 묶지도 이름을 적지도 않는다.
 */
export function smallGroup(sizes, { isBound = false } = {}) {
  if (isBound) return new Set();
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (!(total > 0)) return new Set();
  const present = sizes.map((size, k) => ({ size, k })).filter(({ size }) => size > 0).sort((a, b) => b.size - a.size || a.k - b.k);
  // 묶으면 기타가 색 하나를 쓰므로 이름이 남는 항목은 색 수보다 하나 적다.
  const keep = PALETTE.length - 1;
  const grouped = present.filter(({ size }, rank) => size / total < SMALL_SHARE || (present.length > PALETTE.length && rank >= keep)).map(({ k }) => k);
  return grouped.length >= 2 ? new Set(grouped) : new Set();
}

// cost: time O(r·s), heap O(s), stack O(1)
// vars: r = 행 수, s = 계열 수
// basis: estimate
/**
 * 누적·퍼센트 막대에서 기타로 묶을 계열 번호 집합. 계열 크기는 퍼센트면 행마다의 몫(행 합으로 나눈 값)의 합, 누적이면 절댓값의 합이다.
 * 범례와 조각 그리기가 같은 결과를 읽는다. 그 밖의 종류는 묶지 않는다.
 */
export function groupedSeries(chart, chartType) {
  if (chartType !== 'stacked' && chartType !== 'percent') return new Set();
  const ids = chart.series.map((s) => s.id);
  const rows = chart.rows.map((row) => ids.map((id) => row.values[id])).filter((list) => list.every((v) => typeof v === 'number' && Number.isFinite(v)));
  const sizes = ids.map((_, i) => rows.reduce((sum, list) => {
    if (chartType === 'stacked') return sum + Math.abs(list[i]);
    const total = list.reduce((a, b) => a + b, 0);
    return total > 0 ? sum + list[i] / total : sum;
  }, 0));
  return smallGroup(sizes, { isBound: Boolean(chart.markIds) });
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 항목 수
// basis: estimate
/**
 * 항목 k의 칠. 묶인 항목은 기타 칠이고, 묶음이 있으면 남은 항목이 그 순서대로 범주 색을 앞에서부터 받아 무늬 층으로 넘어가지 않는다.
 * 묶음이 없으면 fallback(종류의 기본 칠)이다.
 */
export function memberPaint(k, grouped, fallback) {
  if (grouped.has(k)) return OTHER_PAINT;
  if (!grouped.size) return fallback(k);
  let rank = 0;
  for (let j = 0; j < k; j += 1) if (!grouped.has(j)) rank += 1;
  return categoryPaint(rank);
}

// cost: time O(s log s), heap O(s), stack O(1)
// vars: s = 항목 수
// basis: estimate
/** 쌓는 순서: 묶이지 않은 항목(원본 순서) 뒤에 묶인 항목이 이어져 기타가 한 덩어리로 놓인다. */
export const stackOrder = (count, grouped) => [...Array(count).keys()].sort((a, b) => Number(grouped.has(a)) - Number(grouped.has(b)) || a - b);
