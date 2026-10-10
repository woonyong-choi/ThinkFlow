// 흐름 조건과 대기(`when`, `wait`, `timeout`, `else`)의 이벤트 처리. 값, 조건, 대기를 시간표를 만들 때 한 번 계산한다(docs/design/playback.md 이벤트 순서).
// 실제 시계, 난수, 재생 상태를 읽지 않는다. 조건을 쓰지 않는 단계는 이 파일을 거치지 않는다(createStepEngine이 불리지 않는다).
import { eventBudgetError } from './budget.js';
import { EventHeap, setTargets, timeLimitError, typeError } from './event-support.js';
import { isPassed } from './lost.js';
import { evalCondition } from './source/condition.js';
import { TIME_LIMIT_MS } from './source/values.js';
import { msOfTicks, TICKS_PER_MS } from './time-grid.js';
import { applyReserve } from './flow-reserve.js';
import { noteRowChanges, resetWriters, runUpdate, spansOf, startValues } from './timeline-values.js';
import { rootOf, valueTable } from './values.js';

// 이벤트 시각은 시간표 눈금(0.00001ms)의 정수 번호다. 같은 번호여야 같은 시각이고 반올림하지 않는다(src/time-grid.js).
// 시간표에 담는 값(변화, 대기, 건너뜀, 교착의 시각)만 ms로 바꾼다.
const TICK_LIMIT = TIME_LIMIT_MS * TICKS_PER_MS;

/**
 * 흐름 단계나 박자 단계의 값과 조건을 시각 순서로 처리하는 그릇. 한 시각의 이벤트는 순위(갱신, 풀린 대기, 출발) 순으로 처리한다.
 * 대기 기록은 시간표를 지나며 이어지는 값 run.conditions에 쌓는다.
 */
class StepEngine {
  heap = new EventHeap();
  pending = [];
  started = [];
  chain = 0;
  waitSeq = 0;
  prior = new Map();
  // 예약이 바꾼 값 이름. 같은 시각에 그 값을 읽는 대기를 다시 평가할 때까지 모아 둔다.
  reserved = new Set();

  // 참조를 끝까지 따라간 값 이름과 그 값의 지금 글
  root = (id) => rootOf(this.byId, id);
  textOf = (id) => this.state.get(this.root(id));

  // cost: time O(v + e), heap O(v), stack O(1)
  // vars: v = 값 수, e = 단계 시작 식 수
  // basis: estimate
  /** @param args { figure, step, si, t0, start, run }. t0는 단계 시작 시각(그림 전체 ms), start는 단계 시작 값(`keep`, 단계 `set=`), run은 시간표를 지나며 이어지는 값 { limits, conditions, writers }다 */
  constructor({ figure, step, si, t0, start, run }) {
    Object.assign(this, { figure, step, si, run, lastT: Math.round(t0 * TICKS_PER_MS) });
    this.byId = valueTable(figure);
    this.state = new Map(figure.values.filter((v) => v.ref === undefined).map((v) => [v.id, v.from]));
    this.followers = new Map();
    for (const v of figure.values.filter((value) => value.ref !== undefined)) this.followers.set(this.root(v.id), (this.followers.get(this.root(v.id)) ?? 0) + 1);
    resetWriters(figure, { writers: run.writers, span: { t0 }, keep: start?.keep });
    if (start) startValues(start, { state: this.state, textOf: this.textOf, byId: this.byId, onWrite: (e) => run.writers.set(this.root(e.id), { line: e.line, at: t0, isSet: true }) });
    this.rows = figure.values.map((v) => ({ si, id: v.id, node: v.on, t0, t1: t0, initial: this.textOf(v.id), changes: [], ...(v.queue ? { slots: v.slots } : {}) }));
  }

