// 점 위에 뜨는 글 상자의 크기와 자리. 움직이는 SVG와 그림 검사가 같은 규칙을 쓴다.
// player.js의 placeChip도 같은 규칙이다. 브라우저 코드는 이 파일을 불러올 수 없어 따로 둔다.
import { measure } from './measure/fonts.js';
import { STYLE } from './measure/sizes.js';
import { pointAlong } from './route.js';
import { values } from './tokens.js';

const SPACE = values.space;
/** 글 상자와 점 사이 간격 */
export const CHIP_GAP = SPACE['6'];
// 검사와 SVG가 경로에서 글 상자 자리를 재는 비율 간격(10%)
const SAMPLES = 10;

// cost: time O(l·n), heap O(1), stack O(1)
// vars: l = 줄 수, n = 줄 글자 수
// basis: estimate
/** 글 상자 크기. 줄은 시간표가 이미 나눴다. */
export function sizeChip(lines) {
  const w = Math.max(...lines.map((line) => measure(line, STYLE.chip.size, STYLE.chip.face))) + SPACE['9'];
  return { w, h: lines.length * STYLE.chip.line + SPACE['4'] };
}

/**
 * 점 point에서 글 상자를 밀어 넣은 자리. 그림 밖으로 나가면 옆으로 밀고, 위가 모자라면 점 아래로 내린다.
 * @returns { dx, dy, box }. dx, dy는 점 위 기본 자리에서 옮긴 양, box는 그림 좌표의 글 상자 사각형이다
 */
export function placeChip(point, chip, width) {
  const half = chip.w / 2 + CHIP_GAP;
  const x = Math.min(width - half, Math.max(half, point.x));
  const isTooHigh = point.y - chip.h - CHIP_GAP < 0;
  const dy = isTooHigh ? chip.h + CHIP_GAP * 2 : 0;
  return { dx: x - point.x, dy, box: { x: x - chip.w / 2, y: point.y - chip.h - CHIP_GAP + dy, w: chip.w, h: chip.h } };
}

// cost: time O(k·p), heap O(k), stack O(1)
// vars: k = 재는 지점 수(11), p = 경로 점 수
// basis: estimate
/** 경로를 10% 간격으로 나눈 지점. 처음과 끝을 포함해 11개다. */
export function sampleRoute(points) {
  return Array.from({ length: SAMPLES + 1 }, (_, i) => ({ fraction: i / SAMPLES, point: pointAlong(points, i / SAMPLES) }));
}
