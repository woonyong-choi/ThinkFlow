// 그림 표시 폭 규칙. 모든 그림은 같은 표준 캔버스 폭으로 보인다(docs/design/layout.md 그림 크기).
import { values } from './tokens.js';

/** 구조, 순서, 상태, 데이터 그림과 전체 폭 차트의 표시 폭 */
export const CANVAS = values.size['figure-canvas'];
/** 그림 머리 `width wide`를 쓴 그림의 표시 폭 */
export const CANVAS_WIDE = values.size['figure-canvas-wide'];
/** 그림 둘레 안쪽 여백. 배치와 차트가 내용 둘레에, 설명 글이 아래에 같은 값을 둔다. */
export const FIGURE_PAD = values.space['14'];
/** 보이는 가로세로 비율의 한도. 비율이 이 값이나 그 역수를 넘으면 그림이 읽히지 않는다. */
export const ASPECT_MAX = values.scale['aspect-max'];

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 그림의 캔버스 폭. `width wide`면 넓은 폭이고 생략하면 표준 폭이다. */
export const canvasOf = (figure) => (figure?.width === 'wide' ? CANVAS_WIDE : CANVAS);

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 그림이 보이는 모양의 가로세로 비율. 내용이 캔버스보다 좁으면 viewBox만 캔버스 폭으로 넓어지므로 보이는 폭은 내용 폭과 캔버스 폭 중 큰 쪽이다.
 * 좁고 긴 그림(451x986)은 내용 비율이 0.46이지만 960x986으로 보이므로 보이는 비율은 0.97이다.
 */
export function displayRatio(width, height, canvas = CANVAS) {
  return Math.max(width, canvas) / height;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 내용 크기에서 viewBox 폭과 표시 크기를 정한다.
 * 내용이 canvas보다 좁으면 viewBox만 canvas로 넓혀 가운데에 두고, 넓으면 viewBox는 내용 폭 그대로 두고 표시 폭만 canvas로 줄인다(글자도 같은 비율로 작아진다).
 * @param width 내용 너비
 * @param height 내용 높이(캡션 포함)
 * @param canvas 캔버스 폭(canvasOf)
 * @returns { viewWidth, shownWidth, shownHeight, scale }. scale은 내용이 줄어드는 비율이고 1이면 줄지 않는다
 */
export function fitCanvas(width, height, canvas = CANVAS) {
  const viewWidth = Math.max(width, canvas);
  const scale = canvas / viewWidth;
  return { viewWidth, shownWidth: canvas, shownHeight: height * scale, scale };
}
