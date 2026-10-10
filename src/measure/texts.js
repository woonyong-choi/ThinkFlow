// 글의 역할과 모양, 그리고 카드 안 글 한 줄(text)의 자리. 머리의 제목·부제·표시, 열 이름과 형식과 제약, 클래스 멤버, 격자 제목과 칸 글, 내용 줄(태그, 본문, 표시, 값)이 모두 같은 모양이다.
// 좌표는 도형 왼쪽 위가 원점이다. x는 anchor(start, middle, end)가 가리키는 글의 한 점이고 center는 줄의 세로 가운데다.
// 그리는 쪽(draw/texts.js)과 이동 글 상자가 피할 사각형(draw/boxes.js)과 그림 검사(check/fit.js)가 같은 text를 읽으므로 글의 자리가 세 곳에서 따로 계산되지 않는다.
import { values } from '../vendor/theme/tokens.js';
import { measure, wrap } from './fonts.js';

const LEADING = values.leading.normal;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 글자 크기에 줄 높이 비율을 곱해 반올림한 줄 높이 */
export const lineHeight = (size, leading) => Math.round(size * leading);

// 글 위계 셋: 제목(text.small-text 15: 카드 제목은 regular, 그룹 제목은 semibold), 문장과 이름표(detail-size 13), 작은 표시(micro-size 11). CSS(styles/figure.css, chart.css, status.css)가 같은 토큰으로 같은 크기와 굵기를 그린다. 굵기는 regular와 semibold 둘이다.
const TITLE = values.text["small-text"];
const FIELD = values.text["tiny-text"];
const META = values.text["figure-meta"];

/**
 * 글 모양. 크기, 글꼴, 줄 높이. 역할 하나가 크기 하나를 쓴다. 차트 제목과 부제도 label과 sub를 쓴다(chart/labels.js).
 * 제목(15): label 카드 제목(regular), group 그룹 제목과 보기 이름(semibold). 문장과 이름표(13): sub 부제, row·mono·cell·item·value 카드 줄, meta 메모와 구획 제목, pill 선 라벨, chip 이동 글, mini 관계 그래프 이름, type 열 형식, rule 제약 줄.
 * 작은 표시(11): tag, key, mark(번호, 태그, 표식, 열 키). CSS가 같은 역할에 같은 크기와 굵기를 그리므로 여기서 잰 폭이 그린 폭이다. 글자 사이 간격도 CSS와 같게 `tracking.text` 하나만 쓴다(fonts.js measure).
 * value는 사용자 자료라 글자 그대로 읽는 굵은 글꼴이다(text.js isLiteralFace). 바뀐 값의 초점이라 굵게 둔다.
 */
export const STYLE = Object.freeze({
  label: { size: TITLE, face: 'regular', line: lineHeight(TITLE, LEADING) },
  sub: { size: FIELD, face: 'regular', line: lineHeight(FIELD, LEADING) },
  row: { size: FIELD, face: 'regular', line: lineHeight(FIELD, LEADING) },
  mono: { size: FIELD, face: 'mono', line: lineHeight(FIELD, LEADING) },
  meta: { size: FIELD, face: 'regular', line: lineHeight(FIELD, LEADING) },
  tag: { size: META, face: 'semibold' },
  key: { size: META, face: 'semibold' },
  mark: { size: META, face: 'semibold' },
  value: { size: FIELD, face: 'semiboldLiteral', line: lineHeight(FIELD, LEADING) },
  pill: { size: FIELD, face: 'regular' },
  group: { size: TITLE, face: 'semibold' },
  chip: { size: FIELD, face: 'regular', line: lineHeight(FIELD, values.leading.snug) },
  cell: { size: FIELD, face: 'regular' },
  item: { size: FIELD, face: 'regular', line: lineHeight(FIELD, LEADING) },
  mini: { size: FIELD, face: 'regular' },
  type: { size: FIELD, face: 'mono', line: lineHeight(FIELD, LEADING) },
  rule: { size: FIELD, face: 'regular', line: lineHeight(FIELD, LEADING) },
});

/** 열 이름과 그 뒤 키 표시(PK, FK) 사이 간격. 키 표시는 이름 text의 key로 붙는다. */
export const KEY_GAP = values.spacing["1-5"];

