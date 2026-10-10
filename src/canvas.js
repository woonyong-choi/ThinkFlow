// 그림 표시 폭 규칙. 모든 그림은 같은 표준 캔버스 폭으로 보인다(docs/design/layout.md 그림 크기).
import { values } from './vendor/theme/tokens.js';

/** 구조, 순서, 상태, 데이터 그림과 전체 폭 차트의 표시 폭 */
export const CANVAS = values.spacing.figure["figure-canvas"];
/** 그림 머리 `width wide`를 쓴 그림의 표시 폭 */
export const CANVAS_WIDE = values.spacing.figure["figure-canvas-wide"];
/** 그림 둘레 안쪽 여백. 배치와 차트가 내용 둘레에 같은 값을 둔다. */
export const FIGURE_PAD = values.spacing["7"];
/**
 * 좁은 화면(`size.figure-compact-width`)에서 그림 컨테이너가 가지는 폭. 컨테이너는 화면 폭에서 좌우 바깥 여백(`spacing.6`)을 뺀 값이고 그림 안쪽에는 여백이 없다.
 * 좁은 배치의 그래프와 차트는 이 폭에 들어가 표시 배율 1배로 보인다.
 */
export const COMPACT_WIDTH = values.spacing.figure["figure-compact-width"] - values.spacing["6"] * 2;
/** 보이는 가로세로 비율의 한도. 비율이 이 값이나 그 역수를 넘으면 그림이 읽히지 않는다. */
export const ASPECT_MAX = values.scale['aspect-max'];

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 본문에 삽입된 재생기(iframe)가 보는 틈 없는 보기 영역. 그림 둘레 안쪽 여백(FIGURE_PAD)을 작은 여백(`space.2`)만 남기고 걷어, 도형이 본문 글과 가까이 놓이고 같은 폭에서 글자가 덜 줄어든다.
 * @returns { x, y, w, h } viewBox 값
 */
export function tightView(width, height) {
  const inset = FIGURE_PAD - values.spacing["1"];
  return { x: inset, y: inset, w: width - inset * 2, h: height - inset * 2 };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 그림의 캔버스 폭. `width wide`면 넓은 폭이고 생략하면 표준 폭이다. */
export const canvasOf = (figure) => (figure?.width === 'wide' ? CANVAS_WIDE : CANVAS);

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 그림 틀(회색 판)의 가로세로 비율. 틀은 내용이 캔버스보다 좁아도 캔버스 폭을 유지하므로 폭은 내용 폭과 캔버스 폭 중 큰 쪽이다. 내용은 자연 크기로 그 안에 놓이고 틀만 넓다.
 * 좁고 긴 그림(451x986)은 내용 비율이 0.46이지만 틀은 960x986이라 비율은 0.97이다. 계산은 바꾸지 않는다.
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
 * @param height 내용 높이
 * @param canvas 캔버스 폭(canvasOf)
 * @returns { viewWidth, shownWidth, shownHeight, scale }. scale은 내용이 줄어드는 비율이고 1이면 줄지 않는다
 */
export function fitCanvas(width, height, canvas = CANVAS) {
  const viewWidth = Math.max(width, canvas);
  const scale = canvas / viewWidth;
  return { viewWidth, shownWidth: canvas, shownHeight: height * scale, scale };
}
