// 그룹 제목 글의 가로 자리. 기본은 그룹 왼쪽 안쪽이고, 선이 그 자리를 지나면 선 오른쪽으로 비킨다(docs/design/layout.md 그룹).
import { measure } from '../measure/fonts.js';
import { STYLE } from '../measure/sizes.js';
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
  for (const g of groups) g.titleDx = g.label ? titleDx(g, edges) : TITLE_INSET;
}

// cost: time O(e·p·e), heap O(1), stack O(1)
// vars: e = 선 수, p = 선 하나의 경로 점 수
// basis: estimate
// 제목 사각형을 지나는 선분의 오른쪽 끝 바로 너머로 옮기기를 되풀이한다. 옮길 때마다 값이 커지므로 선분 수만큼만 돈다.
// 부동소수점 반올림으로 값이 더 커지지 않으면 이미 선분에 맞닿은 자리라 거기서 멈추고, 상한(선분 수 + 1)에 걸리면 기본 거리를 둔다.
function titleDx(g, edges) {
  const w = measure(g.label, STYLE.group.size, STYLE.group.face);
  const limit = g.w - TITLE_INSET - w;
  const segments = edges.flatMap((e) => e.points.slice(1).map((p, i) => [e.points[i], p]));
  let dx = TITLE_INSET;
  for (let pass = 0; pass <= segments.length; pass++) {
    const box = { x: g.x + dx - TITLE_CLEAR, y: g.y, w: w + TITLE_CLEAR * 2, h: SIZE['group-title'] };
    const crossing = segments.filter(([a, b]) => crosses(a, b, box));
    if (!crossing.length) return dx;
    const next = Math.max(...crossing.map(([a, b]) => Math.max(a.x, b.x))) - g.x + TITLE_CLEAR;
    if (next <= dx) return dx;
    if (next > limit) return TITLE_INSET;
    dx = next;
  }
  return TITLE_INSET;
}

// 가로 또는 세로 선분이 사각형 안쪽과 만나는가
function crosses(a, b, box) {
  const [x1, x2] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
  const [y1, y2] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  return x1 < box.x + box.w && box.x < x2 && y1 < box.y + box.h && box.y < y2;
}
