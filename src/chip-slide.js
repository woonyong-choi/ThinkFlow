// 이동 하나의 글 상자 계획에서 자리를 바꾸는 미끄러짐. 앞 지점의 깨끗한 자리에서 지금 지점의 깨끗한 자리로 미끄러질 수 있는 길을 동적 계획 표에 더한다(docs/design/playback.md 이동 글).
import { boxAt, CHIP_FRAME_MS, dotAt, isHit, NODE_MS } from './chip-motion.js';
import { values } from './tokens.js';

/** 글 상자가 점의 움직임에 더해 한 프레임에 움직일 수 있는 최대 거리(px). 미끄러지는 속도의 상한이다. */
export const CHIP_STEP_MAX = 6;
/** 자리 바꿈(미끄러짐) 한 번의 비용. 겹침(1e7)보다 작고, 지점 수백 개의 작은 비용 합보다 크다 */
export const SWITCH_COST = 1e6;
// 미끄러짐 시간(토큰)
const SLIDE_MS = values.duration['chip-slide'];
// 거리가 멀어 한 번에 못 미끄러질 때 미끄러짐 시간을 늘리는 배수
const SLIDE_STRETCH = [1, 2, 4];
// 자리 바꿈 후보로 보는 자리 수(좋은 순)
const BEAM = 6;

// cost: time O(b²·s·a), heap O(b²), stack O(1)
// vars: b = BEAM, s = 미끄러짐 프레임 수, a = 피할 사각형 수
// basis: estimate
// 지점 j에 닿는 미끄러짐. 앞 지점 j - m의 깨끗한 자리에서 j의 깨끗한 자리로, 미끄러짐 시간 배수마다 본다.
// 같은 두 자리는 처음 미끄러질 수 있는 배수에서만 보므로, 지금 비용을 낮추는 배수가 없는 두 자리와 그 마지막 배수 뒤는 미끄러질 수 있는지 재지 않는다(결과가 같다).
export function addSlides(ctx, chain, j) {
  const { nodes, best } = chain;
  const legs = slideLegs(chain, j);
  const to = cleanOf(nodes[j].slots, (slot) => slot.cost);
  const lastUseful = lastUsefulLegs({ legs, to, best }, j);
  const linked = new Set();
  legs.forEach(({ from, starts }, k) => {
    for (const a of starts) for (const b of to) if ((lastUseful.get(pairKey(a, b)) ?? -1) >= k && !linked.has(pairKey(a, b)) && tryLink(ctx, { nodes, best }, { from, j, a, b })) linked.add(pairKey(a, b));
  });
}

// cost: time O(L·b²), heap O(b²), stack O(1)
// vars: L = 미끄러짐 배수 수, b = BEAM
// basis: estimate
// 두 자리(a>b)마다, 이어 보면 지점 j의 b 비용을 낮추는 마지막 배수 번호. 낮추는 배수가 없는 두 자리는 없다.
function lastUsefulLegs({ legs, to, best }, j) {
  const lastUseful = new Map();
  const now = new Map(to.map((b) => [b.key, best[j].get(b.key)?.cost ?? Infinity]));
  legs.forEach(({ from, starts }, k) => {
    for (const a of starts) for (const b of to) if (a.key !== b.key && best[from].get(a.key).cost + SWITCH_COST + b.cost < now.get(b.key)) lastUseful.set(pairKey(a, b), k);
  });
  return lastUseful;
}

// 두 자리 a, b를 잇는 이름
function pairKey(a, b) {
  return `${a.key}>${b.key}`;
}

// cost: time O(c log c) 처음, O(1) 이미 골랐을 때, heap O(c), stack O(1)
// vars: c = 후보 수
// basis: estimate
// 지점 j로 미끄러질 수 있는 출발 지점과 그 지점의 깨끗한 출발 자리(starts, 비용 순). 출발 자리가 없는 지점은 뺀다.
// 지점 from의 best는 j > from인 동안 바뀌지 않으므로 from마다 한 번만 고른다.
function slideLegs({ nodes, best, starts }, j) {
  const legs = [];
  for (const stretch of SLIDE_STRETCH) {
    const from = Math.max(0, j - Math.ceil((SLIDE_MS * stretch) / NODE_MS));
    if (from === j || nodes[j].t - nodes[from].t < SLIDE_MS * stretch - NODE_MS) continue;
    if (!starts.has(from)) starts.set(from, cleanOf(nodes[from].slots, (slot) => best[from].get(slot.key)?.cost ?? Infinity).filter((slot) => best[from].has(slot.key)));
    if (starts.get(from).length) legs.push({ from, starts: starts.get(from) });
  }
  return legs;
}

