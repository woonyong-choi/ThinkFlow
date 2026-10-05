// 조건을 쓴 박자(대기가 풀린 뒤 출발하는 이동)를 시간표 박자로 옮기는 도우미. 이벤트 처리(flow-events.js)에 이동을 넘기고, 출발한 이동과 켜지는 선과 도형의 시각을 구한다.
import { arrivalOffsetMs } from './easing.js';
import { hopMs } from './hop-ms.js';
import { isPassed } from './lost.js';
import { checkMoveInputs, gridPlan, inputTicks, msOfTicks } from './time-grid.js';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 이동이 켜는 선과 도형을 박자의 기억에 더한다. 사라지는 점(lost)은 출발 지점을 지났을 때(0%가 아닐 때)만 선과 출발 도형을 켜고, 끝 도형은 켜지 않는다.
// 선 양 끝을 켜는 규칙(litIds)에서 끝 도형을 빼려고 그 선을 lost에 적는다. 같은 단계에서 사라지지 않는 이동이 그 선을 지나면 선 전체가 켜진다.
function lightMove(memory, hop, drawn) {
  if (hop.lost === undefined) {
    memory.edgesOn.add(drawn.edge);
    memory.lost.delete(drawn.edge);
  } else if (isPassed(0, hop.lost)) {
    if (!memory.edgesOn.has(drawn.edge)) memory.lost.add(drawn.edge);
    memory.edgesOn.add(drawn.edge);
    memory.lit.add(hop.from.split('.')[0]);
  }
}

// cost: time O(h), heap O(1), stack O(1)
// vars: h = 박자의 이동 수
// basis: estimate
// 조건을 쓰지 않은 박자: 이동마다 켜는 선과 도형을 박자의 기억에 더한다. 모두 박자 시작에 켜진다.
function lightAll(memory, { hops, drawn }) {
  hops.forEach((hop, hi) => lightMove(memory, hop, drawn[hi]));
  return undefined;
}

// cost: time O(h·(e + n)), heap O(e + n), stack O(1)
// vars: h = 박자의 이동 수, e = 켜진 선 수, n = 켜진 도형 수
// basis: estimate
/**
 * 조건을 쓴 박자: 이동이 켜는 선과 도형을 기억에 더하되, 대기가 풀린 뒤 출발한 이동(at이 0보다 큼)이 처음 켜는 선과 도형은 켜지는 시각(박자 시작 뒤 ms)을 적는다.
 * 박자 시작에 켜진 것은 시각이 없다. 기다리는 점은 선도 켜지 않기 때문이다.
 * @returns { edgesAt, nodesAt } 또는 켜지는 시각이 늦은 것이 없으면 undefined
 */
function lightTimed(memory, { hops, drawn, scene }) {
  const edgesAt = {};
  const nodesAt = {};
  const earliest = (map, key, at) => {
    map[key] = Math.min(map[key] ?? Infinity, at);
  };
  const order = drawn.map((_, i) => i).sort((a, b) => (drawn[a].at ?? 0) - (drawn[b].at ?? 0));
  for (const i of order) {
    const at = drawn[i].at ?? 0;
    const edgesBefore = new Set(memory.edgesOn);
    const litBefore = new Set(memory.lit);
    lightMove(memory, hops[i], drawn[i]);
    if (!at) continue;
    for (const j of memory.edgesOn) {
      if (edgesBefore.has(j)) continue;
      earliest(edgesAt, j, at);
      if (!memory.lost.has(j)) for (const end of [scene.edges[j].from, scene.edges[j].to]) earliest(nodesAt, end.split('.')[0], at);
    }
    for (const id of memory.lit) if (!litBefore.has(id)) earliest(nodesAt, id, at);
  }
  return Object.keys(edgesAt).length || Object.keys(nodesAt).length ? { edgesAt, nodesAt } : undefined;
}

// cost: time O(p)
// vars: p = 선의 경로 점 수
// basis: estimate
// 이동 하나가 걸리는 시간(ms)을 눈금에 올린 plan. `time=`이 있으면 그 값이고, 없으면 선 길이로 정한다. 눈금에 맞지 않는 `time=`이나 눈금보다 짧은 시간은 `time-precision` 오류다.
function planOf(hop, { run, scene }) {
  checkMoveInputs(hop, hop.line);
  const nodes = [hop.from, hop.to].map((id) => id.split('.')[0]);
  return gridPlan({ ms: hop.timeMs ?? hopMs(scene.edges[hop.edge].points, run.speed), nodes, fracs: [0, 1] }, { line: hop.line });
}

