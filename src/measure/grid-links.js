// 칸 격자의 칸 단위 연결점과 통로. 선이 칸의 어느 면에서 나가고 들어오는지, 안쪽 칸으로 가는 선이 어느 통로로 도는지를 격자 좌표(왼쪽 위가 원점)로 정한다(docs/design/grid.md 칸 단위 연결).
import { values } from '../tokens.js';

const SPACE = values.space;
/** 통로 한 줄(선 하나가 지나는 줄) 사이 간격. 배치가 선 사이에 두는 간격(`elk.spacing.edgeEdge`)과 같은 값이다. */
export const LANE_STEP = SPACE['5'];
// 제목 글 양옆으로 선이 비켜야 하는 여유
const TITLE_CLEAR = SPACE['6'];
const SIDES = { out: ['EAST', 'SOUTH'], in: ['WEST', 'NORTH'] };

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 목록 길이
// basis: estimate
// 목록을 키별로 묶은 Map(Node 20에는 Map.groupBy가 없다). 묶음 안 순서는 목록 순서다.
function groupBy(list, keyOf) {
  const groups = new Map();
  for (const item of list) {
    const key = keyOf(item);
    if (groups.has(key)) groups.get(key).push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

// cost: time O(k·c), heap O(k), stack O(1)
// vars: k = 칸에 이은 선 끝 수, c = 칸 수
// basis: estimate
/**
 * 격자의 연결 계획. 칸에 이은 선 끝마다 면 후보(걸치는 면의 직접 연결과 통로 연결)와 격자 안 선 조각을 정하고, 통로 때문에 늘어난 크기를 알린다.
 * 선 끝은 칸이 걸친 면에서 바로 나가고, 걸치지 않은 안쪽 칸은 칸 아래 통로(행 사이 간격)로 돌아 격자 옆면으로 나간다. 통로는 칸 사이가 아니라 행 사이 빈 줄이라 이웃 칸 글을 가리지 않는다.
 * 통로는 가로 흐름(나가는 선 동쪽, 들어오는 선 서쪽)에서 직접 연결이 없는 선 끝마다 잡는다. 세로 흐름은 남쪽·북쪽이 걸쳐 있으면 거기로, 아니면 같은 동쪽·서쪽 직접 연결이나 통로를 쓰므로 이 통로가 모든 방향의 상한이다.
 * @param grid { rows, cols, cells, links }. links는 { index, way, cell, isInner }[]이고 index는 선 번호, isInner는 같은 격자의 두 칸을 잇는 선이다
 * @param geo { pad, unitW, unitH, titleH, titleHalf }. titleHalf는 가장 긴 제목 줄 폭의 절반
 * @returns { w, h, rowTop, gutter, ends, inner }. rowTop은 행 번호 → 그 행 윗변의 y를 주는 함수다. ends는 `번호:way` → { LANE, EAST?, WEST?, SOUTH?, NORTH? }, 각 후보는 { side, port, lead }이고 lead는 칸 면에서 격자 테두리 위 port까지의 점이다. inner는 선 번호 → 점 목록이다
 */
export function planGridLinks(grid, geo) {
  const { rows, cols, links } = grid;
  const channels = links.filter((l) => l.isInner).length / 2;
  const padRight = channels ? Math.max(geo.pad, (channels + 1) * LANE_STEP) : geo.pad;
  const w = geo.pad + cols * geo.unitW + padRight;
  const cells = new Map(grid.cells.map((c) => [c.id, c]));
  const items = links.map((link) => describe(link, { cell: cells.get(link.cell), grid, geo, w }));
  assignSouthX(items);
  const { gutter, bottom, tracks } = assignTracks(items, { rows, w });
  // 행 위치는 배열로 펼치지 않고 식으로 구한다. 큰 격자에서도 행 수만큼 할당하지 않기 위해서다.
  const rowTop = (r) => geo.titleH + r * (geo.unitH + gutter);
  const h = geo.titleH + rows * geo.unitH + (rows - 1) * gutter + bottom;
  const frame = { w, h, rowTop, geo, padRight, gutter, links };
  for (const item of items) item.candidates = candidatesOf(item, frame, tracks);
  return { w, h, rowTop, gutter, ends: Object.fromEntries(items.map((i) => [`${i.link.index}:${i.link.way}`, i.candidates])), inner: innerRoutes(items, frame) };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선 끝 하나의 칸 위치와 직접 연결할 수 있는 면
function describe(link, { cell, grid, geo, w }) {
  const x = geo.pad + cell.col * geo.unitW;
  const box = { x, w: cell.cols * geo.unitW };
  const touches = { EAST: cell.col + cell.cols === grid.cols, WEST: cell.col === 0, SOUTH: cell.row + cell.rows === grid.rows, NORTH: cell.row === 0 };
  const item = { link, cell, box, touches, w, gutterRow: cell.row + cell.rows - 1 };
  const way = link.isInner ? undefined : link.way;
  const [lateral, vertical] = way ? SIDES[way] : [];
  item.direct = way ? [lateral, vertical].filter((side) => touches[side]) : [];
  item.northX = touches.NORTH && way === 'in' ? northSpots(item, geo, grid.links) : undefined;
  if (way === 'in' && !item.northX) item.direct = item.direct.filter((side) => side !== 'NORTH');
  item.needsLane = !way || !touches[lateral];
  return item;
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 선 끝 수
// basis: estimate
// 위 면으로 들어오는 선이 제목 글을 비켜 칸 위 면에 닿는 x 목록. 제목 양옆 빈 구간 가운데 가장 넓은 곳을 선 수로 나눈다. 둘 곳이 없으면 undefined다.
function northSpots(item, geo, links) {
  const count = links.filter((l) => l.cell === item.cell.id && l.way === 'in' && !l.isInner).length;
  const center = item.w / 2;
  const [from, to] = [item.box.x, item.box.x + item.box.w];
  const free = [[from, Math.min(to, center - geo.titleHalf - TITLE_CLEAR)], [Math.max(from, center + geo.titleHalf + TITLE_CLEAR), to]];
  const [a, b] = free.reduce((best, range) => (range[1] - range[0] > best[1] - best[0] ? range : best));
  if ((b - a) / (count + 1) < LANE_STEP) return undefined;
  const order = links.filter((l) => l.cell === item.cell.id && l.way === 'in' && !l.isInner).indexOf(item.link);
  return a + ((order + 1) / (count + 1)) * (b - a);
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 선 끝 수
// basis: estimate
// 칸 아래 면을 쓰는 선 끝(아래 면으로 바로 나가는 선과 통로로 도는 선)의 x. 한 칸의 이런 선 끝끼리 칸 폭을 고르게 나눠, 같은 면의 세로 조각이 붙지 않게 한다.
function assignSouthX(items) {
  const byCell = groupBy(items.filter((i) => i.needsLane || i.direct.includes('SOUTH')), (i) => i.cell.id);
  for (const group of byCell.values()) {
    group.forEach((item, k) => {
      item.southX = item.box.x + ((k + 1) / (group.length + 1)) * item.box.w;
    });
  }
}

// 통로로 나가는 쪽: 나가는 선과 같은 격자 안 선은 동쪽, 들어오는 선은 서쪽
function exitOf(item) {
  return item.link.way === 'in' && !item.link.isInner ? 'WEST' : 'EAST';
}

// cost: time O(k log k), heap O(k), stack O(1)
// vars: k = 선 끝 수
// basis: estimate
// 행 아래 통로마다 선 끝에 통로 줄(위에서 몇째인지)을 준다. 격자 옆면까지 가는 거리가 긴 선이 아래 줄을 써서, 짧은 선의 세로 조각이 긴 선의 가로 조각을 가로지르지 않는다.
// 서쪽으로 나가는 선이 위 줄, 동쪽으로 나가는 선이 아래 줄이다. @returns { gutter, bottom, tracks }. gutter는 행 사이 간격, bottom은 맨 아래 여백, tracks는 선 끝 → 줄 번호
function assignTracks(items, { rows, w }) {
  const tracks = new Map();
  const counts = new Map();
  const span = (i) => (exitOf(i) === 'WEST' ? i.southX : w - i.southX);
  const byGutter = groupBy(items.filter((i) => i.needsLane), (i) => i.gutterRow);
  for (const [row, group] of byGutter) {
    const ordered = [...group.filter((i) => exitOf(i) === 'WEST').sort((a, b) => span(a) - span(b)), ...group.filter((i) => exitOf(i) === 'EAST').sort((a, b) => span(a) - span(b))];
    ordered.forEach((item, k) => tracks.set(item, k));
    counts.set(row, group.length);
  }
  const inner = Math.max(0, ...[...counts].filter(([row]) => row < rows - 1).map(([, n]) => n));
  return { gutter: inner ? (inner + 1) * LANE_STEP : 0, bottom: Math.max(GAP_BOTTOM, ((counts.get(rows - 1) ?? 0) + 1) * LANE_STEP), tracks };
}

const GAP_BOTTOM = SPACE['6'];

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선 끝 하나의 면 후보. 직접 연결은 걸친 면마다, 통로 연결(LANE)은 모든 선 끝에 둔다(필요 없으면 쓰지 않는다).
function candidatesOf(item, frame, tracks) {
  const { cell } = item;
  const top = frame.rowTop(cell.row);
  const box = { ...item.box, y: top, h: cell.rows * frame.geo.unitH + (cell.rows - 1) * frame.gutter };
  const out = {};
  for (const side of item.direct) out[side] = directCandidate(item, side, { box, frame });
  if (item.needsLane) out.LANE = laneCandidate(item, { box, frame, track: tracks.get(item) });
  return out;
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 같은 칸의 같은 방향 선 끝 수
// basis: estimate
// 걸친 면으로 바로 나가는 연결. 같은 칸의 같은 방향 선 끝은 면을 고르게 나눈다.
function directCandidate(item, side, { box, frame }) {
  const mates = frame.links.filter((l) => l.cell === item.cell.id && l.way === item.link.way && !l.isInner);
  const t = (mates.indexOf(item.link) + 1) / (mates.length + 1);
  if (side === 'EAST' || side === 'WEST') {
    const y = box.y + t * box.h;
    const edge = side === 'EAST' ? box.x + box.w : box.x;
    const exit = side === 'EAST' ? frame.w : 0;
    return { side, port: { x: exit, y }, lead: [{ x: edge, y }, { x: exit, y }] };
  }
  const x = side === 'SOUTH' ? item.southX : item.northX;
  const [edge, exit] = side === 'SOUTH' ? [box.y + box.h, frame.h] : [box.y, 0];
  return { side, port: { x, y: exit }, lead: [{ x, y: edge }, { x, y: exit }] };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 칸 아래 통로를 거쳐 격자 옆면으로 나가는 연결
function laneCandidate(item, { box, frame, track }) {
  const side = exitOf(item);
  const bottom = box.y + box.h;
  const y = frame.rowTop(item.gutterRow) + frame.geo.unitH + (track + 1) * LANE_STEP;
  const exit = side === 'EAST' ? frame.w : 0;
  return { side, port: { x: exit, y }, lead: [{ x: item.southX, y: bottom }, { x: item.southX, y }, { x: exit, y }] };
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 선 끝 수
// basis: estimate
// 같은 격자의 두 칸을 잇는 선의 점. 두 칸의 통로를 오른쪽 여백의 세로 줄로 잇는다.
function innerRoutes(items, frame) {
  const byEdge = groupBy(items.filter((i) => i.link.isInner), (i) => i.link.index);
  const routes = {};
  [...byEdge].forEach(([index, [from, to]], m) => {
    const x = frame.w - frame.padRight + ((m + 1) / (byEdge.size + 1)) * frame.padRight;
    const [a, b] = [from, to].map((i) => i.candidates.LANE.lead);
    routes[index] = [a[0], a[1], { x, y: a[1].y }, { x, y: b[1].y }, b[1], b[0]];
  });
  return routes;
}
