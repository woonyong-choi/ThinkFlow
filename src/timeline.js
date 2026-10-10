// 시간 흐름을 시간표로 편다. 박자마다 상태를 완전히 적어서, 탭으로 건너뛰어도 앞 박자를 다시 계산하지 않는다(docs/design/playback.md).
import { planBeats, sequenceStep } from './sequence-plan.js';
import { resolveBudget } from './budget.js';
import { arrivalOffsetMs } from './easing.js';
import { createStepEngine } from './flow-events.js';
import { hopMs } from './hop-ms.js';
import { chartSegState, createChartRun } from './timeline-charts.js';
import { flowSeg } from './timeline-flow.js';
import { rowPulses } from './timeline-rows.js';
import { createSeg } from './timeline-seg.js';
import { lightBeat, startedHops, timedHop } from './timeline-timed.js';
import { valueRows } from './timeline-values.js';
import { values } from './vendor/theme/tokens.js';
import { initialCardRows } from './values.js';

const DURATION = values.duration;

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 도형의 카드 줄 수
// basis: estimate
// clear는 값 줄을 남기고 본문을 비운다. show는 본문 끝에 한 줄 더한다.
function applyCardOp(rows, op) {
  if (op.type === 'clear') {
    const kept = (rows.get(op.node) ?? []).filter((row) => row.isValue);
    if (kept.length) rows.set(op.node, kept);
    else rows.delete(op.node);
  }
  else rows.set(op.node, [...(rows.get(op.node) ?? []), op.row]);
}

// cost: time O(b·(o + k)), heap O(c·r), stack O(1)
// vars: b = 박자 수, o = 박자의 카드 줄 수, k = 카드 있는 도형 수, c = 카드 내용 수, r = 줄 수
// basis: estimate
/**
 * 박자마다 도형 카드에 보일 내용을 모은다. 크기 계산과 시간표가 공유하며, 각 장면은 선언한 본문에서 시작한다.
 * @param valueTexts 값 이름 → 가질 글 집합. 값 글자 자리의 폭을 정한다(values.js)
 * @returns { contents: Map<도형 id, 줄 목록[]>, beats: Map<beat, { before, after }>, starts: Map<step, 장면 처음 카드>, initial }. before, after, 장면 처음 카드, initial(선언한 본문과 값 줄을 담은 카드)은 { 도형 id: 내용 번호 }
 */
export function collectCards(figure, valueTexts) {
  const contents = new Map();
  const beats = new Map();
  const starts = new Map();
  // cost: time O(k·r), heap O(r), stack O(1)
  // vars: k = 그 도형의 카드 내용 수, r = 줄 수
  // basis: estimate
  const indexOf = (id, rows) => {
    if (!contents.has(id)) contents.set(id, []);
    const list = contents.get(id);
    const key = JSON.stringify(rows);
    let i = list.findIndex((r) => JSON.stringify(r) === key);
    if (i < 0) i = list.push(rows) - 1;
    return i;
  };
  const declared = initialCardRows(figure, valueTexts);
  const stateOf = (rows) => Object.fromEntries([...rows].map(([id, body]) => [id, indexOf(id, body)]));
  const initial = stateOf(declared);
  for (const step of figure.steps) {
    const rows = new Map(declared);
    let state = initial;
    starts.set(step, state);
    for (const beat of planBeats(step)) {
      const before = state;
      for (const op of beat.ops) applyCardOp(rows, op);
      state = stateOf(rows);
      beats.set(beat, { before, after: state });
    }
  }
  return { contents, beats, starts, initial };
}

/** 장면 하나의 재생 정보. 문자열이나 다른 모양은 없다. */
const stepInfo = ({ label, mode, speed }) => ({ label, mode, speed });

