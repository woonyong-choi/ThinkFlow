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
// 메모 상자와 같은 행 화살표 라벨 사이의 최소 간격. 이동 글 상자 간격과 같다.
const NOTE_CLEAR = SPACE['2'];

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
  const centers = placeColumns({ participants, sizes, index }, messages, noteBoxes);
  const headH = Math.max(...participants.map((p) => sizes.get(p.id).h + sizes.get(p.id).marginTop + sizes.get(p.id).marginBottom));
  const items = participants.map((p, i) => {
    const size = sizes.get(p.id);
    const bottom = PAD + headH - size.marginBottom;
    return { ...p, ...size, x: centers[i] - size.w / 2, y: bottom - size.h, w: size.w, h: size.h, ports: [] };
  });
  const rows = layoutRows(messages, noteBoxes, { index, centers, top: PAD + headH + SPACE['12'] });
  const { edges, notes } = rows;
  const bottom = rows.bottom + SPACE['8'];
  const lifelines = items.map((it) => ({ id: it.id, x: centers[index.get(it.id)], y1: it.y + it.h + it.marginBottom, y2: bottom }));
  const right = Math.max(...items.map((it) => it.x + it.w), ...notes.map((n) => n.x + n.w), ...edges.flatMap((e) => e.points.map((p) => p.x)));
  return { items, groups: [], edges, lifelines, notes, width: right + PAD, height: bottom + PAD };
}

// cost: time O(m·n), heap O(m + n), stack O(1)
// vars: m = 메시지 수, n = 메모 수
// basis: estimate
// 메시지마다 한 행을 위에서 아래로 쌓는다. 행 높이는 화살표, 라벨, 그 행의 메모가 서로 겹치지 않는 가장 작은 값이다.
function layoutRows(messages, noteBoxes, ctx) {
  let y = ctx.top;
  const edges = [];
  const notes = [];
  messages.forEach((beat, m) => {
    const row = layoutRow(beat, noteBoxes.filter((n) => n.m === m), { ...ctx, m, y });
    edges.push(row.edge);
    notes.push(...row.notes);
    y += row.height;
  });
  return { edges, notes, bottom: y };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 행의 메모 수
// basis: estimate
// 한 행. 메모가 화살표나 그 라벨과 가로로 겹치면 메모를 위에, 화살표와 라벨을 그 아래에 쌓는다. 겹치지 않으면 한 높이에 나란히 둔다.
function layoutRow(beat, rowNotes, { index, centers, m, y }) {
  const hop = beat.hops[0];
  const [a, b] = [index.get(hop.from), index.get(hop.to)];
  const isSelf = a === b;
  const pill = sizePill(hop.data);
  const loop = Math.max(SPACE['20'], pill.w / 2 + SPACE['6']);
  const placed = rowNotes.map((n) => ({ ...n, x: noteX(n, centers[index.get(n.node)], isRightNote(n, hop)), y: y + SPACE['2'] }));
  const mid = (centers[a] + centers[b]) / 2;
  const span = isSelf ? [centers[a], centers[a] + loop + pill.w / 2] : [Math.min(centers[a], centers[b], mid - pill.w / 2), Math.max(centers[a], centers[b], mid + pill.w / 2)];
  const isStacked = placed.some((n) => n.x < span[1] && n.x + n.w > span[0]);
  const selfExtra = isSelf ? SIZE['seq-row'] / 2 : 0;
  // 메모 위 여백 + 메모 + 최소 간격 + 라벨 위 간격 + 라벨 + 화살표 아래 여백
  const stack = isStacked ? SPACE['2'] + Math.max(...placed.map((n) => n.h)) + NOTE_CLEAR + pill.h + SPACE['2'] + SPACE['8'] + selfExtra : 0;
  const height = Math.max(SIZE['seq-row'] * (isSelf ? 2 : 1), ...placed.map((n) => n.h + SPACE['8']), stack);
  const lineY = y + height - SPACE['8'] - selfExtra;
  const points = isSelf
    ? [{ x: centers[a], y: lineY }, { x: centers[a] + loop, y: lineY }, { x: centers[a] + loop, y: lineY + SPACE['14'] }, { x: centers[a], y: lineY + SPACE['14'] }]
    : [{ x: centers[a], y: lineY }, { x: centers[b], y: lineY }];
  const labelAt = { x: isSelf ? centers[a] + loop : mid, y: lineY - pill.h / 2 - SPACE['2'] };
  return { height, notes: placed, edge: { index: m, from: hop.from, to: hop.to, label: hop.data, points, labelAt, quiet: false, dashed: hop.dashed, line: hop.line } };
}

// 메모는 참여자 선 오른쪽에 놓는다. 그 참여자의 자기 고리와 같은 행이면 고리가 오른쪽을 쓰므로 왼쪽에 놓는다.
function isRightNote(note, hop) {
  return !(hop.from === hop.to && hop.from === note.node);
}

// 메모 상자의 왼쪽 x. 참여자 선 오른쪽에 두거나, 자기 고리의 메모는 왼쪽에 둔다.
function noteX(note, center, toRight) {
  return toRight ? center + SPACE['6'] : center - SPACE['6'] - note.w;
}

// cost: time O(p + m), heap O(p), stack O(1)
// vars: p = 참여자 수, m = 메시지 수
// basis: estimate
// 왼쪽 열부터 가운데 x를 정한다. 이웃 참여자 너비 절반의 합, 건너는 메시지 라벨 폭, 메모와 자기 고리 폭을 모두 만족하는 가장 작은 간격이다.
function placeColumns({ participants, sizes, index }, messages, noteBoxes) {
  const half = (i) => sizes.get(participants[i].id).w / 2;
  const rightNeed = participants.map(() => 0);
  const leftNeed = participants.map(() => 0);
  for (const n of noteBoxes) {
    const need = isRightNote(n, messages[n.m].hops[0]) ? rightNeed : leftNeed;
    need[index.get(n.node)] = Math.max(need[index.get(n.node)], n.w + SPACE['12']);
  }
  for (const beat of messages) {
    const hop = beat.hops[0];
    if (hop.from === hop.to) rightNeed[index.get(hop.from)] = Math.max(rightNeed[index.get(hop.from)], sizePill(hop.data).w + SPACE['20']);
  }
  // 첫 참여자의 왼쪽 메모는 그림 왼쪽 여백(PAD) 안에서 시작한다.
  const centers = [Math.max(PAD + half(0), PAD + leftNeed[0] - SPACE['6'])];
  for (let i = 1; i < participants.length; i++) {
    let c = centers[i - 1] + Math.max(half(i - 1) + half(i) + SPACE['16'], rightNeed[i - 1], leftNeed[i]);
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
  const lines = wrap(text, NOTE_MAX - NOTE_PAD * 2, STYLE.row);
  const w = Math.max(...lines.map((l) => measure(l, STYLE.row.size))) + NOTE_PAD * 2;
  return { lines, w, h: lines.length * STYLE.row.line + NOTE_PAD * 2 };
}
