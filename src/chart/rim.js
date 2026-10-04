// 흐린 행의 테두리. 면은 opacity.dim으로 바탕 쪽으로 흐려져 바탕과 대비가 3에 못 미치므로(라이트 막대 1.5), 같은 모양의 테두리 사본을 흐린 행에서만 보인다.
import { roundCoord as r } from '../text.js';
import { values } from '../tokens.js';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 면 하나(rect)와 같은 모양의 테두리 묶음. 처음에는 숨고(opacity 0), 면이 흐려지는 시각에 보인다(재생기는 `.rim.dim`, 움직이는 SVG는 면과 같은 창의 keyframes).
 * @param at { k, i }. k는 행 번호, i는 계열 번호(없으면 계열 묶음 없이)
 * @param box { x, y, w, h, radius }
 * @param color 테두리 색(토큰 값 `var(--color-…)`)
 * @param isGrow 면이 자라는 움직임(`grow`)을 가졌으면 테두리도 같이 자란다
 */
export function rimRect({ k, i }, { x, y, w, h, radius }, { color, isGrow = false }) {
  const rect = `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${radius}" fill="none" stroke="${color}" stroke-width="${values.border.tag}"${isGrow ? ' class="grow"' : ''}/>`;
  return `<g class="cr-${k} rim" opacity="0">${i === undefined ? rect : `<g class="cs-${i}">${rect}</g>`}</g>`;
}