// cost: time O(b·(h + e + k)), heap O(b·(e + k)), stack O(1)
// vars: b = 박자 수, h = 박자의 이동 수, e = 선 수, k = 카드 있는 도형 수
// basis: estimate
/**
 * 시간표를 만든다. 이동 시간에 선 길이가 필요해 배치가 끝난 장면을 받는다.
 * @param deps { cards, chips, scene }. chips는 이동 글을 글 상자 줄로 나누는 함수, scene은 배치가 끝난 장면(edges의 points를 쓴다)이다
 * @returns { segs, total, steps, growMs, tracks?, values? }. steps는 장면마다 정확히 { label, mode, speed }이고 growMs는 차트 계열이 자라는 시간이다. 표시 길이(presentation)와 표시 정보(marks, pulses)는 장면을 검사한 뒤 timeline-marks.js가 더한다. tracks는 흐름이 지나는 길 { points, names, line }, values는 값 줄마다 값이 바뀌는 시각이다(docs/design/playback.md).
 * seg: { si, bi, t0, t1, move, hops, nodesOn, partsOn, cards, cardsBefore, cardsAt, charts?, status?, pulses? }. nodesOn은 `light`가 켠 도형뿐이다. pulses는 점이 도형에 닿는 시각 { id, at }(구간 처음 뒤 ms)이다. 선이 켜진 구간은 구간에 적지 않고 이동의 길 계획(hop)이 정한다.
 * 구간 길이는 논리 시간이다: 이동이 끝나는 시각, 차트가 자라는 시간, 이벤트 처리가 소비한 시각 가운데 늦은 것에 적은 `wait`를 더한 값이고 효과 시간이나 옛 머묾은 없다. 장면마다 표시 길이(presentation)는 timeline.presentation이다.
 * charts는 차트 카드 id → { series, growing, lights }이다. 이동은 보기마다 hop 하나로 펼쳐지고, 같은 at, ms, cut을 갖는다(docs/design/playback.md 투영).
 */
export function buildTimeline(figure, deps) {
  const speed = figure.paceMs ?? DURATION.hop;
  const growMs = figure.paceMs ?? DURATION.reveal;
  // 박자를 지나며 이어지는 값: 시각, 값 줄, 차트 움직임
  const run = {
    figure,
    speed,
    growMs,
    t: 0,
    tracks: [],
    values: [],
    owned: new Map(),
    charts: createChartRun(figure),
    // 장면 사이로 넘길 값(`keep`)이 있는 그림만 장면이 끝난 값을 적어 둔다.
    isKept: figure.steps.some((step) => step.keep?.length),
    carry: new Map(),
    // 조건과 대기(`when`, `wait`)를 쓰는 그림만 이벤트 처리 기록을 갖는다. 예산 한도, 대기와 건너뜀과 교착 기록, 값을 마지막으로 쓴 줄이다.
    ...(figure.hasConditions ? { limits: deps.limits ?? resolveBudget(), conditions: { waits: [], skips: [], stalls: [], events: 0, ...(figure.hasReserve ? { reserves: [] } : {}) }, writers: new Map() } : {}),
  };
  const segs = figure.steps.flatMap((step, si) => stepSegs({ step, si }, run, deps));
  // 장면이 없는 문서는 선언한 값의 처음 모습을 값 줄로 갖는다. 장면이 아니라 장면 번호(si)가 없고 시간도 흐르지 않는다(길이 0, 변화 없음).
  if (!figure.steps.length && figure.values.length) run.values.push(...declaredRows(figure, deps.cards));
  const { waits, skips, stalls, events, reserves } = run.conditions ?? {};
  const extra = { ...(run.tracks.length ? { tracks: run.tracks } : {}), ...(run.values.length ? { values: run.values } : {}), ...(run.conditions ? { waits, skips, stalls, events, ...(reserves ? { reserves } : {}) } : {}) };
  return { segs, total: run.t, steps: figure.steps.map(stepInfo), initialCards: deps.cards.initial, growMs, rowPulses: rowPulses(segs, deps.cards.contents), ...extra };
}

// cost: time O(b·(h + e + k) + w·e), heap O(b·(e + k)), stack O(1)
// vars: b = 박자 수, h = 박자의 이동 수, e = 선 수, k = 카드 있는 도형 수, w = 값 수와 식 수
// basis: estimate
// 장면 하나의 구간들과 그 장면의 값 줄. 흐름 장면은 구간 하나이고 박자 장면은 박자마다 하나다.
function stepSegs({ step, si }, run, deps) {
  const { figure } = run;
  step = sequenceStep(step, run, deps);  // 조건을 쓴 장면만 이벤트 처리 그릇을 만든다. 쓰지 않은 장면은 옛 경로 그대로다(같은 원본 안에서도).
  const engine = step.hasConditions ? createStepEngine({ figure, step, si, t0: run.t, start: startOf(step, run), run }) : undefined;
  const { segs, moves } = step.tracks.length ? flowSeg({ step, si, engine }, run, deps) : beatSegs({ step, si, engine }, run, deps);
  if (!figure.values.length) return segs;
  const first = segs[0];
  const rows = engine ? engine.finish(segs.at(-1).t1) : valueRows(figure, { moves, span: { si, t0: first.t0, t1: segs.at(-1).t1 }, start: startOf(step, run), writers: run.writers });
  if (run.isKept) run.carry = new Map(rows.map((row) => [row.id, row.changes.at(-1)?.[1] ?? row.initial]));
  run.values.push(...rows.map((row) => ({ ...row, card: first.cards[row.node] ?? first.cardsBefore[row.node] })));
  return segs;
}

