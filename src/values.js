// 값(`value`) 모형 도우미. 장면이 보이는 값과 카드 줄을 시간표, 카드 크기 계산, 그림 검사가 같게 쓴다(docs/design/figure-syntax.md 값).
import { movesOf } from './source/value-check.js';

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 값 수
// basis: estimate
/** 값 이름 → 선언. */
export function valueTable(figure) {
  return new Map(figure.values.map((v) => [v.id, v]));
}

// cost: time O(c), heap O(1), stack O(c)
// vars: c = 참조 사슬 길이
// basis: estimate
/** 참조를 끝까지 따라간 값 이름(from이 있는 값). 참조 순환은 읽을 때 오류라 여기서는 끝이 있다. */
export function rootOf(byId, id) {
  const { ref } = byId.get(id);
  return ref === undefined ? id : rootOf(byId, ref);
}

// cost: time O(v + r), heap O(v + r), stack O(1)
// vars: v = 값 수, r = 카드 선언의 본문 줄 수
// basis: estimate
/**
 * 카드의 처음 본문을 도형별로. 카드 블록의 줄은 선언 순서를 지키고, 블록 밖에서 on=으로 붙인 값은 그 앞에 놓인다. 값 줄은 모든 장면에 남는다.
 * 줄은 `이름` 글이고, 값 글자는 시간표의 변화 목록이 따로 그린다. 오른쪽 끝 자리는 그 값이 가질 모든 글(texts)의 실제 폭이 정한다.
 * @param texts 값 이름 → 가질 글 목록. 없으면 처음 글만이다
 */
export function initialCardRows(figure, texts = new Map()) {
  const rows = new Map();
  const byId = valueTable(figure);
  for (const v of figure.values.filter((value) => !value.queue && value.on !== undefined)) {
    const own = texts.get(v.id) ?? [byId.get(rootOf(byId, v.id)).from];
    rows.set(v.on, [...(rows.get(v.on) ?? []), { text: v.label, isValue: true, valueId: v.id, valueTexts: [...own] }]);
  }
  for (const card of figure.nodes.filter((node) => node.content?.length)) {
    const values = new Map((rows.get(card.id) ?? []).map((row) => [row.valueId, row]));
    const body = card.content.map((row) => {
      if (!row.valueId) return row;
      const value = values.get(row.valueId);
      values.delete(row.valueId);
      return value;
    });
    rows.set(card.id, [...values.values(), ...body]);
  }
  return rows;
}

// cost: time O(p), heap O(t), stack O(1)
// vars: p = 값을 바꾸는 식 수, t = 글 수
// basis: estimate
/**
 * 시간표를 만들기 전에 알 수 있는 값 글: 처음 글과 식이 값을 직접 정하는 글(`id=낱말`). 합과 읽기 식의 결과는 시간표를 만든 뒤에 알 수 있어
 * 한 번 배치한 다음 collectValueTexts로 모아 자리를 넓힌다.
 * @returns Map<값 이름, Set<글>>. 참조 값은 가리키는 값의 글을 따른다
 */
export function initialValueTexts(figure) {
  const byId = valueTable(figure);
  const texts = new Map(figure.values.map((v) => [v.id, new Set()]));
  for (const v of figure.values) texts.get(rootOf(byId, v.id)).add(byId.get(rootOf(byId, v.id)).from);
  for (const { sets } of movesOf(figure)) for (const e of sets) if (e.op === '=' && byId.has(e.id)) texts.get(rootOf(byId, e.id)).add(e.operand);
  return follow(texts, byId);
}

// cost: time O(r·c), heap O(t), stack O(1)
// vars: r = 값 줄 수, c = 값이 바뀌는 횟수, t = 글 수
// basis: estimate
/** 시간표의 값 줄이 실제로 가진 글(처음 글과 바뀐 글)을 모든 장면에서 모은다. */
export function collectValueTexts(figure, timeline) {
  const byId = valueTable(figure);
  const texts = new Map(figure.values.map((v) => [v.id, new Set()]));
  for (const row of timeline.values ?? []) {
    const set = texts.get(rootOf(byId, row.id));
    set.add(row.initial);
    for (const [, text] of row.changes) set.add(text);
  }
  return follow(texts, byId);
}

// 참조 값은 가리키는 값과 같은 글을 갖는다.
function follow(texts, byId) {
  return new Map([...texts].map(([id]) => [id, new Set(texts.get(rootOf(byId, id)))]));
}
