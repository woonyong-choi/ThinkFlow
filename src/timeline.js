// 시간 흐름을 시간표로 편다. 박자마다 상태를 완전히 적어서, 탭으로 건너뛰어도 앞 박자를 다시 계산하지 않는다(docs/design/playback.md).
import { presentSlots, slotMiddle } from './chart/slots.js';
import { roundToScale } from './format.js';
import { hopMs } from './hop-ms.js';
import { flowSeg } from './timeline-flow.js';
import { createSeg } from './timeline-seg.js';
import { valueRows } from './timeline-values.js';
import { values } from './tokens.js';
import { valueRowsByNode } from './values.js';

const DWELL = values.duration;
// 행 이름 세로 옮김(px)을 반올림하는 단위의 역수(소수 둘째 자리)
const SHIFT_PRECISION = 100;

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 도형의 카드 줄 수
// basis: estimate
// 카드 줄 하나를 도형별 줄 목록(rows)에 적용한다. clear는 그 도형의 줄을 비우고 아니면 줄을 더한다.
function applyCardOp(rows, op) {
  if (op.type === 'clear') rows.delete(op.node);
  else rows.set(op.node, [...(rows.get(op.node) ?? []), op.row]);
}

// cost: time O(b·(o + k)), heap O(c·r), stack O(1)
// vars: b = 박자 수, o = 박자의 카드 줄 수, k = 카드 있는 도형 수, c = 카드 내용 수, r = 줄 수
// basis: estimate
/**
 * 박자마다 도형 카드에 보일 내용을 모은다. 크기 계산(가장 큰 내용)과 시간표가 같이 쓴다. 값 카드 줄(`value`)은 그 단계가 보이는 값만, show 줄 앞에 둔다.
 * @returns { contents: Map<도형 id, 줄 목록[]>, beats: Map<beat, { before, after }>, starts: Map<step, 단계 처음 카드> }. before, after, 단계 처음 카드는 { 도형 id: 내용 번호 }
 */
export function collectCards(figure) {
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
  const valueRows = valueRowsByNode(figure);
  for (const step of figure.steps) {
    const rows = new Map();
    const stateOf = () => Object.fromEntries([...new Set([...valueRows.keys(), ...rows.keys()])].map((id) => [id, indexOf(id, [...(valueRows.get(id) ?? []), ...(rows.get(id) ?? [])])]));
    let state = stateOf();
    starts.set(step, state);
    for (const beat of step.beats) {
      const before = state;
      for (const op of beat.ops) applyCardOp(rows, op);
      state = stateOf();
      beats.set(beat, { before, after: state });
    }
  }
  return { contents, beats, starts };
}

/** 계열이 없는 차트(상자, 히트맵, 계열 없는 산점도)가 통째로 자랄 때 쓰는 계열 id */
const WHOLE_CHART = '*';

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 계열 수
// basis: estimate
/** 시간표가 다루는 차트 계열 id. 계열이 없으면 차트 전체를 계열 하나로 본다. */
export function chartSeriesIds(figure) {
  return figure.chart.series.length ? figure.chart.series.map((s) => s.id) : [WHOLE_CHART];
}

// cost: time O(b·(h + e + k)), heap O(b·(e + k)), stack O(1)
// vars: b = 박자 수, h = 박자의 이동 수, e = 선 수, k = 카드 있는 도형 수
// basis: estimate
/**
 * 시간표를 만든다. 이동 시간에 선 길이가 필요해 배치가 끝난 장면을 받는다. 차트는 장면이 없다.
 * @param deps { cards, chips, scene }. chips는 이동 글을 글 상자 줄로 나누는 함수, scene은 배치가 끝난 장면(edges의 points를 쓴다)이고 차트면 없다
 * @returns { segs, total, steps, growMs, tracks?, values? }. growMs는 차트 계열이 자라는 시간이다. tracks는 흐름이 지나는 길 { points, names, line }, values는 값 줄마다 값이 바뀌는 시각이다(docs/design/playback.md).
 * seg: { si, bi, t0, t1, labelShifts, move, hops, edgesOn, nodesOn, partsOn, cards, cardsBefore, cardsAt, caption, series, growing, lights }. 흐름 단계의 seg는 edgesAt, nodesAt(처음 닿는 시각)을 더 갖는다
 */
