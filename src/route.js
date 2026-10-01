// 경로 점을 SVG path로 바꾼다. 점은 옮기지 않고 꺾이는 모서리만 둥글게 한다.

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
/** 꺾은선의 모서리를 radius로 둥글게 한 path d와 경로 길이 절반 지점. */
export function routePolyline(points, radius) {
  const pts = dropRepeats(points);
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    const corner = Math.min(radius, distance(a, b) / 2, distance(b, c) / 2);
    const p1 = pointToward(b, a, corner);
    const p2 = pointToward(b, c, corner);
    d += ` L ${roundTenth(p1.x)} ${roundTenth(p1.y)} Q ${roundTenth(b.x)} ${roundTenth(b.y)}, ${roundTenth(p2.x)} ${roundTenth(p2.y)}`;
  }
  d += ` L ${roundTenth(pts.at(-1).x)} ${roundTenth(pts.at(-1).y)}`;
  return { d, mid: pointAlong(pts, 0.5) };
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

// 좌표를 소수 첫째 자리로 줄인다.
function roundTenth(value) {
  return Math.round(value * 10) / 10;
}
