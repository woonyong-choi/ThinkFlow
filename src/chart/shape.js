// 꼭짓점과 점의 모양. 범주 번호마다 원, 사각형, 마름모, 삼각형이 돌아가며 정해진다(chart-palette.js 모양 목록). 모양이 달라도 넓이는 원과 같다.
import { roundCoord as r } from '../text.js';
import { values } from '../vendor/theme/tokens.js';

const BAR_RADIUS = values.radius.sm;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 막대형 사각형(막대, 워터폴 막대)의 모서리 반지름. 폭이 두 모서리 반지름보다 좁으면 SVG가 반지름을 줄여 둥근 점으로 그리므로 각지게 둔다. */
export const barRadius = (width) => (width < BAR_RADIUS * 2 ? 0 : BAR_RADIUS);

// 반지름 radius인 원과 넓이가 같은 도형의 크기 배율. 사각형은 반변, 마름모는 반대각선, 삼각형은 외접원 반지름이다.
const HALF_SIDE = Math.sqrt(Math.PI) / 2;
const HALF_DIAGONAL = Math.sqrt(Math.PI / 2);
const CIRCUMRADIUS = Math.sqrt((4 * Math.PI) / (3 * Math.sqrt(3)));

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 꼭짓점 목록을 닫힌 경로로
const polygon = (points) => `M ${points.map(([x, y]) => `${r(x)} ${r(y)}`).join(' L ')} Z`;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 점 모양 요소 하나. 가운데 (cx, cy)에 놓고 원과 같은 넓이를 갖는다.
 * @param spec { shape, cx, cy, radius, attrs }. shape는 원, 사각형, 마름모, 삼각형 이름이고 attrs는 요소에 붙일 속성 글(앞에 공백)이다
 */
export function markShape({ shape, cx, cy, radius, attrs }) {
  if (shape === 'square') {
    const half = radius * HALF_SIDE;
    return `<rect x="${r(cx - half)}" y="${r(cy - half)}" width="${r(half * 2)}" height="${r(half * 2)}"${attrs}/>`;
  }
  if (shape === 'diamond') {
    const half = radius * HALF_DIAGONAL;
    return `<path d="${polygon([[cx, cy - half], [cx + half, cy], [cx, cy + half], [cx - half, cy]])}"${attrs}/>`;
  }
  if (shape === 'triangle') {
    const reach = radius * CIRCUMRADIUS;
    return `<path d="${polygon([[cx, cy - reach], [cx + (reach * Math.sqrt(3)) / 2, cy + reach / 2], [cx - (reach * Math.sqrt(3)) / 2, cy + reach / 2]])}"${attrs}/>`;
  }
  return `<circle cx="${r(cx)}" cy="${r(cy)}" r="${r(radius)}"${attrs}/>`;
}
