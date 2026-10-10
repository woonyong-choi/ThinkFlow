// 브라우저와 Node 시험이 같은 글을 쓴다(play.js와 한 스크립트로 이어 붙고, 시험은 curve.js와 이 파일만 불러 쓴다). DOM, 시계, 난수를 쓰지 않는다.
// 시간표(data)에서 장면마다 사건 모델을 한 번 만들고, 장면에 들어선 뒤 흐른 표시 시각을 주면 그 순간의 모습을 돌려주는 순수 함수다.
// 같은 (모델, 시각)은 앞서 어떤 시각을 샘플했든 같은 모습이다. 이전 프레임, 웹 애니메이션 끝 알림, 요소 충돌에서 사건을 읽지 않는다.
// 시각은 두 가지다. 논리 시각은 시간표의 ms이고 speed가 이동 시간만 배로 바꾼다(표시 시각 d의 논리 시각 = 장면 시작 + d·speed).
// 후광, 알약 줄어듦, 반복 꼬리는 사람이 보는 표시 시각으로 재서 speed와 상관없다.
// 켜진 선, 도형, 부분, 차트 밝히기, 값과 차트 틀이 바뀌는 시각의 후광은 시간표가 정한 값(marks, pulses, values, charts)을 읽기만 한다. 같은 논리 사건은 판이 여럿이어도 하나다.

const SCENE_MODES = ['static', 'once', 'loop'];
const STEP_KEYS = ['label', 'mode', 'speed'];
const TIMING_KEYS = ['riseMs', 'holdMs', 'decayMs', 'fadeMs'];
// 곡선 역산(이분 탐색)의 부동소수 오차보다 크고 사건 간격보다 훨씬 작다. 같은 선에서 나가고 들어서는 두 점이 이어 붙는지 볼 때만 쓴다.
const RUN_JOIN_EPSILON_MS = 1e-5;

/**
 * 장면마다 사건 모델을 만든다. 단계 값이 { label, mode, speed } 정본이 아니면 오류다(글이나 빠진 값을 기본값으로 받지 않는다).
 * @param data { steps, segs, marks?, pulses?, values?, charts?, chartFrames?, metrics: { move, pulse: { riseMs, holdMs, decayMs, fadeMs } } }
 */
function buildScenes(data) {
  const timing = checkTiming(data.metrics.pulse);
  return data.steps.map((step, si) => buildScene(data, si, checkStep(step, si), timing));
}

// 단계 값이 정확히 { label: 글, mode: static|once|loop, speed: 양의 유한수 }인지 본다. 아니면 어느 단계의 무엇이 틀렸는지 알리는 오류다.
function checkStep(step, si) {
  const fail = (why) => {
    throw new Error(`steps[${si}]: ${why}`);
  };
  if (step === null || typeof step !== 'object' || Array.isArray(step)) fail(`{ label, mode, speed } 객체여야 한다(받은 값: ${JSON.stringify(step)})`);
  const extra = Object.keys(step).filter((key) => !STEP_KEYS.includes(key));
  if (extra.length || STEP_KEYS.some((key) => !(key in step))) fail(`키는 정확히 ${STEP_KEYS.join(', ')}여야 한다(받은 키: ${Object.keys(step).join(', ')})`);
  if (typeof step.label !== 'string') fail('label은 글이어야 한다');
  if (!SCENE_MODES.includes(step.mode)) fail(`mode는 ${SCENE_MODES.join(', ')} 중 하나여야 한다(받은 값: ${JSON.stringify(step.mode)})`);
  if (typeof step.speed !== 'number' || !Number.isFinite(step.speed) || !(step.speed > 0)) fail(`speed는 양의 유한수여야 한다(받은 값: ${JSON.stringify(step.speed)})`);
  return step;
}

function checkTiming(timing) {
  if (!timing || TIMING_KEYS.some((key) => !(timing[key] >= 0 && Number.isFinite(timing[key])))) throw new Error(`metrics.pulse는 ${TIMING_KEYS.join(', ')}(0 이상의 유한수)를 가져야 한다`);
  return { ...timing, tailMs: Math.max(timing.riseMs + timing.holdMs + timing.decayMs, timing.fadeMs) };
}

