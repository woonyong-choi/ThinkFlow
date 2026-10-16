// 그림 폭 규칙. 그림 폭은 내용 폭이고 캔버스는 표시 폭의 상한이다. 배치는 본문 단 폭에 맞춘다(docs/design/layout.md 그림 비율).
import { values } from '@woonyong-choi/design-tokens/tokens.js';

/** 구조, 순서, 상태, 데이터 그림의 표시 폭 상한. 내용이 이보다 넓을 때만 줄여 보인다. */
export const CANVAS = values.spacing.figure["figure-canvas"];
/** 그림 머리 `width wide`를 쓴 그림의 표시 폭 상한이자 배치 목표 폭 */
export const CANVAS_WIDE = values.spacing.figure["figure-canvas-wide"];
/**
 * 본문 단 폭. 기술 블로그 본문 단과 차트 그림 폭(`spacing.figure.chart.width`)이 같은 값이다.
 * 구조 그림의 배치는 이 폭 안에 들도록 방향을 돌리거나 접는다. 그 안에 든 그림은 본문 단에서 줄지 않아 가장 작은 글 토큰이 그대로 보인다.
 */
export const COLUMN = values.spacing.figure.chart.width;
/** 그림 둘레 안쪽 여백. 배치와 차트가 내용 둘레에 같은 값을 둔다. 그림 폭이 내용 폭이라 이 여백이 캔버스의 빈 테두리 전부다. */
export const FIGURE_PAD = values.spacing["4"];
/**
 * 좁은 화면(`size.figure-compact-width`)에서 그림 컨테이너가 가지는 폭. 컨테이너는 화면 폭에서 좌우 바깥 여백(`spacing.6`)을 뺀 값이고 그림 안쪽에는 여백이 없다.
 * 좁은 배치의 그래프와 차트가 목표로 삼는 폭이다. 그래프가 이 폭을 넘으면 HTML은 자연 크기로 가로 스크롤한다.
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
/** 차트 보기 하나만 있는 그림의 캔버스 폭. 차트 그림 폭과 같아 문서 단 폭에서 줄지 않고 그대로 보인다. */
export const CANVAS_CHART = values.spacing.figure.chart.width;

// cost: time O(v), heap O(1), stack O(1)
// vars: v = 보기 수
// basis: estimate
/** 보기가 모두 차트 보기(plot)나 시간 보기(time)인 그림인가. 이런 그림은 내용이 차트 폭이라 표준 캔버스로 넓히면 양옆이 비고 글자가 줄어든다. */
export const isChartOnly = (figure) => Boolean(figure?.views?.length) && figure.views.every((v) => v.strategy === 'plot' || v.strategy === 'time');

// cost: time O(v), heap O(1), stack O(1)
// vars: v = 보기 수
// basis: estimate
/** 그림의 캔버스 폭. `width wide`면 넓은 폭, 차트 보기만 있으면 차트 폭, 그 밖에는 표준 폭이다. */
export const canvasOf = (figure) => (figure?.width === 'wide' ? CANVAS_WIDE : isChartOnly(figure) ? CANVAS_CHART : CANVAS);

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 구조 그림 배치가 들어갈 목표 폭. `width wide`면 넓은 폭(넓어도 된다는 뜻)이고 생략하면 본문 단 폭이다. */
export const layoutWidthOf = (figure) => (figure?.width === 'wide' ? CANVAS_WIDE : COLUMN);

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 그림이 본문에서 차지하는 가로세로 비율. 그림은 내용 폭으로 그려지지만 본문 단(column)보다 좁은 그림도 단 폭의 자리를 차지하므로 폭은 내용 폭과 단 폭 중 큰 쪽이다.
 * 좁고 긴 그림(451x986)은 내용 비율이 0.46이지만 680 단에서 차지하는 자리는 680x986이라 비율은 0.69다.
 */
export function displayRatio(width, height, column = COLUMN) {
  return Math.max(width, column) / height;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 내용 크기에서 viewBox 폭과 표시 크기를 정한다. viewBox는 언제나 내용 폭이라 빈 캔버스가 없다.
 * 내용이 canvas보다 좁으면 자연 크기로 보이고, 넓으면 표시 폭만 canvas로 줄인다(글자도 같은 비율로 작아진다).
 * @param width 내용 너비
 * @param height 내용 높이
 * @param canvas 표시 폭 상한(canvasOf)
 * @returns { viewWidth, shownWidth, shownHeight, scale }. scale은 내용이 줄어드는 비율이고 1이면 줄지 않는다
 */
export function fitCanvas(width, height, canvas = CANVAS) {
  const shownWidth = Math.min(width, canvas);
  const scale = shownWidth / width;
  return { viewWidth: width, shownWidth, shownHeight: height * scale, scale };
}
