// 이동 하나의 글 상자를 시각마다 재는 도구. 계획(chip-plan.js)과 흐려짐(chip-fade.js), 테스트가 같은 점 위치와 보간을 쓴다.
import { CHIP_GAP, isOutsideFigure, OVERLAP_SLACK, overlapArea } from './chip.js';
import { positionAt, timeAtPosition } from './easing.js';
import { values } from './tokens.js';
import { pointAlong } from './route.js';

/** 60fps 프레임 하나의 길이(ms). 글 상자 계획과 검증이 이 간격으로 잰다. */
export const CHIP_FRAME_MS = values.duration['chip-frame'];
/** 글 상자가 이 불투명도 미만이면 보이지 않는 것으로 본다. 겹침 검사는 보이는 프레임만 센다. */
export const CHIP_VISIBLE_MIN = values.opacity['chip-visible-min'];
// 계획 지점 사이의 프레임 수. 지점 사이 한 프레임은 보간으로 두고 마지막에 프레임마다 다시 잰다
const PLAN_FRAMES = 2;
/** 계획 지점 사이의 시간(ms) */
export const NODE_MS = PLAN_FRAMES * CHIP_FRAME_MS;

/**
 * 시각 t(ms)의 글 상자. path는 planChip이 돌려준 [at, dx, dy, opacity] 목록이고 지점 사이는 시간에 선형으로 잇는다(움직이는 SVG와 재생기와 같다).
 * @param move { route, hop, chip }. route는 그려지는 경로를 편 점 목록(flattenRoute)이다
 * @returns { box, point, opacity }
 */
export function chipStateAt({ route, hop, chip }, path, t) {
  const point = dotAt({ route, hop }, t);
  const [dx, dy, opacity] = offsetAt(path, hop, t);
  return { point, opacity, box: boxAt(point, chip, { dx, dy }) };
}

// cost: time O(F·k), heap O(1), stack O(1)
// vars: F = 이동의 프레임 수, k = 경로 지점 수
// basis: estimate
/** 이동에서 점이 보이는 프레임 가운데 글 상자가 보이는(CHIP_VISIBLE_MIN 이상) 프레임의 비율(0~1). 점이 도형 안에 있어 안 보이는 프레임은 세지 않는다. */
export function visibleShare(move, path) {
  const { hop } = move;
  let [seen, shown] = [0, 0];
  for (let t = 0; t <= hop.ms; t += CHIP_FRAME_MS) {
    const progress = positionAt(Math.min(1, t / hop.ms), hop.pace);
    if (hop.gaps?.some(([from, to]) => progress > from && progress < to)) continue;
    seen += 1;
    if (chipStateAt(move, path, t).opacity >= CHIP_VISIBLE_MIN) shown += 1;
  }
  return seen ? shown / seen : 1;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 점 위 기본 자리에서 옮긴 만큼 옮긴 글 상자
export function boxAt(point, chip, { dx, dy }) {
  return { x: point.x + dx - chip.w / 2, y: point.y - chip.h - CHIP_GAP + dy, w: chip.w, h: chip.h };
}

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
// 시각 t(ms)에 점이 있는 자리. 같은 시각은 한 번만 재도록 ctx.dots에 담는다(없으면 담지 않는다).
export function dotAt({ route, hop, dots }, t) {
  const key = Math.round(t * 1000);
  if (dots?.has(key)) return dots.get(key);
  const progress = positionAt(Math.min(1, t / hop.ms), hop.pace);
  const point = pointAlong(route, hop.isBack ? 1 - progress : progress);
  dots?.set(key, point);
  return point;
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 경로 지점 수
// basis: estimate
// 시각 t의 [dx, dy, opacity]. 첫 지점 앞과 마지막 지점 뒤는 그 지점 값이다. 지점은 경로 길이 비율이고, 점이 그 지점에 닿는 시각은 구간별 이동 시간(hop.pace)까지 거꾸로 푼다.
function offsetAt(path, { ms, pace }, t) {
  const u = Math.min(1, Math.max(0, t / ms));
  const progress = positionAt(u, pace);
  const k = Math.min(Math.max(0, path.findLastIndex((p) => p[0] <= progress)), path.length - 2);
  if (path.length === 1) return path[0].slice(1);
  const [a, b] = [path[k], path[k + 1]];
  const [ta, tb] = [timeAtPosition(a[0], pace), timeAtPosition(b[0], pace)];
  const ratio = tb > ta ? Math.min(1, Math.max(0, (u - ta) / (tb - ta))) : 1;
  return [1, 2, 3].map((i) => a[i] + (b[i] - a[i]) * ratio);
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 경로 지점 수
// basis: estimate
/**
 * 단계 끝에서 잘리는 이동(hop.cut)의 글 상자 경로. 잘림 시각 앞의 지점만 남기고 잘림 시각의 보간 값을 마지막 지점으로 둔다. 움직이는 SVG와 재생기가 같은 시각에 끝나는 글 상자 키를 읽게 하는 한 곳이다.
 * @param path planChip이 돌려준 [진행 비율, dx, dy, opacity] 목록
 * @param hop { ms, cut, pace? } 이동 전체 시간, 그려지는 시간(ms), 구간별 이동 시간 꺾은선
 */
export function cutPath(path, hop) {
  const { ms, cut, pace } = hop;
  if (path.length < 2) return path;
  const kept = path.filter(([progress]) => timeAtPosition(progress, pace) * ms < cut);
  return [...kept, [positionAt(cut / ms, pace), ...offsetAt(path, hop, cut)]];
}

// cost: time O(m), heap O(1), stack O(1)
// vars: m = 글 상자 둘레 칸에 걸린 도형, 글자, 알약 수
// basis: estimate
// 글 상자가 그림 밖이거나 도형, 글자, 알약을 가리는지(선과 그룹 틀은 순위만 낮추므로 보지 않는다)
export function isHit(ctx, box) {
  return isOutsideFigure(box, ctx.scene) || ctx.hardIndex.some(box, (i) => overlapArea(box, ctx.hard[i]) > OVERLAP_SLACK);
}
