// 카드(도형의 바깥 면 하나)의 공통 치수와 머리 배치. 상자, 사람, 표, API, 클래스, 순서 보기 참여자, 격자, 큐가 같은 안쪽 여백과 같은 머리 규칙을 쓴다.
// 카드는 면(draw/surface.js) 위에 머리(아이콘, 제목, 부제, 배지), 구분선, 필드 줄이 놓인 것이고, 종류별 측정은 이 규칙에 줄의 글만 넘긴다.
import { values } from '../vendor/theme/tokens.js';
import { layoutDecor } from './decor.js';
import { measure, wrap } from './fonts.js';
import { STYLE, stackTexts, textAt } from './texts.js';

const SPACE = values.spacing;
const SIZE = values.spacing.figure;

/** 카드 안쪽 여백. x는 글 둘레 가로, y는 위아래다. */
export const PAD = Object.freeze({ x: SPACE["4-5"], y: SPACE["3"] });

/** 카드 안쪽 글이 기본으로 쓸 수 있는 가장 긴 폭. 머리 제목은 본문이 이보다 좁을 때 이 폭에서 줄을 나눈다. */
export const INNER_MAX = SIZE.node['max-width'] - PAD.x * 2;

/**
 * 머리의 공통 치수. 머리는 아이콘 틀(24 격자 한 칸)과 제목이 한 줄로 나란하다. iconGap은 아이콘과 제목 사이,
 * rowH는 구획으로 나뉜 카드(표, API, 클래스, 순서 보기 참여자)의 머리 띠 한 줄 높이다. 제목이 여러 줄이면 줄 높이만큼 늘어난다.
 */
export const HEADER = Object.freeze({ iconGap: SPACE["2"], rowH: Math.max(SIZE.node['table-row'], SIZE.icon.node + SPACE["2"]) });

/** 머리 한 줄의 장식: 아이콘, 제목(너비 titleW, 높이 titleH), 배지, 개수가 한 줄로 나란하다. 아이콘은 제목 첫 줄과 가운데가 같다. 장식이 없으면 undefined. */
export const headerDecor = (node, { titleW, titleH }) => layoutDecor(node, { iconSize: SIZE.icon.node, titleW, titleH, iconGap: HEADER.iconGap });

/** 뜻 표시. 인터페이스는 «interface»가 머리 띠 위에, 추상 클래스는 {abstract}가 머리 띠 아래에 서고, 추상 멤버 뒤에도 같은 {abstract}가 붙는다. 표와 API에는 없다. */
export const MARKS = Object.freeze({ interface: '«interface»', abstract: '{abstract}' });

// cost: time O(n²), heap O(n), stack O(1)
// vars: n = 이름 글자 수
// basis: estimate
/**
 * 구획 카드(표, API, 클래스)와 순서 보기 참여자가 공유하는 머리: 위 표시, 머리 띠(아이콘과 제목), 아래 표시.
 * 제목은 아이콘과 배지를 뺀 room 폭 안에서 한 줄이고, 넘으면 낱말 자리, 이름 안의 `/`·`-`·`_`·`.` 뒤, 글자 단위로 줄을 나눈다. API 경로와 식별자도 같은 규칙이다.
 * 카드는 w보다 좁아질 수 없고(안쪽 여백 별도), 높이 h는 머리 띠(줄 수만큼)와 표시 줄을 더한 값이다.
 * @param room 머리가 쓸 수 있는 가장 긴 폭. 본문이 이미 이보다 넓으면 본문 폭을 넘겨 제목이 필요 없이 좁게 나뉘지 않게 한다
 * @returns { w, h, lead, rowH, band, above?, below? }. lead는 머리 띠 위 표시 줄 높이, rowH는 머리 띠 높이, band는 { w, titleW, lines, decor }다
 */
export function headerOf(node, { room = INNER_MAX } = {}) {
  const { label, meta } = STYLE;
  const chrome = headerDecor(node, { titleW: 0, titleH: label.line })?.w ?? 0;
  const lines = measure(node.label, label.size, label.face) + chrome <= room ? [node.label] : wrap(node.label, room - chrome, label);
  const titleW = Math.max(...lines.map((line) => measure(line, label.size, label.face)));
  const decor = headerDecor(node, { titleW, titleH: label.line });
  const band = { w: decor?.w ?? titleW, titleW, lines, decor };
  const above = node.classifierKind === 'interface' ? MARKS.interface : undefined;
  const below = node.abstract ? MARKS.abstract : undefined;
  const marks = [above, below].filter(Boolean);
  const lead = above ? meta.line : 0;
  const rowH = HEADER.rowH + (lines.length - 1) * label.line;
  return { w: Math.max(band.w, ...marks.map((text) => measure(text, meta.size, meta.face))), h: lead + rowH + (below ? meta.line : 0), lead, rowH, band, above, below };
}

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 제목 줄 수
// basis: estimate
/**
 * 카드 폭 w에서 머리를 놓는다. 머리 띠 덩어리는 카드 가운데이고 아이콘 가운데가 제목 첫 줄 가운데다. 표시 줄은 가운데에 맞춘다.
 * @returns { decor?, texts }. decor는 도형 왼쪽 위가 원점인 장식 자리, texts는 제목 줄들, 위 표시, 아래 표시 순서다
 */
export function placeHeader(header, w) {
  const { band, lead, rowH } = header;
  const x = (w - (band.decor?.w ?? 0)) / 2;
  const decor = band.decor && { ...band.decor, x, y: lead + (HEADER.rowH - band.decor.h) / 2 };
  const title = band.decor?.items.find((item) => item.kind === 'title');
  const cx = decor ? x + title.x + band.titleW / 2 : w / 2;
  const mark = (text, center) => textAt('meta', text, STYLE.meta, { x: w / 2, center, anchor: 'middle' });
  return {
    decor,
    texts: [
      ...stackTexts(band.lines.map((text) => ({ role: 'label', text, style: STYLE.label })), { x: cx, top: lead + (HEADER.rowH - STYLE.label.line) / 2 }),
      ...(header.above ? [mark(header.above, lead / 2)] : []),
      ...(header.below ? [mark(header.below, lead + rowH + STYLE.meta.line / 2)] : []),
    ],
  };
}