// cost: time O(s·a), heap O(1), stack O(1)
// vars: s = 미끄러짐 프레임 수, a = 피할 사각형 수
// basis: estimate
// 두 자리가 다르고 미끄러짐이 가능하면 연결을 비용이 더 싸면 기록한다. 미끄러짐이 가능했는지를 돌려준다.
function tryLink(ctx, { nodes, best }, { from, j, a, b }) {
  if (a.key === b.key || !canSlide(ctx, [nodes[from], nodes[j]], [a, b])) return false;
  const cost = best[from].get(a.key).cost + SWITCH_COST + b.cost;
  if (cost < (best[j].get(b.key)?.cost ?? Infinity)) best[j].set(b.key, { cost, prevJ: from, prevKey: a.key });
  return true;
}

// cost: time O(c·b), heap O(b), stack O(1)
// vars: c = 후보 수, b = BEAM
// basis: estimate
// 깨끗한 후보 가운데 비용이 낮은 BEAM개. 비용이 같으면 앞선 후보가 먼저다(안정 정렬 뒤 앞 BEAM개와 같다).
function cleanOf(slots, costOf) {
  const top = [];
  for (const slot of slots.values()) {
    if (!slot.isClean) continue;
    const cost = costOf(slot);
    if (top.length === BEAM && cost >= top.at(-1).cost) continue;
    const at = top.findIndex((entry) => entry.cost > cost);
    top.splice(at < 0 ? top.length : at, 0, { slot, cost });
    if (top.length > BEAM) top.pop();
  }
  return top.map((entry) => entry.slot);
}

// cost: time O(log F + s·m), heap O(1), stack O(1)
// vars: F = 이동의 프레임 수, s = 미끄러짐 프레임 수, m = 글 상자 둘레 칸에 걸린 사각형 수
// basis: estimate
// 두 자리 사이를 시간에 선형으로 미끄러질 때 속도가 상한 이하이고 모든 프레임이 깨끗한지. 가운데 프레임이 가장 먼저 걸리므로 가운데부터 잰다.
function canSlide(ctx, [first, last], [a, b]) {
  const span = last.t - first.t;
  if (Math.hypot(b.dx - a.dx, b.dy - a.dy) / (span / CHIP_FRAME_MS) > CHIP_STEP_MAX) return false;
  const frames = frameTimes(ctx, first.t);
  const count = framesBefore(frames, last.t);
  const middle = count >> 1;
  const isClear = (t) => {
    const ratio = (t - first.t) / span;
    return !isHit(ctx, boxAt(dotAt(ctx, t), ctx.chip, { dx: a.dx + (b.dx - a.dx) * ratio, dy: a.dy + (b.dy - a.dy) * ratio }));
  };
  if (count > 0 && !isClear(frames[middle])) return false;
  for (let k = 0; k < count; k++) if (k !== middle && !isClear(frames[k])) return false;
  return true;
}

// cost: time O(F) 처음, O(1) 이미 만들었을 때, heap O(F), stack O(1)
// vars: F = 이동의 프레임 수
// basis: estimate
// 지점 시각 start 다음부터 프레임 간격으로 더해 간 시각들. 더하는 방식을 바꾸지 않아야 프레임 시각이 같다.
function frameTimes(ctx, start) {
  if (!ctx.frames.has(start)) {
    const frames = [];
    for (let t = start + CHIP_FRAME_MS; t < ctx.hop.ms; t += CHIP_FRAME_MS) frames.push(t);
    ctx.frames.set(start, frames);
  }
  return ctx.frames.get(start);
}

// cost: time O(log F), heap O(1), stack O(1)
// vars: F = 프레임 수
// basis: estimate
// 오름차순 시각 가운데 end보다 앞선 것의 수
function framesBefore(frames, end) {
  let [low, high] = [0, frames.length];
  while (low < high) {
    const mid = (low + high) >> 1;
    if (frames[mid] < end) low = mid + 1;
    else high = mid;
  }
  return low;
}
