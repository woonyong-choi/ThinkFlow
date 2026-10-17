// 클래스의 머리, 속성, 메서드 구획을 카드가 쓰는 text(measure/texts.js)와 구분선으로 한 번 배치해 측정, 렌더링, 충돌 검사에 넘긴다.
// 머리는 표, API, 순서 보기 참여자와 같은 머리(measure/card.js)이고, 이 파일은 UML 구획(속성, 메서드)과 멤버 표기만 맡는다.
import { plainText } from '../text.js';
import { values } from '@woonyong-choi/design-tokens/tokens.js';
import { INNER_MAX, MARKS, PAD, headerOf, placeHeader } from './card.js';
import { measure, wrap } from './fonts.js';
import { STYLE, stackTexts } from './texts.js';

const VISIBILITY = Object.freeze({ public: '+', private: '-', protected: '#', package: '~' });
// 멤버 한 줄이 쓸 수 있는 가장 긴 폭: 카드 안쪽 최대 폭(INNER_MAX)의 배수
const MEMBER_SPAN = 2;

// cost: time O(m·n²), heap O(m·n), stack O(1)
// vars: m = 멤버 수, n = 가장 긴 표시 글자 수
// basis: estimate
/**
 * 클래스 크기와 글. 머리 아래에 속성, 메서드 구획이 있고 구획 사이에 구분선이 있다. 멤버는 왼쪽에 맞추고 구획 위아래에 안쪽 여백이 있다.
 * 멤버는 고정폭 글이라 글자 그대로 읽고(text.js isLiteralFace) 줄이 나뉘어도 멤버 하나다. 머리 제목은 멤버 폭과 카드 기본 안쪽 폭 가운데 넓은 쪽에서 줄을 나눈다.
 * @returns { w, h, texts, decor?, dividers, description }. dividers는 카드 위에서 구분선까지의 거리, description은 화면 읽기용 글(머리와 멤버 하나씩)이다
 */
export function sizeClassifier(node) {
  const members = (kind) => node.members.filter((m) => m.kind === kind).map((m) => ({ text: memberText(m), core: memberCore(m), style: STYLE.mono, role: 'row mono', ...(m.static ? { underline: true } : {}) }));
  const groups = [members('field'), members('method')];
  // 멤버 줄은 표의 열처럼 한 줄에 다 들어가는 폭으로 카드를 넓힌다. 기본 카드 폭에 맞춰 나누면 이름과 형식이 글자 중간에서 끊긴다(`OrderStat`/`us`).
  // 폭은 가시성·이름·형식(core)으로 정하고, 뒤에 붙는 `{abstract}` 표시는 자리가 없으면 다음 줄로 통째로 넘긴다. 아주 긴 서명만 카드 안쪽 최대 폭의 두 배에서 나눈다.
  const longest = Math.max(0, ...groups.flat().map((member) => measure(member.core, member.style.size, member.style.face)));
  const maxInner = Math.min(Math.max(values.spacing.figure.node["card-width"] - PAD.x * 2, longest), INNER_MAX * MEMBER_SPAN);
  const sections = groups.map((group) => group.flatMap(({ text, core, ...entry }) => wrap(text, maxInner, entry.style).map((line) => ({ ...entry, text: line }))));
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
  return [memberCore(member), member.abstract ? MARKS.abstract : undefined].filter(Boolean).join(' ');
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 멤버 표시 글자 수
// basis: estimate
// 멤버 표시에서 줄을 나누지 않는 앞부분: 가시성 기호, 이름, 형식이나 서명
function memberCore(member) {
  const signature = member.kind === 'field' ? `${member.id}: ${member.signature}` : `${member.id}${member.signature}`;
  return VISIBILITY[member.visibility] ? `${VISIBILITY[member.visibility]} ${signature}` : signature;
}
