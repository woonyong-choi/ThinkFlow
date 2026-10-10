// 카드 안 글(measure/texts.js의 text)을 그린다. 머리, 열, 제약, 클래스 멤버, 격자 칸, 내용 줄(태그, 본문, 표시, 값), 메모와 구획 제목, 차트 제목이 모두 이 함수 하나다.
// 글꼴과 색은 text의 역할(class)이 정하고, 글이 놓인 기준 점(anchor)은 text가 정한다. 그래서 같은 역할의 글은 어느 종류의 카드에서도 같은 모양이다.
// 글을 읽는 방식은 text의 글꼴(style.face)이 정한다: 고정폭이거나 값 글꼴이면 백틱도 글자이고, 그 밖에는 백틱 구간이 코드다(text.js codeParts). 재기와 같은 규칙이다.
import { KEY_GAP } from '../measure/texts.js';
import { centerBaseline, escapeXml, renderRich, roundCoord as r } from '../text.js';

// cost: time O(t·n), heap O(out), stack O(1)
// vars: t = text 수, n = 글자 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * @param texts measure/texts.js의 text 목록
 * @param origin 도형 왼쪽 위 { x, y }. text 좌표는 이 점이 원점이다
 * @param glyphs 쓴 글자를 모으는 그릇
 */
export function drawTexts(texts, origin, glyphs) {
  return texts.map((t) => drawText(t, origin, glyphs)).join('');
}

/**
 * text 하나의 `<text>`. 쓴 글자를 그릇에 모은다.
 * @param extra { attrs?, inner? }. attrs는 여는 태그에 덧붙일 속성(값 글자의 data-v 등), inner는 글 뒤에 넣을 요소(움직임)다
 */
export function drawText(t, origin, glyphs, extra) {
  glyphs.add(t.text, t.style.face);
  if (t.key) glyphs.add(t.key.text, t.key.style.face);
  return textMarkup(t, origin, extra);
}

// cost: time O(n), heap O(out), stack O(1)
// vars: n = 글자 수, out = 만든 SVG 글자 수
// basis: estimate
/** 글자를 모으지 않고 `<text>`만 만든다. 차트처럼 글꼴 조각을 따로 모으는 그림이 쓴다. */
export function textMarkup({ role, text, style, x, center, anchor, underline, key, mutedFrom, lines }, origin, { attrs = '', inner = '' } = {}) {
  const left = r(origin.x + x);
  const tail = `${anchor === 'start' ? '' : ` text-anchor="${anchor}"`}${underline ? ' text-decoration="underline"' : ''}${attrs}`;
  const mark = key ? `<tspan class="key" dx="${KEY_GAP}">${escapeXml(key.text)}</tspan>` : '';
  const body = lines ? lines.map((line, k) => `<tspan x="${left}" dy="${k === 0 ? 0 : style.line}">${renderRich(line, { face: style.face })}</tspan>`).join('') : renderRich(text, { face: style.face, mutedFrom });
  return `<text x="${left}" y="${r(centerBaseline(origin.y + center, style.size))}" class="${role}"${tail}>${body}${mark}${inner}</text>`;
}
