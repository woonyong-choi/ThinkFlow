// 흐름 단계(`track`)를 시간표 구간 하나로 만든다. 박자가 끝나야 다음 박자가 시작하는 시계와 달리, 흐름은 단계 길이 안에서 서로 기다리지 않고 각자 출발한다(docs/design/playback.md 흐름 단계).
import { arrivalOffsetMs } from './easing.js';
import { ratio } from './format.js';
import { hopMs, lengthMs } from './hop-ms.js';
import { isPassed } from './lost.js';
import { trackGeometry, trackInstances } from './track-geometry.js';
import { mirrorPace } from './track-pace.js';
import { makeDiagnostic, FigureError } from './source/problems.js';
import { TIME_LIMIT_MS } from './source/values.js';
import { checkMoveInputs, gridPlan, inputTicks, msOfTicks, TICKS_PER_MS } from './time-grid.js';
import { chartSegState } from './timeline-charts.js';
import { createSeg } from './timeline-seg.js';
import { values } from './vendor/theme/tokens.js';

const FLOW_STEP_MS = values.duration['flow-step'];
// 한 그림이 그릴 수 있는 점 수의 하드 상한. 경고 기준(`scale.flow-dots-max`)의 열 배다. 경고선 위에서 그림은 느려질 뿐이지만 이 선을 넘으면 입력이 처리 예산을 넘으므로 그리지 않는다.
const DOTS_LIMIT = values.scale['flow-dots-max'] * 10;

// cost: time O(l·p), heap O(l·p), stack O(1)
// vars: l = 흐름의 구간(선) 수, p = 선의 경로 점 수
// basis: estimate
// 흐름 하나가 지나는 길. 구간마다 선 경로를(거꾸로 선이면 뒤집어) 이어 붙이고, 이동 시간은 구간 시간(선 길이 비례)의 합이다. time=이 있으면 경로 전체의 시간이다.
// 도형을 지나는 곳은 구간이 끝나는 점과 다음 구간이 시작하는 점을 잇는 직선이고(모서리를 둥글리지 않는다), 그 길이도 경로 길이에 센다. route는 그려지는 길을 편 점 목록이다. fracs[k]는 k번째 도형 경계에 닿는 길이 비율, gaps는 도형 안을 지나는 비율 구간이다.
// 경로가 든 그래프 보기가 여럿이면 첫 보기가 이동 시간과 속도를 정하고, 나머지(mirrors)는 같은 시각에 같은 도형에 닿도록 자기 기하에 맞춘 길만 따로 둔다.
function planTrack(track, { scene, speed }) {
  const [owner, ...others] = trackInstances(track);
  const { lengths, joins, ...geometry } = trackGeometry({ path: track.path, legs: owner.legs }, scene);
  const legs = track.legTimes ? legPlan(track, { lengths: lengths.map((length, i) => length + (joins[i] ?? 0)), speed }) : undefined;
  return {
    ...geometry,
    ms: legs?.ms ?? track.timeMs ?? geometry.parts.reduce((sum, part) => sum + hopMs(part, speed), 0),
    ...(legs ? { pace: legs.pace } : {}),
    mirrors: others.map((instance) => ({ view: instance.view, ...omitLengths(trackGeometry({ path: track.path, legs: instance.legs }, scene)) })),
    view: owner.view,
  };
}

const omitLengths = ({ lengths, joins, ...geometry }) => geometry;

// cost: time O(m·l²), heap O(m·l), stack O(1)
// vars: m = 다른 보기 수, l = 흐름의 선 수
// basis: estimate
// 첫 보기가 이동 시간(눈금에 올린 뒤의 ms)을 정한 다음, 다른 보기마다 같은 ms와 같은 도형 도착 시각을 갖는 plan을 만든다. 도형 후광의 도착 시각은 첫 보기만 읽는다.
function mirrorPlans(plan) {
  return plan.mirrors.map((mirror) => {
    const pace = mirrorPace(plan, plan.pace, mirror);
    return { ...mirror, ms: plan.ms, ...(pace ? { pace } : {}) };
  });
}

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 구간 수
// basis: estimate
/**
 * 구간별 이동 시간(`legs=`)을 정한다(docs/design/playback.md 구간별 이동 시간). 구간은 선 하나와 그 선이 끝나는 도형 안의 이음이다.
 * 적은 시간이 먼저고, `time=`이 있으면 나머지를 `-` 구간에 구간 길이 비례로 나누고(마지막 `-` 구간이 오차를 받아 합이 `time=`과 같다), 없으면 `-` 구간은 거리 기반 시간이다.
 * @param legLengths 구간 길이(px, 선과 뒤따르는 이음)
 * @returns { ms, pace }. ms는 구간 시간의 합(경로 이동 시간)이고 pace는 `[시간 비율, 길이 비율]` 꺾은선이다(구간 끝마다 한 점, 앞뒤는 [0, 0]과 [1, 1])
 */
