// 이름 있는 색(`tone=`, `fill=`, `stroke=`)과 이름 없는 점과 태그가 받는 색의 순서. 이름은 범주 색 도우미(chart-palette.js)의 계열과 무채색 `gray` 하나다.
// 이름 없는 색의 순서도 같은 도우미(categoryPaint)가 정하고, 상태 색이라고 건너뛰는 자리는 없다.
import { PALETTE, categoryPaint } from './chart-palette.js';
import { tokens } from './vendor/theme/tokens.js';

/** 무채색 이름. 범주 계열이 아니라 명시했을 때만 쓴다. */
export const NEUTRAL = 'gray';
/** 범주 계열 이름(도우미의 1판 순서) */
export const FAMILIES = Object.freeze(PALETTE.map(({ family }) => family));
/** 색 이름 전부: 범주 계열과 무채색 */
export const TONES = Object.freeze([...FAMILIES, NEUTRAL]);

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 이름 없이 n번째(0부터)로 받는 색 이름. 범주 번호와 같은 순서이고, 계열 수를 넘으면 계열이 한 바퀴 돈다(점과 태그에는 무늬가 없고 글이나 이름이 구분을 맡는다). */
export const autoTone = (n) => categoryPaint(n).family;

// cost: time O(f), heap O(1), stack O(1)
// vars: f = 계열 수
// basis: estimate
/** 색 이름의 { fill, ink, outline } 토큰 참조. 흐름 점과 태그의 면(fill), 그 위 글자(ink), 글 상자 윤곽(outline, 무채색은 없다). */
export function toneColors(name) {
  const entry = PALETTE.find(({ family }) => family === name);
  if (entry) return { fill: entry.fill, ink: entry.on, outline: entry.border };
  if (name === NEUTRAL) return { fill: tokens.color.flow.gray, ink: tokens.color['flow-ink'].gray, outline: undefined };
  throw new RangeError(`unknown tone: ${name}`);
}

const colorsOf = (pick) => Object.freeze(Object.fromEntries(TONES.flatMap((name) => (pick(toneColors(name)) === undefined ? [] : [[name, pick(toneColors(name))]]))));

/** 재생기가 쓰는 색 이름별 표: 점 면, 점 위 글자, 글 상자 윤곽 */
export const TONE_FILLS = colorsOf(({ fill }) => fill);
export const TONE_INKS = colorsOf(({ ink }) => ink);
export const TONE_OUTLINES = colorsOf(({ outline }) => outline);
