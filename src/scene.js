// D2가 배치한 도형과 선을 그릴 장면(scene)으로 바꾸고, 흐름을 박자별 상태로 편다.
import { isLifeline } from './d2.js';
import { pointAlong, routeBezier, routeCurve, routePolyline, straighten } from './route.js';
import { layoutMiniGraph } from './minigraph.js';
import { measureMono, measureText, wrapText } from './text.js';
import { values } from './tokens.js';

const SPACE = values.space;
const TEXT = values.size.text;
/** 그림 둘레 여백 */
export const PAD = SPACE['14'];
/** 카드 크기와 안쪽 여백 */
export const CARD = Object.freeze({ width: values.size.card, line: values.size.line['15'], pad: SPACE['3'], side: SPACE['4'], gap: SPACE['2'] });
/** 박자마다 점이 도착한 뒤 멈춰 두는 시간(ms). 설명이 바뀐 박자는 글 길이만큼 둔다. */
export const DWELL = Object.freeze({
  base: values.duration.dwell,
  perChar: values.duration['dwell-per-char'],
  max: values.duration['dwell-max'],
  stepEnd: values.duration['step-end'],
});
const NODE = Object.freeze({ minW: values.size['node-min'], maxW: values.size['node-max'], label: values.size.line['18'], sub: values.size.line['15'] });
// D2 경로 모서리를 둥글리는 반지름
const CORNER_RADIUS = values.radius.route;
// 이보다 짧은 계단 단은 끝점을 옮겨 편다. 노드 한 줄 높이보다 작아 끝점이 같은 면 안에 남는다.
const STEP = SPACE['20'];
// 끝점을 옮길 때 도형 모서리에서 비우는 거리.
const PORT_MARGIN = SPACE['4'];
// 나란한 두 선 구간이 이보다 가까우면 붙어 보인다. ELK가 두는 선 간격보다 조금 작다.
const CROWD = SPACE['2-5'];
// 사람 모양에서 몸통 옆면이 시작하는 높이 비율. 이보다 위는 어깨 곡선과 머리라 선이 허공에 닿는다.
const PERSON_BODY_TOP = 0.7;
// 선 라벨을 놓아 볼 자리. 선 길이에 대한 비율이고, 가운데부터 바깥으로 넓혀 간다.
const LABEL_SPOTS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
// 도형 아래에 라벨을 두는 모양(person 등)이 차지하는 높이
const OUTSIDE_LABEL_H = SPACE['12'];

// 이 모양들만 크기를 다시 잡는다. 나머지는 D2 크기를 그대로 쓴다.
const RESIZED = new Set(['rectangle', 'cylinder', 'page', 'document', 'parallelogram', 'queue', 'package', 'step', 'callout', 'stored_data', 'cloud']);
// D2 모양 이름과 그리는 모양 이름. 없는 모양은 둥근 사각형(box)으로 그린다.
const KIND = { cylinder: 'store', diamond: 'decision', oval: 'oval', circle: 'oval', hexagon: 'hexagon', person: 'person', sql_table: 'table', class: 'class', image: 'image', code: 'code' };

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 라벨 글자 수
// basis: estimate
/** 라벨의 첫 줄은 라벨, 나머지 줄은 부제목이다. */
export function splitLabel(label) {
  const [head = '', ...rest] = String(label ?? '').split('\n');
  return { label: head, sub: rest };
}

// cost: time O(r·n²), heap O(r·n), stack O(1)
// vars: r = 카드 줄 수, n = 줄 글자 수
// basis: estimate
/**
 * 카드 줄들을 너비에 맞춰 나눈다.
 * @returns { rows: { row, isHeading, tagW, lines, graph? }[], height }. isHeading은 태그가 길어 줄 위에 따로 서는 경우다.
 *   graph는 관계 그래프 줄의 배치(layoutMiniGraph)다.
 */
