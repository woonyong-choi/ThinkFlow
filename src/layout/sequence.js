// 순서 그림 배치. 참여자 열과 메시지 행이 정해진 격자라 elkjs를 쓰지 않는다(docs/design/layout.md 순서 그림 배치).
import { measure, wrap } from '../measure/fonts.js';
import { STYLE, sizePill } from '../measure/sizes.js';
import { values } from '../tokens.js';

const SPACE = values.space;
const SIZE = values.size;
const PAD = SPACE['14'];
// 메모 상자 안쪽 여백과 최대 너비
const NOTE_PAD = SPACE['5'];
const NOTE_MAX = SIZE['chip-max'];

// cost: time O(p·m + m·n²), heap O(p + m), stack O(1)
// vars: p = 참여자 수, m = 메시지 수, n = 글자 수
// basis: estimate
/**
 * 순서 그림을 배치한다.
 * @returns { items, groups: [], edges, lifelines, notes, width, height }. 메시지는 적은 순서대로 edges의 번호를 받는다
 */
export function layoutSequence(figure, sizes) {
  const participants = figure.nodes;
  const index = new Map(participants.map((p, i) => [p.id, i]));
  const messages = figure.steps.flatMap((s) => s.beats).filter((b) => b.hops.length);
  const noteBoxes = messages.flatMap((beat, m) => beat.notes.map((n) => ({ ...n, m, ...sizeNote(n.text) })));
  const centers = placeColumns(participants, sizes, messages, noteBoxes, index);
  const headH = Math.max(...participants.map((p) => sizes.get(p.id).h + sizes.get(p.id).marginTop + sizes.get(p.id).marginBottom));
  const items = participants.map((p, i) => {
    const size = sizes.get(p.id);
    const bottom = PAD + headH - size.marginBottom;
    return { ...p, ...size, x: centers[i] - size.w / 2, y: bottom - size.h, w: size.w, h: size.h, ports: [] };
  });
  let y = PAD + headH + SPACE['12'];
  const edges = [];
  const notes = [];
  messages.forEach((beat, m) => {
    const hop = beat.hops[0];
    const [a, b] = [index.get(hop.from), index.get(hop.to)];
    const isSelf = a === b;
    const rowNotes = noteBoxes.filter((n) => n.m === m);
    const rowH = Math.max(SIZE['seq-row'] * (isSelf ? 2 : 1), ...rowNotes.map((n) => n.h + SPACE['8']));
    const lineY = y + rowH - SPACE['8'] - (isSelf ? SIZE['seq-row'] / 2 : 0);
    const pill = sizePill(hop.data);
    const loop = Math.max(SPACE['20'], pill.w / 2 + SPACE['6']);
    const points = isSelf
      ? [{ x: centers[a], y: lineY }, { x: centers[a] + loop, y: lineY }, { x: centers[a] + loop, y: lineY + SPACE['14'] }, { x: centers[a], y: lineY + SPACE['14'] }]
      : [{ x: centers[a], y: lineY }, { x: centers[b], y: lineY }];
    const labelAt = isSelf ? { x: centers[a] + loop, y: lineY - pill.h / 2 - SPACE['2'] } : { x: (centers[a] + centers[b]) / 2, y: lineY - pill.h / 2 - SPACE['2'] };
    edges.push({ index: m, from: hop.from, to: hop.to, label: hop.data, points, labelAt, quiet: false, dashed: hop.dashed, line: hop.line });
    for (const n of rowNotes) {
      const c = centers[index.get(n.node)];
      const toRight = !(isSelf && index.get(n.node) === a);
      notes.push({ ...n, x: toRight ? c + SPACE['6'] : c - SPACE['6'] - n.w, y: y + SPACE['2'] });
    }
    y += rowH;
  });
  const bottom = y + SPACE['8'];
  const lifelines = items.map((it) => ({ id: it.id, x: centers[index.get(it.id)], y1: it.y + it.h + it.marginBottom, y2: bottom }));
  const right = Math.max(...items.map((it) => it.x + it.w), ...notes.map((n) => n.x + n.w), ...edges.flatMap((e) => e.points.map((p) => p.x)));
  return { items, groups: [], edges, lifelines, notes, width: right + PAD, height: bottom + PAD };
}

// cost: time O(p + m), heap O(p), stack O(1)
// vars: p = 참여자 수, m = 메시지 수
// basis: estimate
// 왼쪽 열부터 가운데 x를 정한다. 이웃 참여자 너비 절반의 합, 건너는 메시지 라벨 폭, 메모와 자기 고리 폭을 모두 만족하는 가장 작은 간격이다.
function placeColumns(participants, sizes, messages, noteBoxes, index) {
  const half = (i) => sizes.get(participants[i].id).w / 2;
  const rightNeed = participants.map(() => 0);
  for (const n of noteBoxes) rightNeed[index.get(n.node)] = Math.max(rightNeed[index.get(n.node)], n.w + SPACE['12']);
  for (const beat of messages) {
    const hop = beat.hops[0];
    if (hop.from === hop.to) rightNeed[index.get(hop.from)] = Math.max(rightNeed[index.get(hop.from)], sizePill(hop.data).w + SPACE['20']);
  }
  const centers = [PAD + half(0)];
  for (let i = 1; i < participants.length; i++) {
    let c = centers[i - 1] + Math.max(half(i - 1) + half(i) + SPACE['16'], rightNeed[i - 1]);
    for (const beat of messages) {
      const hop = beat.hops[0];
      const [a, b] = [index.get(hop.from), index.get(hop.to)].sort((x, y) => x - y);
      if (b === i && a < i) c = Math.max(c, centers[a] + sizePill(hop.data).w + SPACE['12']);
    }
    centers.push(c);
  }
  return centers;
}

// cost: time O(n²), heap O(n), stack O(1)
// vars: n = 메모 글자 수
// basis: estimate
// 메모 상자 크기. 너비 NOTE_MAX에서 줄을 나눈다.
function sizeNote(text) {
  const lines = wrap(text, NOTE_MAX - NOTE_PAD * 2, STYLE.row.size);
  const w = Math.max(...lines.map((l) => measure(l, STYLE.row.size))) + NOTE_PAD * 2;
  return { lines, w, h: lines.length * STYLE.row.line + NOTE_PAD * 2 };
}
