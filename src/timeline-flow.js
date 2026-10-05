// 흐름 단계(`track`)를 시간표 구간 하나로 만든다. 박자가 끝나야 다음 박자가 시작하는 시계와 달리, 흐름은 단계 길이 안에서 서로 기다리지 않고 각자 출발한다(docs/design/playback.md 흐름 단계).
import { arrivalOffsetMs } from './easing.js';
import { ratio } from './format.js';
import { hopMs, lengthMs } from './hop-ms.js';
import { isPassed } from './lost.js';
import { flattenRoute, routeLength } from './route.js';
import { makeDiagnostic, FigureError } from './source/problems.js';
import { TIME_LIMIT_MS } from './source/values.js';
import { checkMoveInputs, gridPlan, inputTicks, msOfTicks, TICKS_PER_MS } from './time-grid.js';
import { createSeg } from './timeline-seg.js';
import { values } from './tokens.js';

const FLOW_STEP_MS = values.duration['flow-step'];
// 한 그림이 그릴 수 있는 점 수의 하드 상한. 경고 기준(`scale.flow-dots-max`)의 열 배다. 경고선 위에서 그림은 느려질 뿐이지만 이 선을 넘으면 입력이 처리 예산을 넘으므로 그리지 않는다.
const DOTS_LIMIT = values.scale['flow-dots-max'] * 10;

