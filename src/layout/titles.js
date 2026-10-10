// 그룹 제목 글의 가로 자리. 기본은 그룹 왼쪽 안쪽이고, 선이 그 자리를 지나면 선 오른쪽으로 비킨다(docs/design/layout.md 그룹).
import { groupHead } from '../measure/sizes.js';
import { values } from '../vendor/theme/tokens.js';

const SIZE = values.spacing.figure;
/** 그룹 왼쪽 끝에서 제목 글까지 기본 거리 */
const TITLE_INSET =values.spacing["4-5"];
// 제목 덩어리(아이콘 탭과 제목 글)와 비켜 선 선 사이 간격. 선이 글자에 붙어 한 획처럼 읽히지 않을 만큼 둔다.
const TITLE_CLEAR = values.spacing["2"];

// cost: time O(g·e·p·e), heap O(1), stack O(1)
// vars: g = 그룹 수, e = 선 수, p = 선 하나의 경로 점 수
// basis: estimate
/**
 * 그룹마다 제목 글의 왼쪽 끝 거리 titleDx를 정한다. 아이콘 탭이 있으면 탭과 제목이 한 덩어리로 비킨다. 비킬 자리가 없으면 기본 거리를 둔다.
 * @param sweep 박자 이동 글 상자가 쓸고 지나는 선의 옆 폭 Map<선 번호, { x }>. 그 선의 세로 구간에는 TITLE_CLEAR 대신 이 폭만큼 비킨다
 */
export function placeTitles(groups, edges, sweep = new Map()) {
  for (const g of groups) {
    g.titleDx = g.label ? titleDx(g, edges, sweep) : TITLE_INSET + groupHead(g).lead;
    g.isTitleBlocked = g.label ? crossesTitle(g, edges) : false;
  }
}

// cost: time O(e·p·(e·p)), heap O(e·p), stack O(1)
// vars: e = 선 수, p = 선 하나의 경로 점 수
// basis: estimate
// 제목 덩어리가 선분을 지나지 않는 가장 왼쪽 자리. 후보는 기본 거리, 선분 오른쪽 끝 바로 너머, 선분 왼쪽 끝 바로 앞이다(덩어리가 선분 사이 틈에 들어가는 자리도 찾는다).
// 어느 후보도 맞지 않으면 기본 거리를 둔다(그림 검사 13번이 알린다).
function titleDx(g, edges, sweep) {
  const head = groupHead(g);
  const [w, inset] = [head.w, TITLE_INSET + head.lead];
  const limit = g.w - TITLE_INSET - w;
  // 선분마다 비켜 설 간격: 박자 이동 글 상자가 쓸고 지나는 선은 그 옆 폭, 그 밖의 선은 TITLE_CLEAR
  const segments = edges.flatMap((e) => e.points.slice(1).map((p, i) => [e.points[i], p, Math.max(TITLE_CLEAR, sweep.get(e.index)?.x ?? 0)]));
  // 덩어리는 탭 왼쪽 끝(dx - inset)에서 제목 글 오른쪽 끝(dx + w)까지다. 탭이 없으면 제목 글만이다.
  const candidates = [inset, ...segments.flatMap(([a, b, clear]) => [Math.max(a.x, b.x) - g.x + clear + (head.lead ? inset : 0), Math.min(a.x, b.x) - g.x - clear - w])].filter((dx) => dx >= inset && dx <= limit).sort((x, y) => x - y);
  const fits = (dx) => !segments.some(([a, b, clear]) => crosses(a, b, headBox(g, dx, clear)));
  return candidates.find(fits) ?? inset;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 제목 덩어리의 사각형. 아이콘 탭이 있으면 탭 왼쪽 끝부터, 없으면 제목 글 왼쪽 끝부터이고 좌우로 clear만큼 넓힌다. */
export function headBox(g, dx, clear = 0) {
  const head = groupHead(g);
  const left = head.lead ? dx - TITLE_INSET - head.lead : dx;
  return { x: g.x + left - clear, y: g.y, w: dx + head.w - left + clear * 2, h: SIZE.group.title };
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
  const box = headBox(g, g.titleDx);
  return edges.some((e) => e.points.slice(1).some((p, i) => crosses(e.points[i], p, box)));
}
