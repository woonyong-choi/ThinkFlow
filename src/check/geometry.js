// 그림 검사가 함께 쓰는 사각형, 선분, 부모 관계 계산.
import { ROOT } from '../layout/model.js';
import { measure } from '../measure/fonts.js';
import { STYLE, sizePill } from '../measure/sizes.js';
import { values } from '../tokens.js';

/** 잰 글 폭의 반올림 차이를 넘기 위한 여유 */
export const FIT_SLACK = 0.5;
/** 도형 경계와 선 끝이 같다고 보는 거리 */
export const TOUCH = 0.5;

/** 도형과 그룹 안쪽으로 들어가야 선이 지나간 것으로 보는 안쪽 여백 */
export const THROUGH_INSET = 1;
// 선분 범위 비교에서 선이 닿기만 한 것을 겹침으로 세는 여유
const TOUCH_SLACK = 0.01;

// 사람과 원통은 배치 사각형 위아래 여백까지 그린다.
export function drawnBox(it) {
  const side = it.marginSide ?? 0;
  return { x: it.x - side, y: it.y - (it.marginTop ?? 0), w: it.w + side * 2, h: it.h + (it.marginTop ?? 0) + (it.marginBottom ?? 0) };
}

// 그룹 제목 글이 차지하는 사각형. 그리는 자리는 draw/figure.js drawGroup이다.
export function titleBox(g) {
  return { x: g.x + g.titleDx, y: g.y, w: measure(g.label, STYLE.group.size, STYLE.group.face), h: values.size.group.title };
}

export function pillBox(e) {
  const { w, h } = sizePill(e.label);
  return { x: e.labelAt.x - w / 2, y: e.labelAt.y - h / 2, w, h };
}

export function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function capitalize(text) {
  return text[0].toUpperCase() + text.slice(1);
}

export function fits(size, room) {
  return size <= room + FIT_SLACK;
}

/** 선분 p-q가 사각형 r 안쪽과 만나는지 */
export function segmentHits(p, q, r) {
  const [x1, x2] = [Math.min(p.x, q.x), Math.max(p.x, q.x)];
  const [y1, y2] = [Math.min(p.y, q.y), Math.max(p.y, q.y)];
  return x1 < r.x + r.w && r.x < x2 + TOUCH_SLACK && y1 < r.y + r.h && r.y < y2 + TOUCH_SLACK;
}

export function near(a, b) {
  return Math.abs(a - b) <= TOUCH;
}

export function onBorder(p, r) {
  const inX = r.x - TOUCH <= p.x && p.x <= r.x + r.w + TOUCH;
  const inY = r.y - TOUCH <= p.y && p.y <= r.y + r.h + TOUCH;
  const onX = near(p.x, r.x) || near(p.x, r.x + r.w);
  const onY = near(p.y, r.y) || near(p.y, r.y + r.h);
  return (onX && inY) || (onY && inX);
}

// cost: time O(s + g), heap O(s + g), stack O(1)
// vars: s = 도형 수, g = 그룹 수
// basis: estimate
// 도형과 그룹의 부모 관계. contains(a, b)는 그룹 a가 b(도형이나 그룹)를 품는지다.
export function createFamily(scene) {
  const parents = new Map([...scene.items, ...scene.groups].map((it) => [it.id, it.parent]));
  // cost: time O(d), heap O(1), stack O(1)
  // vars: d = 그룹 깊이
  // basis: estimate
  const contains = (a, b) => {
    for (let p = parents.get(b); p !== undefined && p !== ROOT; p = parents.get(p)) if (p === a) return true;
    return false;
  };
  // 배치를 바꾸라는 안내. 그룹이 없으면 그룹 방향을 바꿀 수 없어 선언 순서를 권한다.
  const hint = scene.groups.length ? 'change a group direction' : 'change the declaration order';
  return { contains, isRelated: (a, b) => a === b || contains(a, b) || contains(b, a), hint };
}