  // cost: time O(1), heap O(1), stack O(1)
  // basis: estimate
  // 이벤트 n개를 센다. 그림 전체 합계(events)나 한 시각의 합계(chain)가 한도를 넘으면 예산 오류로 끝낸다.
  count(n, { line, t }) {
    const { limits, conditions } = this.run;
    conditions.events += n;
    this.chain += n;
    if (conditions.events > limits.events) throw eventBudgetError('events', limits.events, { line, t: msOfTicks(t) });
    if (this.chain > limits.chain) throw eventBudgetError('chain', limits.chain, { line, t: msOfTicks(t) });
  }

  // cost: time O(n), heap O(1), stack O(d)
  // vars: n = 조건 AST 노드 수, d = 괄호 깊이
  // basis: estimate
  // 조건 하나를 계산한다. 종류가 맞지 않으면 `value-type` 오류다.
  test(condition, key, launch) {
    const result = evalCondition(condition.ast, this.textOf);
    if (result.typeError) throw typeError(result.typeError, { line: launch.line, key, text: condition.text });
    return result.value;
  }

  // cost: time O(p·a), heap O(p·a), stack O(1)
  // vars: p = 경로의 도형 수, a = `on` 줄 수
  // basis: estimate
  /**
   * 출발한 점이 닿는 도형마다 갱신을 힙에 넣는다. 사라지는 점(lost)은 사라지기 전에 통과한 도형에만 닿는다.
   * 키는 [시각, 순위 0, 갱신 종류(on 0, set 1, 적용할 식 없는 도착 2), 이동 순번, 선언 순번, 식 순번]이라 같은 시각의 순서가 표를 따른다.
   * 점이 도형에 닿는 일은 값을 바꾸지 않아도 이벤트 하나라서, 대기가 남았는데 닿을 점이 있으면 처리할 이벤트가 남은 것이다.
   */
  scheduleArrivals(plan, { launch, startAt }) {
    const { heap, figure } = this;
    const at = (k) => startAt + plan.arrivals[k];
    const push = ({ k, order, ei = 0 }, { kind, exprs, line }) => heap.push({ key: [at(k), 0, kind, launch.order, order, ei], kind: 'update', exprs, line });
    for (let k = 1; k < plan.nodes.length && isPassed(plan.fracs[k], plan.lost); k++) {
      push({ k, order: k }, { kind: 2, exprs: [], line: launch.line });
      figure.arrivals.forEach((a, ai) => a.node === plan.nodes[k] && a.sets.length && push({ k, order: ai }, { kind: 0, exprs: a.sets, line: a.line }));
    }
    for (const [k, list] of setTargets(plan)) push({ k, order: 0, ei: list[0].ei }, { kind: 1, exprs: list.map(({ e }) => e), line: list[0].e.line });
  }

  // cost: time O(p·a), heap O(p·a), stack O(1)
  // vars: p = 경로의 도형 수, a = `on` 줄 수
  // basis: estimate
  // 점을 출발시킨다. via는 바로 출발(direct), 대기가 풀려 출발(release), 시간 초과 분기 출발(else)이다.
  launchDot(launch, { t, via }) {
    const isElse = via === 'else';
    this.scheduleArrivals(isElse ? launch.elsePlan : launch.plan, { launch, startAt: t });
    this.started.push({ launch, at: t, via, isElse });
  }

  // cost: time O(n), heap O(1), stack O(d)
  // vars: n = 조건 AST 노드 수, d = 괄호 깊이
  // basis: estimate
  // `when`을 실행 직전에 한 번 평가해 출발시키거나 건너뛴다.
  runLaunch(launch, { t, via }) {
    if (launch.when) {
      this.count(1, { line: launch.line, t });
      if (!this.test(launch.when, 'when', launch)) {
        this.run.conditions.skips.push({ si: this.si, line: launch.line, node: launch.node, cond: launch.when.text, t: msOfTicks(t) });
        return;
      }
    }
    if (launch.reserve) applyReserve(this, launch, t);
    this.launchDot(launch, { t, via });
  }

