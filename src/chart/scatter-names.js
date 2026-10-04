// 산점도 점 이름 자리. 점 오른쪽이 기본이고, 다른 이름이나 점과 겹치면 왼쪽, 위아래로 옮겨 둘 다 읽히게 한다(docs/design/charts.md 산점도).
import { measure } from '../measure/fonts.js';
import { DOT, NAME_OFFSET, SPACE, TEXT } from './metrics.js';

// 이름을 위아래로 옮기는 한 걸음(px). 글자 높이에 간격 `space.1`을 더해 옮긴 이름이 닿지 않게 한다.
export const NAME_STEP = TEXT['11'] + SPACE['1'];
// 위아래로 옮겨 볼 최대 걸음 수
const STEPS_MAX = 4;
// 옮김 순서: 제자리, 위, 아래, 두 걸음 위, 두 걸음 아래, ...
const SHIFTS = Array.from({ length: STEPS_MAX * 2 + 1 }, (_, i) => (i === 0 ? 0 : (i % 2 ? -1 : 1) * Math.ceil(i / 2)));

const isOverlapping = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 점 (x, y)의 이름 글자 상자. toLeft면 점 왼쪽, 아니면 오른쪽에 두고 shift걸음 위(음수)나 아래로 옮긴다.
function boxOf({ x, y }, { width, toLeft, shift }) {
  const cy = y + shift * NAME_STEP;
  return { x0: toLeft ? x - NAME_OFFSET - width : x + NAME_OFFSET, x1: toLeft ? x - NAME_OFFSET : x + NAME_OFFSET + width, y0: cy - TEXT['11'] / 2, y1: cy + TEXT['11'] / 2 };
}

// cost: time O(p²), heap O(p), stack O(1)
// vars: p = 점 수
// basis: estimate
/**
 * 점마다 이름 자리를 정한다. 먼저 적은 점부터 오른쪽(그림 오른쪽 끝을 넘으면 왼쪽), 다른 쪽, 위아래로 옮긴 자리 순으로 보고,
 * 이미 놓인 이름과 모든 점을 피하는 자리를 쓴다. 없으면 점은 가려도 이름끼리는 안 겹치는 자리, 그것도 없으면 기본 자리다.
 * @param points { p, x, y } 목록
 * @returns { p, nameW, toLeft, shift, box } 목록과, 끝내 겹친 이름 쌍 clashes([먼저 놓인 점, 겹친 점])
 */
export function placeNames(points, right) {
  const dots = points.map(({ x, y }) => ({ x0: x - DOT, x1: x + DOT, y0: y - DOT, y1: y + DOT }));
  const placed = [];
  const clashes = [];
  for (const point of points) {
    const width = measure(point.p.label, TEXT['11']);
    const wantsLeft = point.x + NAME_OFFSET + width > right;
    const options = [wantsLeft, !wantsLeft].flatMap((toLeft) => SHIFTS.map((shift) => ({ width, toLeft, shift })));
    const boxes = options.map((option) => boxOf(point, option));
    const isFree = (box, obstacles) => obstacles.every((other) => !isOverlapping(box, other));
    const names = placed.map(({ box }) => box);
    const at = [[...names, ...dots], names].map((obstacles) => boxes.findIndex((box) => isFree(box, obstacles))).find((i) => i >= 0) ?? 0;
    const clash = placed.find(({ box }) => isOverlapping(box, boxes[at]));
    if (clash) clashes.push([clash.p, point.p]);
    placed.push({ p: point.p, nameW: width, toLeft: options[at].toLeft, shift: options[at].shift, box: boxes[at] });
  }
  return { names: placed, clashes };
}
