// 출력에 쓰는 숫자 서식. 좌표, 경로, keyTimes, 퍼센트, 크기, 재생기 데이터가 모두 여기서 정한 자릿수로 줄어서 나간다.
// 계산 중간 값은 줄이지 않는다. 줄이는 곳은 글로 쓰기 직전뿐이다.
// 실행 환경(Node 버전)마다 Math 함수의 마지막 자리가 달라도 같은 글이 나오도록, 자르기 전에 계산 오차를 먼저 걷어 낸다.

/** 출력 숫자의 소수 자릿수. coord는 좌표와 크기, ratio는 keyTimes, 퍼센트, 경로 비율, 재생기 데이터다. */
export const DIGITS = { coord: 1, ratio: 5 };

// 반올림 전에 걷어 내는 계산 오차의 자릿수(절대값). 1e-9보다 작은 흔들림은 같은 값이 된다.
const NOISE_DIGITS = 9;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** value를 소수 digits자리로 반올림한다. 반올림 경계(12.25 등)가 1e-12 위아래 어느 쪽이어도 같은 값이고(걷어 낸 값이 하나로 정해지고 toFixed가 그 값을 자른다), -0은 0이다. */
export function roundTo(value, digits) {
  if (!Number.isFinite(value)) return value;
  const rounded = Number(Number(value.toFixed(NOISE_DIGITS)).toFixed(digits));
  return rounded === 0 ? 0 : rounded;
}

/** 좌표, 너비, 높이, 반지름 같은 화면 길이. */
export const coord = (value) => roundTo(value, DIGITS.coord);

/** keyTimes, keyPoints, 경로 비율 같은 비율. */
export const ratio = (value) => roundTo(value, DIGITS.ratio);

/** 퍼센트 글(`12.5%`). fraction은 0에서 1까지의 비율이다. */
export const percentText = (fraction) => `${roundTo(fraction * 100, DIGITS.ratio - 2)}%`;

// cost: time O(n), heap O(n), stack O(d)
// vars: n = 값 수, d = 중첩 깊이
// basis: estimate
/** JSON.stringify에 넘기는 replacer. 숫자를 ratio 자릿수로 줄인다. 재생기 데이터가 HTML에 들어갈 때 쓴다. */
export const roundedNumbers = (_key, value) => (typeof value === 'number' ? ratio(value) : value);
