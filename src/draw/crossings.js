// 선 교차의 끊김. 두 선이 직각으로 지나는 자리에서 세로 구간을 끊어 가로 선이 그 위로 지나가게 보인다(다리 표시).
// 경로 점은 그대로이고, 세로 구간을 가진 선의 path에 구멍 난 clipPath를 걸 뿐이다. 그룹과 판은 면이 없어(draw/figure.js drawGroup) 구멍으로 바탕이 그대로 보인다.
// 장면마다 나타나는 선(순서 보기의 메시지처럼 장면 번호가 있는 선)은 늘 보이지 않으므로 끊지 않는다. 그 선이 숨은 장면에서 빈 구멍이 남기 때문이다.
import { values } from '@woonyong-choi/design-tokens/tokens.js';
import { roundCoord as r } from '../text.js';

const EDGE = values['border-width'].edge;
/** 끊긴 자리의 반 길이: 위로 지나는 선 굵기의 절반과 양쪽 틈 */
const GAP_HALF = EDGE / 2 + values.spacing['1'];
/** 구멍의 반 폭: 끊기는 선 굵기를 덮을 만큼 */
const CUT_HALF = EDGE;
const ROUTE = values.radius.route;
/** 좌표 반올림 여유(px) */
const TOUCH = 1;

const length = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
// 꺾은선의 곧은 구간. 세로(v)와 가로(h)만 남긴다. lo~hi는 둥근 모서리(route.js cornerAt과 같은 깎는 길이)를 뺀 곧은 범위다. 선 끝(도형 테두리)은 깎지 않는다.
function segmentsOf(points) {
  const corner = (i) => (i <= 0 || i >= points.length - 1 ? 0 : Math.min(ROUTE, length(points[i - 1], points[i]) / 2, length(points[i], points[i + 1]) / 2));
  // 끝 여유: 모서리 곡선이 끝나는 자리(좌표 반올림 TOUCH 안)는 곧은 선 위로 치고, 선 끝(도형 테두리)은 TOUCH만큼 안쪽부터 친다(T자로 닿는 선은 다리가 아니다).
  const slack = (i) => (i <= 0 || i >= points.length - 1 ? -TOUCH : TOUCH);
  return points.slice(1).flatMap((b, i) => {
    const a = points[i];
    const [ca, cb] = [corner(i), corner(i + 1)];
    const [sa, sb] = [slack(i), slack(i + 1)];
    if (a.x === b.x && a.y !== b.y) return [{ kind: 'v', x: a.x, lo: Math.min(a.y, b.y) + (a.y < b.y ? ca : cb), hi: Math.max(a.y, b.y) - (a.y < b.y ? cb : ca) }];
    if (a.y === b.y && a.x !== b.x) return [{ kind: 'h', y: a.y, lo: Math.min(a.x, b.x) + (a.x < b.x ? ca : cb) - (a.x < b.x ? sa : sb), hi: Math.max(a.x, b.x) - (a.x < b.x ? cb : ca) + (a.x < b.x ? sb : sa) }];
    return [];
  });
}

// 위로 지나는 가로 선은 넓힌 곧은 범위 안이면 되고, 끊기는 세로 선은 구멍 전체가 곧은 범위 안이어야 한다.
const onLine = (value, { lo, hi }) => value > lo && value < hi;
const cuttable = (value, { lo, hi }) => value - GAP_HALF >= lo && value + GAP_HALF <= hi;

// cost: time O(e²·p²), heap O(e·p), stack O(1)
// vars: e = 선 수, p = 선 하나의 경로 점 수
// basis: estimate
/**
 * 선마다 끊을 자리 목록. 두 선의 세로 구간과 가로 구간이 두 구간 모두의 곧은 부분에서 만나면 세로 구간을 가진 선이 끊긴다.
 * @returns Map<선 번호, { x, y, w, h }[]>. 끊을 자리가 없는 선은 들어 있지 않다
 */
export function crossingCuts(edges) {
  const shown = edges.map((e, j) => ({ j, segments: e.si === undefined && !e.isMark ? segmentsOf(e.points) : [] }));
  const cuts = new Map();
  for (const a of shown) for (const b of shown) {
    if (a.j === b.j) continue;
    for (const v of a.segments.filter((s) => s.kind === 'v')) for (const h of b.segments.filter((s) => s.kind === 'h')) {
      if (!onLine(v.x, h) || !cuttable(h.y, v)) continue;
      const cut = { x: v.x - CUT_HALF, y: h.y - GAP_HALF, w: CUT_HALF * 2, h: GAP_HALF * 2 };
      const list = cuts.get(a.j) ?? [];
      // 겹치는 구멍은 clip-rule evenodd에서 서로 지워지므로 하나만 둔다.
      if (!list.some((o) => Math.abs(o.y - cut.y) < cut.h && o.x === cut.x)) cuts.set(a.j, [...list, cut]);
    }
  }
  return cuts;
}

// cost: time O(p + c), heap O(out), stack O(1)
// vars: p = 경로 점 수, c = 끊을 자리 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 선 하나의 clipPath 정의와 path에 붙일 속성. 바깥 사각형은 선 전체(화살촉 포함)를 넉넉히 덮고, 끊을 자리마다 구멍을 낸다.
 * @param id clipPath id
 */
export function cutClip(id, points, cuts) {
  if (!cuts?.length) return { defs: '', attribute: '' };
  const pad = values.spacing['4'];
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const box = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
  const rect = ({ x, y, w, h }) => `M ${r(x)} ${r(y)} h ${r(w)} v ${r(h)} h ${r(-w)} Z`;
  return { defs: `<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d="${[box, ...cuts].map(rect).join(' ')}" clip-rule="evenodd"/></clipPath>`, attribute: ` clip-path="url(#${id})"` };
}
