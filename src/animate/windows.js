// 켜짐과 꺼짐 상태를 CSS keyframes class로 바꾼다. 같은 켜짐 순서는 class 하나를 나눠 쓴다(docs/design/playback.md).
import { values } from '../tokens.js';

// 켜짐 구간 끝을 다음 구간 시작보다 이만큼(ms) 앞당긴다. 같은 퍼센트에 두 값이 겹치지 않게 하기 위해서다.
const EPSILON_MS = 0.1;
// 켜짐과 꺼짐이 바뀔 때 새 값으로 서서히 가는 시간(ms). HTML 재생기의 CSS transition(duration.fast)과 같다.
const FADE_MS = values.duration.fast;
// 설명 글과 단계 이름이 바뀔 때 앞 글이 사라지는 시간이자 뒤 글이 나타나는 시간(ms). 재생기도 같은 토큰을 읽는다.
const SWAP_MS = values.duration['caption-fade'];
// 서서히 가지 않고 구간 시작에서 한꺼번에 바뀔 때의 전환 시간(ms)
const STEP_MS = 0;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * keyframes를 만들고 class 이름을 나눠 주는 그릇.
 * @param clock createClock 결과
 * @param segs 시간표 박자 목록
 * @param css keyframes와 class 규칙을 쌓는 목록
 * @returns { windows, fadeFrames }
 */
export function createWindows(clock, segs, css) {
  const names = new Map();
  const fadeFrames = (spans, fadeMs = FADE_MS) => framesOf(spans, clock.percent, fadeMs);

  // cost: time O(b), heap O(b), stack O(1)
  // vars: b = 박자 수
  // basis: estimate
  /**
   * states[i]는 박자 i의 켜짐이다. { before, after, at }이면 박자 안 at(ms)에서 before가 after로 바뀐다.
   * 켜짐 순서와 켜짐, 꺼짐 CSS가 같으면 같은 class 이름을 돌려준다.
   * @param css { on, off, isSwap, isStep }. 켜짐일 때와 꺼짐일 때의 CSS 선언. isSwap이면 앞 글이 다 사라진 뒤 이 글이 나타난다(순차 페이드). isStep이면 서서히 가지 않고 구간 시작에서 한꺼번에 바뀐다
   */
  function windows(states, { on: onCss, off: offCss, isSwap = false, isStep = false }) {
    const flat = spansOf(states, segs);
    const spans = isSwap ? delayEntrances(flat, SWAP_MS) : flat;
    const key = `${isSwap ? 'swap|' : ''}${isStep ? 'step|' : ''}${onCss}|${offCss}|${spans.map(([start, , on]) => `${Math.round(start)}${on ? 1 : 0}`).join('')}`;
    if (!names.has(key)) {
      const name = `a${names.size}`;
      names.set(key, name);
      const frames = fadeFrames(spans.map(([start, end, on]) => [start, end, on ? onCss : offCss]), fadeOf({ isSwap, isStep }));
      css.push(`@keyframes ${name} { ${frames} }\n.fl .${name} { animation: ${name} ${clock.duration} infinite linear; }`);
    }
    return names.get(key);
  }

  return { windows, fadeFrames };
}

// 전환 방식에 따른 서서히 가는 시간(ms)
function fadeOf({ isSwap, isStep }) {
  if (isStep) return STEP_MS;
  return isSwap ? SWAP_MS : FADE_MS;
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 구간 수
// basis: estimate
// 구간 [시작, 끝, CSS] 목록을 keyframes 본문으로. 앞 구간과 값이 다르면 구간 시작에서 앞 값을 잡고 fadeMs 동안 새 값으로 서서히 간다(재생기의 transition과 같다).
// 한 바퀴의 첫 구간은 이전 값이 없어 바로 시작한다.
function framesOf(spans, percent, fadeMs) {
  return spans
    .map(([start, end, value], i) => {
      const last = Math.max(start, end - EPSILON_MS);
      const settle = Math.min(start + fadeMs, last);
      if (i === 0 || spans[i - 1][2] === value || settle <= start) return `${percent(start)},${percent(last)} { ${value} }`;
      return `${percent(start)} { ${spans[i - 1][2]} } ${percent(settle)},${percent(last)} { ${value} }`;
    })
    .join(' ');
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 박자 수
// basis: estimate
// 박자별 켜짐을 [시작, 끝, 켜짐] 구간으로. 박자 안에서 켜짐이 바뀌면 그 박자는 두 구간이다.
function spansOf(states, segs) {
  return segs.flatMap((s, i) => {
    const st = typeof states[i] === 'object' ? states[i] : { before: states[i], after: states[i], at: 0 };
    const at = s.t0 + st.at;
    return st.at > 0 && st.before !== st.after ? [[s.t0, at, st.before], [at, s.t1, st.after]] : [[s.t0, s.t1, st.after]];
  });
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 구간 수
// basis: estimate
// 꺼짐에서 켜짐으로 바뀌는 구간의 시작을 delay(ms) 늦추고, 앞 꺼짐 구간을 그만큼 늘린다. 한 바퀴의 첫 구간은 이전 값이 없어 그대로 둔다.
function delayEntrances(spans, delay) {
  const isEntrance = (i) => i > 0 && spans[i][2] && !spans[i - 1][2];
  return spans.map(([start, end, on], i) => [isEntrance(i) ? Math.min(start + delay, end) : start, i + 1 < spans.length && isEntrance(i + 1) ? Math.min(spans[i + 1][0] + delay, spans[i + 1][1]) : end, on]);
}
