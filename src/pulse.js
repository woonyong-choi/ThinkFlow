// 갱신 펄스. 값이나 차트 표식이 바뀌거나 점이 도형에 닿은 시각(at)부터 400ms 동안 80ms 올라가고, 80ms 머물고, 240ms 내려온다. 재생 속도와 상관없이 화면 시간(ms)이다.
// 같은 대상의 펄스가 겹치면 합하지 않고 가장 센 값을 쓴다(max). 앞 펄스를 뒤 펄스가 자르지 않는다. 시간표의 논리 시각은 펄스가 바꾸지 않는다.
// 장면의 한 바퀴(표시 길이)는 마지막 펄스가 끝날 때까지 보여 준다: 컴파일러가 장면마다 한 번 정하고(timeline-marks.js presentationOf) 재생기와 SVG가 같은 값을 읽는다.
import { values } from './vendor/theme/tokens.js';

/** 펄스 세 구간(화면 ms): 올라감, 머묾, 내려감. 토큰 duration.effect-rise, effect-hold, effect-decay다. */
export const PULSE = Object.freeze({ rise: values.duration['effect-rise'], hold: values.duration['effect-hold'], fall: values.duration['effect-decay'] });
/** 펄스 하나가 보이는 전체 길이(화면 ms) */
export const PULSE_MS = PULSE.rise + PULSE.hold + PULSE.fall;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 펄스 하나의 세기(0에서 1). elapsed는 펄스가 시작한 뒤 흐른 화면 ms다. 시작 전이나 끝난 뒤는 0이다.
function pulseLevel(elapsed) {
  if (elapsed < 0 || elapsed >= PULSE_MS) return 0;
  if (elapsed < PULSE.rise) return elapsed / PULSE.rise;
  if (elapsed < PULSE.rise + PULSE.hold) return 1;
  return 1 - (elapsed - PULSE.rise - PULSE.hold) / PULSE.fall;
}

// cost: time O(p²), heap O(p), stack O(1)
// vars: p = 같은 대상의 펄스 수
// basis: estimate
/**
 * 한 대상의 펄스 세기를 시각 순 꺾은선의 꼭짓점 [화면 ms, 세기]로 바꾼다. 펄스마다 세기가 꺾이는 시각과, 겹친 펄스의 세기가 엇갈리는 시각을 꼭짓점으로 두고 처음(0)과 끝(durationMs)을 더한다.
 * 겹친 펄스는 가장 센 값을 따르므로(max) 꼭짓점 사이는 직선이다.
 * @param starts 펄스 시작 화면 시각(ms) 목록
 * @param durationMs 한 바퀴 화면 길이
 */
export function envelopeKeys(starts, durationMs) {
  const level = (t) => Math.max(0, ...starts.map((s) => pulseLevel(t - s)));
  const bends = starts.flatMap((s) => [s, s + PULSE.rise, s + PULSE.rise + PULSE.hold, s + PULSE_MS]);
  const base = [...new Set([0, durationMs, ...bends.filter((t) => t > 0 && t < durationMs)])].sort((a, b) => a - b);
  // 꼭짓점 사이에서는 펄스마다 세기가 직선이다. 두 직선이 구간 안에서 만나는 시각도 꼭짓점이 된다.
  const crossings = base.slice(1).flatMap((end, i) => {
    const start = base[i];
    const lines = starts.map((s) => ({ v: level1(start - s, 1), slope: (level1(end - s, -1) - level1(start - s, 1)) / (end - start) }));
    return lines.flatMap((a, x) => lines.slice(x + 1).flatMap((b) => {
      if (a.slope === b.slope) return [];
      const at = (b.v - a.v) / (a.slope - b.slope);
      return at > 0 && at < end - start ? [start + at] : [];
    }));
  });
  return [...new Set([...base, ...crossings])].sort((a, b) => a - b).map((t) => [t, level(t)]);
}

// 꼭짓점 경계에서 한쪽 값. side가 1이면 구간 시작 쪽, -1이면 구간 끝 쪽 극한이다(꺾이는 곳에서 직선의 기울기를 구간 안쪽 값으로 읽기 위해서다).
function level1(elapsed, side) {
  return pulseLevel(elapsed + side * 1e-9);
}