// cost: time O(w), heap O(w), stack O(1)
// vars: w = 값 수
// basis: estimate
// 장면이 없는 문서의 값 줄: 이벤트 없이 처음 값(from, 참조는 가리키는 값의 from)을 갖는 줄. 카드 값 줄은 선언한 값 줄만 담은 카드(collectCards의 initial)에 놓인다.
function declaredRows(figure, cards) {
  return valueRows(figure, { moves: [], span: { si: undefined, t0: 0, t1: 0 } }).map((row) => ({ ...row, card: cards.initial[row.node] }));
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 장면의 시작 값 { keep, carried, sets }. keep도 장면 set=도 없는 장면은 undefined라 값 처리가 옛 경로 그대로다.
function startOf(step, run) {
  if (!step.keep?.length && !step.sets?.length) return undefined;
  return { keep: (step.keep ?? []).map((k) => k.id), carried: run.carry, sets: step.sets ?? [] };
}

// cost: time O(b·(h + e + k)), heap O(b·(e + k)), stack O(1)
// vars: b = 박자 수, h = 박자의 이동 수, e = 선 수, k = 카드 있는 도형 수
// basis: estimate
// 박자 장면의 구간들과, 값 바꾸기 식이 쓰는 이동 목록(박자 시작에 점이 출발해 이동 시간 뒤 도착한다).
function beatSegs({ step, si, engine }, run, deps) {
  // 장면 안에서 쌓이는 값: 지나간 선, 밝힌 대상, 차트 밝히기
  const memory = { lit: new Set(), charts: new Map() };
  // 조건을 쓴 장면은 박자마다 이벤트를 처리해 실제로 출발한 이동과 출발 시각을 먼저 정한다. 앞 박자가 끝난 뒤의 값을 읽는다.
  const segs = step.beats.map((beat, bi) => {
    const { started, endMs } = engine && beat.hops.length ? startedHops(beat, { run, deps, engine }) : {};
    return beatSeg({ step, si, beat, bi, timed: started, endMs }, { memory, run }, deps);
  });
  if (engine) return { segs, moves: [] };
  const moves = step.beats.flatMap((beat, bi) => beat.hops.map((hop) => ({ start: segs[bi].t0 + (hop.sequenceAt ?? 0), ms: run.owned.get(hop), nodes: [hop.from, hop.to].map((id) => id.split('.')[0]), fracs: [0, 1], sets: hop.sets, lost: hop.lost })));
  return { segs, moves };
}

// cost: time O(h·p), heap O(h), stack O(1)
// vars: h = 박자의 이동 수, p = 선의 경로 점 수
// basis: estimate
// 조건을 쓰지 않은 박자의 이동(hops). 모든 이동이 박자 시작에 출발한다. 이동 하나는 보기마다 hop 하나가 되고, 시간은 첫 투영의 선(owner)이 한 번 정한다.
// 순서 보기에는 글 상자가 없다(메시지 글은 라벨이다).
function plainHops(beat, { run, chips, scene }) {
  const { speed } = run;
  return beat.hops.flatMap((hop) => {
    const ms = hop.timeMs ?? hopMs(scene.edges[hop.edge].points, speed);
    run.owned.set(hop, ms);
    return hop.projections.map((p) => ({ edge: p.edge, ...(hop.sequenceAt === undefined ? {} : { at: hop.sequenceAt }), isBack: p.kind === 'graph' && Boolean(p.isBack), ms, ...(hop.lost === undefined ? {} : { cut: arrivalOffsetMs(hop.lost, ms) }), to: hop.to.split('.')[0], data: hop.data !== undefined && p.kind === 'graph' ? chips(hop.data) : undefined, ...(hop.tone ? { tone: hop.tone } : {}), line: hop.line }));
  });
}

// cost: time O(h + e + k), heap O(e + k), stack O(1)
// vars: h = 박자의 이동 수, e = 선 수, k = 카드 있는 도형 수
// basis: estimate
// 박자 하나의 상태. 시각 t를 이 박자 길이만큼 앞으로 보낸다. timed는 조건을 쓴 장면에서 이벤트 처리가 정한 이 박자의 출발 목록이다(건너뛴 이동은 없고, 대기가 풀린 뒤 출발한 이동은 `at`을 갖는다). endMs는 이벤트 처리가 소비한 끝 시각(박자 시작 뒤 ms)이라 점이 출발하지 않은 대기의 끝도 박자 길이에 든다.
function beatSeg({ step, si, beat, bi, timed, endMs = 0 }, { memory, run }, { cards, chips, scene }) {
  const hops = timed ? timed.flatMap((entry) => timedHop(entry, { chips })) : plainHops(beat, { run, chips, scene });
  lightBeat(memory, beat);
  const charts = chartSegState(run, memory, { si, bi, beat });
  const pulses = arrivalPulses(hops);
  const move = hops.reduce((end, h) => Math.max(end, (h.at ?? 0) + (h.cut ?? h.ms)), 0);
  // 박자의 논리 길이: 이동이 끝나는 시각, 차트가 자라는 시간, 이벤트 처리가 소비한 시각 가운데 가장 늦은 것에 적은 `wait`를 더한다. 그 밖의 시간은 없다.
  // 효과(후광, 알약 줄어듦)의 400ms는 논리 시각이 아니라 표시 시간이라 여기에 더하지 않는다(timeline-marks.js presentationOf). 박자는 서로 붙어 이어진다.
  const grow = Object.values(charts).some((c) => c.growing.length) ? run.growMs : 0;
  const card = cards.beats.get(beat.planned ?? beat);
  return createSeg(run, {
    line: beat.line,
    si,
    bi,
    length: Math.max(move, grow, endMs) + beat.waitMs,
    move,
    hops,
    nodesOn: [...memory.lit].filter((id) => !id.includes('.')),
    partsOn: [...memory.lit].filter((id) => id.includes('.')),
    card: { before: card.before, after: card.after, at: cardTimes(hops, card) },
    charts,
    status: step.status,
    extra: pulses.length ? { pulses } : {},
  });
}

// cost: time O(h), heap O(h), stack O(1)
// vars: h = 박자의 이동 수
// basis: estimate
// 점이 도형에 닿는 시각 { id, at }(박자 처음 뒤 ms). 사라지는 점(cut)은 닿지 못한다. 이동은 보기마다 하나여도 도형은 하나라 같은 도형, 같은 시각은 한 번이다.
function arrivalPulses(hops) {
  const seen = new Set();
  return hops.flatMap((hop) => {
    const at = (hop.at ?? 0) + hop.ms;
    const key = `${hop.to}@${at}`;
    if (hop.cut !== undefined || seen.has(key)) return [];
    seen.add(key);
    return [{ id: hop.to, at }];
  });
}

// cost: time O(h + k), heap O(k), stack O(1)
// vars: h = 이동 수, k = 카드 있는 도형 수
// basis: estimate
// 도착 규칙: 카드가 바뀌는 도형 가운데 이 박자에 점이 도착하는 도형은 가장 늦은 도착 시각에, 나머지는 0에 바뀐다.
function cardTimes(hops, card) {
  const arrivals = new Map();
  for (const h of hops) if (h.cut === undefined) arrivals.set(h.to, Math.max(arrivals.get(h.to) ?? 0, (h.at ?? 0) + h.ms));
  const changed = Object.keys({ ...card.before, ...card.after }).filter((id) => card.before[id] !== card.after[id]);
  return Object.fromEntries(changed.map((id) => [id, arrivals.get(id) ?? 0]));
}

// cost: time O(l), heap O(l), stack O(1)
// vars: l = light 대상 수
// basis: estimate
/**
 * 박자에서 밝은 도형과 그룹의 id. `light`가 명시한 대상뿐이다. 점이 닿은 도형은 밝히지 않고(도착 후광 seg.pulses가 테두리만 깜빡인다), 선 양 끝이나 카드가 찬 도형도 켜지지 않는다. HTML과 SVG가 같이 쓴다.
 */
export function litIds(seg) {
  return new Set(seg.nodesOn);
}
