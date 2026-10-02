// 이동 글 상자 계획의 마무리. 겹치는 지점을 흐리게 하고, 60fps 프레임마다 다시 재고, 같은 직선 위의 지점을 줄이고, 그림 검사가 볼 문제를 모은다.
import { boxAt, CHIP_FRAME_MS, CHIP_VISIBLE_MIN, dotAt, isHit, MOVE, NODE_MS } from './chip-motion.js';
import { progressAt } from './easing.js';
import { values } from './tokens.js';

// 흐려짐 시간(토큰)
const FADE_MS = values.duration['chip-fade'];
// 겹침이 흐려짐으로 가려져도 이동 시간의 이 비율을 넘으면 그림 검사가 알린다
const FADE_SHARE_MAX = 0.25;
// 이 변화 이하면 같은 직선 위의 지점으로 보고 뺀다(px, 불투명도)
const OFFSET_EPS = 0.05;
const OPACITY_EPS = 0.01;
// 프레임 검증에서 겹침이 남았을 때 흐리게 할 지점을 넓혀 다시 재는 최대 횟수
const VERIFY_ROUNDS = 6;

// cost: time O(r·(F + a)), heap O(r), stack O(1)
// vars: r = 머무는 지점 수, F = 이동의 프레임 수, a = 피할 사각형 수
// basis: estimate
// 겹치는 지점을 흐리게 하고, 프레임마다 다시 재서 지점 사이에 남은 겹침이 있으면 그 둘레 지점도 흐리게 한다.
export function settle(ctx, rest) {
  const points = rest.map((r) => ({ t: r.t, dx: r.slot.dx, dy: r.slot.dy, isFaded: !r.slot.isClean, slot: r.slot }));
  for (let round = 0; round < VERIFY_ROUNDS; round++) {
    applyFade(points);
    const bad = firstHit(ctx, points);
    if (bad === undefined) break;
    const found = points.findIndex((p) => p.t >= bad);
    const next = found < 0 ? points.length - 1 : Math.max(1, found);
    points[next - 1].isFaded = true;
    points[next].isFaded = true;
  }
  applyFade(points);
  return points;
}

// cost: time O(r²), heap O(1), stack O(1)
// vars: r = 머무는 지점 수
// basis: estimate
// 지점마다 불투명도. 흐려진 지점과 그 이웃은 0이고, 멀어질수록 FADE_MS에 걸쳐 1이 된다.
function applyFade(points) {
  const faded = points.filter((p) => p.isFaded);
  for (const p of points) {
    const near = Math.min(Infinity, ...faded.map((f) => Math.abs(f.t - p.t)));
    p.opacity = near <= NODE_MS ? 0 : Math.min(1, (near - NODE_MS) / FADE_MS);
  }
}

// cost: time O(F·(r + a)), heap O(1), stack O(1)
// vars: F = 이동의 프레임 수, r = 머무는 지점 수, a = 피할 사각형 수
// basis: estimate
// 보이는(CHIP_VISIBLE_MIN 이상) 프레임 가운데 처음으로 가리거나 그림 밖인 시각. 없으면 undefined.
function firstHit(ctx, points) {
  let k = 0;
  for (let t = 0; t <= ctx.hop.ms; t += CHIP_FRAME_MS) {
    while (k < points.length - 2 && points[k + 1].t <= t) k += 1;
    const [a, b] = [points[k], points[k + 1]];
    const ratio = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
    const opacity = a.opacity + (b.opacity - a.opacity) * ratio;
    if (opacity < CHIP_VISIBLE_MIN) continue;
    const box = boxAt(dotAt(ctx, t), ctx.chip, { dx: a.dx + (b.dx - a.dx) * ratio, dy: a.dy + (b.dy - a.dy) * ratio });
    if (isHit(ctx, box)) return t;
  }
  return undefined;
}

// cost: time O(r²), heap O(r), stack O(1)
// vars: r = 머무는 지점 수
// basis: estimate
// 같은 직선 위에 있는 중간 지점을 뺀다. 이웃을 이은 선이 중간 지점을 OFFSET_EPS, OPACITY_EPS 안에서 지나면 뺀다.
export function simplify(points) {
  const kept = [points[0]];
  let anchor = 0;
  for (let i = 2; i < points.length; i++) {
    if (isStraight(points, anchor, i)) continue;
    kept.push(points[i - 1]);
    anchor = i - 1;
  }
  if (points.length > 1) kept.push(points.at(-1));
  return kept;
}

// cost: time O(r), heap O(1), stack O(1)
// vars: r = 머무는 지점 수
// basis: estimate
// points[from]과 points[to]를 시간에 선형으로 이은 값이 그 사이 모든 지점의 값과 같은지
function isStraight(points, from, to) {
  const [a, b] = [points[from], points[to]];
  return points.slice(from + 1, to).every((p) => {
    const ratio = (p.t - a.t) / (b.t - a.t);
    return Math.abs(a.dx + (b.dx - a.dx) * ratio - p.dx) <= OFFSET_EPS && Math.abs(a.dy + (b.dy - a.dy) * ratio - p.dy) <= OFFSET_EPS && Math.abs(a.opacity + (b.opacity - a.opacity) * ratio - p.opacity) <= OPACITY_EPS;
  });
}

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 머무는 지점 수
// basis: estimate
// 그림 검사가 보는 지점별 문제. 겹침이 흐려짐으로 가려졌고 흐려진 시간이 이동의 FADE_SHARE_MAX 이하면 알리지 않는다(그림 밖은 흐려도 알린다).
export function issuesOf(points, hop) {
  const fadedMs = points.filter((p) => !p.slot.isClean).length * NODE_MS;
  const isTolerated = fadedMs <= hop.ms * FADE_SHARE_MAX;
  return points.map((p) => ({ at: progressAt(MOVE, p.t / hop.ms), isOutside: p.slot.isOutside, hits: isTolerated ? [] : p.slot.hits }));
}
