// 큐 도형: 이름 줄 아래에 칸 한 줄이 놓인 둥근 사각형. 크기와 칸 자리를 그리는 쪽, 값 변화를 그리는 쪽, 그림 검사가 같은 값으로 쓴다(docs/design/figure-syntax.md 큐).
import { values } from '../tokens.js';
import { measure, wrap } from './fonts.js';

const SPACE = values.space;
const SIZE = values.size;
const SLOT = SIZE.queue;
// 이름 줄 양옆 안쪽 간격과 위아래 간격은 일반 도형(box)과 같다.
const PAD_X = SPACE['9'];
const PAD_Y = SPACE['6'];
// 이름 줄과 칸 줄 사이
const GAP = SPACE['3'];

// cost: time O(n²), heap O(n), stack O(1)
// vars: n = 이름 글자 수
// basis: estimate
/**
 * 큐 크기. 너비는 이름 폭과 칸 줄 폭 가운데 큰 쪽(최소 `size.node.min-width`)이고, 칸 수가 많으면 도형 최대 너비를 넘는다(칸 폭은 줄이지 않는다).
 * @param label 이름 줄 모양 { size, face, line }
 */
export function sizeQueue(node, label) {
  const labelLines = wrap(node.label, SIZE.node['max-width'] - PAD_X * 2, label);
  const textW = Math.max(...labelLines.map((l) => measure(l, label.size, label.face)));
  const w = Math.max(SIZE.node['min-width'], textW + PAD_X * 2, slotsWidth(node.slots) + PAD_X * 2);
  const h = PAD_Y * 2 + labelLines.length * label.line + GAP + SLOT['slot-height'];
  return { w, h, marginTop: 0, marginBottom: 0, labelLines, subLines: [] };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 칸 줄 너비: 칸 폭 n개와 사이 간격. */
export function slotsWidth(slots) {
  return slots * SLOT['slot-width'] + (slots - 1) * SLOT['slot-gap'];
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 칸 수
// basis: estimate
/** 칸 사각형 목록(왼쪽부터). 그림 좌표이고 칸 줄은 도형 가운데 아래쪽 안에 놓인다. */
export function queueSlots(it) {
  const left = it.x + (it.w - slotsWidth(it.slots)) / 2;
  const top = it.y + it.h - PAD_Y - SLOT['slot-height'];
  return Array.from({ length: it.slots }, (_, k) => ({ x: left + k * (SLOT['slot-width'] + SLOT['slot-gap']), y: top, w: SLOT['slot-width'], h: SLOT['slot-height'] }));
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 값을 찬 칸 수로. 음수는 0칸, 칸 수를 넘으면 가득 찬 칸이다. 값 글자는 시간표가 숫자로 담는다. */
export function filledSlots(text, slots) {
  return Math.min(slots, Math.max(0, Math.floor(Number(text))));
}
