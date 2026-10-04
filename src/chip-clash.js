// 서로 다른 점의 글 상자가 겹치는 것을 다룬다. 점이 여럿 동시에 지나는 구간(흐름, 박자의 `&` 동시 이동)에서, 겹치는 구간에서 나중에 출발한 점의 글 상자를 숨기고(점은 보인다) 자리가 나면 서서히 다시 보인다.
// 숨김은 이동마다 한 번 계산한 불투명도 키(hop.chipFade)로 시간표에 담고, 움직이는 SVG와 재생기와 그림 검사 7번이 그 키를 그대로 읽는다(docs/design/playback.md 이동 글).
import { CHIP_FRAME_MS, CHIP_VISIBLE_MIN, chipStateAt } from './chip-motion.js';
import { OVERLAP_SLACK, overlapArea, sizeChip } from './chip.js';
import { curveOf, progressAt } from './easing.js';
import { flattenRoute } from './route.js';
import { values } from './tokens.js';

const MOVE = curveOf('move');
/** 글 상자가 숨고 다시 나타나는 시간(ms). 이동 글 상자 흐려짐 토큰과 같다. */
export const CHIP_HIDE_FADE_MS = values.duration['chip-fade'];

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 키 수
// basis: estimate
/** 이동 시작 뒤 t(ms)의 숨김 불투명도. keys는 [시각, 값] 목록(시각 오름차순, 첫 키는 0)이고 키 사이는 시간에 선형이다. 키가 없으면 1이다. */
export function fadeAt(keys, t) {
  if (!keys?.length) return 1;
  const k = keys.findLastIndex(([at]) => at <= t);
  if (k < 0) return keys[0][1];
  if (k === keys.length - 1) return keys[k][1];
  const [[a, va], [b, vb]] = [keys[k], keys[k + 1]];
  return va + ((vb - va) * (t - a)) / (b - a);
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 숨는 구간 수
// basis: estimate
// 겹치는 구간 [시작, 끝]을 불투명도 키로. 겹침이 시작되기 전에 CHIP_HIDE_FADE_MS만큼 앞서 흐려져 겹칠 때는 이미 안 보이고, 끝난 뒤 같은 시간 동안 나타난다.
// 이동 시작(0)보다 앞선 키는 0에서의 보간 값으로 바꾼다.
function fadeKeysOf(spans) {
  const raw = spans.flatMap(([from, to]) => [[from - CHIP_HIDE_FADE_MS, 1], [from, 0], [to, 0], [to + CHIP_HIDE_FADE_MS, 1]]);
  const atZero = fadeAt([[-Infinity, 1], ...raw], 0);
  const keys = [[0, atZero], ...raw.filter(([at]) => at > 0)];
  return keys.filter(([at], i) => i === keys.length - 1 || keys[i + 1][0] > at);
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
// 이동의 길(그려지는 경로를 편 점 목록)과 글 상자 크기. 같은 이동은 한 번만 만든다.
function motionOf(hop, { scene, timeline }, cache) {
  if (!cache.has(hop)) cache.set(hop, { route: hop.track === undefined ? flattenRoute(scene.edges[hop.edge].points) : timeline.tracks[hop.track].route, hop, chip: sizeChip(hop.data) });
  return cache.get(hop);
}

// cost: time O(p + l), heap O(1), stack O(1)
// vars: p = 경로 점 수, l = 글 상자 경로 지점 수
// basis: estimate
// 이동 시작 뒤 local(ms)의 글 상자 { box, hop }. 점이 보이지 않거나(도형 안, 이동 밖, 단계 끝에 잘린 뒤) 계획이 흐린 때는 없다. isFactored면 숨김(chipFade)도 곱한다.
function chipAt(motion, local, { isFactored }) {
  const { hop } = motion;
  if (local < 0 || local > (hop.cut ?? hop.ms)) return undefined;
  const progress = progressAt(MOVE, Math.min(1, local / hop.ms));
  if (hop.gaps?.some(([from, to]) => progress > from && progress < to)) return undefined;
  const { box, opacity } = chipStateAt(motion, hop.chipPath, local);
  const shown = isFactored ? opacity * fadeAt(hop.chipFade, local) : opacity;
  return shown >= CHIP_VISIBLE_MIN ? { box, hop } : undefined;
}

// cost: time O(h²), heap O(h), stack O(1)
// vars: h = 구간의 글 상자 있는 이동 수
// basis: estimate
// 프레임 하나(구간 시작 뒤 t)에서 먼저 출발한 점부터 글 상자를 놓고, 이미 놓인 글 상자와 겹쳐 놓지 못한 이동 목록.
function clashedAt(hops, t, world) {
  const placed = [];
  const clashed = [];
  for (const hop of hops) {
    const chip = chipAt(motionOf(hop, world, world.cache), t - (hop.at ?? 0), { isFactored: false });
    if (chip && placed.some((box) => overlapArea(box, chip.box) > OVERLAP_SLACK)) clashed.push(hop);
    else if (chip) placed.push(chip.box);
  }
  return clashed;
}

// cost: time O(F·h²), heap O(h), stack O(1)
// vars: F = 구간의 프레임 수, h = 구간의 글 상자 있는 이동 수
// basis: estimate
// 구간 하나에서 이동마다 글 상자가 겹친 이동 시작 뒤 시각 목록.
function clashTimes(seg, hops, world) {
  const times = new Map(hops.map((hop) => [hop, []]));
  for (let t = 0; t <= seg.t1 - seg.t0; t += CHIP_FRAME_MS) for (const hop of clashedAt(hops, t, world)) times.get(hop).push(t - hop.at);
  return times;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 겹친 프레임 수
// basis: estimate
// 겹친 프레임 시각들을 구간으로 묶는다. 숨는 시간의 두 배 넘게 떨어지면 다른 구간이다.
function spansOf(times) {
  const spans = [];
  for (const t of times) {
    if (spans.length && t - spans.at(-1)[1] <= CHIP_HIDE_FADE_MS * 2) spans.at(-1)[1] = t;
    else spans.push([t, t]);
  }
  return spans;
}

// cost: time O(F·h²), heap O(h), stack O(1)
// vars: F = 구간의 프레임 수, h = 구간의 글 상자 있는 이동 수
// basis: estimate
/**
 * 구간마다 글 상자가 겹치는 구간을 찾아 나중에 출발한 점의 hop.chipFade(불투명도 키)에 담는다.
 * 60fps 프레임마다 먼저 출발한 점부터 글 상자를 놓고, 이미 놓인 글 상자와 겹치면 그 프레임은 겹침이다.
 */
export function planClashes(scene, timeline) {
  const world = { scene, timeline, cache: new Map() };
  for (const seg of timeline.segs) {
    const hops = seg.hops.filter((hop) => hop.data).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
    if (hops.length < 2) continue;
    for (const [hop, times] of clashTimes(seg, hops, world)) if (times.length) hop.chipFade = fadeKeysOf(spansOf(times));
  }
}

// cost: time O(h²), heap O(h), stack O(1)
// vars: h = 구간의 글 상자 있는 이동 수
// basis: estimate
// 프레임 하나에서 보이는 글 상자끼리 겹치는 이동 쌍.
function overlapsAt(hops, t, world) {
  const chips = hops.map((hop) => chipAt(motionOf(hop, world, world.cache), t - (hop.at ?? 0), { isFactored: true })).filter(Boolean);
  return chips.flatMap((a, i) => chips.slice(i + 1).filter((b) => overlapArea(a.box, b.box) > OVERLAP_SLACK).map((b) => ({ a: a.hop, b: b.hop })));
}

// cost: time O(F·h²), heap O(h), stack O(1)
// vars: F = 구간의 프레임 수, h = 구간의 글 상자 있는 이동 수
// basis: estimate
/**
 * 보이는 글 상자끼리 겹치는 곳. 숨김(hop.chipFade)을 적용한 뒤에도 겹치면 { seg, a, b, t }(이동 a, b와 구간 안 시각)이다. 이동 쌍마다 처음 한 곳만 돌려준다.
 */
export function findClashes(scene, timeline) {
  const world = { scene, timeline, cache: new Map() };
  const found = [];
  const seen = new Set();
  for (const seg of timeline.segs) {
    const hops = seg.hops.filter((hop) => hop.data);
    if (hops.length < 2) continue;
    for (let t = 0; t <= seg.t1 - seg.t0; t += CHIP_FRAME_MS) {
      for (const { a, b } of overlapsAt(hops, t, world)) {
        const key = `${hops.indexOf(a)}\u0000${hops.indexOf(b)}\u0000${seg.t0}`;
        if (!seen.has(key)) found.push({ seg, a, b, t });
        seen.add(key);
      }
    }
  }
  return found;
}