/**
 * text 하나.
 * @param role CSS 역할 class(label, sub, meta, cell, cell type, cell rule, row mono, item, tag, mark, value, mini 등). 글꼴과 색은 역할이 정한다
 * @param style 글 모양(STYLE 항목). 폭과 줄 높이를 잰다
 * @param at { x, center, anchor }. anchor 기본은 start다
 * @param extra { underline?, key?: { text, style }, mutedFrom?, lines? }. key는 이름 뒤에 붙는 작은 표시, mutedFrom은 표시 글자 몇 번째부터 흐린지, lines는 한 text가 여러 줄로 나뉠 때(값 글) 줄 목록이다
 */
export function textAt(role, text, style, { x, center, anchor = 'start' }, extra = {}) {
  return { role, text, style, x, center, anchor, ...extra };
}

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 줄 수
// basis: estimate
/**
 * 같은 x에 줄들을 위에서 아래로 쌓는다. height를 주면 줄 묶음을 top에서 그 높이 안의 세로 가운데에 놓고, 없으면 top에서 시작한다.
 * @param lines { role, text, style, ...extra }[]
 */
export function stackTexts(lines, { x, top, height, anchor = 'middle' }) {
  let lineTop = height === undefined ? top : top + (height - lines.reduce((sum, line) => sum + line.style.line, 0)) / 2;
  return lines.map(({ role, text, style, ...extra }) => {
    const center = lineTop + style.line / 2;
    lineTop += style.line;
    return textAt(role, text, style, { x, center, anchor }, extra);
  });
}

/** 이름(label)과 부제(sub) 줄을 위에서 아래로 쌓은 text. 상자, 사람, 원통, 갈림길, 원, 큐, 격자 제목이 같은 쌓기를 쓴다. */
export function titleTexts({ labelLines, subLines = [] }, at) {
  return stackTexts([...labelLines.map((text) => ({ role: 'label', text, style: STYLE.label })), ...subLines.map((text) => ({ role: 'sub', text, style: STYLE.sub }))], at);
}

// cost: time O(n²), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/**
 * 안쪽 여백이 있는 글 덩어리: 메모 상자와 순서 구획 제목이 같다. textW에서 줄을 나누고 글은 위 왼쪽 여백 안쪽에 쌓인다.
 * @param opts { textW, pad, style, role }. textW는 글 한 줄의 가장 긴 폭, pad는 사방 안쪽 여백, role은 CSS 역할 class다
 * @returns { lines, w, h, texts }. w와 h는 여백을 포함한 덩어리 크기, texts는 덩어리 왼쪽 위가 원점인 text다
 */
export function textBlock(text, { textW, pad, style, role = 'meta' }) {
  const lines = wrap(text, textW, style);
  const w = Math.max(...lines.map((line) => measure(line, style.size, style.face))) + pad * 2;
  return { lines, w, h: lines.length * style.line + pad * 2, texts: stackTexts(lines.map((line) => ({ role, text: line, style })), { x: pad, top: pad, anchor: 'start' }) };
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** text의 글 폭. 이름 뒤 키 표시를 포함하고, 여러 줄로 나뉜 text는 가장 긴 줄이다. */
export function textWidth({ text, style, key, lines }) {
  const widest = Math.max(...(lines ?? [text]).map((line) => measure(line, style.size, style.face)));
  return widest + (key ? KEY_GAP + measure(key.text, key.style.size, key.style.face) : 0);
}

/** 도형 자리 origin({ x, y }) 기준 text의 글 사각형 { x, center, width }. x는 글의 왼쪽 끝이다. */
export function textSpan(origin, t) {
  const width = textWidth(t);
  const left = t.anchor === 'middle' ? t.x - width / 2 : t.anchor === 'end' ? t.x - width : t.x;
  return { x: origin.x + left, center: origin.y + t.center, width };
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = text 수
// basis: estimate
/** 도형이 그리는 모든 text: 머리와 본문 text, 부분(표 열, 격자 칸)의 text. 내용 줄의 text는 내용 면 안에 있어(it.content.layouts) 포함하지 않는다. */
export function allTexts(it) {
  return [...(it.texts ?? []), ...(it.tableRows ?? it.cells ?? []).flatMap((part) => part.texts)];
}