export function layoutCard(rows, width) {
  const inner = width - CARD.side * 2;
  if (!rows?.length) return { rows: [], height: CARD.line + CARD.pad * 2 };
  const laid = rows.map((row) => {
    if (row.graph) return { row, isHeading: false, tagW: 0, lines: [], graph: layoutMiniGraph(row.graph, inner) };
    const isHeading = (row.tag?.length ?? 0) > 2;
    const tagW = row.tag && !isHeading ? measureText(row.tag.toUpperCase(), TEXT['9']) + SPACE['6-5'] : 0;
    const markW = row.mark && !isHeading ? measureText(row.mark, TEXT['11']) + SPACE['3'] : 0;
    const body = row.text + (row.meta != null ? ` · ${row.meta}` : '');
    return { row, isHeading, tagW, lines: wrapText(body, inner - tagW - markW, row.isMono ? TEXT['10-5'] : TEXT['11']) };
  });
  const textH = laid.reduce((h, r) => h + (r.isHeading ? CARD.line : 0) + r.lines.length * CARD.line + (r.graph?.height ?? 0), 0);
  return { rows: laid, height: textH + CARD.gap * (laid.length - 1) + CARD.pad * 2 };
}

// cost: time O(b·k·r), heap O(c·r), stack O(1)
// vars: b = 박자 수, k = 도형마다 서로 다른 카드 내용 수, r = 카드 줄 수, c = 카드 내용 전체 수
// basis: estimate
/** 흐름이 카드에 담는 내용 전부. 도형 id마다 서로 다른 내용 목록이다. */
export function collectCardContents(flow) {
  const cards = new Map();
  for (const step of flow.steps) {
    for (const beat of step.beats) {
      for (const [id, rows] of Object.entries(beat.show ?? {})) {
        if (!cards.has(id)) cards.set(id, []);
        const list = cards.get(id);
        if (!list.some((known) => isSameRows(known, rows))) list.push(rows);
      }
    }
  }
  return cards;
}