  // cost: time O(w), heap O(1), stack O(1)
  // vars: w = 대기 수
  // basis: estimate
  // 대기 하나가 끝난 기록. 기다리던 점은 더 이어 가지 않으므로 대기 목록에서 뺀다.
  endWait(entry, { t, end }) {
    const { launch } = entry;
    entry.isDone = true;
    this.pending.splice(this.pending.indexOf(entry), 1);
    this.run.conditions.waits.push({ si: this.si, line: launch.line, node: launch.node, cond: launch.wait.text, t0: msOfTicks(entry.t0), t1: msOfTicks(t), end });
  }

  // cost: time O(r), heap O(r), stack O(1)
  // vars: r = 조건이 읽는 값 수
  // basis: estimate
  // 끝나지 않는 대기를 `stalls`에 남긴다. 대기 중인 도형과 조건, 읽은 값의 글과 마지막으로 쓴 줄과 시각이다.
  noteStall(entry, t) {
    const { launch } = entry;
    const written = (id) => this.run.writers.get(this.root(id));
    const refs = launch.wait.refs.map((id) => ({ id, text: this.textOf(id), line: written(id).line, at: written(id).at }));
    this.run.conditions.stalls.push({ si: this.si, line: launch.line, node: launch.node, move: launch.text, cond: launch.wait.text, t: msOfTicks(t), refs, ...(launch.isStuck ? { stuck: true } : {}) });
  }

  // cost: time O(1), heap O(1), stack O(1)
  // basis: estimate
  // 값을 쓸 때마다 부르는 갈고리. 마지막으로 쓴 줄을 적고, 이 시각에 바뀐 값을 모으고, 값이 바뀐 참조 값마다 갱신 이벤트를 더한다.
  noteWrite(t) {
    return (e) => {
      const root = this.root(e.id);
      this.run.writers.set(root, { line: e.line, at: msOfTicks(t), isSet: true });
      if (!this.prior.has(root)) this.prior.set(root, this.state.get(root));
      this.count(this.followers.get(root) ?? 0, { line: e.line, t });
    };
  }

  // cost: time O(u·w), heap O(u), stack O(1)
  // vars: u = 이 시각의 갱신 수, w = 값 수
  // basis: estimate
  // 이 시각의 갱신(순위 1, 2)을 순서대로 적용한다. 갱신마다 별도 이벤트로 센다. 이 시각에 실제로 바뀐 값 이름 집합을 돌려준다.
  applyUpdates(items, t) {
    const { state, byId, rows, textOf } = this;
    this.prior.clear();
    for (const { exprs, line } of items) {
      this.count(1, { line, t });
      runUpdate(exprs, { state, textOf, byId, onWrite: this.noteWrite(t) });
      noteRowChanges(rows, textOf, { t: msOfTicks(t) });
    }
    return new Set([...this.prior].filter(([id, text]) => state.get(id) !== text).map(([id]) => id));
  }

  // cost: time O(w·n), heap O(w), stack O(1)
  // vars: w = 대기 수, n = 조건 AST 노드 수
  // basis: estimate
  // 순위 3: 값이 바뀌었으면 그 값을 읽는 대기를 선언 순서로 다시 평가해 참이면 풀어 출발시킨다. 시간 초과는 여기서 정하지 않는다(expireWaits).
  settleWaits(changed, t) {
    for (const entry of [...this.pending].sort((a, b) => a.launch.order - b.launch.order || a.seq - b.seq)) {
      const { launch } = entry;
      if (!entry.roots.some((root) => changed.has(root))) continue;
      this.count(1, { line: launch.line, t });
      if (!this.test(launch.wait, 'wait', launch)) continue;
      this.endWait(entry, { t, end: 'released' });
      this.count(1, { line: launch.line, t });
      this.runLaunch(launch, { t, via: 'release' });
    }
  }

