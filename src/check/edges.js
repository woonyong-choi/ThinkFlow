// 3번, 4번, 5번: 선이 도형을 지나지 않고, 끝이 연결점에 있고, 다른 선과 붙지 않는다.
import { CROWD, TOUCH } from '../layout/model.js';
import { THROUGH_INSET, capitalize, drawnBox, near, onBorder, segmentHits } from './geometry.js';

// cost: time O(e·(s + g)·p·d), heap O(1), stack O(1)
// vars: e = 선 수, s = 도형 수, g = 그룹 수, p = 경로 점 수, d = 그룹 깊이
// basis: estimate
// 3번: 선이 끝 도형이 아닌 도형 안을 지나지 않는다. 그룹은 선 끝을 품은 그룹(선이 드나드는 그룹)만 빼고 본다.
export function checkThrough({ edges, boxes, scene, family }, problems) {
  for (const e of edges) {
    const ends = [e.from.split('.')[0], e.to.split('.')[0]];
    const inset = (r) => ({ x: r.x + THROUGH_INSET, y: r.y + THROUGH_INSET, w: r.w - THROUGH_INSET * 2, h: r.h - THROUGH_INSET * 2 });
    const hits = (r) => segments(e).some(([p, q]) => segmentHits(p, q, inset(r)));
    for (const box of boxes) {
      if (!ends.includes(box.id) && hits(box)) problems.error(e.line, `[check 3] edge ${e.from} -> ${e.to} passes through node "${box.id}" (line ${box.line}). ${capitalize(family.hint)}`);
    }
    for (const g of scene.groups) {
      const isCrossed = ends.some((end) => end === g.id || family.contains(g.id, end));
      if (!isCrossed && hits(g)) problems.error(e.line, `[check 3] edge ${e.from} -> ${e.to} passes through group "${g.id}" (line ${g.line}). ${capitalize(family.hint)}`);
    }
    checkCells(e, boxes.filter((box) => ends.includes(box.id) && box.it.shape === 'grid'), problems);
  }
}

// cost: time O(g·c·p), heap O(1), stack O(1)
// vars: g = 선 끝 격자 수(2 이하), c = 칸 수, p = 경로 점 수
// basis: estimate
// 3번의 칸 판정: 선 끝 격자 안에서 선이 어느 칸(글이 든 칸이든 빈 자리든)의 안쪽도 지나지 않는다. 안쪽 칸으로 가는 선은 행 사이 통로로 돌아야 이웃 칸 글을 가리지 않는다.
function checkCells(e, grids, problems) {
  for (const { it } of grids) {
    for (const cell of it.cells) {
      const rect = { x: it.x + cell.x + THROUGH_INSET, y: it.y + cell.y + THROUGH_INSET, w: cell.w - THROUGH_INSET * 2, h: cell.h - THROUGH_INSET * 2 };
      if (segments(e).some(([p, q]) => segmentHits(p, q, rect))) problems.error(e.line, `[check 3] edge ${e.from} -> ${e.to} passes through cell "${it.id}.${cell.id}" (line ${cell.line}). Move the cell or the edge ends so the edge turns through the gaps between rows`);
    }
  }
}

