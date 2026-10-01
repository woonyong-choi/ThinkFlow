// 상자 사이 선의 경로를 만든다. D2가 잡은 꺾은선을 다듬거나(routePolyline), 같은 두 끝을 곡선으로 잇는다(routeCurve).

// ELK 경로에서 이보다 짧은 꺾임은 편다. 라벨을 비키느라 생긴 꺾임이라 둥글리면 혹처럼 보인다.
const JOG = 20;
// straighten이 꺾임을 펴는 최대 횟수. 경로 하나의 꺾임 수보다 넉넉하다.
const MAX_STRAIGHTEN = 20;

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
/**
 * D2 경로의 두 끝을 3차 곡선 하나로 잇는다. 끝에서는 D2 경로의 첫 선분과 끝 선분 방향으로 나가고 들어온다.
 * 선 끝 자리는 D2가 정한 것을 그대로 쓰므로, 한 면에 선이 여럿이어도 겹치지 않는다.
 * @returns { d, mid }. mid는 곡선의 t = 0.5 지점이다.
 */
export function routeCurve(points) {
  const [s, e] = [points[0], points.at(-1)];
  const out = directionOf(s, points[1]);
  const into = directionOf(points.at(-2), e);
  // 조절점은 나가는 방향으로 두 끝 거리의 절반만큼 뻗는다. 그 방향 거리가 0이면 곡선이 직선으로 무너지므로 전체 거리를 쓴다.
  const reach = (dir) => Math.abs((e.x - s.x) * dir.x + (e.y - s.y) * dir.y) / 2 || distance(s, e) / 2;
  const c1 = { x: s.x + out.x * reach(out), y: s.y + out.y * reach(out) };
  const c2 = { x: e.x - into.x * reach(into), y: e.y - into.y * reach(into) };
  const mid = { x: (s.x + 3 * c1.x + 3 * c2.x + e.x) / 8, y: (s.y + 3 * c1.y + 3 * c2.y + e.y) / 8 };
  return { d: `M ${s.x} ${s.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${e.x} ${e.y}`, mid };
}

// a에서 b로 가는 단위 방향
function directionOf(a, b) {
  const length = distance(a, b) || 1;
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 조절점 수
// basis: estimate
/**
 * dagre 배치가 준 3차 곡선 조절점(시작점 뒤로 세 점씩)을 그대로 잇는다.
 * @returns { d, mid }. mid는 조절점 꺾은선 길이의 절반 지점으로 어림한다.
 */
export function routeBezier(points) {
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i + 2 < points.length; i += 3) {
    const [a, b, c] = [points[i], points[i + 1], points[i + 2]];
    d += ` C ${a.x} ${a.y}, ${b.x} ${b.y}, ${c.x} ${c.y}`;
  }
  return { d, mid: pointAlong(points, 0.5) };
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
/**
 * 꺾은선의 모서리를 둥글게 해서 쓴다. 짧은 꺾임은 그 전에 straighten으로 편다.
 * @returns { d, mid }. mid는 경로 길이의 절반 지점이다.
 */
export function routePolyline(pts, radius = 10) {
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    const r = Math.min(radius, distance(a, b) / 2, distance(b, c) / 2);
    const p1 = pointToward(b, a, r);
    const p2 = pointToward(b, c, r);
    d += ` L ${p1.x} ${p1.y} Q ${b.x} ${b.y}, ${p2.x} ${p2.y}`;
  }
  d += ` L ${pts.at(-1).x} ${pts.at(-1).y}`;
  return { d, mid: pointAlong(pts, 0.5) };
}

// cost: time O(p·(p + f)), heap O(p), stack O(1)
// vars: p = 경로 점 수, f = isFree 한 번의 비용
// basis: estimate
/**
 * 가운데의 짧은 꺾임을 없앤다. 꺾임 한쪽 구간을 다른 쪽 줄로 옮기고 한 줄에 놓인 점을 지운다. 끝점은 옮기지 않는다.
 * @param isFree 옮긴 경로를 받아 써도 되는지 답한다. 아니면 그 꺾임은 그대로 둔다. 다른 선과 겹치지 않게 하는 데 쓴다.
 */
export function straighten(points, isFree = () => true) {
  let pts = removeCollinear(points.map((p) => ({ x: p.x, y: p.y })));
  const kept = new Set();
  for (let guard = 0; guard < MAX_STRAIGHTEN; guard++) {
    // 점 네 개짜리 경로의 가운데 꺾임은 어느 쪽을 옮겨도 끝점이 움직여서 그대로 둔다.
    const isMovable = (k) => k >= 1 && k + 2 < pts.length && !(k === 1 && k + 2 === pts.length - 1);
    const i = pts.findIndex((p, k) => isMovable(k) && distance(p, pts[k + 1]) < JOG && !kept.has(`${p.x},${p.y}`));
    if (i < 0) break;
    // 꺾임 뒤 구간이 끝점에 닿으면 끝점이 도형에서 떨어지므로, 그때는 꺾임 앞 구간을 뒤 줄로 옮긴다.
    const isAtEnd = i + 2 === pts.length - 1;
    const [from, to] = isAtEnd ? [pts[i + 1], pts[i]] : [pts[i], pts[i + 1]];
    const moved = new Set(isAtEnd ? [i, i - 1] : [i + 1, i + 2]);
    const axis = Math.abs(from.x - to.x) < 0.5 ? 'y' : 'x';
    const delta = from[axis] - to[axis];
    const candidate = pts.map((p, k) => (moved.has(k) ? { ...p, [axis]: p[axis] + delta } : p));
    if (isFree(candidate)) pts = removeCollinear(candidate);
    else kept.add(`${pts[i].x},${pts[i].y}`);
  }
  return pts;
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
// 겹친 점과 앞뒤 점과 한 줄에 놓인 점을 지운다.
function removeCollinear(points) {
  const out = [];
  for (const p of points) {
    if (out.length && distance(out.at(-1), p) < 0.5) continue;
    if (out.length >= 2) {
      const [a, b] = [out.at(-2), out.at(-1)];
      const cross = (b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x);
      if (Math.abs(cross) < 0.5) out.pop();
    }
    out.push(p);
  }
  return out;
}

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
/** 꺾은선 길이의 비율 fraction 지점. 선 라벨을 여기에 둔다. */
export function pointAlong(pts, fraction) {
  const total = pts.slice(1).reduce((sum, p, i) => sum + distance(pts[i], p), 0);
  let left = total * fraction;
  for (let i = 1; i < pts.length; i++) {
    const length = distance(pts[i - 1], pts[i]);
    if (left <= length) return pointToward(pts[i - 1], pts[i], left);
    left -= length;
  }
  return pts.at(-1);
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// from에서 to 쪽으로 r만큼 간 점
function pointToward(from, to, r) {
  const length = distance(from, to) || 1;
  return { x: from.x + ((to.x - from.x) * r) / length, y: from.y + ((to.y - from.y) * r) / length };
}
