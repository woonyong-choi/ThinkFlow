// 큐 도형: 이름 아래에 고정 크기 칸을 여러 줄로 놓는다. 빈 칸과 값 변화가 같은 배치를 쓴다(docs/design/figure-syntax.md 큐).
import { values } from '../vendor/theme/tokens.js';
import { INNER_MAX, PAD } from './card.js';
import { measure, wrap } from './fonts.js';
import { STYLE, titleTexts } from './texts.js';

const SPACE = values.spacing;
const SIZE = values.spacing.figure;
const SLOT = SIZE.queue;
// 이름 줄과 칸 줄 사이
const GAP = SPACE["1-5"];

// cost: time O(n²), heap O(n), stack O(1)
// vars: n = 이름 글자 수
// basis: estimate
/** 큐 크기. 칸 크기를 유지하며 도형 선호 폭 안에서 줄을 나눈다. 이름은 카드 머리처럼 위 안쪽 여백 아래에서 시작한다. */
export function sizeQueue(node) {
  const labelLines = wrap(node.label, INNER_MAX, STYLE.label);
  const textW = Math.max(...labelLines.map((l) => measure(l, STYLE.label.size, STYLE.label.face)));
  const slots = slotLayout(node.slots);
  const w = Math.max(SIZE.node['min-width'], textW + PAD.x * 2, slots.w + PAD.x * 2);
  const h = PAD.y * 2 + labelLines.length * STYLE.label.line + GAP + slots.h;
  return { w, h, marginTop: 0, marginBottom: 0, texts: titleTexts({ labelLines }, { x: w / 2, top: PAD.y }) };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function slotLayout(slots) {
  const columns = Math.min(slots, Math.max(1, Math.floor((INNER_MAX + SLOT['slot-gap']) / (SLOT['slot-width'] + SLOT['slot-gap']))));
  const rows = Math.ceil(slots / columns);
  return { columns, w: columns * SLOT['slot-width'] + (columns - 1) * SLOT['slot-gap'], h: rows * SLOT['slot-height'] + (rows - 1) * SLOT['slot-gap'] };
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 칸 수
// basis: estimate
/** 칸 사각형 목록(행마다 왼쪽부터, 위에서 아래로). 빈 칸과 찬 칸이 같은 순서를 따른다. */
export function queueSlots(it) {
  const slots = slotLayout(it.slots);
  const left = it.x + (it.w - slots.w) / 2;
  const top = it.y + it.h - PAD.y - slots.h;
  return Array.from({ length: it.slots }, (_, k) => ({ x: left + k % slots.columns * (SLOT['slot-width'] + SLOT['slot-gap']), y: top + Math.floor(k / slots.columns) * (SLOT['slot-height'] + SLOT['slot-gap']), w: SLOT['slot-width'], h: SLOT['slot-height'] }));
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 값을 찬 칸 수로. 음수는 0칸, 칸 수를 넘으면 가득 찬 칸이다. 값 글자는 시간표가 숫자로 담는다. */
export function filledSlots(text, slots) {
  return Math.min(slots, Math.max(0, Math.floor(Number(text))));
}
