// 그룹 제목 글의 가로 자리. 기본은 그룹 왼쪽 안쪽이고, 선이 그 자리를 지나면 선 오른쪽으로 비킨다(docs/design/layout.md 그룹).
import { groupHead } from '../measure/sizes.js';
import { values } from '../tokens.js';

const SIZE = values.size;
/** 그룹 왼쪽 끝에서 제목 글까지 기본 거리 */
export const TITLE_INSET = values.space['9'];
// 제목 글과 비켜 선 선 사이 간격
const TITLE_CLEAR = values.space['2'];

// cost: time O(g·e·p·e), heap O(1), stack O(1)
// vars: g = 그룹 수, e = 선 수, p = 선 하나의 경로 점 수
// basis: estimate
/** 그룹마다 제목 글의 왼쪽 끝 거리 titleDx를 정한다. 비킬 자리가 없으면 기본 거리를 둔다. */
export function placeTitles(groups, edges) {
  for (const g of groups) {
    g.titleDx = g.label ? titleDx(g, edges) : TITLE_INSET + groupHead(g).lead;
    g.isTitleBlocked = g.label ? crossesTitle(g, edges) : false;
  }
}

// cost: time O(e·p·(e·p)), heap O(e·p), stack O(1)
// vars: e = 선 수, p = 선 하나의 경로 점 수
// basis: estimate
// 제목 덩어리가 선분을 지나지 않는 가장 왼쪽 자리. 후보는 기본 거리, 선분 오른쪽 끝 바로 너머, 선분 왼쪽 끝 바로 앞이다(덩어리가 선분 사이 틈에 들어가는 자리도 찾는다).
// 어느 후보도 맞지 않으면 기본 거리를 둔다(그림 검사 13번이 알린다).
function titleDx(g, edges) {
  const head = groupHead(g);
  const [w, inset] = [head.w, TITLE_INSET + head.lead];
  const limit = g.w - TITLE_INSET - w;
  const segments = edges.flatMap((e) => e.points.slice(1).map((p, i) => [e.points[i], p]));
  const candidates = [inset, ...segments.flatMap(([a, b]) => [Math.max(a.x, b.x) - g.x + TITLE_CLEAR, Math.min(a.x, b.x) - g.x - TITLE_CLEAR - w])].filter((dx) => dx >= inset && dx <= limit).sort((x, y) => x - y);
  const fits = (dx) => !segments.some(([a, b]) => crosses(a, b, { x: g.x + dx - TITLE_CLEAR, y: g.y, w: w + TITLE_CLEAR * 2, h: SIZE.group.title }));
  return candidates.find(fits) ?? inset;
}

// 가로 또는 세로 선분이 사각형 안쪽과 만나는가
function crosses(a, b, box) {
  const [x1, x2] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
  const [y1, y2] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  return x1 < box.x + box.w && box.x < x2 && y1 < box.y + box.h && box.y < y2;
}

// cost: time O(e·p), heap O(e·p), stack O(1)
// vars: e = 선 수, p = 선 하나의 경로 점 수
// basis: estimate
// 정한 자리에서도 제목 덩어리를 지나는 선이 있는가. 있으면 배치가 그 그룹을 넓혀 다시 한 번 배치한다.
function crossesTitle(g, edges) {
  const box = { x: g.x + g.titleDx, y: g.y, w: groupHead(g).w, h: SIZE.group.title };
  return edges.some((e) => e.points.slice(1).some((p, i) => crosses(e.points[i], p, box)));
}
