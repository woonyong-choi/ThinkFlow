// 시퀀스 구획은 메시지 행의 앞뒤에 제목과 경계 여백을 예약한다.
import { FIGURE_PAD } from '../canvas.js';
import { STYLE, textBlock } from '../measure/texts.js';
import { values } from '../vendor/theme/tokens.js';

const SPACE = values.spacing;
const PAD = SPACE["3"];
const INDENT = SPACE["2"];

// cost: time O(f·n²), heap O(f·n), stack O(1)
// vars: f = 구획과 대안 수, n = 제목 글자 수
// basis: estimate
/** 원본 구획마다 첫 메시지 전 제목과 마지막 메시지 뒤 여백을 배치한다. */
export function fragmentRows(controls = []) {
  const frames = controls.map((c) => ({ kind: c.kind, label: c.label, depth: c.depth, first: c.first, last: c.last, header: header(titleOf(c), true), branches: c.branches.map((b) => ({ ...header(`[${b.label}]${c.kind === 'alt' && b.label === c.choose ? ' · 재생' : ''}`), first: b.first, last: b.last })) }));
  const before = new Map();
  const after = new Map();
  for (const frame of frames) {
    add(before, frame.first, { depth: frame.depth * 2, target: frame.header, frame });
    for (const branch of frame.branches) add(before, branch.first, { depth: frame.depth * 2 + 1, target: branch });
    add(after, frame.last, frame);
  }
  return {
    inset: frames.length ? (Math.max(...frames.map((f) => f.depth)) + 1) * INDENT : 0,
    frames,
    // cost: time O(f·log f), heap O(1), stack O(1)
    // vars: f = 이 행에서 시작하는 구획과 대안 수
    // basis: estimate
    before(index, y) {
      for (const event of (before.get(index) ?? []).sort((a, b) => a.depth - b.depth)) {
        if (event.frame) event.frame.y = y;
        event.target.y = y;
        y += event.target.h;
      }
      return y;
    },
    // cost: time O(f·log f), heap O(1), stack O(1)
    // vars: f = 이 행에서 닫히는 구획 수
    // basis: estimate
    after(index, y) {
      for (const frame of (after.get(index) ?? []).sort((a, b) => b.depth - a.depth)) {
        y += PAD;
        frame.h = y - frame.y;
      }
      return y;
    },
  };
}

function titleOf(control) {
  const choice = control.kind === 'opt' ? (control.run === 'on' ? ' · 재생' : ' · 생략') : '';
  return `${control.kind} · ${control.label}${control.times ? ` ×${control.times}` : ''}${choice}`;
}

function add(map, index, entry) {
  if (!map.has(index)) map.set(index, []);
  map.get(index).push(entry);
}

// cost: time O(n²), heap O(n), stack O(1)
// vars: n = 제목 글자 수
// basis: estimate
// 제목 또는 대안 이름 줄: 메모 상자와 같은 글 덩어리(measure/texts.js textBlock)이고, 생명선 위에 얹는 제목 면(plate)이 함께 따라온다. 면은 덩어리보다 가로 왼쪽을 반 여백, 위아래를 반 여백씩 안으로 들인 사각형이다(덩어리 왼쪽 위가 원점).
function header(text, isTitle = false) {
  const style = { ...STYLE.meta, face: isTitle ? 'semibold' : STYLE.meta.face };
  const { w, h, texts } = textBlock(text, { textW: values.spacing.figure.chip["max-width"], pad: PAD, style, role: isTitle ? 'meta fl-fragment-label' : 'meta' });
  return { text, w, h, texts, plate: { x: PAD / 2, y: PAD / 2, w: w - PAD / 2, h: h - PAD } };
}

// cost: time O(f·b), heap O(f), stack O(1)
// vars: f = 구획 수, b = 구획의 대안 수
// basis: estimate
/** 모든 구획 경계를 참여자와 메모 바깥으로 잡되 중첩 경계를 서로 띄운다. */
export function finishFragments(plan, scene) {
  if (!plan.frames.length) return;
  const needed = Math.max(...plan.frames.map((f) => f.depth * INDENT * 2 + Math.max(f.header.w, ...f.branches.map((b) => b.w))));
  const right = Math.max(scene.width - FIGURE_PAD + plan.inset, FIGURE_PAD + needed);
  scene.fragments = plan.frames.map((f) => ({ ...f, x: FIGURE_PAD + f.depth * INDENT, w: right - FIGURE_PAD - f.depth * INDENT * 2 }));
  scene.width = right + FIGURE_PAD;
}