function isSameRows(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// cost: time O(s·c), heap O(c), stack O(1)
// vars: s = 도형 수, c = 선 수
// basis: estimate
// 순서 그림 참여자와 그 안 도형, container를 알아보는 함수를 만든다.
function analyzeStructure(diagram) {
  const ids = diagram.shapes.map((s) => s.id);
  const participants = new Set(diagram.connections.filter(isLifeline).map((c) => c.src));
  const isInSequence = (id) => [...participants].some((p) => id === p || id.startsWith(`${p}.`));
  const isContainer = (id) => !participants.has(id) && ids.some((k) => k.startsWith(`${id}.`));
  return { isInSequence, isContainer };
}

// cost: time O(s² + s·r·n²), heap O(s), stack O(1)
// vars: s = 도형 수, r = 카드 줄 수, n = 줄 글자 수
// basis: estimate
/**
 * 도형 크기를 Hindsight 그림처럼 잡는 D2 줄을 만든다. 원본 뒤에 붙이면 D2가 이 크기로 다시 배치한다.
 * 원본에 width, height, font-size를 적은 도형과 선은 건드리지 않는다.
 * @returns 줄바꿈으로 이은 D2 줄. 바꿀 것이 없으면 빈 글자
 */
export function buildSizeOverrides(diagram, flow) {
  const { sized, fontSized } = diagram.explicit ?? { sized: new Set(), fontSized: new Set() };
  const { isInSequence, isContainer } = analyzeStructure(diagram);
  const cards = collectCardContents(flow);
  const lines = [];
  for (const s of diagram.shapes) {
    const isResized = RESIZED.has(s.type) && !isContainer(s.id) && !isInSequence(s.id) && !sized.has(s.id);
    if (!isResized) continue;
    const { w, h } = measureNode(s, cards.get(s.id));
    lines.push(`${s.id}.width: ${Math.round(w)}`, `${s.id}.height: ${Math.round(h)}`);
  }
  // container 라벨과 선 라벨은 작게 그리므로 D2가 잡는 자리도 줄인다.
  for (const s of diagram.shapes) {
    if (isContainer(s.id) && !fontSized.has(s.id)) lines.push(`${s.id}.style.font-size: 12`);
  }
  for (const c of diagram.connections) {
    if (c.label && !isLifeline(c) && !fontSized.has(c.id)) lines.push(`${c.id}.style.font-size: 11`);
  }
  return lines.join('\n');
}

// cost: time O(k·r·n²), heap O(r·n), stack O(1)
// vars: k = 카드 내용 수, r = 카드 줄 수, n = 줄 글자 수
// basis: estimate
// 도형 하나의 너비와 높이. 너비는 라벨 폭, 높이는 라벨 줄 수와 가장 긴 카드 내용으로 정한다.
function measureNode(shape, contents) {
  const { label, sub } = splitLabel(shape.label);
  const iconW = shape.icon ? measureText(label, TEXT['14']) + SPACE['32'] : 0;
  let w = Math.max(measureText(label, TEXT['14']) + SPACE['18'], ...sub.map((t) => measureText(t, TEXT['12']) + SPACE['16']), iconW);
  w = Math.min(NODE.maxW, Math.max(NODE.minW, w));
  if (contents) w = Math.max(w, CARD.width);
  const isStore = shape.type === 'cylinder';
  const top = isStore ? SPACE['12'] : SPACE['5'];
  const cardH = contents ? SPACE['4'] + Math.max(...contents.map((rows) => layoutCard(rows, w - SPACE['5'] * 2).height)) : 0;
  const minH = isStore ? values.size['store-min-h'] : values.size['node-min-h'];
  const h = Math.max(minH, top + NODE.label + sub.length * NODE.sub + cardH + SPACE['5']);
  return { w, h };
}

// cost: time O(s·c·p + c²·p³), heap O(s + c·p), stack O(1)
// vars: s = 도형 수, c = 선 수, p = 경로 점 수
// basis: estimate
/**
 * 그릴 것 전부를 모은다. 좌표는 그림 왼쪽 위가 PAD가 되게 옮긴다.
 * @returns { items, edges, width, height }. items는 부모가 먼저 오도록 깊이 순이다.
 */
export function layoutScene(diagram, flow, { edges: edgeMode = 'd2' } = {}) {
  const structure = analyzeStructure(diagram);
  const points = [
    ...diagram.shapes.flatMap((s) => [s.pos, { x: s.pos.x + s.width, y: s.pos.y + s.height + (s.labelPosition?.startsWith('OUTSIDE_BOTTOM') ? OUTSIDE_LABEL_H : 0) }]),
    ...diagram.connections.flatMap((c) => c.route ?? []),
  ];
  const offset = { x: PAD - Math.min(...points.map((p) => p.x)), y: PAD - Math.min(...points.map((p) => p.y)) };
  const items = buildItems(diagram, flow, structure, offset);
  const edges = buildEdges(diagram, items, structure, offset, edgeMode);
  const quiet = new Set(flow.quiet ?? []);
  for (const e of edges) if (quiet.has(e.id)) e.isQuiet = true;
  const width = Math.max(...points.map((p) => p.x)) + offset.x + PAD;
  const height = Math.max(...points.map((p) => p.y)) + offset.y + PAD;
  return { items, edges, width, height };
}

// cost: time O(s log s + b·k·r), heap O(s), stack O(1)
// vars: s = 도형 수, b = 박자 수, k = 카드 내용 수, r = 카드 줄 수
// basis: estimate
// 도형과 container를 그리는 데 필요한 값만 남긴다.
function buildItems(diagram, flow, { isContainer }, offset) {
  const cards = collectCardContents(flow);
  return [...diagram.shapes]
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || (a.zIndex ?? 0) - (b.zIndex ?? 0))
    .map((s) => ({
      id: s.id,
      kind: kindOf(s, isContainer),
      x: s.pos.x + offset.x,
      y: s.pos.y + offset.y,
      w: s.width,
      h: s.height,
      ...splitLabel(s.label),
      isDashed: s.strokeDash > 0,
      fill: s.fill?.startsWith('#') ? s.fill : undefined,
      stroke: s.stroke?.startsWith('#') ? s.stroke : undefined,
      icon: s.icon?.Scheme ? `${s.icon.Scheme}://${s.icon.Host}${s.icon.Path}` : undefined,
      columns: s.columns ?? undefined,
      fields: s.fields ?? undefined,
      methods: s.methods ?? undefined,
      cards: cards.get(s.id),
    }));
}

function kindOf(shape, isContainer) {
  if (isContainer(shape.id)) return 'frame';
  if (shape.type === 'text') return shape.language === 'markdown' ? 'markdown' : 'text';
  return KIND[shape.type] ?? 'box';
}