export function buildTimeline(figure, deps) {
  const speed = figure.speedMs ?? (figure.kind === 'chart' ? DWELL.reveal : DWELL.hop);
  // 박자를 지나며 이어지는 값: 시각, 순서 그림 메시지 번호, 드러난 계열
  const run = {
    figure,
    speed,
    t: 0,
    messageIndex: 0,
    revealed: [],
    hasReveal: figure.steps.some((s) => s.beats.some((b) => b.reveal.length)),
    seriesIds: chartSeriesIds(figure),
    tracks: [],
    values: [],
  };
  const segs = figure.steps.flatMap((step, si) => stepSegs({ step, si }, run, deps));
  const extra = { ...(run.tracks.length ? { tracks: run.tracks } : {}), ...(run.values.length ? { values: run.values } : {}) };
  return { segs, total: run.t || 1, steps: figure.steps.map((s) => s.label), growMs: speed, ...extra };
}

// cost: time O(b·(h + e + k) + w·e), heap O(b·(e + k)), stack O(1)
// vars: b = 박자 수, h = 박자의 이동 수, e = 선 수, k = 카드 있는 도형 수, w = 값 수와 식 수
// basis: estimate
// 단계 하나의 구간들과 그 단계의 값 줄. 흐름 단계는 구간 하나이고 박자 단계는 박자마다 하나다.
function stepSegs({ step, si }, run, deps) {
  const { figure } = run;
  const { segs, moves } = step.tracks.length ? flowSeg({ step, si }, run, deps) : beatSegs({ step, si }, run, deps);
  if (!figure.values.length) return segs;
  const first = segs[0];
  const rows = valueRows(figure, { moves, span: { si, t0: first.t0, t1: segs.at(-1).t1 } });
  run.values.push(...rows.map((row) => ({ ...row, card: first.cards[row.node] ?? first.cardsBefore[row.node] })));
  return segs;
}

// cost: time O(b·(h + e + k)), heap O(b·(e + k)), stack O(1)
// vars: b = 박자 수, h = 박자의 이동 수, e = 선 수, k = 카드 있는 도형 수
// basis: estimate
// 박자 단계의 구간들과, 값 바꾸기 식이 쓰는 이동 목록(박자 시작에 점이 출발해 이동 시간 뒤 도착한다).
function beatSegs({ step, si }, run, deps) {
  // 단계 안에서 쌓이는 값: 지나간 선, 밝힌 대상, 차트 밝히기, 마지막 설명
  const memory = { edgesOn: new Set(), lit: new Set(), lights: [], caption: step.caption ?? '' };
  const segs = step.beats.map((beat, bi) => beatSeg({ step, si, beat, bi }, { memory, run }, deps));
  const moves = step.beats.flatMap((beat, bi) => beat.hops.map((hop, hi) => ({ start: segs[bi].t0, ms: segs[bi].hops[hi].ms, nodes: [hop.from, hop.to].map((id) => id.split('.')[0]), fracs: [0, 1], sets: hop.sets })));
  return { segs, moves };
}

// cost: time O(h + e + k), heap O(e + k), stack O(1)
// vars: h = 박자의 이동 수, e = 선 수, k = 카드 있는 도형 수
// basis: estimate
// 박자 하나의 상태. 시각 t를 이 박자 길이만큼 앞으로 보낸다.
function beatSeg({ step, si, beat, bi }, { memory, run }, { cards, chips, scene }) {
  const { figure, speed } = run;
  const hops = beat.hops.map((hop) => {
    const edge = figure.kind === 'sequence' ? run.messageIndex++ : hop.edge;
    return { edge, isBack: Boolean(hop.isBack), ms: hop.timeMs ?? hopMs(scene.edges[edge].points, speed), to: hop.to.split('.')[0], data: hop.data !== undefined && figure.kind !== 'sequence' ? chips(hop.data) : undefined, ...(hop.tone ? { tone: hop.tone } : {}), line: hop.line };
  });
  for (const h of hops) memory.edgesOn.add(h.edge);
  for (const target of beat.light) memory.lit.add(target);
  memory.lights.push(...beat.chartLight.map((l) => (l.x !== undefined ? `x=${l.x}` : l.names.join('\u0000'))));
  const growing = run.hasReveal ? beat.reveal : bi === 0 && si === 0 ? run.seriesIds : [];
  run.revealed.push(...beat.reveal);
  if (beat.say !== undefined) memory.caption = beat.say;
  const move = Math.max(0, ...hops.map((h) => h.ms));
  const grow = growing.length ? speed : 0;
  const said = beat.say ?? (bi === 0 ? step.caption : undefined);
  const hold = dwellOf(said) + (bi === step.beats.length - 1 ? DWELL['step-end'] : 0);
  const card = cards.beats.get(beat) ?? { before: {}, after: {} };
  return createSeg(run, {
    line: beat.line,
    si,
    bi,
    length: Math.max(move, grow) + beat.waitMs + hold,
    labelShifts: run.hasReveal ? labelShiftsOf(figure, [...run.revealed]) : [],
    move,
    hops,
    edgesOn: [...memory.edgesOn],
    nodesOn: [...memory.lit].filter((id) => !id.includes('.')),
    partsOn: [...memory.lit].filter((id) => id.includes('.')),
    card: { before: card.before, after: card.after, at: cardTimes(hops, card) },
    caption: memory.caption,
    growing,
    lights: [...memory.lights],
  });
}

