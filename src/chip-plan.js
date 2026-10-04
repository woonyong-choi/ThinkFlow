// 이동 하나의 글 상자 계획. 자리 바꿈을 가장 적게 하고, 꼭 바꿔야 하면 짧게 미끄러지고, 그것도 안 되면 그 구간만 흐리게 한다(docs/design/playback.md 이동 글).
import { CHIP_GAP, chipCandidateAt, chipCandidates, descOf, sizeChip } from './chip.js';
import { gridOf } from './chip-grid.js';
import { issuesOf, settle, simplify } from './chip-fade.js';
import { dotAt, MOVE, NODE_MS, visibleShare } from './chip-motion.js';
import { addSlides, SWITCH_COST } from './chip-slide.js';
import { progressAt } from './easing.js';
import { flattenRoute } from './route.js';
import { values } from './tokens.js';

export { CHIP_FRAME_MS, CHIP_VISIBLE_MIN, chipStateAt } from './chip-motion.js';
export { CHIP_STEP_MAX } from './chip-slide.js';

// 글 상자와 점 사이가 이보다 멀면 떨어졌다고 본다(가리는 것을 비켜 올린 최대 거리까지는 붙은 것이다)
const DETACH_GAP = CHIP_GAP * 2 + CHIP_GAP * 4;
// 비용 가중치. 겹침 > 자리 바꿈 > 떨어짐(DETACH_GAP을 넘은 px마다) > 가까운 선(넓이마다) > 위아래 끝 여백 > 선택 순서 순으로 크다. 바꿈 한 번이 지점 수백 개의 작은 비용 합보다 크다
const UNCLEAN_COST = 1e7;
const DETACH_COST_PER_PX = 2e4;
const NEAR_COST = 300;
const MARGIN_COST = 500;
const ORDER_COST = 100;
// 글 상자(흐름과 박자 이동 모두)는 자기 점에서 이 거리(px, 상자 가장자리와 점 중심) 안에만 둔다. 이를 넘는 후보는 비용을 재지 않고 제외한다(점 옆 기본 자리는 늘 이 안이다)
const ATTACH_MAX = values.size.packet['chip-reach'];
// 박자 이동의 글 상자가 보여야 하는 비율의 하한. 못 넘으면 도형 이름을 가리는 자리도 쓴다(선 라벨 알약은 가리지 않는다)
const SHARE_MIN = values.scale['chip-visible-share'];
// 보이는 채로 가리는 자리의 비용(겹친 넓이 px²마다). 적게 가리는 자리를 고르게 한다
const SHOWN_HIT_COST = 1000;

// 이동에 맞춘 계획의 문제 목록. 그림 검사가 같은 계획을 다시 세우지 않고 쓴다. { scene, issues }
const plannedIssues = new WeakMap();

// cost: time O(h·plan), heap O(h), stack O(1)
// vars: h = 글 상자 있는 이동 수, plan = planChip 비용
// basis: measured npm run perf
/**
 * 시간표의 글 상자 있는 이동마다 계획을 세워 hop.chipPath에 담는다. 같은 선, 글, 시간, 방향의 이동은 계획이 같아 한 번만 세운다.
 * 문제 목록은 hop 밖(plannedIssues)에 두어 시간표를 담는 HTML에 실리지 않게 한다.
 */
export function planHops(scene, timeline, avoid) {
  const plans = new Map();
  for (const seg of timeline.segs) {
    for (const hop of seg.hops) {
      if (!hop.data) continue;
      const key = `${hop.track === undefined ? hop.edge : `t${hop.track}`}\u0000${hop.ms}\u0000${hop.isBack}\u0000${hop.data.join('\u0000')}`;
      if (!plans.has(key)) plans.set(key, planChip(scene, hop.track === undefined ? hop : { ...hop, route: timeline.tracks[hop.track].route }, avoid));
      hop.chipPath = plans.get(key).path;
      plannedIssues.set(hop, { scene, issues: hop.track === undefined ? plans.get(key).issues : reportedOf(plans.get(key).issues, hop) });
    }
  }
}

