// 시간 흐름을 시간표로 편다. 박자마다 상태를 완전히 적어서, 탭으로 건너뛰어도 앞 박자를 다시 계산하지 않는다(docs/design/playback.md).
import { values } from './tokens.js';

const DWELL = values.duration;

// cost: time O(b·(o + k)), heap O(c·r), stack O(1)
// vars: b = 박자 수, o = 박자의 카드 줄 수, k = 카드 있는 도형 수, c = 카드 내용 수, r = 줄 수
// basis: estimate
/**
 * 박자마다 도형 카드에 보일 내용을 모은다. 크기 계산(가장 큰 내용)과 시간표가 같이 쓴다.
 * @returns { contents: Map<도형 id, 줄 목록[]>, beats: Map<beat, { before, after }> }. before, after는 { 도형 id: 내용 번호 }
 */
export function collectCards(figure) {
  const contents = new Map();
  const beats = new Map();
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
  for (const step of figure.steps) {
    const rows = new Map();
    let state = {};
    for (const beat of step.beats) {
      const before = state;
      for (const op of beat.ops) {
        if (op.type === 'clear') rows.delete(op.node);
        else rows.set(op.node, [...(rows.get(op.node) ?? []), op.row]);
      }
      state = Object.fromEntries([...rows.entries()].map(([id, r]) => [id, indexOf(id, r)]));
      beats.set(beat, { before, after: state });
    }
  }
  return { contents, beats };
}

// cost: time O(b·(h + e + k)), heap O(b·(e + k)), stack O(1)
// vars: b = 박자 수, h = 박자의 이동 수, e = 선 수, k = 카드 있는 도형 수
// basis: estimate
/**
 * 시간표를 만든다.
 * @param chips 이동 글을 글 상자 줄로 나누는 함수
 * @returns { segs, total, steps }. seg: { si, bi, t0, t1, move, hops, edgesOn, nodesOn, columnsOn, cards, cardsBefore, cardsAt, caption, series, growing, lights }
 */
export function buildTimeline(figure, cards, chips) {
  const speed = figure.speedMs ?? (figure.kind === 'chart' ? DWELL.reveal : DWELL.hop);
  const segs = [];
  const revealed = [];
  const hasReveal = figure.steps.some((s) => s.beats.some((b) => b.reveal.length));
  const seriesIds = figure.chart.series.map((s) => s.id);
  let t = 0;
  let messageIndex = 0;
  figure.steps.forEach((step, si) => {
    const edgesOn = new Set();
    const lit = new Set();
    const lights = [];
    let caption = step.caption ?? '';
    step.beats.forEach((beat, bi) => {
      const hops = beat.hops.map((hop) => {
        const edge = figure.kind === 'sequence' ? messageIndex++ : hop.edge;
        return { edge, isBack: Boolean(hop.isBack), ms: hop.timeMs ?? speed, to: hop.to.split('.')[0], data: hop.data !== undefined && figure.kind !== 'sequence' ? chips(hop.data) : undefined };
      });
      for (const h of hops) edgesOn.add(h.edge);
      for (const target of beat.light) lit.add(target);
      lights.push(...beat.chartLight.map((l) => (l.x !== undefined ? `x=${l.x}` : l.names.join('\u0000'))));
      const growing = hasReveal ? beat.reveal : bi === 0 && si === 0 ? seriesIds : [];
      revealed.push(...beat.reveal);
      if (beat.say !== undefined) caption = beat.say;
      const move = Math.max(0, ...hops.map((h) => h.ms));
      const grow = growing.length ? speed : 0;
      const said = beat.say ?? (bi === 0 ? step.caption : undefined);
      const isLast = bi === step.beats.length - 1;
      const hold = dwellOf(said) + (isLast ? DWELL['step-end'] : 0);
      const card = cards.beats.get(beat) ?? { before: {}, after: {} };
      const cardsAt = cardTimes(hops, card);
      const seg = {
        si,
        bi,
        t0: t,
        t1: t + Math.max(move, grow) + beat.waitMs + hold,
        move,
        hops,
        edgesOn: [...edgesOn],
        nodesOn: [...lit].filter((id) => !id.includes('.')),
        columnsOn: [...lit].filter((id) => id.includes('.')),
        cards: card.after,
        cardsBefore: card.before,
        cardsAt,
        caption,
        series: hasReveal ? [...revealed] : seriesIds,
        growing,
        lights: [...lights],
      };
      segs.push(seg);
      t = seg.t1;
    });
  });
  return { segs, total: t || 1, steps: figure.steps.map((s) => s.label) };
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