// cost: time O(e), heap O(1), stack O(1)
// vars: e = 선 수
// basis: estimate
// 4번: 선 끝이 도형별 연결점 규칙 자리에 있다(docs/design/layout.md 연결점). 순서 그림은 메시지가 생명선에서 시작하고 끝나므로 보지 않는다. 실패는 이 도구의 버그다.
export function checkEnds({ edges, scene, figure }, problems) {
  if (figure.kind === 'sequence') return;
  const rects = new Map([...scene.items, ...scene.groups].map((it) => [it.id, it]));
  for (const e of edges) {
    for (const [end, point, way, part] of [[e.from, e.points[0], 'out', { column: e.fromColumn, cell: e.fromCell }], [e.to, e.points.at(-1), 'in', { column: e.toColumn, cell: e.toCell }]]) {
      const id = end.split('.')[0];
      const it = rects.get(id);
      if (it && !isPortPlace(point, it, { way, ...part })) problems.error(e.line, `[check 4] internal: edge ${e.from} -> ${e.to} does not touch "${id}" at its connection point. Please report this`);
    }
  }
}

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 칸 수
// basis: estimate
// 격자 칸의 그림 좌표 사각형
function cellRect(it, id) {
  const cell = it.cells.find((c) => c.id === id);
  return { x: it.x + cell.x, y: it.y + cell.y, w: cell.w, h: cell.h };
}

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 테이블 열 수와 칸 수
// basis: estimate
// 도형별 연결점. 나가는 선은 오른쪽(세로 그룹 안 원통은 아래나 오른쪽), 들어오는 선은 왼쪽(세로 그룹 안 원통은 위나 왼쪽)이다. 격자 칸의 선은 그 칸의 테두리다. 묶음 배치한 테이블 열은 들어오는 선도 오른쪽이다. 그 밖의 도형과 그룹은 경계 어디나다.
function isPortPlace(p, it, { way, column, cell }) {
  const side = way === 'out' ? it.x + it.w : it.x;
  if (it.shape === 'grid' && cell) return onBorder(p, cellRect(it, cell));
  if (it.shape === 'table' && column) return near(p.x, it.isBracket ? it.x + it.w : side) && near(p.y, it.y + it.rowH * (it.columns.findIndex((c) => c.name === column) + 1.5));
  if (it.shape === 'decision') return near(p.x, side) && near(p.y, it.y + it.h / 2);
  if (it.shape === 'person' && it.direction === 'down') return near(p.x, side) && onBorder(p, it);
  // 원통은 뚜껑 윤곽까지가 선이 닿는 면이라 그린 사각형으로 본다.
  if (it.shape === 'store') {
    const drawn = drawnBox(it);
    if (it.direction !== 'down') return onBorder(p, drawn);
    // 세로 그룹 안 원통도 그룹 밖에서 오는 선은 선이 놓이는 방향의 옆면에 닿는다(layout.md 연결점).
    return onBorder(p, drawn) && (near(p.y, way === 'out' ? drawn.y + drawn.h : drawn.y) || near(p.x, way === 'out' ? drawn.x + drawn.w : drawn.x));
  }
  return onBorder(p, it);
}

// cost: time O(e²·p²), heap O(1), stack O(1)
// vars: e = 선 수, p = 경로 점 수
// basis: estimate
// 5번: 다른 두 선의 나란한 구간이 CROWD보다 가깝게 겹치지 않는다. 같은 도형에서 함께 나가거나 함께 들어오는 두 선은 그 도형 쪽 끝 선분(경계에서 첫 꺾임까지)을 보지 않는다.
export function checkCrowding({ edges, family }, problems) {
  edges.forEach((a, i) => {
    for (const b of edges.slice(i + 1)) {
      const skip = sharedEndSegments(a, b);
      const isClose = segments(a).some((sa, ia) => segments(b).some((sb, ib) => !skip(ia, ib) && crowded(sa, sb)));
      if (isClose) problems.error(a.line, `[check 5] edges ${a.from} -> ${a.to} and ${b.from} -> ${b.to} (line ${b.line}) run too close. ${capitalize(family.hint)}`);
    }
  });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 두 선이 같은 시작 도형이면 첫 선분끼리, 같은 끝 도형이면 마지막 선분끼리 짝을 건너뛰는 판정 함수를 돌려준다. 서로 다른 도형 사이 선과 안쪽 선분은 그대로 본다.
function sharedEndSegments(a, b) {
  const base = (end) => end.split('.')[0];
  const sameFrom = base(a.from) === base(b.from);
  const sameTo = base(a.to) === base(b.to);
  return (ia, ib) => (sameFrom && ia === 0 && ib === 0) || (sameTo && ia === a.points.length - 2 && ib === b.points.length - 2);
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
function segments(e) {
  return e.points.slice(1).map((q, i) => [e.points[i], q]);
}

// 선분이 가로면 'x', 세로면 'y', 비스듬하면 없음
function axisOf([a, b]) {
  if (Math.abs(a.y - b.y) < TOUCH) return 'x';
  return Math.abs(a.x - b.x) < TOUCH ? 'y' : undefined;
}

// 나란한 두 선분이 CROWD보다 가깝게 CROWD 넘는 길이만큼 겹치는지
function crowded(first, second) {
  const along = axisOf(first);
  if (!along || along !== axisOf(second)) return false;
  const across = along === 'x' ? 'y' : 'x';
  const span = ([a, b]) => [Math.min(a[along], b[along]), Math.max(a[along], b[along])];
  const [lo1, hi1] = span(first);
  const [lo2, hi2] = span(second);
  const overlap = Math.min(hi1, hi2) - Math.max(lo1, lo2);
  const gap = Math.abs(first[0][across] - second[0][across]);
  return overlap > CROWD && gap > TOUCH && gap < CROWD;
}