// cost: time O(i·g), heap O(i), stack O(1)
// vars: i = 지점별 문제 수, g = 도형 안을 지나는 구간 수
// basis: estimate
// 흐름 글 상자의 문제 가운데 그림 검사가 알릴 것. 글 상자는 가리는 곳에서 숨으므로(흐려짐) 가림은 알리지 않고, 그림 밖만 알린다. 점이 도형 안을 지나 보이지 않는 구간은 보지 않는다.
function reportedOf(issues, hop) {
  return issues.filter(({ at }) => !hop.gaps.some(([from, to]) => at > from && at < to)).map((issue) => ({ ...issue, hits: [] }));
}

// cost: time O(plan) 계획이 없을 때, O(1) 있을 때, heap O(n), stack O(1)
// vars: plan = planChip 비용, n = 계획 지점 수
// basis: estimate
/** 이동의 지점별 문제. planHops가 같은 장면으로 세운 계획이 있으면 그것을 쓴다. */
export function issuesOfHop(scene, hop, avoid) {
  const planned = plannedIssues.get(hop);
  return planned?.scene === scene ? planned.issues : planChip(scene, hop, avoid).issues;
}

// cost: time O(n·k·m + L·n·b²·s·m), heap O(n·k), stack O(1)
// vars: n = 계획 지점 수, k = 자리 종류 수, m = 글 상자 둘레 칸에 걸린 사각형 수, L = 미끄러짐 배수 수(3), b = BEAM, s = 미끄러짐 프레임 수
// basis: measured npm run perf
/**
 * 이동 하나의 글 상자 계획. 계획 지점마다 후보를 재고, 자리 바꿈 횟수를 가장 적게 하는 후보 열을 동적 계획으로 고른다.
 * 바꿔야 하면 두 자리 사이를 시간에 선형으로 미끄러지고(중간 프레임이 모두 깨끗한 때만), 깨끗한 길이 없으면 바꾸지 않고 겹치는 구간만 흐리게 한다.
 * 움직이는 SVG와 재생기가 이 목록을 그대로 쓴다.
 * 흐름(track) 이동은 이어 붙인 경로 hop.route를 따라가고, 지나는 선 모두(hop.edges)를 피할 대상에서 뺀다.
 * @returns { path, issues }. path는 이동 진행 비율 at(오름차순)마다 [at, dx, dy, opacity]이고, issues는 지점마다 { at, isOutside, hits }다
 */
export function planChip(scene, hop, avoid) {
  const plan = planWith(scene, hop, { avoid, isRelaxed: false });
  if (hop.track !== undefined) return plan;
  const move = { route: hop.route ?? flattenRoute(scene.edges[hop.edge].points), hop, chip: sizeChip(hop.data) };
  if (visibleShare(move, plan.path) >= SHARE_MIN) return plan;
  // 박자 이동의 글은 정보라서, 깨끗한 자리가 모자라 숨는 시간이 길면 도형 이름을 가리더라도 점 옆에 보인다.
  const shown = planWith(scene, hop, { avoid, isRelaxed: true });
  return visibleShare(move, shown.path) > visibleShare(move, plan.path) ? shown : plan;
}

