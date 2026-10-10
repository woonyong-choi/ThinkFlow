// 클래스의 머리, 속성, 메서드 구획을 카드가 쓰는 text(measure/texts.js)와 구분선으로 한 번 배치해 측정, 렌더링, 충돌 검사에 넘긴다.
// 머리는 표, API, 순서 보기 참여자와 같은 머리(measure/card.js)이고, 이 파일은 UML 구획(속성, 메서드)과 멤버 표기만 맡는다.
import { plainText } from '../text.js';
import { values } from '../vendor/theme/tokens.js';
import { INNER_MAX, MARKS, PAD, headerOf, placeHeader } from './card.js';
import { measure, wrap } from './fonts.js';
import { STYLE, stackTexts } from './texts.js';

const VISIBILITY = Object.freeze({ public: '+', private: '-', protected: '#', package: '~' });

// cost: time O(m·n²), heap O(m·n), stack O(1)
// vars: m = 멤버 수, n = 가장 긴 표시 글자 수
// basis: estimate
/**
 * 클래스 크기와 글. 머리 아래에 속성, 메서드 구획이 있고 구획 사이에 구분선이 있다. 멤버는 왼쪽에 맞추고 구획 위아래에 안쪽 여백이 있다.
 * 멤버는 고정폭 글이라 글자 그대로 읽고(text.js isLiteralFace) 줄이 나뉘어도 멤버 하나다. 머리 제목은 멤버 폭과 카드 기본 안쪽 폭 가운데 넓은 쪽에서 줄을 나눈다.
 * @returns { w, h, texts, decor?, dividers, description }. dividers는 카드 위에서 구분선까지의 거리, description은 화면 읽기용 글(머리와 멤버 하나씩)이다
 */
export function sizeClassifier(node) {
  const maxInner = values.spacing.figure.node["card-width"] - PAD.x * 2;
  const members = (kind) => node.members.filter((m) => m.kind === kind).map((m) => ({ text: memberText(m), style: STYLE.mono, role: 'row mono', ...(m.static ? { underline: true } : {}) }));
  const groups = [members('field'), members('method')];
  const sections = groups.map((group) => group.flatMap(({ text, ...entry }) => wrap(text, maxInner, entry.style).map((line) => ({ ...entry, text: line }))));
  const body = Math.max(0, ...sections.flat().map((line) => measure(line.text, line.style.size, line.style.face)));
  const header = headerOf(node, { room: Math.max(body, INNER_MAX) });
  const w = Math.max(values.spacing.figure.node["min-width"], Math.max(header.w, body) + PAD.x * 2);
  const { decor, texts } = placeHeader(header, w);
  const dividers = [header.h];
  let y = header.h;
  for (const [index, lines] of sections.entries()) {
    y += PAD.y;
    texts.push(...stackTexts(lines, { x: PAD.x, top: y, anchor: 'start' }));
    y += lines.length ? lines.reduce((sum, line) => sum + line.style.line, 0) : STYLE.mono.line;
    y += PAD.y;
    if (index < sections.length - 1) dividers.push(y);
  }
  const description = [plainText(node.label), header.above, header.below, ...groups.flat().map((member) => member.text)].filter(Boolean).join('; ');
  return { w, h: y, marginTop: 0, marginBottom: 0, decor, texts, dividers, description };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 멤버 표시 글자 수
// basis: estimate
function memberText(member) {
  const signature = member.kind === 'field' ? `${member.id}: ${member.signature}` : `${member.id}${member.signature}`;
  return [VISIBILITY[member.visibility], signature, member.abstract ? MARKS.abstract : undefined].filter(Boolean).join(' ');
}
