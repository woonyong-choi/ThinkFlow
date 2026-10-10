// 경로 점을 SVG path로 바꾼다. 점은 옮기지 않고 꺾이는 모서리만 둥글게 한다.
import { coord as roundCoord } from './format.js';
import { values } from './vendor/theme/tokens.js';

// 둥근 모서리(곡선)를 직선 몇 개로 펴서 길이를 재는 칸 수
const CURVE_STEPS = 16;

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
/** 꺾은선의 모서리를 radius로 둥글게 한 path d와 경로 길이 절반 지점. */
export function routePolyline(points, radius) {
  const pts = dropRepeats(points);
  let d = `M ${roundCoord(pts[0].x)} ${roundCoord(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const { from, via, to } = cornerAt(pts, i, radius);
    d += ` L ${roundCoord(from.x)} ${roundCoord(from.y)} Q ${roundCoord(via.x)} ${roundCoord(via.y)}, ${roundCoord(to.x)} ${roundCoord(to.y)}`;
  }
  d += ` L ${roundCoord(pts.at(-1).x)} ${roundCoord(pts.at(-1).y)}`;
  return { d, mid: pointAlong(pts, 0.5) };
}

// cost: time O(p·CURVE_STEPS), heap O(p·CURVE_STEPS), stack O(1)
// vars: p = 경로 점 수, CURVE_STEPS = 모서리 하나를 펴는 직선 수(16)
// basis: estimate
/**
 * 그려지는 경로(둥근 모서리)를 직선으로 편 점 목록. 점이 따라가는 길(SVG path)의 길이와 자리는 꺾은선이 아니라 이 둥근 경로가 정한다.
 * 모서리가 둥글면 꺾은선보다 짧아, 같은 비율이라도 점 자리가 달라진다.
 */
export function flattenRoute(points, radius = values.radius.route) {
  const pts = dropRepeats(points);
  const flat = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const { from, via, to } = cornerAt(pts, i, radius);
    for (let k = 0; k <= CURVE_STEPS; k++) flat.push(quadAt({ from, via, to }, k / CURVE_STEPS));
  }
  flat.push(pts.at(-1));
  return flat;
}

// 모서리 i의 둥글게 깎기 시작점, 꺾이는 점, 끝점
function cornerAt(pts, i, radius) {
  const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
  const corner = Math.min(radius, distance(a, b) / 2, distance(b, c) / 2);
  return { from: pointToward(b, a, corner), via: b, to: pointToward(b, c, corner) };
}

// 2차 베지어 곡선 위 t 지점
function quadAt({ from, via, to }, t) {
  const [u, w] = [(1 - t) ** 2, t * t];
  return { x: u * from.x + 2 * (1 - t) * t * via.x + w * to.x, y: u * from.y + 2 * (1 - t) * t * via.y + w * to.y };
}

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
/** 꺾은선 길이의 비율 fraction 지점 */
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

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
/** 꺾은선 길이(px). 점 이동 시간을 정할 때 쓴다. */
export function routeLength(points) {
  return points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0);
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
// 같은 자리의 점과 한 줄 위 가운데 점을 지운다. 그리는 모양은 같다.
function dropRepeats(points) {
  const out = [];
  for (const p of points) {
    if (out.length && distance(out.at(-1), p) < 0.5) continue;
    if (out.length >= 2) {
      const [a, b] = [out.at(-2), out.at(-1)];
      if (Math.abs((b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x)) < 0.5) out.pop();
    }
    out.push(p);
  }
  return out;
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointToward(from, to, length) {
  const total = distance(from, to) || 1;
  return { x: from.x + ((to.x - from.x) * length) / total, y: from.y + ((to.y - from.y) * length) / total };
}