// cost: time O(n·k·m + L·n·b²·s·m), heap O(n·k), stack O(1)
// vars: n = 계획 지점 수, k = 자리 종류 수, m = 글 상자 둘레 칸에 걸린 사각형 수, L = 미끄러짐 배수 수(3), b = BEAM, s = 미끄러짐 프레임 수
// basis: measured npm run perf
// 계획 한 번. isRelaxed면 선 라벨 알약만 가리면 안 되는 것으로 보고 도형과 글자는 가려도 숨기지 않는다.
function planWith(scene, hop, { avoid, isRelaxed }) {
  const own = hop.edges ?? [hop.edge];
  const ctx = { scene, hop, isRelaxed, chip: sizeChip(hop.data), field: avoid.filter((o) => !own.includes(o.edge)), route: hop.route ?? flattenRoute(scene.edges[hop.edge].points), dots: new Map(), frames: new Map() };
  ctx.hard = ctx.field.filter((o) => !o.soft && (!isRelaxed || o.isPill));
  ctx.hardIndex = gridOf(ctx.hard);
  ctx.index = gridOf(ctx.field);
  const times = nodeTimes(hop.ms);
  const { descs, known } = usefulDescs(ctx, times);
  const nodes = times.map((t, j) => ({ t, slots: slotsAt(ctx, t, { descs, known: known[j] }) }));
  // 바꾸지 않고 가는 길이 바꿈 한 번보다 싸면 그것이 답이다. 바꿈 후보는 그렇지 않을 때만 잰다.
  let chosen = stayCheapest(nodes);
  if (chosen.cost >= SWITCH_COST) chosen = chooseSlots(ctx, nodes);
  const rest = settle(ctx, chosen.rest);
  const path = simplify(rest).map(({ t, dx, dy, opacity }) => [progressAt(MOVE, t / hop.ms), dx, dy, opacity]);
  // 이분 탐색의 오차를 없애 첫 지점은 정확히 0, 끝 지점은 정확히 1로 둔다.
  path[0][0] = 0;
  path.at(-1)[0] = 1;
  return { path, issues: issuesOf(rest, hop) };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 계획 지점 수
// basis: estimate
function nodeTimes(ms) {
  const count = Math.max(1, Math.ceil(ms / NODE_MS));
  return Array.from({ length: count + 1 }, (_, j) => Math.min(ms, j * NODE_MS));
}

// cost: time O(n·k·a), heap O(n·k), stack O(1)
// vars: n = 계획 지점 수, k = 후보 수, a = 피할 사각형 수
// basis: estimate
// 이동 중 어느 지점에서든 깨끗했던 자리 종류(key별 desc). 점 위 기본 자리는 깨끗한 때가 없어도 마지막 수단으로 넣는다.
// 후보는 점마다 가까운 사각형 때문에 생기고 사라지므로, 이 자리 종류를 모든 지점에서 다시 만들어야 같은 자리를 이동 내내 이을 수 있다.
// known[j]는 지점 j에서 이미 만든 후보(key별)다. slotsAt이 같은 후보를 다시 만들지 않고 쓴다.
function usefulDescs(ctx, times) {
  const descs = new Map();
  const known = times.map((t) => {
    const found = new Map();
    for (const c of chipCandidates(dotAt(ctx, t), ctx.chip, { scene: ctx.scene, avoid: ctx.field, isWide: true, index: ctx.index })) {
      if (ctx.isRelaxed) c.hits = c.pillHits;
      found.set(c.key, c);
      if (!c.isOutside && c.hits.length === 0) descs.set(c.key, c.desc);
    }
    return found;
  });
  descs.set('above/mid/gap', descOf(['above'], ['mid'], 'gap'));
  return { descs, known };
}

// cost: time O(k·a), heap O(k), stack O(1)
// vars: k = 자리 종류 수, a = 피할 사각형 수
// basis: estimate
// 시각 t에 자리 종류마다 만든 후보. key로 찾는다. 이미 만든 후보(known)는 다시 재지 않는다.
function slotsAt(ctx, t, { descs, known }) {
  const point = dotAt(ctx, t);
  const slots = new Map();
  // 지점마다 자리 종류 수만큼 돌므로 Map 항목 쌍을 만들지 않게 forEach로 돈다(할당이 줄어 GC가 준다).
  descs.forEach((desc, key) => {
    const c = known.get(key) ?? chipCandidateAt(point, ctx.chip, { scene: ctx.scene, avoid: ctx.field, desc, index: ctx.index });
    // c는 이 이동 계획만 쓰는 후보라 그대로 고쳐 쓴다.
    if (ctx.isRelaxed) c.hits = c.pillHits;
    c.point = point;
    c.cost = isWithinReach(c.box, point) ? unaryCost(c, point, ctx.isRelaxed) : Infinity;
    c.isClean = !c.isOutside && c.hits.length === 0;
    slots.set(key, c);
  });
  return slots;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 글 상자 사각형과 점 중심 사이 거리(px)
function gapOf(box, point) {
  return Math.hypot(Math.max(box.x - point.x, 0, point.x - box.x - box.w), Math.max(box.y - point.y, 0, point.y - box.y - box.h));
}

// 글 상자가 점에 붙어 있다고 볼 거리 안인지(흐름의 글 상자 후보 분류)
const isWithinReach = (box, point) => gapOf(box, point) <= ATTACH_MAX;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 후보 하나의 한 지점 비용. 겹침이나 그림 밖은 흐려져야 하므로 가장 크다.
function unaryCost({ rank: [, area, near, tight, crowded, order], box, isOutside, hits }, point, isRelaxed) {
  const unclean = (isOutside || hits.length ? UNCLEAN_COST : 0) + (isRelaxed ? area * SHOWN_HIT_COST : area * Number(hits.length > 0 || isOutside));
  const gap = gapOf(box, point);
  return unclean + near * NEAR_COST + (tight + crowded) * MARGIN_COST + order * ORDER_COST + Math.max(0, gap - DETACH_GAP) * DETACH_COST_PER_PX;
}

// cost: time O(n·k), heap O(n), stack O(1)
// vars: n = 계획 지점 수, k = 후보 수
// basis: estimate
// 바꾸지 않고 한 자리로 처음부터 끝까지 가는 길 가운데 가장 싼 것(같으면 앞선 후보)과 총비용.
// 지점 비용은 0 이상이라 합이 지금까지의 가장 싼 값에 이르면 그 자리는 더 보지 않는다(같은 값은 앞선 후보가 이기므로 결과가 같다).
function stayCheapest(nodes) {
  let chosen = { cost: Infinity };
  for (const key of nodes[0].slots.keys()) {
    let cost = 0;
    for (let j = 0; j < nodes.length && cost < chosen.cost; j++) cost += nodes[j].slots.get(key).cost;
    if (cost < chosen.cost) chosen = { cost, key };
  }
  return { cost: chosen.cost, rest: nodes.map((node) => ({ t: node.t, slot: node.slots.get(chosen.key) })) };
}

// cost: time O(n·(k + b²·s·a)), heap O(n·k), stack O(1)
// vars: n = 계획 지점 수, k = 후보 수, b = BEAM, s = 미끄러짐 프레임 수, a = 피할 사각형 수
// basis: estimate
// 지점마다 가장 싼 누적 비용으로 이어지는 후보 열. 같은 key를 이으면 비용이 없고, 다른 key로 가려면 미끄러짐(SWITCH_COST)이 든다.
function chooseSlots(ctx, nodes) {
  const best = nodes.map(() => new Map());
  const starts = new Map();
  nodes.forEach((node, j) => {
    node.slots.forEach((slot, key) => {
      const stay = best[j - 1]?.get(key);
      if (j === 0) best[j].set(key, { cost: slot.cost });
      else if (stay) best[j].set(key, { cost: stay.cost + slot.cost, prevJ: j - 1, prevKey: key });
    });
    if (j > 0) addSlides(ctx, { nodes, best, starts }, j);
  });
  return backtrack(nodes, best);
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 계획 지점 수
// basis: estimate
// 끝 지점에서 가장 싼 후보부터 거꾸로 걸어 머무는 지점마다의 후보와 총비용을 모은다. 미끄러지는 동안의 지점은 건너뛴다.
function backtrack(nodes, best) {
  const last = nodes.length - 1;
  const [endKey, end] = [...best[last].entries()].reduce((a, b) => (b[1].cost < a[1].cost ? b : a));
  let key = endKey;
  const rest = [];
  for (let j = last; j >= 0; ) {
    const state = best[j].get(key);
    rest.push({ t: nodes[j].t, slot: nodes[j].slots.get(key) });
    [j, key] = state.prevJ === undefined ? [-1, key] : [state.prevJ, state.prevKey];
  }
  return { rest: rest.reverse(), cost: end.cost };
}