// 장면 si의 사건 모델. 선이 점으로 차 있는 구간, 켜진 구간, 후광이 시작하는 시각을 정하고, 표시 길이(마지막 사건의 효과가 끝날 때까지)는 시간표가 정한 값(data.presentation)을 읽는다.
function buildScene(data, si, step, timing) {
  const first = data.segs.findIndex((seg) => seg.si === si);
  if (first < 0) throw new Error(`steps[${si}]: 이 장면에 속한 박자가 없다`);
  const last = data.segs.findLastIndex((seg) => seg.si === si);
  const segs = data.segs.slice(first, last + 1);
  const presentationMs = data.presentation?.[si];
  if (!(presentationMs >= 0 && Number.isFinite(presentationMs))) throw new Error(`steps[${si}]: presentation(표시 길이)이 0 이상의 유한수여야 한다(받은 값: ${JSON.stringify(presentationMs)})`);
  const scene = { si, label: step.label, mode: step.mode, speed: step.speed, first, last, segs, t0: segs[0].t0, t1: segs.at(-1).t1, timing, presentationMs };
  scene.edgeRuns = edgeRunsOf(segs, data.metrics.move);
  scene.held = heldRangesOf(data, scene);
  scene.pulses = pulseOnsetsOf(data, scene);
  return scene;
}

// ---- 선 사용 구간 ----

// 선마다 점이 한 개 이상 올라 있는 논리 시각 구간(전체 시간표 ms, [from, to))의 목록. 닿거나 겹치는 구간은 합쳐서, 한 점이 나가는 시각에 다른 점이 들어서도 선이 꺼지는 프레임이 없다.
// 선 번호는 판을 합친 장면의 선 번호라 같은 이동을 보이는 여러 판의 선이 각각 자기 구간을 갖는다.
function edgeRunsOf(segs, move) {
  const spans = new Map();
  for (const seg of segs) for (const hop of seg.hops) for (const leg of hopLegs(hop, move)) spans.set(leg.edge, [...(spans.get(leg.edge) ?? []), [seg.t0 + (hop.at ?? 0) + leg.from, seg.t0 + (hop.at ?? 0) + leg.to]]);
  return new Map([...spans].map(([edge, list]) => [edge, mergeRuns(list)]));
}

