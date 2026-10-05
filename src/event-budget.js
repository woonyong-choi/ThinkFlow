// 조건과 대기의 이벤트 예산 사전 검사와 끝나지 않는 대기의 경고. 이벤트 처리 자체는 flow-events.js다(docs/design/playback.md 이벤트 예산, 대기가 끝나는 때).
import { eventBudgetError } from './budget.js';
import { departureCount } from './timeline-flow.js';
import { values } from './tokens.js';

const FLOW_STEP_MS = values.duration['flow-step'];

// cost: time O(s·t), heap O(1), stack O(1)
// vars: s = 조건을 쓴 단계 수, t = 단계의 흐름과 이동 수
// basis: estimate
/**
 * 문장으로 개수가 정해지는 이벤트(출발과 그 도착)의 합계를 시간표를 만들기 전에 세어 `events` 예산을 넘으면 막는다. 조건을 쓰지 않는 그림은 세지 않는다.
 * 합계는 출발 수에 (1 + 경로의 도형 수)를 곱해 구하고, `when`으로 건너뛸 출발도 센다. 박자 이동은 출발 하나에 도형 둘이다. 합계가 처음 한도를 넘는 줄에 오류를 붙인다.
 * 대기 평가, 해제, 참조 값 갱신처럼 동적으로 생기는 이벤트는 이벤트 처리가 추가하기 직전에 검사한다.
 * @throws FigureError `budget-exceeded`
 */
export function checkEventBudget(figure, limits) {
  if (!figure.hasConditions) return;
  let total = 0;
  let over;
  for (const step of figure.steps.filter((s) => s.hasConditions)) {
    const items = [
      ...step.beats.flatMap((beat) => beat.hops.map((hop) => ({ line: hop.line, events: 3 + (hop.condition?.reserve ? 1 : 0) }))),
      ...step.tracks.map((track) => ({ line: track.line, events: departureCount(track, step.forMs ?? FLOW_STEP_MS) * (1 + track.path.length + (track.condition?.reserve ? 1 : 0)) })),
    ];
    for (const item of items) {
      total += item.events;
      over ??= total > limits.events ? item.line : undefined;
    }
  }
  if (over !== undefined) throw eventBudgetError('events', limits.events, { line: over, needed: total });
}

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 조건이 읽는 값 수
// basis: estimate
// 읽은 값 하나의 설명: 지금 글과 마지막으로 쓴 줄과 시각
function describeRef(ref, figure) {
  const isDeclared = figure.values.some((v) => v.id === ref.id && v.line === ref.line);
  return `${ref.id} is "${ref.text}" (${isDeclared ? `declared on line ${ref.line}` : `set by line ${ref.line} at ${Number(ref.at.toFixed(3))}ms`})`;
}

// cost: time O(s·r), heap O(s), stack O(1)
// vars: s = 끝나지 않는 대기 수, r = 조건이 읽는 값 수
// basis: estimate
/**
 * 끝나지 않는 대기(`stalls`)마다 경고 `wait-stalled`를 낸다. `stuck`이 있는 대기는 경고 없이 `stalls`에만 남는다.
 * 메시지는 대기한 이동, 조건, 읽은 값의 글과 마지막으로 쓴 줄을 적는다.
 */
export function warnStalls(figure, timeline, problems) {
  for (const stall of timeline.stalls ?? []) {
    if (stall.stuck) continue;
    const reasons = stall.refs.map((ref) => describeRef(ref, figure)).join(' and ');
    problems.warn(stall.line, `wait on "${stall.move}" can never be released: ${stall.cond} is false because ${reasons}. Add timeout=, or mark the wait with stuck if it is intended`, { code: 'wait-stalled' });
  }
}
