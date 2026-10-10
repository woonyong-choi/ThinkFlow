// 조건을 쓴 박자(대기가 풀린 뒤 출발하는 이동)를 시간표 박자로 옮기는 도우미. 이벤트 처리(flow-events.js)에 이동을 넘기고, 출발한 이동과 켜지는 선과 도형의 시각을 구한다.
import { arrivalOffsetMs } from './easing.js';
import { hopMs } from './hop-ms.js';
import { checkMoveInputs, gridPlan, inputTicks, msOfTicks } from './time-grid.js';

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
    const { when, wait, timeoutMs, isStuck, reserve } = hop.condition ?? {};
    const elsePlan = hop.elseLeg && { ...gridPlan({ ms: hopMs(scene.edges[hop.elseLeg.edge].points, run.speed), nodes: [base(hop.from), base(hop.condition.elseNode)], fracs: [0, 1] }, { line: hop.line }), sets: [] };
    const timeoutTicks = timeoutMs === undefined ? undefined : inputTicks(timeoutMs, { line: hop.line, key: 'timeout' });
    const plan = { ...planOf(hop, { run, scene }), lost: hop.lost, sets: hop.sets };
    return { order: hi, line: hop.line, node: hop.from, text: `${hop.from} -> ${hop.to}`, when, wait, reserve, timeoutTicks, isStuck, rel: 0, plan, elsePlan, hop };
  });
  const { started, endTicks } = engine.runLaunches({ launches, start: run.t });
  const entries = started.map(({ launch, at, isElse }) => ({ hop: launch.hop, at: msOfTicks(at), isElse, ms: (isElse ? launch.elsePlan : launch.plan).ms }));
  return { started: entries, endMs: msOfTicks(endTicks) };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 출발한 이동 하나를 시간표의 이동(hops) 목록으로. 이동은 보기마다 hop 하나가 되고 모두 같은 at, ms, cut을 갖는다. 시간 초과 분기(else)는 출발 도형에서 `else` 도형으로 가는 선을 지나고 글과 색만 이어받는다.
export function timedHop({ hop, at, isElse, ms }, { chips }) {
  const lost = isElse ? undefined : hop.lost;
  return projectionsOf(hop, isElse).map((p) => ({
    edge: p.edge,
    isBack: p.kind === 'graph' && Boolean(p.isBack),
    ms,
    ...(lost === undefined ? {} : { cut: arrivalOffsetMs(lost, ms) }),
    ...(at > 0 ? { at } : {}),
    to: (isElse ? hop.condition.elseNode : hop.to).split('.')[0],
    data: hop.data !== undefined && p.kind === 'graph' ? chips(hop.data) : undefined,
    ...(hop.tone ? { tone: hop.tone } : {}),
    line: hop.line,
  }));
}

// 이동(또는 시간 초과 분기의 선)이 보일 투영 목록. 첫 투영이 시간을 정한다.
const projectionsOf = (hop, isElse) => (isElse ? hop.elseLeg : hop).projections;

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 박자의 light 대상 수
// basis: estimate
/**
 * 이 박자의 `light` 대상(도형, 그룹, 부분)을 켠다. 켜 두는 것은 `light`가 명시한 대상뿐이다. 점이 지난 선과 닿은 도형은 켜지지 않는다:
 * 선은 점이 올라 있는 동안만 활성이고(이동의 길 계획), 도형은 도착 후광(seg.pulses)이 맡는다.
 */
export function lightBeat(memory, beat) {
  for (const target of beat.light) memory.lit.add(target);
}