  // cost: time O(w), heap O(1), stack O(1)
  // vars: w = 대기 수
  // basis: estimate
  // 이 시각의 처리가 더 일어나지 않을 때 제한 시간이 지난 대기를 시간 초과로 끝내고 `else` 점을 출발시킨다. 같은 시각의 출발이 뒤 회차에 거는 갱신과 `reserve=`가 먼저 대기를 풀 수 있어야
  // 같은 시각에 풀림과 시간 초과가 겹칠 때 풀림이 이긴다. 시간 초과로 새 이벤트가 생기면 부른 쪽이 이 시각을 한 번 더 돈다.
  expireWaits(t) {
    for (const entry of [...this.pending].sort((a, b) => a.launch.order - b.launch.order || a.seq - b.seq)) {
      if (entry.deadline > t) continue;
      const { launch } = entry;
      this.endWait(entry, { t, end: 'timeout' });
      if (launch.elsePlan) {
        this.count(1, { line: launch.line, t });
        this.launchDot(launch, { t, via: 'else' });
      }
    }
  }

  // cost: time O(d·n), heap O(d), stack O(1)
  // vars: d = 이 시각의 출발 수, n = 조건 AST 노드 수
  // basis: estimate
  // 순위 4: 이 시각에 출발하는 점을 선언 순서로 처리한다. `wait`가 거짓이면 점은 출발 도형에서 기다린다.
  runDepartures(items, t) {
    for (const { launch } of items) {
      this.count(launch.wait ? 2 : 1, { line: launch.line, t });
      if (launch.wait && !this.test(launch.wait, 'wait', launch)) this.holdDeparture(launch, t);
      else this.runLaunch(launch, { t, via: 'direct' });
    }
  }

  // cost: time O(w), heap O(1), stack O(1)
  // vars: w = 조건이 읽는 값 수
  // basis: estimate
  // `wait`가 거짓인 출발을 대기에 올린다. 제한 시간이 있으면 그 시각을 깨울 이벤트를 하나 넣는다.
  holdDeparture(launch, t) {
    const deadline = launch.timeoutTicks === undefined ? Infinity : t + launch.timeoutTicks;
    const roots = [...new Set(launch.wait.refs.map((id) => this.root(id)))];
    const entry = { launch, t0: t, deadline, seq: this.waitSeq++, roots, isDone: false };
    this.pending.push(entry);
    if (deadline !== Infinity) this.heap.push({ key: [deadline, 3, 0, 0, 0, 0], kind: 'deadline', entry });
  }

  // cost: time O(u + d + w), heap O(u + d), stack O(1)
  // vars: u = 갱신 수, d = 출발 수, w = 대기 수
  // basis: estimate
  // 한 시각의 이벤트를 위 표의 순위(갱신, 풀린 대기, 출발)로 처리한다. 출발 도형에 닿는 것으로 정한 `@도형` 갱신은 출발과 같은 시각이라,
  // 처리가 새 이벤트를 같은 시각에 더하면 같은 시각을 한 번 더 돈다. 이 연쇄는 chain 예산이 끊는다.
  // 시간 초과는 이 시각의 회차가 모두 끝난 뒤에 정한다(expireWaits). 시간 초과로 새 이벤트가 생기면 그 회차를 다시 돈다.
  processSlot(t) {
    if (t > TICK_LIMIT) throw timeLimitError(this.heap.peek(), this.step);
    this.chain = 0;
    this.lastT = t;
    const isBusy = () => (this.dropStale() && this.heap.peek().key[0] === t) || this.reserved.size > 0;
    do {
      do {
        const items = [];
        while (this.heap.size && this.heap.peek().key[0] === t) items.push(this.heap.pop());
        const updates = items.filter((item) => item.kind === 'update');
        // 예약이 바꾼 값을 읽는 대기도 같은 시각에 다시 평가한다(원자 예약). 예약이 남기면 이 시각을 한 번 더 돈다.
        const changed = new Set([...(updates.length ? this.applyUpdates(updates, t) : []), ...this.reserved]);
        this.reserved.clear();
        this.settleWaits(changed, t);
        this.runDepartures(items.filter((item) => item.kind === 'depart'), t);
      } while (isBusy());
      this.expireWaits(t);
    } while (isBusy());
  }

