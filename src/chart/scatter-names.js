// 산점도 점 이름 자리. 점 오른쪽이 기본이고, 다른 이름이나 점과 겹치면 왼쪽, 위아래로 옮겨 둘 다 읽히게 한다(docs/design/charts.md 산점도).
import { measure, wrap } from '../measure/fonts.js';
import { DOT, NAME_OFFSET, SPACE, TEXT } from './metrics.js';

// 이름을 위아래로 옮기는 한 걸음(px). 글자 높이에 간격 `space.1`을 더해 옮긴 이름이 닿지 않게 한다. 브라우저가 이름 한 줄을 이 높이의 줄 상자로 그려서 이름 상자의 높이도 줄 수 × 한 걸음이다.
export const NAME_STEP = TEXT['11'] + SPACE["0-5"];
// 위아래로 옮겨 볼 최대 걸음 수
const STEPS_MAX = 4;
// 옮김 순서: 제자리, 위, 아래, 두 걸음 위, 두 걸음 아래, ...
const SHIFTS = Array.from({ length: STEPS_MAX * 2 + 1 }, (_, i) => (i === 0 ? 0 : (i % 2 ? -1 : 1) * Math.ceil(i / 2)));

const isOverlapping = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
// 두 상자 사이의 가장 가까운 거리. 닿거나 겹치면 0이다.
const gapBetween = (a, b) => Math.hypot(Math.max(a.x0 - b.x1, b.x0 - a.x1, 0), Math.max(a.y0 - b.y1, b.y0 - a.y1, 0));

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 점 (x, y)의 이름 글자 상자. toLeft면 점 왼쪽, 아니면 오른쪽에 두고 shift걸음 위(음수)나 아래로 옮긴다.
function boxOf({ x, y }, { width, height = NAME_STEP, toLeft, shift }) {
  const cy = y + shift * NAME_STEP;
  return { x0: toLeft ? x - NAME_OFFSET - width : x + NAME_OFFSET, x1: toLeft ? x - NAME_OFFSET : x + NAME_OFFSET + width, y0: cy - height / 2, y1: cy + height / 2 };
}

// cost: time O(p²·s + n²), heap O(p + n), stack O(1)
// vars: p = 점 수, s = 한 점의 이름 자리 후보 수(옮김 걸음 수의 두 배), n = 이름 전체 글자 수
// basis: estimate
/**
 * 점마다 이름 자리를 정한다. 먼저 적은 점부터 오른쪽(그림 오른쪽 끝을 넘으면 왼쪽), 다른 쪽, 위아래로 옮긴 자리 순으로 보고,
 * 이미 놓인 이름과 모든 점을 피하면서 자기 점이 다른 어느 점보다 `space.6` 이상 가까운 자리를 먼저 쓴다. 없으면 그 가까움을 뺀 자리,
 * 그것도 없으면 점은 가려도 이름끼리는 안 겹치는 자리, 그것도 없으면 기본 자리다.
 * @param points { p, text, x, y } 목록. text는 그려지는 이름 글(계열 번호 키가 앞에 붙을 수 있다)이고 글 폭과 줄바꿈이 이것을 잰다.
 * @returns { p, text, nameW, toLeft, shift, box } 목록과, 끝내 겹친 이름 쌍 clashes([먼저 놓인 점, 겹친 점])
 */
export function placeNames(points, right, bounds) {
  const dots = points.map(({ x, y }) => ({ x0: x - DOT, x1: x + DOT, y0: y - DOT, y1: y + DOT }));
  const placed = [];
  const clashes = [];
  for (const point of points) {
    const width = measure(point.text, TEXT['11']);
    const rightRoom = right - point.x - NAME_OFFSET;
    const leftRoom = point.x - (bounds?.left ?? 0) - NAME_OFFSET;
    const wantsLeft = width > rightRoom && (!bounds || leftRoom > rightRoom);
    // 줄 폭의 하한은 가장 긴 낱말이다. 좁은 쪽에서도 낱말 안은 끊지 않고, 낱말이 들어가지 않는 쪽의 상자는 inBounds가 걸러 다른 쪽이나 위아래로 옮긴 자리가 고려된다.
    const longest = Math.max(...point.text.split(' ').map((word) => measure(word, TEXT['11'])));
    const options = [wantsLeft, !wantsLeft].flatMap((toLeft) => {
      const room = toLeft ? point.x - (bounds?.left ?? 0) - NAME_OFFSET : right - point.x - NAME_OFFSET;
      const lines = bounds ? wrap(point.text, Math.max(longest, room), { size: TEXT['11'] }) : [point.text];
      const nameW = bounds ? Math.max(...lines.map((line) => measure(line, TEXT['11']))) : width;
      return SHIFTS.map((shift) => ({ width: nameW, height: lines.length * NAME_STEP, toLeft, shift, lines }));
    });
    const boxes = options.map((option) => boxOf(point, option));
    const inBounds = (box) => !bounds || (box.x0 >= bounds.left && box.x1 <= right && box.y0 >= bounds.top && box.y1 <= bounds.bottom);
    const isFree = (box, obstacles) => inBounds(box) && obstacles.every((other) => !isOverlapping(box, other));
    // 이름이 자기 점에서 다른 어느 점보다 `space.6` 이상 가까우면 어느 점의 이름인지 읽힌다.
    const own = dots[points.indexOf(point)];
    const isOwned = (box) => dots.every((dot) => dot === own || gapBetween(box, dot) >= gapBetween(box, own) + SPACE["3"]);
    const names = placed.map(({ box }) => box);
    const tiers = [(box) => isFree(box, [...names, ...dots]) && isOwned(box), (box) => isFree(box, [...names, ...dots]), (box) => isFree(box, names)];
    const at = tiers.map((fits) => boxes.findIndex(fits)).find((i) => i >= 0) ?? 0;
    const clash = placed.find(({ box }) => isOverlapping(box, boxes[at]));
    if (clash) clashes.push([clash.p, point.p]);
    placed.push({ p: point.p, text: point.text, nameW: options[at].width, lines: options[at].lines, fitsBounds: inBounds(boxes[at]), toLeft: options[at].toLeft, shift: options[at].shift, box: boxes[at] });
  }
  return { names: placed, clashes };
}