// cost: time O(c²·p³ + c·s·p + c log c), heap O(c·p), stack O(1)
// vars: c = 선 수, p = 경로 점 수, s = 도형 수
// basis: estimate
// 선마다 경로를 정한다. 선 끝 간격과 다른 선과의 겹침을 함께 따져야 하므로 한꺼번에 잇는다.
function buildEdges(diagram, items, { isInSequence }, offset, edgeMode) {
  const rects = Object.fromEntries(items.map((it) => [it.id, it]));
  const edges = diagram.connections.map((c) => {
    const isLifelineEdge = isLifeline(c);
    const route = (c.route ?? []).map((p) => ({ x: p.x + offset.x, y: p.y + offset.y }));
    const hasBothEnds = Boolean(rects[c.src] && rects[c.dst]);
    // 순서 그림 메시지, 생명선, 자기 자신으로 가는 선은 D2 자리가 곧 뜻이라 선 끝을 옮기지 않는다.
    // dagre 배치의 경로는 꺾은선이 아니라 3차 곡선 조절점이라 다듬지 않고 그대로 그린다.
    const isBezier = Boolean(c.isCurve) && route.length >= 4;
    const keepsEnds = isBezier || isLifelineEdge || c.src === c.dst || isInSequence(c.src) || isInSequence(c.dst);
    const needsD2Route = keepsEnds || !hasBothEnds;
    return {
      points: route.length > 1 ? route : straightBetween(rects[c.src], rects[c.dst]),
      isCurved: edgeMode === 'curve' && !needsD2Route,
      keepsEnds,
      isBezier,
      isLifeline: isLifelineEdge,
      id: c.id,
      src: c.src,
      dst: c.dst,
      label: c.label || undefined,
      hasStartArrow: Boolean(c.srcArrow) && c.srcArrow !== 'none',
      hasEndArrow: Boolean(c.dstArrow) && c.dstArrow !== 'none',
      isDashed: c.strokeDash > 0,
    };
  });
  const routed = edges.filter((e) => e.points);
  spreadPorts(routed.filter((e) => !e.keepsEnds), rects);
  const polylines = routed.filter((e) => !e.isBezier);
  for (const e of polylines) {
    const [from, to] = e.isLifeline ? [null, null] : [rects[e.src], rects[e.dst]];
    e.points = snapRoute(e.points, from, to);
  }
  for (const e of polylines) {
    const [from, to] = e.isLifeline ? [null, null] : [rects[e.src], rects[e.dst]];
    const others = routed.filter((o) => o !== e).map((o) => o.points);
    // 펴서 다른 선에 더 붙으면 펴지 않는다. 원래부터 붙어 있던 것은 따지지 않는다.
    const isFree = (candidate) => countCrowding(candidate, others) <= countCrowding(e.points, others);
    // 펴기 전에 한 줄에 놓인 점과 짧은 꺾임을 먼저 지워야 계단 모양을 알아본다.
    const straight = straighten(e.points, isFree);
    e.points = e.keepsEnds ? straight : flattenStep(straight, from, to, isFree);
  }
  centerLoneLines(routed.filter((e) => !e.keepsEnds), rects);
  for (const e of edges) {
    if (!e.points) continue;
    if (e.isBezier) Object.assign(e, routeBezier(e.points));
    else Object.assign(e, e.isCurved ? routeCurve(e.points) : routePolyline(e.points, e.isLifeline ? 0 : CORNER_RADIUS));
  }
  placeLabels(edges.filter((e) => e.label && e.points && !e.isCurved && !e.isBezier));
  for (const e of edges) {
    delete e.points;
    delete e.keepsEnds;
    delete e.isBezier;
    delete e.isCurved;
  }
  return edges;
}

/** 선 라벨 알약의 너비와 높이. render.js도 같은 크기로 그린다. */
export function measurePill(label) {
  return { w: measureMono(label, TEXT['11']) + SPACE['7'], h: values.size.pill };
}

// cost: time O(l²·k), heap O(l), stack O(1)
// vars: l = 라벨 있는 선 수, k = LABEL_SPOTS 수
// basis: estimate
// 라벨이 먼저 놓인 라벨과 겹치면 선을 따라 다른 자리로 옮긴다. 모든 자리가 겹치면 가운데에 둔다.
function placeLabels(edges) {
  const placed = [];
  const overlaps = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
  for (const e of edges) {
    const size = measurePill(e.label);
    const boxes = LABEL_SPOTS.map((f) => ({ ...pointAlong(e.points, f), ...size }));
    const box = boxes.find((b) => !placed.some((p) => overlaps(b, p))) ?? boxes[0];
    e.mid = { x: box.x, y: box.y };
    placed.push(box);
  }
}

// cost: time O(p·q), heap O(1), stack O(1)
// vars: p = 경로 점 수, q = 다른 선들의 점 수 합
// basis: estimate
// 경로의 수평·수직 구간이 다른 선의 나란한 구간과 CROWD보다 가깝게 겹치는 수
function countCrowding(points, others) {
  let count = 0;
  for (let i = 1; i < points.length; i++) {
    for (const other of others) {
      for (let k = 1; k < other.length; k++) if (isCrowded(points[i - 1], points[i], other[k - 1], other[k])) count++;
    }
  }
  return count;
}

