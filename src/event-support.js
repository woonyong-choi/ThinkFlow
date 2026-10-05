// 조건과 대기의 이벤트 처리(flow-events.js)가 쓰는 도우미: 시각 순으로 꺼내는 힙, 값 종류 오류, 단계가 읽기 식을 쓰는지.
import { isPassed } from './lost.js';
import { FigureError, makeDiagnostic } from './source/problems.js';
import { TIME_LIMIT_MS } from './source/values.js';

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 키 길이(6)
// basis: estimate
// 키 [시각, 순서…]의 사전 순으로 앞서는지
const isBefore = (a, b) => {
  for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return a.key[i] < b.key[i];
  return false;
};

/** 이벤트를 키 [시각, 순위, 순서…]순으로 꺼내는 힙. 같은 키는 넣은 차례를 보장하지 않으므로 키가 순서를 모두 정해야 한다. */
export class EventHeap {
  items = [];

  get size() {
    return this.items.length;
  }

  // cost: time O(1), heap O(1), stack O(1)
  // basis: estimate
  /** 가장 앞선 이벤트. 비어 있으면 undefined다. */
  peek() {
    return this.items[0];
  }

  // cost: time O(log n), heap O(1), stack O(1)
  // vars: n = 힙의 이벤트 수
  // basis: estimate
  /** 이벤트를 넣는다. */
  push(item) {
    const { items } = this;
    items.push(item);
    for (let i = items.length - 1, parent = (i - 1) >> 1; i > 0 && isBefore(items[i], items[parent]); i = parent, parent = (i - 1) >> 1) [items[i], items[parent]] = [items[parent], items[i]];
  }

  // cost: time O(log n), heap O(1), stack O(1)
  // vars: n = 힙의 이벤트 수
  // basis: estimate
  /** 가장 앞선 이벤트를 꺼낸다. */
  pop() {
    const { items } = this;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      this.sinkFirst();
    }
    return top;
  }

  // cost: time O(log n), heap O(1), stack O(1)
  // vars: n = 힙의 이벤트 수
  // basis: estimate
  // 맨 앞 이벤트를 제자리로 내린다.
  sinkFirst() {
    const { items } = this;
    for (let i = 0; ; ) {
      const children = [2 * i + 1, 2 * i + 2].filter((child) => child < items.length);
      const first = children.reduce((best, child) => (isBefore(items[child], items[best]) ? child : best), i);
      if (first === i) return;
      [items[i], items[first]] = [items[first], items[i]];
      i = first;
    }
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 값 종류가 맞지 않는 조건의 오류(`value-type`). 줄은 조건을 쓴 이동이나 흐름 줄이다. */
export function typeError(message, { line, key, text }) {
  return new FigureError([makeDiagnostic({ severity: 'error', line, message: `${key}="${text}" cannot be evaluated: ${message}` }, { code: 'value-type' })]);
}

// cost: time O(s)
// vars: s = 단계의 식 수
// basis: estimate
/** 이 단계가 읽기 식(`:=`)을 쓰는지. `on` 줄, 단계 `set=`, 이동과 흐름의 `set=`을 본다. 읽기 식이 든 단계만 갱신을 묶어 읽고 쓴다. */
export function stepReads(figure, step) {
  const has = (sets) => (sets ?? []).some((e) => e.op === ':=');
  return figure.arrivals.some((a) => has(a.sets)) || has(step.sets) || step.beats.some((beat) => beat.hops.some((hop) => has(hop.sets))) || step.tracks.some((track) => has(track.sets));
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 식 수
// basis: estimate
/** 이동의 `set=` 식을 닿는 도형(경로 번호)별로 묶는다. `@도형`이 없으면 경로의 마지막 도형이고, 사라지기 전에 통과하지 못한 도형의 식은 뺀다. */
export function setTargets(plan) {
  const targets = new Map();
  plan.sets.forEach((e, ei) => {
    const k = e.at === undefined ? plan.nodes.length - 1 : plan.nodes.indexOf(e.at);
    if (isPassed(plan.fracs[k], plan.lost)) targets.set(k, [...(targets.get(k) ?? []), { e, ei }]);
  });
  return targets;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 대기가 시간 상한(1시간)을 넘겨 이어질 때의 오류. top은 힙의 맨 앞 이벤트이고 줄은 그 이벤트의 줄이다. */
export function timeLimitError(top, step) {
  const line = top.line ?? top.launch?.line ?? step.line;
  return new FigureError([makeDiagnostic({ severity: 'error', line, message: `the figure runs longer than the limit of 1h (${TIME_LIMIT_MS}ms) while waiting at this line. Add timeout= or shorten a time` }, { code: 'time-limit' })]);
}
