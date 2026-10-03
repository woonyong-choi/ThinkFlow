// 값(`value`) 모형 도우미. 단계가 보이는 값과 카드 줄을 시간표, 카드 크기 계산, 그림 검사가 같게 쓴다(docs/design/figure-syntax.md 값).
import { VALUE_MAX } from './source/grammar.js';

/** 카드 줄 폭을 재는 본보기 글. 값이 바뀌어도 줄 폭과 줄 수가 달라지지 않게 가장 넓은 자리를 미리 비워 둔다. */
export const VALUE_SAMPLE = '8'.repeat(VALUE_MAX);

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

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 값 수
// basis: estimate
/** 값 카드 줄을 도형별로. 선언한 값은 모든 단계의 카드에 늘 올라 있다. 줄은 `이름` 글과 오른쪽 끝 자리(mark)이고, 값 글자는 시간표의 변화 목록이 따로 그린다. */
export function valueRowsByNode(figure) {
  const rows = new Map();
  for (const v of figure.values) rows.set(v.on, [...(rows.get(v.on) ?? []), { text: v.label, mark: VALUE_SAMPLE, isValue: true, valueId: v.id }]);
  return rows;
}