// cost: time O(r·s), heap O(r), stack O(1)
// vars: r = 행 수, s = 계열 수
// basis: estimate
/**
 * 막대 차트의 행 이름이 보이는 막대 가운데로 가도록 행마다 세로로 옮길 거리(px). 이름은 모든 계열이 보일 때 값이 있는 막대 묶음의 가운데에 그려져 있으므로,
 * 계열을 하나씩 드러내는 동안은 보이는 막대의 가운데와 그 자리의 차이만큼 옮긴다. 값이 없는 계열 슬롯(비교 없음 글)은 막대가 아니라서 묶음 가운데를 정할 때 빼고,
 * 막대가 하나도 안 보이고 그 글만 보이는 동안에는 그 글 슬롯에 맞춘다. 플레이어는 이 값을 읽어 적용만 한다. 막대가 아니거나 계열이 하나면 빈 목록이다.
 */
function labelShiftsOf(figure, shown) {
  const { series, rows } = figure.chart;
  if (figure.chartType !== 'bar' || series.length < 2) return [];
  const seen = series.flatMap((s, i) => (shown.includes(s.id) ? [i] : []));
  return rows.map((row) => {
    if (!seen.length) return 0;
    const present = presentSlots(row, series);
    const bars = seen.filter((i) => present.includes(i));
    return roundToScale(slotMiddle(bars.length ? bars : seen) - slotMiddle(present), SHIFT_PRECISION);
  });
}

// cost: time O(h + k), heap O(k), stack O(1)
// vars: h = 이동 수, k = 카드 있는 도형 수
// basis: estimate
// 도착 규칙: 카드가 바뀌는 도형 가운데 이 박자에 점이 도착하는 도형은 가장 늦은 도착 시각에, 나머지는 0에 바뀐다.
function cardTimes(hops, card) {
  const arrivals = new Map();
  for (const h of hops) arrivals.set(h.to, Math.max(arrivals.get(h.to) ?? 0, h.ms));
  const changed = Object.keys({ ...card.before, ...card.after }).filter((id) => card.before[id] !== card.after[id]);
  return Object.fromEntries(changed.map((id) => [id, arrivals.get(id) ?? 0]));
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 설명 글자 수
// basis: estimate
// 새 설명이 있으면 글 길이만큼 멈추고, 없으면 기본 멈춤 시간이다.
function dwellOf(said) {
  if (!said) return DWELL.dwell;
  return Math.min(DWELL['dwell-max'], Math.max(DWELL.dwell, [...said].length * DWELL['dwell-per-char']));
}

// cost: time O(e + l + k), heap O(e + l + k), stack O(1)
// vars: e = 밝은 선 수, l = light 대상 수, k = 카드 있는 도형 수
// basis: estimate
/** 박자에서 밝은 도형과 그룹의 id. 밝은 선의 양 끝, light 대상, 카드가 찬 도형이다. HTML과 SVG가 같이 쓴다. */
export function litIds(seg, edges) {
  const ids = new Set(seg.nodesOn);
  for (const j of seg.edgesOn) {
    ids.add(edges[j].from.split('.')[0]);
    ids.add(edges[j].to.split('.')[0]);
  }
  for (const id of Object.keys(seg.cards)) ids.add(id);
  return ids;
}
