// 움직이는 SVG의 한 바퀴 시계. 점, 켜짐 keyframes, 차트가 모두 이 시계의 길이와 비율 계산 하나를 쓴다.

// keyTimes와 퍼센트를 자르는 소수 자릿수(10^5)
const PRECISION = 100000;
const MS_PER_SECOND = 1000;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 한 바퀴 시계를 만든다. 한 바퀴 길이는 시간표 total 그대로(1ms 단위)다. 0.1초로 반올림하면 퍼센트와 keyTimes가 어긋난 채 반복된다.
 * @param total 시간표의 한 바퀴 길이(ms)
 * @returns { duration, keyTime, percent }. keyTime은 SMIL keyTimes(한 바퀴를 0에서 1로 본 비율)이고, 같은 값끼리 같은 시각이어야 해서 모든 점 요소가 이 함수 하나를 쓴다. percent는 CSS keyframes 퍼센트다.
 */
export function createClock(total) {
  return {
    duration: `${Math.round(total) / MS_PER_SECOND}s`,
    keyTime: (ms) => Math.round((ms / total) * PRECISION) / PRECISION,
    percent: (ms) => `${Math.round((ms / total) * PRECISION) / (PRECISION / 100)}%`,
  };
}