function legPlan(track, { lengths: legLengths, speed }) {
  const unset = legLengths.flatMap((length, i) => (track.legTimes[i] === null ? [i] : []));
  const times = [...track.legTimes];
  if (track.timeMs === undefined) for (const i of unset) times[i] = lengthMs(legLengths[i], speed);
  else {
    const rest = track.timeMs - times.reduce((sum, ms) => sum + (ms ?? 0), 0);
    const weight = legLengths.reduce((sum, length, i) => sum + (times[i] === null ? length : 0), 0);
    let given = 0;
    unset.forEach((i, n) => {
      times[i] = n === unset.length - 1 ? rest - given : (rest * (weight > 0 ? legLengths[i] / weight : 1 / unset.length));
      given += times[i];
    });
  }
  const ms = track.timeMs ?? times.reduce((sum, time) => sum + time, 0);
  if (ms > TIME_LIMIT_MS) throw new FigureError([makeDiagnostic({ severity: 'error', line: track.line, message: `the legs of this track add up to ${ms}ms, over the limit of 1h (${TIME_LIMIT_MS}ms). Shorten a leg` }, { code: 'time-limit' })]);
  const total = legLengths.reduce((sum, length) => sum + length, 0);
  let [time, length] = [0, 0];
  const pace = [[0, 0], ...legLengths.map((leg, i) => {
    time += times[i];
    length += leg;
    return i === legLengths.length - 1 ? [1, 1] : [ratio(time / ms), ratio(length / total)];
  })];
  return { ms, pace };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 흐름 하나의 출발 수. 배열을 만들지 않고 단계 길이와 every에서 센다. every가 없으면 한 번이다.
// 나눗셈 오차로 하나 많거나 적게 나올 수 있어(`ceil(0.07 / 0.01)`은 8), 마지막 출발 `at + (n-1)·every`가 단계 끝 전이고 그다음 출발 `at + n·every`가 단계 끝 이후가 되도록 한 번 맞춘다. departures가 만드는 시각과 같은 식이다.
export function departureCount(track, lengthMs) {
  if (track.atMs >= lengthMs) return 0;
  if (track.everyMs === undefined) return 1;
  const startOf = (i) => track.atMs + i * track.everyMs;
  let count = Math.ceil((lengthMs - track.atMs) / track.everyMs);
  // 나눗셈 오차는 하나를 넘지 않는다. 시각이 늘지 않는 입력(at + n·every === at)에서 끝없이 세지 않도록 한 번씩만 맞춘다.
  if (count > 1 && startOf(count - 1) >= lengthMs) count--;
  else if (startOf(count) < lengthMs) count++;
  return count;
}

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 단계의 흐름 수
// basis: estimate
// 이 단계의 점 수를 그림 전체 합계에 더하고, 한도를 넘으면 출발 시각 배열을 만들기 전에 오류로 끝낸다.
function reserveDots(step, lengthMs, { run, limit, hasConditions }) {
  const lengthTicks = hasConditions ? inputTicks(lengthMs, { line: step.line, key: 'for' }) : undefined;
  for (const track of step.tracks) {
    const count = hasConditions ? gridDepartures(track, lengthTicks).count : departureCount(track, lengthMs);
    run.dots = (run.dots ?? 0) + count * trackInstances(track).length;
    if (run.dots > limit) throw new FigureError([makeDiagnostic({ severity: 'error', line: track.line, message: `[check 14] the flows would draw ${run.dots} dots, over the limit of ${limit}. Raise every=, shorten for=, or remove a track` }, { code: 'check-14' })]);
  }
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 출발 수
// basis: estimate
// 흐름 하나의 출발 시각(단계 안 ms). 미리 센 출발 수(departureCount)만큼 `at + i·every`로 만든다. 시각이 유한하지 않거나 엄격히 늘지 않거나 단계 끝 전이 아니면(지원하지 않는 시간 정밀도) 그 track 줄의 오류로 끝낸다. every가 없으면 한 번이다.
function departures(track, lengthMs) {
  const count = departureCount(track, lengthMs);
  const starts = [];
  for (let i = 0; i < count; i++) {
    const at = track.atMs + i * (track.everyMs ?? 0);
    if (!Number.isFinite(at) || at >= lengthMs || (i > 0 && at <= starts[i - 1])) throw new FigureError([makeDiagnostic({ severity: 'error', line: track.line, message: `time precision is not supported: departure ${i} of ${count} would start at ${at}ms, which does not come after the one before it. Raise every= or lower at=` }, { code: 'time-precision' })]);
    starts.push(at);
  }
  return starts;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 출발 수
// basis: estimate
// 조건을 쓴 흐름 하나의 출발 눈금 번호(단계 안). 수를 세는 예산 검사와 같은 눈금 계획을 쓴다.
function departureTicks(track, lengthTicks) {
  const { at, every, count } = gridDepartures(track, lengthTicks);
  return Array.from({ length: count }, (_, i) => at + i * (every ?? 0));
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 적은 시간은 눈금 정밀도를 검증하고, 출발지별로 계산한 기본 시각은 가장 가까운 눈금으로 올린다. 서로 다른 기본 출발을 같은 눈금에 합칠 수는 없다.
function gridDepartures(track, lengthTicks) {
  const every = track.everyMs === undefined ? undefined : inputTicks(track.everyMs, { line: track.line, key: 'every' });
  const phase = track.atPhase;
  if (phase && every < phase.count) throw new FigureError([makeDiagnostic({ severity: 'error', line: track.line, message: `time precision is not supported: every=${track.everyMs}ms cannot stagger ${phase.count} sources on the ${msOfTicks(1)}ms time grid. Raise every= or set at= explicitly` }, { code: 'time-precision' })]);
  const at = phase ? Math.round((every * phase.index) / phase.count) : inputTicks(track.atMs, { line: track.line, key: 'at' });
  const count = at >= lengthTicks ? 0 : every === undefined ? 1 : Math.floor((lengthTicks - at - 1) / every) + 1;
  return { at, every, count };
}

// cost: time O(d·(l + p)), heap O(d·p), stack O(1)
// vars: d = 흐름의 출발 수, l = 흐름의 구간 수, p = 경로의 도형 수
// basis: estimate
/**
 * 흐름 하나의 출발마다 점(hops)과 도형에 닿는 후광(pulses)을 모은다.
 * 단계 끝까지 도착하지 못하는 점과 사라지는 점(lost)은 그려지는 시간(cut)에서 끝나고, 사라지기 전에 통과하지 못한 도형은 후광도 선 켜짐도 없다.
 * 선은 점이 그 선에 들어선 지점(첫 선은 0, 그다음은 도형 안 구간을 지난 비율)이 사라지는 비율보다 앞일 때만 켜진다.
 */
function trackEvents(plan, { track, index, length, chips, starts }, { hops, pulses }) {
  // 눈금에 올린 이동(plan.arrivals)은 닿는 시각도 눈금 번호로 더해 이벤트 처리와 같은 시각을 쓴다
  const arrival = (view, at, k) => (view.arrivals ? msOfTicks(Math.round(at * TICKS_PER_MS) + view.arrivals[k]) : at + arrivalOffsetMs(view.fracs[k], view.ms, view.pace));
  const lostMs = track.lost === undefined ? Infinity : arrivalOffsetMs(track.lost, plan.ms, plan.pace);
  // 이동 하나는 보기마다 점 하나다. 길이 다른 보기도 같은 출발, 이동 시간, 사라지는 시각을 쓰고 도형 후광(pulses)은 이름 하나라 첫 보기의 도착으로 한 번만 건다.
  const views = [plan, ...mirrorPlans(plan)];
  for (const at of starts) {
    views.forEach((view, v) => hops.push({ track: index + v, edges: view.edges, legEdges: view.legEdges, gaps: view.gaps, isBack: false, at, ms: plan.ms, ...cutOf(Math.min(lostMs, at + plan.ms > length ? length - at : Infinity)), ...(view.pace ? { pace: view.pace } : {}), to: plan.nodes.at(-1), data: track.data === undefined ? undefined : chips(track.data), ...(track.tone ? { tone: track.tone } : {}), line: track.line }));
  }
  for (const at of starts) plan.nodes.slice(1).forEach((id, k) => isPassed(plan.fracs[k + 1], track.lost) && pulses.push({ id, at: arrival(plan, at, k + 1) }));
}

// 그려지는 시간(cut) 필드. 단계 끝이나 사라짐으로 잘리지 않으면(Infinity) 필드가 없다.
const cutOf = (cut) => (cut === Infinity ? {} : { cut });

// cost: time O(t·d·log d), heap O(t·d), stack O(1)
// vars: t = 흐름 수, d = 흐름의 출발 수
// basis: estimate
/**
 * 조건을 쓴 흐름 단계의 점. 출발마다 이벤트 처리에 넘겨 `when`이 거짓인 출발은 점을 만들지 않고(출발 수에는 들어간다), `wait`가 풀린 출발은 풀린 시각(`at`)에 출발하며,
 * 시간 초과로 끝난 대기는 `else` 도형으로 가는 점을 출발시킨다. 점의 이동, 선 켜짐, 후광은 조건이 없는 흐름과 같은 규칙(trackEvents)이다.
 */
function conditionalTracks(plans, { step, indexes, length, chips, run, scene, engine }, out) {
  const t0 = run.t;
  const base = (id) => id.split('.')[0];
  const lengthTicks = inputTicks(length, { line: step.line, key: 'for' });
  let order = 0;
  const launches = plans.flatMap((plan, i) => {
    const track = step.tracks[i];
    const { when, wait, timeoutMs, isStuck, reserve } = track.condition ?? {};
    const elsePlan = track.elseLeg && { ...gridPlan({ ms: hopMs(scene.edges[track.elseLeg.edge].points, run.speed), nodes: [base(track.source), base(track.condition.elseNode)], fracs: [0, 1] }, { line: track.line }), sets: [] };
    const timeoutTicks = timeoutMs === undefined ? undefined : inputTicks(timeoutMs, { line: track.line, key: 'timeout' });
    return departureTicks(track, lengthTicks).map((rel) => ({ order: order++, line: track.line, node: track.source, text: track.path.join(' -> '), when, wait, reserve, timeoutTicks, isStuck, rel, track: i, plan: { ms: plan.ms, nodes: plan.nodes, fracs: plan.fracs, arrivals: plan.arrivals, pace: plan.pace, lost: track.lost, sets: track.sets }, elsePlan }));
  });
  const { started } = engine.runLaunches({ launches, start: t0, lengthTicks });
  const starts = plans.map(() => []);
  const branches = [];
  for (const { launch, at, via, isElse } of started) {
    if (at >= lengthTicks) continue;
    if (isElse) branches.push({ launch, rel: msOfTicks(at) });
    else starts[launch.track].push(msOfTicks(at));
  }
  plans.forEach((plan, i) => trackEvents(plan, { track: step.tracks[i], index: indexes[i], length, chips, starts: starts[i].sort((a, b) => a - b) }, out));
  for (const { launch, rel } of branches) branchEvents(step.tracks[launch.track], { plan: launch.elsePlan, rel, length, chips }, out);
}

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 흐름이 지나는 그래프 보기 수
// basis: estimate
// 시간 초과 분기 점. 출발 도형에서 `else` 도형으로 가는 선을 보기마다 하나씩 같은 시각에 지난다(이동 시간은 첫 보기가 정한다). 글과 색은 흐름에서 이어받고, 단계 끝까지 도착하지 못하면 그 끝에서 잘린다.
function branchEvents(track, { plan, rel, length, chips }, { hops, pulses }) {
  for (const { elseLeg } of trackInstances(track)) {
    const { edge, isBack } = elseLeg;
    hops.push({ edge, isBack: Boolean(isBack), at: rel, ms: plan.ms, ...cutOf(rel + plan.ms > length ? length - rel : Infinity), to: plan.nodes.at(-1), data: track.data === undefined ? undefined : chips(track.data), ...(track.tone ? { tone: track.tone } : {}), line: track.line });
  }
  pulses.push({ id: plan.nodes.at(-1), at: msOfTicks(Math.round(rel * TICKS_PER_MS) + plan.arrivals.at(-1)) });
}

// cost: time O(t·(d + l)), heap O(t·d + e), stack O(1)
// vars: t = 흐름 수, d = 흐름의 출발 수, l = 흐름의 구간 수, e = 지나는 선 수
// basis: estimate
/**
 * 흐름 단계 하나의 구간. 구간 길이는 단계의 for=이고, 없으면 토큰 duration.flow-step이다.
 * 선은 점이 올라 있는 동안만 활성이고(이동의 길 계획), 도형은 켜 두지 않고 점이 닿을 때마다 후광만 깜빡인다(pulses: { id, at }).
 * @param run 시간표를 지나며 이어지는 값 { figure, speed, t, tracks, ... }
 * @param deps { scene, cards, chips, dotsLimit? }. dotsLimit은 그림 전체 점 수의 하드 상한이고(기본 `scale.flow-dots-max`의 열 배), 넘으면 FigureError다
 * @param step 단계 { step, si, engine }. engine은 조건을 쓴 단계의 이벤트 처리 그릇(flow-events.js)이고, 있으면 출발 시각과 건너뜀을 그 결과로 정한다
 * @returns { segs, moves }. segs는 구간 하나의 목록, moves는 값 바꾸기 식이 쓰는 이동 목록이다
 */
export function flowSeg({ step, si, engine }, run, { scene, cards, chips, dotsLimit = DOTS_LIMIT }) {
  const plans = step.tracks.map((track) => {
    const plan = planTrack(track, { scene, speed: run.speed });
    if (!engine) return plan;
    checkMoveInputs(track, track.line);
    return gridPlan(plan, { line: track.line });
  });
  // 흐름 하나는 지나는 그래프 보기마다 길 하나를 시간표의 tracks에 둔다(첫 보기가 앞). indexes[i]는 흐름 i의 첫 보기 길 번호, source는 문서 전체에서 센 흐름 번호다.
  const source = run.tracks.reduce((count, track) => Math.max(count, track.source + 1), 0);
  const indexes = [];
  step.tracks.forEach((track, i) => {
    indexes.push(run.tracks.length);
    const { mirrors, view, ...owner } = plans[i];
    for (const geometry of [{ ...owner, view }, ...mirrors]) run.tracks.push({ parts: geometry.parts, route: geometry.route, names: geometry.names, gaps: geometry.gaps, line: track.line, source: source + i, view: geometry.view });
  });
  const length = step.forMs ?? FLOW_STEP_MS;
  reserveDots(step, length, { run, limit: dotsLimit, hasConditions: Boolean(engine) });
  const hops = [];
  const pulses = [];
  if (engine) conditionalTracks(plans, { step, indexes, length, chips, run, scene, engine }, { hops, pulses });
  else plans.forEach((plan, i) => trackEvents(plan, { track: step.tracks[i], index: indexes[i], length, chips, starts: departures(step.tracks[i], length) }, { hops, pulses }));
  const start = cards.starts.get(step) ?? {};
  const seg = createSeg(run, {
    line: step.line,
    si,
    bi: 0,
    length,
    move: length,
    hops,
    nodesOn: [],
    partsOn: [],
    card: { before: start, after: start, at: {} },
    charts: chartSegState(run, { charts: new Map() }, { si, bi: 0 }),
    status: step.status,
    // 단계 끝(for=)에 닿는 점도 이 단계의 사건이다. 닿지 못하고 잘리는 점(끝 뒤에 닿는 점)만 후광이 없다.
    extra: { pulses: pulses.filter(({ at }) => at <= length) },
  });
  if (engine) return { segs: [seg], moves: [] };
  // 값은 흐름의 사건 하나에 한 번만 바뀐다. 다른 보기의 점은 같은 사건의 모양이라 값을 바꾸는 이동이 아니다.
  const moves = hops.flatMap((hop) => {
    const i = indexes.indexOf(hop.track);
    return i < 0 ? [] : [{ ...plans[i], start: seg.t0 + hop.at, sets: step.tracks[i].sets, lost: step.tracks[i].lost }];
  });
  return { segs: [seg], moves };
}
