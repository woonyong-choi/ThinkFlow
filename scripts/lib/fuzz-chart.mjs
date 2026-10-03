// fuzz-layout의 차트 원본 생성기. 행 기준, 차이 차트, 0 시작 해제와 값 크기를 섞는다. 같은 씨앗은 같은 원본을 만든다.
// 차트: 행 수, 값의 크기(소수에서 수만까지), 새 문법을 쓰는 확률
const CHART_ROWS_MIN = 2;
const CHART_ROWS_SPREAD = 6;
const MAGNITUDES = [0.05, 5, 95, 1200, 45000];
const CHART_TYPES = ['bar', 'bar', 'difference', 'difference', 'line'];
const ROW_RULE_CHANCE = 0.6;
const ZERO_OFF_CHANCE = 0.6;
const ALL_ZERO_CHANCE = 0.15;
const INTERVAL_CHANCE = 0.7;
const SHARED_RULE_CHANCE = 0.4;
const NEGATIVE_BASE_CHANCE = 0.3;
const TWO_SERIES_CHANCE = 0.3;
const VALUE_DIGITS = 3;

// 값 하나. 크기는 MAGNITUDES에서 고르고 소수 VALUE_DIGITS자리로 줄인다.
const amount = (rnd, scale) => Number((rnd.next() * scale).toFixed(VALUE_DIGITS));

// 값 하나의 신뢰구간 낱말. low ≤ 값 ≤ high를 지키고, low는 floor 아래로 내려가지 않는다(막대는 0).
function intervalWords({ id, value, scale, floor }, rnd) {
  const spread = amount(rnd, scale / 10);
  const [low, high] = [Math.max(floor ?? -Infinity, value - spread), value + spread].map((v) => Number(v.toFixed(VALUE_DIGITS)));
  return rnd.next() < INTERVAL_CHANCE ? ` ${id}.low=${Math.min(low, value)} ${id}.high=${Math.max(high, value)}` : '';
}

// 막대 차트: 행마다 값, 신뢰구간, 가끔 행 기준(`rule=값`)과 공통 기준선을 섞는다. 계열은 가끔 둘이다.
function randomBar(rnd, scale) {
  const ids = rnd.next() < TWO_SERIES_CHANCE ? ['a', 'b'] : ['a'];
  const lines = ['chart bar', 'x "비율(%)"', ...ids.map((id) => `series ${id} "계열 ${id}"`)];
  if (rnd.next() < SHARED_RULE_CHANCE) lines.push(`rule ${amount(rnd, scale)} "공통"`);
  for (let i = 0; i < CHART_ROWS_MIN + rnd.int(CHART_ROWS_SPREAD); i++) {
    const values = ids.map((id) => ({ id, value: amount(rnd, scale) }));
    const rule = rnd.next() < ROW_RULE_CHANCE ? ` rule=${amount(rnd, scale)}` : '';
    lines.push(`row "행${i}" ${values.map(({ id, value }) => `${id}=${value}${intervalWords({ id, value, scale, floor: 0 }, rnd)}`).join(' ')}${rule}`);
  }
  return lines;
}

// 차이 차트: 부호가 섞인 값과 신뢰구간, 가끔 모두 0인 값과 음수 기준선
function randomDifference(rnd, scale) {
  const isFlat = rnd.next() < ALL_ZERO_CHANCE;
  const lines = ['chart difference', 'x "차이(%p)"', 'series d "차이"'];
  if (rnd.next() < SHARED_RULE_CHANCE) lines.push(`rule ${-amount(rnd, scale)} "기준선"`);
  for (let i = 0; i < CHART_ROWS_MIN + rnd.int(CHART_ROWS_SPREAD); i++) {
    const value = isFlat ? 0 : Number((amount(rnd, scale) - amount(rnd, scale)).toFixed(VALUE_DIGITS));
    lines.push(`row "행${i}" d=${value}${isFlat ? ' d.low=0 d.high=0' : intervalWords({ id: 'd', value, scale }, rnd)}`);
  }
  return lines;
}

// 선 차트: 가끔 `zero off`를 쓰고, 값 범위를 0 근처 밖(음수 포함)에 둔다. 기준선은 값 범위 안팎을 오간다.
function randomLine(rnd, scale) {
  const base = amount(rnd, scale) * (rnd.next() < NEGATIVE_BASE_CHANCE ? -1 : 1);
  const lines = ['chart line', 'y "값(%)"', ...(rnd.next() < ZERO_OFF_CHANCE ? ['zero off'] : []), 'series a "A"'];
  if (rnd.next() < SHARED_RULE_CHANCE) lines.push(`rule ${Number((base + amount(rnd, scale / 10)).toFixed(VALUE_DIGITS))} "목표"`);
  for (let i = 0; i < CHART_ROWS_MIN + rnd.int(CHART_ROWS_SPREAD * 5); i++) {
    const value = Number((base + amount(rnd, scale / 10)).toFixed(VALUE_DIGITS));
    lines.push(`point x=${(i + 1) * 100} a=${value}${intervalWords({ id: 'a', value, scale }, rnd)}`);
  }
  return lines;
}

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 행 수
// basis: estimate
// 차트 원본 하나. 종류와 값 크기를 섞어 행 기준, 차이 차트, 0 시작 해제와 기준선 라벨 자리를 시험한다.
export function randomChart(rnd) {
  const builders = { bar: randomBar, difference: randomDifference, line: randomLine };
  return builders[rnd.pick(CHART_TYPES)](rnd, rnd.pick(MAGNITUDES)).join('\n');
}
