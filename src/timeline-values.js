// 값 바꾸기(`on` 줄과 `set=`)를 시각 순서로 적용해 값 줄마다 값이 바뀌는 시각과 새 값을 구한다. 박자 단계와 흐름 단계가 같은 규칙을 쓴다(docs/design/playback.md 값 변화).
import { arrivalOffsetMs } from './easing.js';
import { isPassed } from './lost.js';
import { FigureError, makeDiagnostic } from './source/problems.js';
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
// 실행 때 값 종류가 맞지 않는 식의 오류(`value-type`). 줄은 그 식을 쓴 줄이다.
function typeError(e, message) {
  return new FigureError([makeDiagnostic({ severity: 'error', line: e.line, message }, { code: 'value-type' })]);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 읽기 식과 합 식이 있는 갱신의 식 하나를 적용한 새 값 글. 읽기 식은 갱신을 시작하는 시점에 읽어 둔 글(reads)을 쓴다.
// 큐는 정수만 받고, 낱말을 담은 값에 합을 하는 식은 실행 때 `value-type` 오류다(읽기 식이 낱말을 옮겨 올 수 있어 읽을 때 다 걸러내지 못한다).
function applyChecked(e, { state, reads, byId }) {
  const isQueue = Boolean(byId.get(e.id).queue);
  if (e.op === ':=') {
    const text = reads.get(e.operand);
    if (isQueue && !(NUMBER_PATTERN.test(text) && Number.isInteger(Number(text)))) throw typeError(e, `"${e.id}" is a queue and counts filled slots in whole numbers, but "${e.operand}" holds "${text}". Read a whole number into a queue`);
    return text;
  }
  const next = applyExpression(e, state);
  if (next === undefined) throw typeError(e, `"${e.id}${e.op}${e.operand}" does a sum, but "${e.id}" holds the word "${state.get(e.id)}". Use = to set a word`);
  return next;
}

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 갱신의 식 수
// basis: estimate
// 갱신 하나(같은 순간에 같은 줄이 적용하는 식 목록). 읽기 식의 원천은 갱신을 시작하는 시점의 값으로 한꺼번에 읽어 두고, 그 뒤에 식을 적은 순서대로 쓴다. 그래서 `a:=b, b:=a`는 맞바꿈이다.
export function runUpdate(exprs, { state, textOf, byId, onWrite }) {
  const reads = new Map(exprs.filter((e) => e.op === ':=').map((e) => [e.operand, textOf(e.operand)]));
  for (const e of exprs) {
    const next = applyChecked(e, { state, reads, byId });
    if (onWrite && next !== state.get(e.id)) onWrite(e);
    state.set(e.id, next);
  }
}

// cost: time O(e + v), heap O(v), stack O(1)
// vars: e = 갱신의 식 수, v = 값 수
// basis: estimate
/**
 * 예약(`reserve=`)의 식 목록을 한 번에 적용하거나 하나도 적용하지 않는다. 식을 복사본에 먼저 적용해 읽기, 종류 검사, 합 계산이 하나라도 실패하면(`value-type` 오류) state를 건드리지 않고 그 오류를 던진다.
 * 모두 성공하면 바뀌는 값마다 onWrite를 한 번 부르고 복사본을 state에 반영한다. 읽기 식의 원천은 runUpdate와 같이 갱신을 시작하는 시점의 값이다.
 * @returns 바뀐 값 이름(참조를 따라간 처음 값)의 목록
 */
export function runAtomicUpdate(exprs, { state, byId, onWrite }) {
  const draft = new Map(state);
  runUpdate(exprs, { state: draft, textOf: (id) => draft.get(rootOf(byId, id)), byId });
  const changed = new Map(exprs.filter((e) => draft.get(e.id) !== state.get(e.id)).map((e) => [e.id, e]));
  for (const e of changed.values()) onWrite?.(e);
  for (const id of changed.keys()) state.set(id, draft.get(id));
  return [...changed.keys()];
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

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 두 이벤트가 한 갱신인지: 같은 시각에 같은 `on` 줄(같은 도착)이나 같은 `set=`가 적용하는 식이다.
const isSameUpdate = (a, b) => a.t === b.t && a.order[0] === b.order[0] && a.order[1] === b.order[1] && a.order[2] === b.order[2];

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 값이 바뀌는 횟수
// basis: estimate
// 값 줄이 보이는 동안 글이 바뀌는 구간 [시작, 끝, 글]과, 바뀌는 순간마다 value-flash 동안 밝히는 구간(겹치면 하나로 잇는다). SVG와 재생기가 읽기만 한다.
export function spansOf(row) {
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

// cost: time O(w), heap O(1), stack O(1)
// vars: w = 값 수
// basis: estimate
/**
 * 시각 t에 값이 바뀐 줄마다 변화 [t, 글]을 적는다. isMerged면 같은 시각에 이어진 갱신이 값 줄에 보이는 것은 그 시각의 마지막 글 하나이고, 앞서 바뀐 글로 되돌아오면 바뀐 것이 아니다.
 * 시간표의 값 줄(valueRows)과 이벤트 처리(flow-events.js)가 같이 쓴다.
 */
export function noteRowChanges(rows, textOf, { t, isMerged }) {
  for (const row of rows) {
    const text = textOf(row.id);
    const last = row.changes.at(-1);
    if (isMerged && last?.[0] === t) {
      if (text === (row.changes.at(-2)?.[1] ?? row.initial)) row.changes.pop();
      else last[1] = text;
    } else if (text !== (last?.[1] ?? row.initial)) row.changes.push([t, text]);
  }
}

// cost: time O(e·(log e + w)), heap O(e + w), stack O(1)
// vars: e = 이벤트 수, w = 값 수
// basis: estimate
/**
 * 단계 하나의 값 줄. 단계가 시작할 때 모든 값이 from으로 돌아가고(`keep`한 값은 앞 단계가 끝난 값에서 시작하고, 단계 `set=` 재설정이 그 위에 적용된다), 이벤트를 닿는 시각 순서로 적용한다. 단계가 끝난 뒤에 닿는 점은 값을 바꾸지 못한다.
 * 참조 값은 가리키는 값이 바뀌는 같은 시각에 같은 글로 바뀐다. 글이 그대로면 바뀐 것이 아니라 변화를 적지 않는다.
 * 읽기 식(`:=`)이 있는 단계만 같은 갱신의 식을 묶어 읽고 쓴다. 읽기 식이 없는 단계는 같은 원본 안에서도 식 하나씩 적용하는 옛 경로 그대로다.
 * @param moves 식이 있는 이동과 흐름 { start, ms, nodes, fracs, sets, pace?, lost? }. start는 그림 전체 시각(ms), fracs는 nodes가 경로 길이의 어느 비율에 있는지, pace는 구간별 이동 시간 꺾은선, lost는 사라지는 경로 비율이다
 * @param span { si, t0, t1 }. 단계 번호와 단계의 시작과 끝 시각
 * @param start 단계 시작 값 { keep, carried, sets }. keep은 유지할 값 이름, carried는 앞 단계가 끝난 값 { 이름 → 글 }, sets는 단계 `set=` 식이다. keep도 set도 없는 단계는 넘기지 않는다
 * @param writers 값을 마지막으로 쓴 줄을 적을 그릇(Map: 값 이름 → { line, at, isSet }). 조건을 쓰는 그림만 넘기고, 교착 설명(`stalls`)이 읽는다
 * @returns { si, id, node, t0, t1, initial, changes, periods, flashes, slots? }[]. 선언한 값마다 하나다. slots는 큐의 칸 수다
 * @throws FigureError 읽기 식이 큐에 정수가 아닌 글을 넣거나 낱말을 담은 값에 합을 하면 `value-type` 오류
 */
export function valueRows(figure, { moves, span, start, writers }) {
  const byId = valueTable(figure);
  const state = new Map(figure.values.filter((v) => v.ref === undefined).map((v) => [v.id, v.from]));
  const textOf = (id) => state.get(rootOf(byId, id));
  if (writers) resetWriters(figure, { writers, span, keep: start?.keep });
  if (start) startValues(start, { state, textOf, byId, onWrite: writers && ((e) => writers.set(rootOf(byId, e.id), { line: e.line, at: span.t0, isSet: true })) });
  const rows = figure.values.map((v) => ({ si: span.si, id: v.id, node: v.on, t0: span.t0, t1: span.t1, initial: textOf(v.id), changes: [], ...(v.queue ? { slots: v.slots } : {}) }));
  const events = moves.flatMap((move, mi) => [...arrivalEvents(move, mi, figure.arrivals), ...setEvents(move, mi)]).filter((ev) => ev.t <= span.t1).sort(compareEvents);
  const noteChanges = (t, { isMerged }) => noteRowChanges(rows, textOf, { t, isMerged });
  // 읽기 식이 있는 단계만 갱신 단위로 읽고 쓴다. 읽기 식이 없는 단계는 같은 원본의 다른 단계가 읽기 식을 써도 식 하나씩 적용하는 옛 경로 그대로다.
  if (figure.hasRead && events.some((ev) => ev.e.op === ':=')) {
    for (let from = 0, to = 1; from < events.length; from = to, to = from + 1) {
      while (to < events.length && isSameUpdate(events[from], events[to])) to++;
      runUpdate(events.slice(from, to).map((ev) => ev.e), { state, textOf, byId, onWrite: writers && ((e) => writers.set(rootOf(byId, e.id), { line: e.line, at: events[from].t, isSet: true })) });
      noteChanges(events[from].t, { isMerged: true });
    }
    return rows.map((row) => ({ ...row, ...spansOf(row) }));
  }
  for (const { t, e } of events) {
    const next = applyExpression(e, state);
    if (next === undefined || next === state.get(e.id)) continue;
    state.set(e.id, next);
    writers?.set(rootOf(byId, e.id), { line: e.line, at: t, isSet: true });
    noteChanges(t, { isMerged: false });
  }
  return rows.map((row) => ({ ...row, ...spansOf(row) }));
}

// cost: time O(k + e), heap O(e), stack O(1)
// vars: k = keep한 값 수, e = 단계 set= 식 수
// basis: estimate
// 단계의 시작 값을 정한다. keep한 값은 앞 단계가 끝난 값으로 바꾸고, 단계 `set=` 재설정은 그 위에 한 갱신으로 적용한다. 재설정은 값을 바꾸는 순간이 아니라 시작 값이라 변화로 적지 않는다.
export function startValues({ keep, carried, sets }, { state, textOf, byId, onWrite }) {
  for (const id of keep) state.set(id, carried.get(id));
  if (sets.length) runUpdate(sets, { state, textOf, byId, onWrite });
}

// cost: time O(v), heap O(1), stack O(1)
// vars: v = 값 수
// basis: estimate
/** 단계가 시작할 때 값의 마지막으로 쓴 줄을 정한다. keep한 값은 앞 단계가 남긴 기록을 그대로 두고, 나머지는 선언 줄이다. */
export function resetWriters(figure, { writers, span, keep }) {
  for (const v of figure.values.filter((value) => value.ref === undefined)) if (!keep?.includes(v.id) || !writers.has(v.id)) writers.set(v.id, { line: v.line, at: span.t0, isSet: false });
}