function mergeRuns(list) {
  const merged = [];
  for (const [from, to] of [...list].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const tail = merged.at(-1);
    if (tail && from <= tail[1] + RUN_JOIN_EPSILON_MS) tail[1] = Math.max(tail[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

/**
 * 점 하나가 각 선에 올라 있는 박자 안 구간 { edge, from, to }(ms). 도형 안을 지나는 구간(gaps)은 어느 선에도 속하지 않는다.
 * 박자의 이동(hop.edge)은 선 하나에 이동 내내 있고, 흐름의 점(hop.track)은 시간표의 길 계획(hop.legEdges, 구간마다 선 번호)대로 구간마다 그 선에 있다.
 * 잘리는 점(hop.cut)은 거기까지만 선에 있다. 정본이 아닌 이동은 근사로 받지 않고 오류다.
 */
function hopLegs(hop, move) {
  const end = hop.cut ?? hop.ms;
  const isTrack = hop.track !== undefined;
  const edges = isTrack ? hop.legEdges : [hop.edge];
  const gaps = hop.gaps ?? [];
  const isGap = (gap) => Array.isArray(gap) && gap.length === 2 && gap.every(Number.isFinite);
  if (!(hop.ms > 0 && Number.isFinite(hop.ms)) || !Array.isArray(edges) || !edges.length || !edges.every(Number.isInteger) || (isTrack && (gaps.length !== edges.length - 1 || !gaps.every(isGap)))) {
    throw new Error(`이동이 정본이 아니다: ${isTrack ? `track ${hop.track}` : `edge ${hop.edge}`}, ms ${hop.ms}, legEdges ${JSON.stringify(hop.legEdges)}, gaps ${JSON.stringify(hop.gaps)}`);
  }
  const spanOf = (k) => (isTrack ? [k === 0 ? 0 : gaps[k - 1][1], k === edges.length - 1 ? 1 : gaps[k][0]] : [0, 1]);
  const timeOf = (f) => (f <= 0 ? 0 : f >= 1 ? hop.ms : hop.ms * timeAtProgress(move, f, hop.pace));
  return edges.flatMap((edge, k) => {
    const [from, to] = spanOf(k).map(timeOf);
    return from < end && from < to ? [{ edge, from, to: Math.min(to, end) }] : [];
  });
}

// ---- 켜진 구간 ----

/**
 * 장면과 겹치는 조용한 선의 보이는 구간 목록 { kind: 'edge', key, ranges }(`quiet:번호`, data.marks). 알 수 없는 키는 오류다.
 * 켜 둔 도형, 부분, 차트 행(`light`)은 구간이 그 장면에서 지금까지 켠 목록(nodesOn, partsOn, charts[id].lights)으로 갖는다(heldAt). 길이 0인 구간도 같은 규칙으로 읽힌다.
 * 점이 지나간 선은 켜 두지 않는다: 옛 `edge:` 키는 더 이상 없고 오류다. 점이 지나는 동안의 선은 이동 목록에서 따로 구한 선 사용 구간(edgeRuns)이 맡는다.
 */
function heldRangesOf(data, scene) {
  const held = [];
  for (const [key, ranges] of Object.entries(data.marks ?? {})) {
    const [kind, rest] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    if (kind !== 'quiet') throw new Error(`marks의 키가 정본이 아니다: ${key}${kind === 'edge' ? '(지나간 선은 켜 두지 않는다)' : ''}`);
    // 구간은 [시작, 끝, 출처 장면]이다. 이 장면 것만 읽는다: 다른 장면에서 지나간 조용한 선은 이 장면에서 보이지 않는다.
    if (!ranges.every((range) => Array.isArray(range) && range.length === 3 && Number.isFinite(range[0]) && Number.isFinite(range[1]) && range[0] <= range[1] && Number.isInteger(range[2]))) throw new Error(`marks의 구간이 정본이 아니다: ${key} ${JSON.stringify(ranges)}([시작, 끝, 장면 번호]여야 한다)`);
    const own = ranges.filter(([, , si]) => si === scene.si);
    if (own.length) held.push({ kind: 'edge', key: Number(rest), ranges: own });
  }
  return held;
}

// 논리 시각 x가 장면 소유 구간 목록에 들어 있는지. 장면 끝 시각(x가 end 이상)은 장면의 마지막 순간이라 끝까지 이어진 구간을 읽는다. 길이 0인 구간은 그 시각에서만 든다.
function isCovered(ranges, x, end) {
  return ranges.some(([from, to]) => (x >= end ? to >= end : from <= x && (x < to || (from === to && x === from))));
}

// ---- 후광 시작 시각 ----

/**
 * 후광 키마다 시작하는 논리 시각 오름차순 목록. 키는 `node:도형 논리 id`, `value:값 줄 번호`, `chart:차트 id:표 id`다.
 * 점이 도착한 도형(통과하지 못하고 사라진 점은 시간표가 넣지 않는다)은 구간의 pulses이고, 값이 실제로 바뀐 시각과 차트 표가 실제로 달라진 시각은 시간표의 pulses(같은 틱 안에서 제자리로 돌아온 변화는 시간표가 이미 뺐다)다.
 * 후광은 시각이 아니라 출처 장면에 속한다(`si`). 그래서 장면 끝 시각에 닿은 점의 후광도 그 장면의 꼬리까지 보인다.
 */
function pulseOnsetsOf(data, scene) {
  const onsets = new Map();
  const add = (key, at) => onsets.set(key, [...(onsets.get(key) ?? []), at]);
  for (const seg of scene.segs) for (const { id, at } of seg.pulses ?? []) add(`node:${id}`, seg.t0 + at);
  for (const { key, at, si } of data.pulses ?? []) if (si === scene.si) add(key, at);
  for (const list of onsets.values()) list.sort((a, b) => a - b);
  return onsets;
}

// ---- 샘플 ----

/**
 * 장면에 들어선 뒤 흐른 표시 시각 elapsed(ms)가 가리키는 때. 정지는 늘 마지막 모습, 한 번은 표시 길이가 지나면 마지막 모습을 유지하고, 반복은 표시 길이마다 처음으로 돌아간다.
 * isSettled(움직임 줄이기, 한 번 장면이 끝나 멈춤)이면 방식과 상관없이 마지막 모습이다.
 * @returns { phase: 'play' | 'final', d } d는 장면 안 표시 시각이다. 마지막 모습은 d가 표시 길이라 후광과 점이 모두 끝나 있다.
 */
function clockOf(scene, elapsed, isSettled) {
  const total = scene.presentationMs;
  if (isSettled || scene.mode === 'static' || !(total > 0)) return { phase: 'final', d: total };
  const now = Math.max(0, elapsed);
  if (scene.mode === 'once') return now >= total ? { phase: 'final', d: total } : { phase: 'play', d: now };
  return { phase: 'play', d: now % total };
}

/**
 * 시각 elapsed에서 장면의 모습. 앞서 어떤 시각을 샘플했는지에 기대지 않는다. isSettled가 참이면 방식과 시각에 상관없이 마지막 모습이다(clockOf).
 * @returns { phase, d, seg, elapsed, cards, edges, held, pulses, values, charts }
 * seg는 전체 박자 번호, elapsed는 그 박자 안 논리 ms, cards는 도형 논리 id별 보일 카드 번호, edges는 { 선 번호: { active, pill } }(pill은 0~1),
 * held는 { edges, lit, parts, lights }(켜진 선 번호, 켜진 도형·그룹 논리 id, 켜진 부분, { 차트 id: 밝힌 행 이름[] }),
 * pulses는 { 키: 0~1 }(0보다 큰 것만), values는 값 줄별 보일 글(이 장면 줄이 아니면 없다), charts는 { 차트 id: 보일 틀 번호 }다.
 */
function sampleScene(scene, data, elapsed, isSettled = false) {
  const { phase, d } = clockOf(scene, elapsed, isSettled);
  // 표시 길이는 반올림되어 있어 d·speed가 장면 끝보다 조금 모자랄 수 있다. 마지막 모습은 늘 장면 끝 시각을 읽는다(끝 시각의 길이 0 박자를 잃지 않는다).
  const isFinal = phase === 'final';
  const logical = isFinal ? Math.max(scene.t0 + d * scene.speed, scene.t1) : scene.t0 + d * scene.speed;
  const held = Math.min(logical, scene.t1);
  const seg = scene.segs.findLast((s) => s.t0 <= held);
  const local = Math.min(held - seg.t0, seg.t1 - seg.t0);
  return {
    phase,
    d,
    si: scene.si,
    seg: scene.first + scene.segs.indexOf(seg),
    elapsed: local,
    cards: cardsAt(seg, local),
    // 마지막 모습은 정의상 쉼이다. 표시 길이는 마지막 효과가 끝나는 시각이라 알약과 후광은 남지 않으며, 표시 길이를 반올림한 끝자리의 양수 찌꺼기를 항목으로 내지 않는다.
    edges: isFinal ? {} : edgeStatesAt(scene, logical),
    held: heldAt(scene, held, seg),
    pulses: isFinal ? {} : pulsesAt(scene, d),
    values: valuesAt(data, scene.si, held),
    charts: chartsAt(data, scene.si, held),
  };
}

// 박자 안 시각 elapsed에 도형(논리 id)마다 보일 카드 번호. 점이 닿는 시각(cardsAt) 전에는 박자 처음 카드, 그 시각부터는 박자 끝 카드다.
function cardsAt(seg, elapsed) {
  const cards = { ...seg.cardsBefore };
  for (const [id, at] of Object.entries(seg.cardsAt)) if (elapsed >= at) cards[id] = seg.cards[id];
  return cards;
}

// 논리 시각 at(구간 seg 안)에 보이는 조용한 선과 켜진 도형·그룹, 부분, 차트 밝히기. 켜 둔 것은 구간이 그 장면에서 지금까지 `light`로 켠 대상이다.
function heldAt(scene, at, seg) {
  const out = { edges: [], lit: [...seg.nodesOn], parts: [...seg.partsOn], lights: {} };
  for (const [id, chart] of Object.entries(seg.charts ?? {})) if (chart.lights.length) out.lights[id] = [...chart.lights];
  for (const entry of scene.held) if (isCovered(entry.ranges, at, scene.t1)) out.edges.push(entry.key);
  return out;
}

// 선이 지금 점으로 차 있는지(active)와 고정 알약 세기(pill, 0~1). 알약은 선이 차 있는 동안 1이고, 비면 fadeMs(표시 시각) 동안 1에서 0으로 줄어든다. 켜 둔 선(held)과는 따로다.
// 선마다 구간 목록을 훑는다. 구간은 선을 지나간 점의 수만큼이다.
function edgeStatesAt(scene, logical) {
  const edges = {};
  for (const [edge, runs] of scene.edgeRuns) {
    const active = runs.some(([from, to]) => from <= logical && logical < to);
    const ended = runs.findLast(([, to]) => to <= logical);
    const pill = active ? 1 : ended ? Math.max(0, 1 - (logical - ended[1]) / scene.speed / scene.timing.fadeMs) : 0;
    if (active || pill > 0) edges[edge] = { active, pill };
  }
  return edges;
}

// 표시 시각 d에서 키별 후광 세기(0보다 큰 것만). 같은 키의 후광이 겹쳐도 가장 센 하나만 쓴다(더하지 않는다).
// 키마다 이분 탐색으로 아직 끝나지 않은 첫 후광을 찾고 시작 전까지 훑는다.
function pulsesAt(scene, d) {
  const out = {};
  for (const [key, onsets] of scene.pulses) {
    let level = 0;
    for (let i = firstAtLeast(onsets, scene.t0 + (d - scene.timing.tailMs) * scene.speed); i < onsets.length; i++) {
      const x = d - (onsets[i] - scene.t0) / scene.speed;
      if (x < 0) break;
      level = Math.max(level, envelope(x, scene.timing));
    }
    if (level > 0) out[key] = level;
  }
  return out;
}

// 오름차순 목록에서 value 이상인 첫 번호. 모두 작으면 길이다.
function firstAtLeast(sorted, value) {
  let [low, high] = [0, sorted.length];
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid] < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

// 후광이 시작한 뒤 x ms(표시 시각)의 세기. 0에서 rise 동안 1로 오르고, hold 동안 1이고, decay 동안 0으로 내린다.
function envelope(x, { riseMs, holdMs, decayMs }) {
  if (x < 0) return 0;
  if (x < riseMs) return x / riseMs;
  if (x < riseMs + holdMs) return 1;
  const falling = x - riseMs - holdMs;
  return falling < decayMs ? 1 - falling / decayMs : 0;
}

// 논리 시각 at에 값 줄마다 보일 글. 이 장면의 줄이 아니면 없다. 시각이 든 기간의 글이고, 어느 기간에도 들지 않으면(같은 시각의 중간 기록 뒤, 끝 이후) 마지막 기록이다.
function valuesAt(data, si, at) {
  return (data.values ?? []).map((row) => (row.si === si ? (row.periods.find(([from, to]) => at >= from && at < to) ?? row.periods.at(-1))[2] : undefined));
}

// 차트 카드마다 보일 틀 번호. 이 장면에 시간표 행이 있으면 그 기간의 틀이고(기간에 들지 않으면 마지막 기간), 행이 없으면 처음 틀(0번, 값이 시작할 때의 그림)이다.
function chartsAt(data, si, at) {
  return Object.fromEntries(
    Object.keys(data.chartFrames ?? {}).map((cardId) => {
      const periods = data.charts?.[cardId]?.rows.find((row) => row.si === si)?.periods;
      return [cardId, periods?.length ? (periods.find(([from, to]) => at >= from && at < to) ?? periods.at(-1))[2] : 0];
    }),
  );
}