// cost: time O(l·p), heap O(l·p), stack O(1)
// vars: l = 흐름의 구간(선) 수, p = 선의 경로 점 수
// basis: estimate
// 흐름 하나가 지나는 길. 구간마다 선 경로를(거꾸로 선이면 뒤집어) 이어 붙이고, 이동 시간은 구간 시간(선 길이 비례)의 합이다. time=이 있으면 경로 전체의 시간이다.
// 도형을 지나는 곳은 구간이 끝나는 점과 다음 구간이 시작하는 점을 잇는 직선이고(모서리를 둥글리지 않는다), 그 길이도 경로 길이에 센다. route는 그려지는 길을 편 점 목록이다. fracs[k]는 k번째 도형 경계에 닿는 길이 비율, gaps는 도형 안을 지나는 비율 구간이다.
function planTrack(track, { scene, speed }) {
  const parts = track.legs.map((leg) => (leg.isBack ? [...scene.edges[leg.edge].points].reverse() : scene.edges[leg.edge].points));
  const lengths = parts.map((part) => routeLength(flattenRoute(part)));
  const joins = parts.slice(1).map((part, i) => Math.hypot(part[0].x - parts[i].at(-1).x, part[0].y - parts[i].at(-1).y));
  const total = lengths.reduce((sum, length) => sum + length, 0) + joins.reduce((sum, length) => sum + length, 0);
  const fracs = [0];
  const gaps = [];
  let covered = 0;
  lengths.forEach((length, i) => {
    covered += length;
    fracs.push(covered / total);
    if (i < joins.length) {
      gaps.push([covered / total, (covered + joins[i]) / total]);
      covered += joins[i];
    }
  });
  fracs[fracs.length - 1] = 1;
  const legs = track.legTimes ? legPlan(track, { lengths: lengths.map((length, i) => length + (joins[i] ?? 0)), speed }) : undefined;
  return {
    parts,
    route: parts.flatMap((part) => flattenRoute(part)),
    edges: [...new Set(track.legs.map((leg) => leg.edge))],
    legEdges: track.legs.map((leg) => leg.edge),
    names: track.path,
    nodes: track.path.map((id) => id.split('.')[0]),
    fracs,
    gaps,
    ms: legs?.ms ?? track.timeMs ?? parts.reduce((sum, part) => sum + hopMs(part, speed), 0),
    ...(legs ? { pace: legs.pace } : {}),
  };
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
function reserveDots(step, lengthMs, { run, limit }) {
  for (const track of step.tracks) {
    run.dots = (run.dots ?? 0) + departureCount(track, lengthMs);
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
// 조건을 쓴 흐름 하나의 출발 눈금 번호(단계 안). `at`과 `every`가 눈금의 정수배가 아니면 `time-precision` 오류이고, 정수배면 `at + i·every`가 정수라 늘 엄격히 늘고 단계 길이보다 작다.
function departureTicks(track, lengthTicks) {
  const at = inputTicks(track.atMs, { line: track.line, key: 'at' });
  const every = track.everyMs === undefined ? undefined : inputTicks(track.everyMs, { line: track.line, key: 'every' });
  if (at >= lengthTicks) return [];
  if (every === undefined) return [at];
  return Array.from({ length: Math.floor((lengthTicks - at - 1) / every) + 1 }, (_, i) => at + i * every);
}

// cost: time O(d·(l + p)), heap O(d·p), stack O(1)
// vars: d = 흐름의 출발 수, l = 흐름의 구간 수, p = 경로의 도형 수
// basis: estimate
/**
 * 흐름 하나의 출발마다 점(hops), 처음 닿는 선의 시각(edgesAt), 도형에 닿는 후광(pulses)을 모은다.
 * 단계 끝까지 도착하지 못하는 점과 사라지는 점(lost)은 그려지는 시간(cut)에서 끝나고, 사라지기 전에 통과하지 못한 도형은 후광도 선 켜짐도 없다.
 * 선은 점이 그 선에 들어선 지점(첫 선은 0, 그다음은 도형 안 구간을 지난 비율)이 사라지는 비율보다 앞일 때만 켜진다.
 */
function trackEvents(plan, { track, index, length, chips, starts }, { hops, edgesAt, pulses }) {
  // 눈금에 올린 이동(plan.arrivals)은 닿는 시각도 눈금 번호로 더해 이벤트 처리와 같은 시각을 쓴다
  const arrival = (at, k) => (plan.arrivals ? msOfTicks(Math.round(at * TICKS_PER_MS) + plan.arrivals[k]) : at + arrivalOffsetMs(plan.fracs[k], plan.ms, plan.pace));
  const lostMs = track.lost === undefined ? Infinity : arrivalOffsetMs(track.lost, plan.ms, plan.pace);
  for (const at of starts) hops.push({ track: index, edges: plan.edges, gaps: plan.gaps, isBack: false, at, ms: plan.ms, ...cutOf(Math.min(lostMs, at + plan.ms > length ? length - at : Infinity)), ...(plan.pace ? { pace: plan.pace } : {}), to: plan.nodes.at(-1), data: track.data === undefined ? undefined : chips(track.data), ...(track.tone ? { tone: track.tone } : {}), line: track.line });
  for (const at of starts) plan.nodes.slice(1).forEach((id, k) => isPassed(plan.fracs[k + 1], track.lost) && pulses.push({ id, at: arrival(at, k + 1) }));
  if (starts.length) plan.legEdges.forEach((edge, k) => isPassed(k === 0 ? 0 : plan.gaps[k - 1][1], track.lost) && (edgesAt[edge] = Math.min(edgesAt[edge] ?? Infinity, arrival(starts[0], k))));
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
function conditionalTracks(plans, { step, first, length, chips, run, scene, engine }, out) {
  const t0 = run.t;
  const base = (id) => id.split('.')[0];
  const lengthTicks = inputTicks(length, { line: step.line, key: 'for' });
  let order = 0;
  const launches = plans.flatMap((plan, i) => {
    const track = step.tracks[i];
    const { when, wait, timeoutMs, isStuck } = track.condition ?? {};
    const elsePlan = track.elseLeg && { ...gridPlan({ ms: hopMs(scene.edges[track.elseLeg.edge].points, run.speed), nodes: [base(track.source), base(track.condition.elseNode)], fracs: [0, 1] }, { line: track.line }), sets: [] };
    const timeoutTicks = timeoutMs === undefined ? undefined : inputTicks(timeoutMs, { line: track.line, key: 'timeout' });
    return departureTicks(track, lengthTicks).map((rel) => ({ order: order++, line: track.line, node: track.source, text: track.path.join(' -> '), when, wait, timeoutTicks, isStuck, rel, track: i, plan: { ms: plan.ms, nodes: plan.nodes, fracs: plan.fracs, arrivals: plan.arrivals, pace: plan.pace, lost: track.lost, sets: track.sets }, elsePlan }));
  });
  const { started } = engine.runLaunches({ launches, start: t0, lengthTicks });
  const starts = plans.map(() => []);
  const branches = [];
  for (const { launch, at, via, isElse } of started) {
    if (at >= lengthTicks) continue;
    if (isElse) branches.push({ launch, rel: msOfTicks(at) });
    else starts[launch.track].push(msOfTicks(at));
  }
  plans.forEach((plan, i) => trackEvents(plan, { track: step.tracks[i], index: first + i, length, chips, starts: starts[i].sort((a, b) => a - b) }, out));
  for (const { launch, rel } of branches) branchEvents(step.tracks[launch.track], { plan: launch.elsePlan, rel, length, chips }, out);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 시간 초과 분기 점 하나. 출발 도형에서 `else` 도형으로 가는 선 하나를 지난다. 글과 색은 흐름에서 이어받고, 단계 끝까지 도착하지 못하면 그 끝에서 잘린다.
function branchEvents(track, { plan, rel, length, chips }, { hops, edgesAt, pulses }) {
  const { edge, isBack } = track.elseLeg;
  hops.push({ edge, isBack: Boolean(isBack), at: rel, ms: plan.ms, ...cutOf(rel + plan.ms > length ? length - rel : Infinity), to: plan.nodes.at(-1), data: track.data === undefined ? undefined : chips(track.data), ...(track.tone ? { tone: track.tone } : {}), line: track.line });
  edgesAt[edge] = Math.min(edgesAt[edge] ?? Infinity, rel);
  pulses.push({ id: plan.nodes.at(-1), at: msOfTicks(Math.round(rel * TICKS_PER_MS) + plan.arrivals.at(-1)) });
}

// cost: time O(t·(d + l)), heap O(t·d + e), stack O(1)
// vars: t = 흐름 수, d = 흐름의 출발 수, l = 흐름의 구간 수, e = 지나는 선 수
// basis: estimate
/**
 * 흐름 단계 하나의 구간. 구간 길이는 단계의 for=이고, 없으면 토큰 duration.flow-step이다.
 * 선은 점이 처음 닿는 시각에 켜지고 단계 끝까지 남는다(edgesAt). 도형은 켜 두지 않고 점이 닿을 때마다 후광만 깜빡인다(pulses: { id, at }).
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
  const first = run.tracks.length;
  run.tracks.push(...plans.map((plan, i) => ({ parts: plan.parts, route: plan.route, names: plan.names, gaps: plan.gaps, line: step.tracks[i].line })));
  const length = step.forMs ?? FLOW_STEP_MS;
  reserveDots(step, length, { run, limit: dotsLimit });
  const hops = [];
  const edgesAt = {};
  const pulses = [];
  if (engine) conditionalTracks(plans, { step, first, length, chips, run, scene, engine }, { hops, edgesAt, pulses });
  else plans.forEach((plan, i) => trackEvents(plan, { track: step.tracks[i], index: first + i, length, chips, starts: departures(step.tracks[i], length) }, { hops, edgesAt, pulses }));
  const start = cards.starts.get(step) ?? {};
  const seg = createSeg(run, {
    line: step.line,
    si,
    bi: 0,
    length,
    labelShifts: [],
    move: length,
    hops,
    edgesOn: [],
    nodesOn: [],
    partsOn: [],
    card: { before: start, after: start, at: {} },
    caption: step.caption ?? '',
    growing: run.hasReveal || si > 0 ? [] : run.seriesIds,
    lights: [],
    status: step.status,
    extra: { edgesAt, nodesAt: {}, pulses: pulses.filter(({ at }) => at < length) },
  });
  if (engine) return { segs: [seg], moves: [] };
  const moves = hops.map((hop) => ({ ...plans[hop.track - first], start: seg.t0 + hop.at, sets: step.tracks[hop.track - first].sets, lost: step.tracks[hop.track - first].lost }));
  return { segs: [seg], moves };
}
