// 선 라벨 자리 고르기. elkjs가 선 꼬리 옆에 잡은 자리가 다른 라벨, 도형, 다른 선과 겹치거나 그룹 테두리에 걸치면 자기 선을 따라 출발점에서 가장 가까운 빈 자리로 옮긴다(docs/design/layout.md 선 라벨).
// 경로 점은 건드리지 않고 라벨 가운데 자리만 정한다.
import { sizePill } from '../measure/sizes.js';
import { values } from '@woonyong-choi/design-tokens/tokens.js';
import { TOUCH } from './model.js';

// 라벨과 자기 선 사이 간격. elkjs 라벨 간격(`elk.spacing.edgeLabel`)과 같다.
const GAP = values.spacing["1"];
// 다른 요소와 이보다 가까우면 붙어 보인다.
const CLEAR = values.spacing["0-5"];
// 자기 선을 따라 자리를 찾는 걸음
const STEP = values.spacing["1-5"];

// cost: time O(l·c·(s + l + e·p)), heap O(l), stack O(1)
// vars: l = 라벨 수, c = 후보 자리 수(선 길이 / STEP), s = 도형 수, e = 선 수, p = 경로 점 수
// basis: estimate
/**
 * 라벨 자리를 선언 순서대로 정한다. 앞 라벨은 elkjs 자리가 비어 있으면 그대로이고, 겹치면 자기 선의 출발점부터 걸어가며 처음 빈 자리를 쓴다.
 * 빈 자리가 없으면 elkjs 자리를 그대로 두어 그림 검사 2번이 알린다.
 * @param edges 경로 점(points)과 elkjs 라벨 자리(labelAt)를 가진 선. labelAt을 바꾼다
 * @param items 도형 사각형
 * @param bounds 그림 크기 { width, height }
 * @param groups 그룹 사각형. 라벨은 그룹 안에 들거나 밖에 있어야 하고 테두리에 걸치면 안 된다
 */
export function settleLabels(edges, items, bounds, groups = []) {
  const solids = items.map((it) => inflate({ x: it.x - (it.marginSide ?? 0), y: it.y - (it.marginTop ?? 0), w: it.w + (it.marginSide ?? 0) * 2, h: it.h + (it.marginTop ?? 0) + (it.marginBottom ?? 0) }, CLEAR));
  const runs = edges.flatMap((e) => e.points.slice(1).map((q, k) => ({ p: e.points[k], q })));
  const placed = [];
  for (const e of edges) {
    if (!e.labelAt || e.isMark) continue;
    const size = sizePill(e.label, e.no);
    const isFree = (at) => {
      const box = boxAt(at, size);
      if (box.x < 0 || box.y < 0 || box.x + box.w > bounds.width || box.y + box.h > bounds.height) return false;
      const around = inflate(box, CLEAR);
      return !solids.some((s) => meets(around, s)) && !placed.some((o) => meets(around, o)) && !runs.some((run) => crosses(run, box)) && !groups.some((g) => straddles(around, g));
    };
    if (!isFree(e.labelAt)) e.labelAt = spotsAlong(e.points, size).find(isFree) ?? e.labelAt;
    placed.push(boxAt(e.labelAt, size));
  }
}

// cost: time O(p·L/STEP), heap O(p·L/STEP), stack O(1)
// vars: p = 경로 구간 수, L = 구간 길이
// basis: estimate
// 출발점에서 가까운 순서의 라벨 후보 자리. 세로 구간은 선 오른쪽과 왼쪽, 가로 구간은 선 위와 아래다. 라벨 앞 끝이 구간 위의 걸음 자리에 온다.
function spotsAlong(points, { w, h }) {
  const spots = [];
  for (let k = 1; k < points.length; k++) {
    const [a, b] = [points[k - 1], points[k]];
    const isVertical = Math.abs(a.x - b.x) < TOUCH;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const sign = isVertical ? Math.sign(b.y - a.y) : Math.sign(b.x - a.x);
    const along = isVertical ? h : w;
    for (let d = GAP; d + along <= length - GAP; d += STEP) {
      const lead = d + along / 2;
      if (isVertical) for (const side of [1, -1]) spots.push({ x: a.x + side * (GAP + w / 2), y: a.y + sign * lead });
      else for (const side of [-1, 1]) spots.push({ x: a.x + sign * lead, y: a.y + side * (GAP + h / 2) });
    }
  }
  return spots;
}

const boxAt = (at, { w, h }) => ({ x: at.x - w / 2, y: at.y - h / 2, w, h });
const inflate = (r, d) => ({ x: r.x - d, y: r.y - d, w: r.w + d * 2, h: r.h + d * 2 });
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const holds = (outer, inner) => outer.x <= inner.x && outer.y <= inner.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
// 사각형이 그룹 테두리에 걸치는가: 그룹과 겹치지만 그룹 안에 다 들지 않는다.
const straddles = (box, group) => meets(box, group) && !holds(group, box);

// 선 구간 하나가 사각형 안쪽을 지나는가. 가로·세로 선은 폭이 0이라 범위 비교에 작은 여유를 더한다.
const CROSS_SLACK = 0.01;
function crosses({ p, q }, r) {
  const [x1, x2] = [Math.min(p.x, q.x), Math.max(p.x, q.x)];
  const [y1, y2] = [Math.min(p.y, q.y), Math.max(p.y, q.y)];
  return x1 < r.x + r.w && r.x < x2 + CROSS_SLACK && y1 < r.y + r.h && r.y < y2 + CROSS_SLACK;
}