  // cost: time O(n·log n), heap O(1), stack O(1)
  // vars: n = 힙의 이벤트 수
  // basis: estimate
  // 이미 끝난 대기의 제한 시간 이벤트가 맨 앞이면 버린다. 처리할 이벤트가 남았는지 가르는 기준이 낡은 이벤트에 흔들리지 않게 한다. 힙이 비어 있지 않으면 true다.
  dropStale() {
    const { heap } = this;
    while (heap.size && heap.peek().kind === 'deadline' && heap.peek().entry.isDone) heap.pop();
    return heap.size > 0;
  }

  // cost: time O(n·log n), heap O(n), stack O(1)
  // vars: n = 처리한 이벤트 수
  // basis: estimate
  /**
   * 출발(launch) 목록을 처리한다. 박자 단계는 박자마다 한 번(lengthTicks 없음), 흐름 단계는 단계 하나를 한 번(lengthTicks는 단계 길이) 부른다.
   * launch는 { order, line, node, text, when?, wait?, timeoutTicks?, isStuck, rel, plan, elsePlan? }이고 rel은 start 뒤 출발 눈금 번호, plan은 { ms, nodes, fracs, arrivals, pace?, lost?, sets }다(arrivals는 time-grid.js의 gridPlan이 정한다).
   * 단계 끝까지 풀리지 않는 대기는 `step-end`, 처리할 이벤트가 하나도 없는 대기는 `stalled`로 끝나 `stalls`에 남는다.
   * @param args { launches, start, lengthTicks }. start는 이 처리의 시작 시각(그림 전체 ms)이고 눈금 번호 하나로 바뀐다
   * @returns { started, endTicks }. started는 출발한 점 { launch, at, via, isElse }의 처리 순서 목록이고 at은 start 뒤 눈금 번호다. endTicks는 이벤트 처리가 마지막으로 소비한 시각의 start 뒤 눈금 번호(0 이상)다
   */
  runLaunches({ launches, start, lengthTicks = Infinity }) {
    const origin = Math.round(start * TICKS_PER_MS);
    const tEnd = origin + lengthTicks;
    this.started = [];
    for (const launch of launches) this.heap.push({ key: [origin + launch.rel, 2, launch.order, 0, 0, 0], kind: 'depart', launch });
    while (this.dropStale() && this.heap.peek().key[0] <= tEnd) this.processSlot(this.heap.peek().key[0]);
    const isStepEnd = this.dropStale();
    for (const entry of [...this.pending]) {
      this.endWait(entry, { t: isStepEnd ? tEnd : this.lastT, end: isStepEnd ? 'step-end' : 'stalled' });
      if (!isStepEnd) this.noteStall(entry, this.lastT);
    }
    return { started: this.started.map((item) => ({ ...item, at: item.at - origin })), endTicks: Math.max(0, this.lastT - origin) };
  }

  // cost: time O(w), heap O(w), stack O(1)
  // vars: w = 값 수
  // basis: estimate
  /** 단계가 끝난 시각 t1로 값 줄을 마무리한다. 값 줄마다 값이 보이는 구간(periods)이 붙는다. */
  finish(t1) {
    return this.rows.map((row) => {
      const done = { ...row, t1 };
      return { ...done, ...spansOf(done) };
    });
  }
}

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 값 수
// basis: estimate
/**
 * 단계 하나의 이벤트 처리 그릇을 만든다. 단계마다 한 번 만들고 `runLaunches`로 출발을 처리한 뒤 `finish`로 값 줄을 얻는다.
 * @param args { figure, step, si, t0, start, run }. t0는 단계 시작 시각(그림 전체 ms), start는 단계 시작 값(`keep`, 단계 `set=`)이고 run은 시간표를 지나며 이어지는 값 { limits, conditions, writers }다
 */
export function createStepEngine(args) {
  return new StepEngine(args);
}
