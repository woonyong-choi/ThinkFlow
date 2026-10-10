// 움직이는 SVG의 한 바퀴 시계. 점, 켜짐 keyframes, 차트가 모두 이 시계의 길이와 비율 계산 하나를 쓴다.
// 시계는 장면의 논리 ms를 재생 속도(speed)로 나눈 화면 길이로 돌고, 반복 방식(mode)에 따라 SMIL과 CSS의 반복 표기를 한 곳에서 정한다.
import { percentText, ratio } from '../format.js';

const MS_PER_SECOND = 1000;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 한 바퀴 시계를 만든다. 한 바퀴의 화면 길이는 장면의 논리 길이를 speed로 나눈 값을 1ms 단위로 반올림한 값이다(0.1초로 반올림하면 퍼센트와 keyTimes가 어긋난 채 반복된다).
 * 마지막 펄스가 끝날 때까지 보여 주려고 화면 길이가 더 필요하면 displayMs로 넘긴다. 논리 시각 ms는 늘 speed로 나눈 화면 시각에 놓인다.
 * @param total 시간표의 한 바퀴 논리 길이(ms)
 * @param options { speed, mode, displayMs }. mode는 'loop'(되풀이), 'once'(한 번 재생하고 마지막 상태에 머묾), 'static'(재생 없이 마지막 상태). displayMs는 화면 길이(ms)로, 생략하면 total / speed다
 * @returns { duration, durationMs, total, mode, speed, smil, css, keyTime, percent }. total은 장면의 논리 길이(ms)다. smil과 css는 SMIL 요소와 CSS animation의 반복 표기다
 */
export function createClock(total, { speed = 1, mode = 'loop', displayMs } = {}) {
  const durationMs = Math.round(displayMs ?? total / speed);
  const display = (ms) => ms / speed / durationMs;
  const isLoop = mode === 'loop';
  return {
    duration: `${durationMs / MS_PER_SECOND}s`,
    durationMs,
    total,
    mode,
    speed,
    smil: isLoop ? 'repeatCount="indefinite"' : 'repeatCount="1" fill="freeze"',
    css: isLoop ? 'infinite' : '1 forwards',
    keyTime: (ms) => ratio(display(ms)),
    percent: (ms) => percentText(display(ms)),
  };
}