// 두 구간이 같은 방향이고, 거리가 CROWD보다 가깝고, 길이 방향으로 겹치는지 본다.
function isCrowded(a, b, c, d) {
  const axisOf = (p, q) => (Math.abs(p.y - q.y) < 0.5 ? 'x' : Math.abs(p.x - q.x) < 0.5 ? 'y' : undefined);
  const along = axisOf(a, b);
  if (!along || along !== axisOf(c, d)) return false;
  const across = along === 'x' ? 'y' : 'x';
  const overlap = Math.min(Math.max(a[along], b[along]), Math.max(c[along], d[along])) - Math.max(Math.min(a[along], b[along]), Math.min(c[along], d[along]));
  return Math.abs(a[across] - c[across]) < CROWD && overlap > 0;
}

// D2 경로가 없을 때 두 도형 가운데를 잇는다. 도형이 없으면 없다.
function straightBetween(a, b) {
  if (!a || !b) return null;
  return [
    { x: a.x + a.w / 2, y: a.y + a.h / 2 },
    { x: b.x + b.w / 2, y: b.y + b.h / 2 },
  ];
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
/**
 * D2는 라벨이 들어갈 최소 높이로 ELK 배치를 하고, 도형은 지정한 높이로 줄여 그린다.
 * 그래서 선 끝이 도형에서 떨어질 수 있다. 첫 선분과 끝 선분을 늘이거나 줄여 도형 경계에 붙인다.
 */
function snapRoute(route, from, to) {
  const pts = route.map((p) => ({ ...p }));
  fitEnd(pts[0], pts[1], from);
  fitEnd(pts.at(-1), pts.at(-2), to);
  return pts;
}

// cost: time O(q), heap O(1), stack O(1)
// vars: q = isFree 한 번의 비용(다른 선들의 점 수 합)
// basis: estimate
/**
 * 점 네 개짜리 계단 선(─┐└─)의 가운데 단이 STEP보다 짧으면 끝점 하나를 옮겨 일자로 편다.
 * 받는 쪽 끝을 먼저, 안 되면 보내는 쪽 끝을 옮긴다. 옮긴 끝이 도형 면 안에 남고 isFree가 허락할 때만 옮긴다.
 */
function flattenStep(points, from, to, isFree) {
  if (points.length !== 4 || !from || !to) return points;
  const [s, p1, p2, e] = points;
  const axis = Math.abs(p1.x - p2.x) < 0.5 ? 'y' : 'x';
  const isStep = Math.abs(s[axis] - p1[axis]) < 0.5 && Math.abs(p2[axis] - e[axis]) < 0.5;
  if (!isStep || Math.abs(p1[axis] - p2[axis]) >= STEP) return points;
  // 사람 모양은 몸통 구간 안에서만 옮긴다(sideSpan).
  const fits = (r, value) => {
    const [low, high] = sideSpan(r, axis);
    return low + PORT_MARGIN <= value && value <= high - PORT_MARGIN;
  };
  const moveEnd = [s, { ...e, [axis]: s[axis] }];
  const moveStart = [{ ...s, [axis]: e[axis] }, e];
  if (fits(to, s[axis]) && isFree(moveEnd)) return moveEnd;
  if (fits(from, e[axis]) && isFree(moveStart)) return moveStart;
  return points;
}

// cost: time O(c²·p + c·s·p), heap O(c + s), stack O(1)
// vars: c = 선 수, p = 경로 점 수, s = 도형 수
// basis: estimate
/**
 * 마주 보는 두 면에 선이 하나뿐이고 거의 곧은 선이면, 두 도형이 겹치는 구간의 가운데로 옮긴다.
 * ELK는 사람 모양처럼 아래에 이름표가 붙은 도형의 가운데를 이름표까지 넣어 잡아, 같은 줄의 선이 상자 아래쪽으로 쏠린다.
 * 옮겨서 다른 선에 더 붙으면 옮기지 않는다.
 */
function centerLoneLines(edges, rects) {
  const counts = new Map();
  const sides = edges.map((e) => {
    const pair = facingSides(rects[e.src], rects[e.dst]);
    if (pair) {
      for (const key of [`${e.src}:${pair[0]}`, `${e.dst}:${pair[1]}`]) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return pair;
  });
  edges.forEach((e, i) => {
    const pair = sides[i];
    const isLone = pair && counts.get(`${e.src}:${pair[0]}`) === 1 && counts.get(`${e.dst}:${pair[1]}`) === 1;
    if (!isLone) return;
    const axis = pair[0] === 'left' || pair[0] === 'right' ? 'y' : 'x';
    // 가로지르는 방향으로 STEP 넘게 움직이는 선은 D2가 다른 것을 피해 돈 선이라 그대로 둔다.
    const values = e.points.map((p) => p[axis]);
    if (Math.max(...values) - Math.min(...values) >= STEP) return;
    const [a, b] = [rects[e.src], rects[e.dst]];
    const hasPerson = axis === 'y' && (a.kind === 'person' || b.kind === 'person');
    const ends = [edgeOf(a, pair[0]), edgeOf(b, pair[1])];
    const candidate = centeredLine(ends, axis, [sideSpan(a, axis), sideSpan(b, axis)], hasPerson);
    const others = edges.filter((o) => o !== e).map((o) => o.points);
    const blockers = Object.values(rects).filter((r) => r !== a && r !== b && r.kind !== 'frame');
    const isClear = !blockers.some((r) => crossesRect(candidate, r));
    if (isClear && countCrowding(candidate, others) <= countCrowding(e.points, others)) e.points = candidate;
  });
}

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
// 수평·수직 선분으로 된 경로가 도형 r 안을 지나는지 본다.
function crossesRect(points, r) {
  const isInside = (v, low, size) => low < v && v < low + size;
  const overlaps = (a, b, low, size) => Math.min(a, b) < low + size && low < Math.max(a, b);
  return points.slice(1).some((q, i) => {
    const p = points[i];
    const isHorizontal = Math.abs(p.y - q.y) < 0.5;
    return isHorizontal ? isInside(p.y, r.y, r.h) && overlaps(p.x, q.x, r.x, r.w) : isInside(p.x, r.x, r.w) && overlaps(p.y, q.y, r.y, r.h);
  });
}

// 두 도형이 마주 보는 면. 가로로 떨어져 있으면 오른쪽·왼쪽, 세로로 떨어져 있으면 아래·위, 겹치면 없다.
function facingSides(a, b) {
  if (a.x + a.w <= b.x) return ['right', 'left'];
  if (b.x + b.w <= a.x) return ['left', 'right'];
  if (a.y + a.h <= b.y) return ['bottom', 'top'];
  if (b.y + b.h <= a.y) return ['top', 'bottom'];
  return undefined;
}

// 도형 r의 한 면이 놓인 좌표
function edgeOf(r, side) {
  return { left: r.x, right: r.x + r.w, top: r.y, bottom: r.y + r.h }[side];
}

// 선이 닿을 수 있는 면의 구간. 사람 모양은 옆면이 몸통 아래쪽에만 있다(render.js의 사람 모양 비율).
function sideSpan(r, axis) {
  const [start, size] = axis === 'y' ? [r.y, r.h] : [r.x, r.w];
  const isPersonSide = r.kind === 'person' && axis === 'y';
  return isPersonSide ? [start + size * PERSON_BODY_TOP, start + size] : [start, start + size];
}

// cost: time O(1), heap O(1), stack O(1), alloc 4
// basis: estimate
// 상자끼리는 겹친 구간 가운데의 곧은 선이다. 사람 모양이 끼거나 구간이 안 겹치면 각 구간 가운데를 계단 선으로 잇는다.
// 사람 몸통 높이에 상자 쪽 끝까지 맞추면 상자의 아래쪽 끝에 닿기 때문이다. ends는 두 면이 놓인 좌표다.
function centeredLine([startAt, endAt], axis, [a, b], hasPerson) {
  const across = axis === 'y' ? 'x' : 'y';
  const low = Math.max(a[0], b[0]);
  const high = Math.min(a[1], b[1]);
  const isShared = high - low >= 1 && !hasPerson;
  const [from, to] = isShared ? [(low + high) / 2, (low + high) / 2] : [(a[0] + a[1]) / 2, (b[0] + b[1]) / 2];
  const point = (along, value) => ({ [across]: along, [axis]: value });
  if (Math.abs(from - to) < 0.5) return [point(startAt, from), point(endAt, to)];
  const middle = (startAt + endAt) / 2;
  return [point(startAt, from), point(middle, from), point(middle, to), point(endAt, to)];
}

// cost: time O(c log c), heap O(c), stack O(1)
// vars: c = 선 수
// basis: estimate
/**
 * 한 면에 닿는 선 끝이 그 면 밖에 있으면, 그 면의 선 끝을 순서대로 고르게 다시 놓는다.
 * ELK는 선이 많은 도형의 면을 늘려 끝점을 벌리는데, 도형은 줄인 높이로 그리므로 끝점이 도형 밖에 남는다.
 * 끝점과 다음 점을 함께 옮겨 첫 선분이 수평이나 수직을 지킨다. 면 위에 붙이는 일은 다음 snapRoute가 한다.
 */
function spreadPorts(edges, rects) {
  const groups = new Map();
  for (const e of edges) {
    if (e.points.length === 2) e.points = splitStraight(e.points);
    const ends = [
      [e.src, e.points[0], e.points[1]],
      [e.dst, e.points.at(-1), e.points.at(-2)],
    ];
    for (const [id, end, next] of ends) {
      const side = sideOf(end, next, rects[id]);
      if (!side) continue;
      const key = `${id}:${side}`;
      if (!groups.has(key)) groups.set(key, { r: rects[id], axis: side === 'left' || side === 'right' ? 'y' : 'x', ends: [] });
      groups.get(key).ends.push({ end, next });
    }
  }
  for (const { r, axis, ends } of groups.values()) {
    // 사람 모양은 몸통 구간 안에서만 나눈다(sideSpan).
    const [start, stop] = sideSpan(r, axis);
    const length = stop - start;
    const isInside = (p) => start <= p[axis] && p[axis] <= stop;
    if (ends.every(({ end }) => isInside(end))) continue;
    ends.sort((a, b) => a.end[axis] - b.end[axis]);
    ends.forEach(({ end, next }, k) => {
      const value = start + (length * (k + 1)) / (ends.length + 1);
      end[axis] = value;
      next[axis] = value;
    });
  }
}

// cost: time O(1), heap O(1), stack O(1), alloc 3
// basis: estimate
// 곧은 두 점 선을 가운데에서 꺾을 수 있게 네 점으로 나눈다. 끝을 옮겨도 다른 끝은 그대로 남는다.
function splitStraight([a, b]) {
  const isHorizontal = Math.abs(a.y - b.y) < 0.5;
  const isVertical = Math.abs(a.x - b.x) < 0.5;
  // 대각선은 나누면 모양이 바뀌어 그대로 둔다. 면 위 끝점 다시 놓기도 수평·수직 선만 다룬다.
  if (!isHorizontal && !isVertical) return [a, b];
  const m = isHorizontal ? { x: (a.x + b.x) / 2, y: a.y } : { x: a.x, y: (a.y + b.y) / 2 };
  return [a, { ...m }, { ...m }, b];
}

// 선 끝 end가 도형 r의 어느 면으로 드나드는지 본다. 첫 선분이 향하는 쪽이 면이다. 수평이나 수직이 아니면 없다.
function sideOf(end, next, r) {
  if (!r) return undefined;
  if (Math.abs(end.y - next.y) < 0.5) {
    if (next.x >= r.x + r.w) return 'right';
    if (next.x <= r.x) return 'left';
  }
  if (Math.abs(end.x - next.x) < 0.5) {
    if (next.y >= r.y + r.h) return 'bottom';
    if (next.y <= r.y) return 'top';
  }
  return undefined;
}

// 끝점 end를 도형 r의 경계로 옮긴다. end와 next가 이루는 선분이 수직이나 수평일 때만 옮긴다.
function fitEnd(end, next, r) {
  if (!r) return;
  const isVertical = Math.abs(end.x - next.x) < 0.5 && end.x >= r.x && end.x <= r.x + r.w;
  const isHorizontal = Math.abs(end.y - next.y) < 0.5 && end.y >= r.y && end.y <= r.y + r.h;
  if (isVertical) {
    if (next.y >= r.y + r.h) end.y = r.y + r.h;
    else if (next.y <= r.y) end.y = r.y;
  } else if (isHorizontal) {
    if (next.x >= r.x + r.w) end.x = r.x + r.w;
    else if (next.x <= r.x) end.x = r.x;
  }
}

// cost: time O(b·(e + s + k·r)), heap O(b·(e + s)), stack O(1)
// vars: b = 박자 수, e = 선 수, s = 도형 수, k = 도형마다 카드 내용 수, r = 카드 줄 수
// basis: estimate
/**
 * 흐름을 박자(seg) 목록으로 편다. 한 단계 안에서는 지나간 선과 도형이 계속 밝고, 카드 내용도 남는다.
 * @returns { segs, total, steps }. seg: { si, bi, t0, t1, move, hops, edgesOn, nodesOn, cards: { 도형 번호: 내용 번호 }, cardsBefore, cardsAt, caption }
 *   cardsAt(ms)까지는 cardsBefore, 그 뒤로는 cards를 보인다
 */
export function buildTimeline(flow, scene) {
  const itemIndex = new Map(scene.items.map((it, i) => [it.id, i]));
  const edgeIndex = new Map(scene.edges.map((e, i) => [e.id, i]));
  const segs = [];
  let t = 0;
  flow.steps.forEach((step, si) => {
    const beats = step.beats.length ? step.beats : [{ hops: [], light: [], show: {} }];
    const edgesOn = new Set();
    const shown = {};
    let caption = step.caption ?? '';
    beats.forEach((beat, bi) => {
      for (const hop of beat.hops) edgesOn.add(edgeIndex.get(hop.edge));
      const before = { ...shown };
      for (const [id, rows] of Object.entries(beat.show ?? {})) {
        const i = itemIndex.get(id);
        shown[i] = scene.items[i].cards.findIndex((known) => isSameRows(known, rows));
      }
      if (beat.say != null) caption = beat.say;
      const move = beat.ms ?? flow.speed;
      const hold = dwellOf(beat.say ?? (bi === 0 ? step.caption : undefined)) + (bi === beats.length - 1 ? DWELL.stepEnd : 0);
      // 점이 도착하는 도형의 카드는 도착할 때 바꾼다. 날아오는 글 상자보다 카드가 먼저 바뀌면 순서가 거꾸로 보이기 때문이다.
      // 나머지 도형의 카드는 박자 시작에 바꾼다.
      const targets = new Set(beat.hops.map((h) => itemIndex.get(h.to)));
      for (const key of Object.keys(shown)) if (!targets.has(Number(key))) before[key] = shown[key];
      const lit = { edgesOn, shown, before, cardsAt: targets.size ? move : 0, nodesOn: litNodes(scene, itemIndex, beat, edgesOn, shown) };
      segs.push(buildSeg({ si, bi, t0: t, move, hold, caption }, beat, lit, edgeIndex));
      t += move + hold;
    });
  });
  return { segs, total: t || 1, steps: flow.steps.map((s) => s.label) };
}

// cost: time O(l + k + e), heap O(s), stack O(1)
// vars: l = light 수, k = 카드가 찬 도형 수, e = 밝은 선 수, s = 도형 수
// basis: estimate
// 밝힐 도형: 이 박자의 light 대상, 카드가 찬 도형, 밝은 선의 양 끝
function litNodes(scene, itemIndex, beat, edgesOn, shown) {
  const nodes = new Set([...beat.light.map((id) => itemIndex.get(id)), ...Object.keys(shown).map(Number)]);
  for (const e of edgesOn) {
    nodes.add(itemIndex.get(scene.edges[e].src));
    nodes.add(itemIndex.get(scene.edges[e].dst));
  }
  return [...nodes].filter((i) => i !== undefined);
}

// cost: time O(h + e + s), heap O(h + e + s), stack O(1)
// vars: h = 이동 수, e = 밝은 선 수, s = 카드 수
// basis: estimate
// 박자 하나의 상태. 집합과 객체는 복사해 뒤 박자의 변경이 앞 박자에 번지지 않게 한다.
function buildSeg({ si, bi, t0, move, hold, caption }, beat, { edgesOn, shown, before, cardsAt, nodesOn }, edgeIndex) {
  return {
    si,
    bi,
    t0,
    t1: t0 + move + hold,
    move,
    hops: beat.hops.map((h) => ({ edge: edgeIndex.get(h.edge), isBack: h.isBack, data: h.data })),
    edgesOn: [...edgesOn],
    nodesOn,
    cards: { ...shown },
    cardsBefore: { ...before },
    cardsAt,
    caption,
  };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 설명 글자 수
// basis: estimate
// 점이 도착한 뒤 멈추는 시간. 새로 보인 설명이 있으면 글 길이만큼 둔다.
function dwellOf(said) {
  if (!said) return DWELL.base;
  return Math.min(DWELL.max, Math.max(DWELL.base, [...said].length * DWELL.perChar));
}