// cost: time O(h·p), heap O(h), stack O(1)
// vars: h = 박자의 이동 수, p = 선의 경로 점 수
// basis: estimate
/**
 * 조건을 쓴 박자의 이동을 이벤트 처리에 넘겨 실제로 출발한 이동을 구한다. 박자 시작 시각(run.t)에 모든 이동이 출발 준비를 하고, `wait`가 거짓이면 풀릴 때까지 기다린다.
 * @returns { started, endMs }. started는 출발한 이동 { hop, at, isElse, ms }의 순서 목록이고 at은 박자 시작 뒤 출발 ms(바로 출발했으면 0)다.
 *   endMs는 이벤트 처리가 마지막으로 소비한 시각(박자 시작 뒤 ms)이다. 점이 출발하지 않은 대기(시간 초과로 끝났는데 `else`가 없는 대기, 기다린 뒤 `when`이 거짓인 출발)의 끝도 들어 있다
 */
export function startedHops(beat, { run, deps, engine }) {
  const { scene } = deps;
  const base = (id) => id.split('.')[0];
  const launches = beat.hops.map((hop, hi) => {
    const { when, wait, timeoutMs, isStuck } = hop.condition ?? {};
    const elsePlan = hop.elseLeg && { ...gridPlan({ ms: hopMs(scene.edges[hop.elseLeg.edge].points, run.speed), nodes: [base(hop.from), base(hop.condition.elseNode)], fracs: [0, 1] }, { line: hop.line }), sets: [] };
    const timeoutTicks = timeoutMs === undefined ? undefined : inputTicks(timeoutMs, { line: hop.line, key: 'timeout' });
    const plan = { ...planOf(hop, { run, scene }), lost: hop.lost, sets: hop.sets };
    return { order: hi, line: hop.line, node: hop.from, text: `${hop.from} -> ${hop.to}`, when, wait, timeoutTicks, isStuck, rel: 0, plan, elsePlan, hop };
  });
  const { started, endTicks } = engine.runLaunches({ launches, start: run.t });
  const entries = started.map(({ launch, at, isElse }) => ({ hop: launch.hop, at: msOfTicks(at), isElse, ms: (isElse ? launch.elsePlan : launch.plan).ms }));
  return { started: entries, endMs: msOfTicks(endTicks) };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 출발한 이동 하나를 시간표의 이동(hops)으로. 시간 초과 분기(else)는 출발 도형에서 `else` 도형으로 가는 선을 지나고 글과 색만 이어받는다.
export function timedHop({ hop, at, isElse, ms }, { chips }) {
  const edge = isElse ? hop.elseLeg.edge : hop.edge;
  const lost = isElse ? undefined : hop.lost;
  return {
    edge,
    isBack: Boolean(isElse ? hop.elseLeg.isBack : hop.isBack),
    ms,
    ...(lost === undefined ? {} : { cut: arrivalOffsetMs(lost, ms) }),
    ...(at > 0 ? { at } : {}),
    to: (isElse ? hop.condition.elseNode : hop.to).split('.')[0],
    data: hop.data !== undefined ? chips(hop.data) : undefined,
    ...(hop.tone ? { tone: hop.tone } : {}),
    line: hop.line,
  };
}

// cost: time O(h·(e + n)), heap O(e + n), stack O(1)
// vars: h = 박자의 이동 수, e = 켜진 선 수, n = 켜진 도형 수
// basis: estimate
/**
 * 박자 하나가 켜는 선과 도형을 기억에 더하고, 이 박자의 `light` 대상을 켠다. timed가 있으면(조건을 쓴 박자) 켜지는 시각이 늦은 선과 도형의 시각 { edgesAt, nodesAt }을 돌려주고, 없으면 모두 박자 시작에 켜져 undefined다.
 * `light` 대상은 박자 시작에 켜지므로 시각이 있던 도형이라도 시각을 뺀다.
 */
export function lightBeat(memory, { beat, hops, timed, scene }) {
  const at = timed ? lightTimed(memory, { hops: timed.map(({ hop, isElse }) => (isElse ? { from: hop.from } : hop)), drawn: hops, scene }) : lightAll(memory, { hops: beat.hops, drawn: hops });
  for (const target of beat.light) {
    memory.lit.add(target);
    if (at) delete at.nodesAt[target];
  }
  return at;
}
