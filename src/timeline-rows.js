// 카드 글 줄의 갱신 효과. `show`와 `clear`는 장면 구성이지만, 실제로 보이는 글이 바뀐 줄은 작은 배경 피드백을 받는다(값 줄의 배경 후광과 같은 면).
// 보이는 글은 정규화한 글이다(태그, 글, 덧붙임, 표시를 `plainText`로 풀어 붙인 것). 같은 장면의 같은 시각(박자가 길이 0으로 이어져도 같다)에 지웠다 다시 쓴 줄은 순변화가 없어 효과가 없다.
// 지운 줄과 값 줄은 효과가 없고(값 줄은 값의 후광이 맡는다), 카드 전체를 깜빡이지 않으며 새 id도 만들지 않는다.
import { STYLE } from './measure/texts.js';
import { plainText } from './text.js';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 한 줄의 보이는 글. 값 줄은 값이 맡으므로 없다. 관계 그래프 줄은 그래프 모양 전체가 글이다.
// 그려지는 글(draw/content.js)과 같이 읽는다: 본문과 덧붙임은 줄의 글꼴(`mono`면 백틱도 글자)로, 태그와 표시는 산문으로 읽는다.
function visibleText(row) {
  if (row.isValue || row.chartId) return undefined;
  if (row.graph) {
    const { nodes, edges, lit } = row.graph;
    return `graph:${JSON.stringify({ nodes: nodes.map((name) => [plainText(name), lit.includes(name)]), edges })}`;
  }
  const face = row.isMono ? STYLE.mono.face : STYLE.row.face;
  const shown = [[row.tag], [row.text, face], [row.meta, face], [row.mark]];
  return shown.filter(([part]) => part !== undefined).map(([part, partFace]) => plainText(String(part), partFace).trim()).join(' ').trim();
}

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 줄 수
// basis: estimate
// 지난 내용에 없던 줄(글 개수로 맞춘다: 같은 글이 둘이면 둘 모두 있어야 그대로다)의 줄 번호 목록. 번호는 새 내용의 줄 번호(값 줄을 포함한 자리)다.
function changedRows(before, after) {
  const left = new Map();
  for (const row of before) {
    const text = visibleText(row);
    if (text !== undefined) left.set(text, (left.get(text) ?? 0) + 1);
  }
  const changed = [];
  after.forEach((row, index) => {
    const text = visibleText(row);
    if (text === undefined) return;
    if (left.get(text) > 0) left.set(text, left.get(text) - 1);
    else changed.push(index);
  });
  return changed;
}

// cost: time O(b·k + r), heap O(b·k + r), stack O(1)
// vars: b = 구간 수, k = 카드 내용이 바뀌는 도형 수, r = 줄 수
// basis: estimate
/**
 * 카드 글 줄의 효과 목록. 같은 장면, 같은 도형, 같은 시각의 바뀜은 첫 이전 내용과 마지막 이후 내용을 맞대어 순변화만 센다.
 * @param segs 시간표의 구간 목록
 * @param contents collectCards의 contents(도형 id → 내용 목록, 내용은 줄 목록)
 * @returns { key: `row:도형:줄 번호`, at: 시각, si }[] 시각 순
 */
export function rowPulses(segs, contents) {
  const events = new Map();
  for (const seg of segs) {
    for (const [node, at] of Object.entries(seg.cardsAt)) {
      const key = `${seg.si}\u0000${node}\u0000${seg.t0 + at}`;
      const found = events.get(key);
      if (found) found.after = seg.cards[node];
      else events.set(key, { si: seg.si, node, at: seg.t0 + at, before: seg.cardsBefore[node], after: seg.cards[node] });
    }
  }
  const rowsOf = (node, index) => (index === undefined ? [] : (contents.get(node)?.[index] ?? []));
  return [...events.values()]
    .flatMap(({ si, node, at, before, after }) => changedRows(rowsOf(node, before), rowsOf(node, after)).map((index) => ({ key: `row:${node}:${index}`, at, si })))
    .sort((a, b) => a.at - b.at || (a.key < b.key ? -1 : Number(a.key > b.key)));
}
