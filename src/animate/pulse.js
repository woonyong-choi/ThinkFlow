// 갱신 펄스의 SMIL. 같은 대상의 펄스를 하나의 불투명도 꺾은선으로 합친다(가장 센 값, 합하지 않는다). 펄스 길이는 재생 속도와 상관없는 화면 ms다.
import { ratio } from '../format.js';
import { envelopeKeys } from '../pulse.js';

// cost: time O(p²), heap O(p), stack O(1)
// vars: p = 같은 대상의 펄스 수
// basis: estimate
/**
 * 불투명도 꺾은선 SMIL 요소. 펄스가 없는 시간은 0이고 펄스 동안 0에서 1 사이로 올라갔다 내려온다.
 * @param clock createClock 결과
 * @param ats 그 대상의 펄스 시작 시각(장면 기준 논리 ms). 화면 시각은 speed로 나눈 값이다
 * @returns 펄스가 없으면 빈 글
 */
export function pulseAnimate(clock, ats) {
  if (!ats.length || clock.mode === 'static') return '';
  const keys = envelopeKeys(ats.map((at) => at / clock.speed), clock.durationMs);
  return `<animate attributeName="opacity" dur="${clock.duration}" ${clock.smil} calcMode="linear" keyTimes="${keys.map(([t]) => ratio(t / clock.durationMs)).join(';')}" values="${keys.map(([, level]) => ratio(level)).join(';')}"/>`;
}
