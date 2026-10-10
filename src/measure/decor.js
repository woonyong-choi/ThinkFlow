// 도형 윗줄과 그룹 제목 줄에 놓는 장식(아이콘, 글자 배지, 복제 개수 `(N)`)의 크기와 자리. 여기서 정한 크기를 배치에 넘기고 그대로 그린다.
import { values } from '../vendor/theme/tokens.js';
import { measure } from './fonts.js';

const SPACE = values.spacing;
const SIZE = values.spacing.figure;

/** 알약 안 글. 배지는 흑백에서도 도형의 뜻을 글자로 남기는 자리라 본문 글보다 작지 않다. 크기는 작은 표시(text.figure-meta)이고 status.css와 figure.css의 `.badge`가 같은 토큰을 그린다. */
export const BADGE_STYLE = Object.freeze({ size: values.text["figure-meta"], face: 'semibold' });
/** 장식 사이 간격과 알약 높이, 도형 윗줄과 이름 사이 간격 */
export const DECOR = Object.freeze({ gap: SPACE["1"], pillH: SIZE.pill.height, rowGap: SPACE["1"], pillPad: SPACE["3-5"] });
/** 복제 개수(count)를 가진 상자의 뒤 윤곽 한 겹 간격 */
export const STACK_STEP = SPACE["1"];

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 알약 너비. 글 폭에 좌우 안쪽 간격을 더한다. */
function pillWidth(text) {
  return measure(text, BADGE_STYLE.size, BADGE_STYLE.face) + DECOR.pillPad;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 장식 목록. 아이콘, 배지, 개수 순서다. 알약은 { kind, text, w, h }, 아이콘은 { kind: 'icon', w, h }다.
function itemsOf(item, iconSize) {
  const pills = [item.badge && { kind: 'badge', text: item.badge }, item.count !== undefined && { kind: 'count', text: `(${item.count})` }].filter(Boolean);
  return [...(item.iconData ? [{ kind: 'icon', w: iconSize, h: iconSize }] : []), ...pills.map((p) => ({ ...p, w: pillWidth(p.text), h: DECOR.pillH }))];
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 장식 수
// basis: estimate
/**
 * 장식 한 줄의 자리. 왼쪽에서 오른쪽으로 놓고 세로는 가운데 맞춘다. 좌표는 줄 왼쪽 위가 원점이다.
 * @param item 도형 또는 그룹(iconData, badge, count)
 * @param options { iconSize, titleW, titleH, iconGap }. titleW가 있으면 아이콘 뒤에 제목 글(너비 titleW, 높이 titleH)을 놓는다. iconGap은 아이콘 뒤 간격이다(그룹 제목 줄은 기본, 카드 머리는 HEADER.iconGap)
 * @returns undefined(장식 없음) 또는 { items: { kind, x, y, w, h, text? }[], w, h }. 제목 글은 kind 'title'이다
 */
export function layoutDecor(item, { iconSize, titleW, titleH = DECOR.pillH, iconGap = DECOR.gap }) {
  const parts = itemsOf(item, iconSize);
  if (!parts.length) return undefined;
  if (titleW !== undefined) parts.splice(parts[0]?.kind === 'icon' ? 1 : 0, 0, { kind: 'title', w: titleW, h: titleH });
  const h = Math.max(...parts.map((p) => p.h));
  let x = 0;
  const items = parts.map((p) => {
    const placed = { ...p, x, y: (h - p.h) / 2 };
    x += p.w + (p.kind === 'icon' ? iconGap : DECOR.gap);
    return placed;
  });
  const last = parts.at(-1).kind === 'icon' ? iconGap : DECOR.gap;
  return { items, w: x - last, h };
}

/** 도형 윗줄의 장식. 너비가 도형 안쪽에 들어가야 하므로 도형 크기를 정하는 쪽이 이 너비를 쓴다. */
export const nodeDecor = (node) => layoutDecor(node, { iconSize: node.tile ? SIZE.icon.tile : SIZE.icon.node });

/** 그룹 제목 줄의 장식(제목 글과 배지, 개수 알약). 아이콘은 제목 줄 왼쪽 모서리 탭이 맡아(draw/decor.js drawGroupTab) 여기에 없다. 장식이 없으면 undefined이고 제목 글만 그린다. */
export const groupDecor = (group, titleW) => layoutDecor({ ...group, iconData: undefined }, { iconSize: 0, titleW });

/** 복제 개수(count) 상자의 앞 상자(몸통) 사각형. 뒤 윤곽 두 겹이 비치는 만큼 도형 사각형보다 작다. 그 밖의 도형은 도형 사각형 그대로다. */
export const bodyOf = (it) => ({ x: it.x, y: it.y, w: it.w - (it.stack ?? 0), h: it.h - (it.stack ?? 0) });
