// 모바일 보기 영역은 정적인 도형뿐 아니라 이동 점과 글상자의 전체 계획을 포함한다.
import { tightView } from '../canvas.js';
import { sizeChip } from '../chip.js';
import { chipStateAt } from '../chip-motion.js';
import { timeAtPosition } from '../easing.js';
import { flattenRoute } from '../route.js';
import { values } from '../vendor/theme/tokens.js';

// cost: time O(h·(p + k)·(p + k)), heap O(p + k), stack O(1)
// vars: h = 이동 수, p = 경로 지점 수, k = 글상자 계획 지점 수
// basis: estimate
export function figureViewBounds({ scene, timeline }) {
  const bounds = tightView(scene.width, scene.height);
  const extend = (box) => {
    const right = Math.max(bounds.x + bounds.w, box.x + box.w);
    const bottom = Math.max(bounds.y + bounds.h, box.y + box.h);
    bounds.x = Math.min(bounds.x, box.x);
    bounds.y = Math.min(bounds.y, box.y);
    bounds.w = right - bounds.x;
    bounds.h = bottom - bounds.y;
  };
  for (const seg of timeline.segs) for (const hop of seg.hops) {
    const route = hop.track === undefined ? flattenRoute(scene.edges[hop.edge].points) : timeline.tracks[hop.track].route;
    const halo = values.spacing.figure.packet.halo;
    for (const p of route) extend({ x: p.x - halo, y: p.y - halo, w: halo * 2, h: halo * 2 });
    if (hop.data) extendChip({ route, hop, chip: sizeChip(hop.data) }, extend);
  }
  return bounds;
}

// cost: time O((p + k)·(p + k)), heap O(p + k), stack O(1)
// vars: p = 경로 지점 수, k = 글상자 계획 지점 수
// basis: estimate
// 각 직선과 계획 구간에서 점 좌표와 상대 이동량은 각각 단조다. 두 범위를 더해 구간 중간의 돌출도 포함한다.
function extendChip(motion, extend) {
  const { route, hop, chip } = motion;
  const distances = route.map((p, i) => i ? Math.hypot(p.x - route[i - 1].x, p.y - route[i - 1].y) : 0);
  const length = distances.reduce((sum, d) => sum + d, 0);
  let at = 0;
  const turns = distances.map((d) => { at += d; return length ? (hop.isBack ? 1 - at / length : at / length) : 0; });
  const cuts = [...new Set([0, 1, ...turns, ...hop.chipPath.map(([p]) => p)])].sort((a, b) => a - b);
  const states = cuts.map((p) => chipStateAt(motion, hop.chipPath, timeAtPosition(p, hop.pace) * hop.ms));
  for (let i = 1; i < states.length; i++) {
    const [a, b] = [states[i - 1], states[i]];
    const x = Math.min(a.point.x, b.point.x) + Math.min(a.box.x - a.point.x, b.box.x - b.point.x);
    const y = Math.min(a.point.y, b.point.y) + Math.min(a.box.y - a.point.y, b.box.y - b.point.y);
    const right = Math.max(a.point.x, b.point.x) + Math.max(a.box.x - a.point.x, b.box.x - b.point.x) + chip.w;
    const bottom = Math.max(a.point.y, b.point.y) + Math.max(a.box.y - a.point.y, b.box.y - b.point.y) + chip.h;
    extend({ x, y, w: right - x, h: bottom - y });
  }
}
