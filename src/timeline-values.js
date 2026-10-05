// 값 바꾸기(`on` 줄과 `set=`)를 시각 순서로 적용해 값 줄마다 값이 바뀌는 시각과 새 값을 구한다. 박자 단계와 흐름 단계가 같은 규칙을 쓴다(docs/design/playback.md 값 변화).
import { arrivalOffsetMs } from './easing.js';
import { isPassed } from './lost.js';
import { NUMBER_PATTERN } from './source/words.js';
import { roundNumber } from './source/value.js';
import { values } from './tokens.js';
import { rootOf, valueTable } from './values.js';

const FLASH_MS = values.duration['value-flash'];

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 식 하나를 적용한 새 값 글. 숫자가 아닌 값에 합을 하는 식은 읽을 때 오류라 여기서는 오지 않는다.
function applyExpression(e, state) {
  if (e.op === '=') return e.operand;
  const sign = e.op === '-' ? -1 : 1;
  return NUMBER_PATTERN.test(state.get(e.id)) ? String(roundNumber(Number(state.get(e.id)) + sign * Number(e.operand))) : undefined;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 이벤트 하나. order는 같은 시각의 적용 순서 [종류(on 0, set 1), 이동 순번, 선언 순번, 식 순번]다.
const eventOf = (move, k, { e, order }) => ({ t: move.start + arrivalOffsetMs(move.fracs[k], move.ms, move.pace), e, order });

// cost: time O(p·a·e), heap O(p·a·e), stack O(1)
// vars: p = 경로의 도형 수, a = `on` 줄 수, e = 식 수
// basis: estimate
// 이동이 경로의 도형(출발 도형은 닿는 것이 아니라 뺀다)에 닿을 때 적용하는 `on` 줄의 이벤트. 사라지는 점(lost)은 사라지기 전에 통과한 도형에만 닿는다.
function arrivalEvents(move, mi, arrivals) {
  const events = [];
  for (let k = 1; k < move.nodes.length && isPassed(move.fracs[k], move.lost); k++) {
    arrivals.forEach((a, ai) => {
      if (a.node === move.nodes[k]) events.push(...a.sets.map((e, ei) => eventOf(move, k, { e, order: [0, mi, ai, ei] })));
    });
  }
  return events;
}

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 식 수
// basis: estimate
// 이동의 `set=` 이벤트. `@도형`이 없으면 경로의 마지막 도형에 닿을 때다. 사라지는 점(lost)이 사라지기 전에 통과하지 못한 도형의 식은 적용하지 않는다.
function setEvents(move, mi) {
  const targets = move.sets.map((e) => (e.at === undefined ? move.nodes.length - 1 : move.nodes.indexOf(e.at)));
  return move.sets.flatMap((e, ei) => (isPassed(move.fracs[targets[ei]], move.lost) ? [eventOf(move, targets[ei], { e, order: [1, mi, 0, ei] })] : []));
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 이벤트 순서: 시각, 같으면 on 앞 set 뒤, 같으면 이동 순번, 선언 순번, 식 순번.
function compareEvents(a, b) {
  return a.t - b.t || a.order.reduce((diff, part, i) => diff || part - b.order[i], 0);
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 값이 바뀌는 횟수
// basis: estimate
// 값 줄이 보이는 동안 글이 바뀌는 구간 [시작, 끝, 글]과, 바뀌는 순간마다 value-flash 동안 밝히는 구간(겹치면 하나로 잇는다). SVG와 재생기가 읽기만 한다.
function spansOf(row) {
  const marks = [[row.t0, row.initial], ...row.changes];
  const periods = marks.map(([at, text], i) => [at, marks[i + 1]?.[0] ?? row.t1, text]);
  const flashes = [];
  for (const [at] of row.changes) {
    const end = Math.min(at + FLASH_MS, row.t1);
    if (flashes.length && at <= flashes.at(-1)[1]) flashes.at(-1)[1] = end;
    else flashes.push([at, end]);
  }
  return { periods, flashes };
}

// cost: time O(e·(log e + w)), heap O(e + w), stack O(1)
// vars: e = 이벤트 수, w = 값 수
// basis: estimate
/**
 * 단계 하나의 값 줄. 단계가 시작할 때 모든 값이 from으로 돌아가고, 이벤트를 닿는 시각 순서로 적용한다. 단계가 끝난 뒤에 닿는 점은 값을 바꾸지 못한다.
 * 참조 값은 가리키는 값이 바뀌는 같은 시각에 같은 글로 바뀐다. 글이 그대로면 바뀐 것이 아니라 변화를 적지 않는다.
 * @param moves 식이 있는 이동과 흐름 { start, ms, nodes, fracs, sets, pace?, lost? }. start는 그림 전체 시각(ms), fracs는 nodes가 경로 길이의 어느 비율에 있는지, pace는 구간별 이동 시간 꺾은선, lost는 사라지는 경로 비율이다
 * @param span { si, t0, t1 }. 단계 번호와 단계의 시작과 끝 시각
 * @returns { si, id, node, t0, t1, initial, changes, periods, flashes, slots? }[]. 선언한 값마다 하나다. slots는 큐의 칸 수다
 */
export function valueRows(figure, { moves, span }) {
  const byId = valueTable(figure);
  const state = new Map(figure.values.filter((v) => v.ref === undefined).map((v) => [v.id, v.from]));
  const textOf = (id) => state.get(rootOf(byId, id));
  const rows = figure.values.map((v) => ({ si: span.si, id: v.id, node: v.on, t0: span.t0, t1: span.t1, initial: textOf(v.id), changes: [], ...(v.queue ? { slots: v.slots } : {}) }));
  const events = moves.flatMap((move, mi) => [...arrivalEvents(move, mi, figure.arrivals), ...setEvents(move, mi)]).filter((ev) => ev.t <= span.t1);
  for (const { t, e } of events.sort(compareEvents)) {
    const next = applyExpression(e, state);
    if (next === undefined || next === state.get(e.id)) continue;
    state.set(e.id, next);
    for (const row of rows) if (textOf(row.id) !== (row.changes.at(-1)?.[1] ?? row.initial)) row.changes.push([t, textOf(row.id)]);
  }
  return rows.map((row) => ({ ...row, ...spansOf(row) }));
}
