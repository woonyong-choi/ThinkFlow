// 클래스 관계의 끝 종류와 순환 상속을 확인한다.

// cost: time O(n + e), heap O(n + e), stack O(1)
// vars: n = 분류자와 그룹 수, e = 관계 수
// basis: estimate
export function checkClassRelations(figure, problems) {
  const nodes = new Map(figure.nodes.map((node) => [node.id, node]));
  // 테이블의 association은 클래스 관계 검사의 대상이 아니다.
  for (const edge of figure.edges.filter((e) => e.relation !== undefined)) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (from?.shape !== 'classifier' || to?.shape !== 'classifier') continue;
    if (edge.relation === 'inheritance' && from.classifierKind !== to.classifierKind) problems.error(edge.line, 'inheritance joins two classes or two interfaces');
    if (edge.relation === 'realization' && (from.classifierKind !== 'class' || to.classifierKind !== 'interface')) problems.error(edge.line, 'realization goes from a class to an interface');
    if (['aggregation', 'composition'].includes(edge.relation) && from.classifierKind !== 'class') problems.error(edge.line, 'the whole of an aggregation or composition must be a class');
  }
  checkInheritanceCycles(figure, problems);
}

// cost: time O(n + e), heap O(n + e), stack O(1)
// vars: n = 분류자 수, e = 상속 관계 수
// basis: estimate
function checkInheritanceCycles(figure, problems) {
  const pending = new Map(figure.nodes.map((node) => [node.id, 0]));
  const children = new Map(figure.nodes.map((node) => [node.id, []]));
  const edges = figure.edges.filter((edge) => edge.relation === 'inheritance' && pending.has(edge.from) && pending.has(edge.to));
  for (const edge of edges) {
    pending.set(edge.from, pending.get(edge.from) + 1);
    children.get(edge.to).push(edge.from);
  }
  const ready = [...pending].filter(([, count]) => count === 0).map(([id]) => id);
  for (let i = 0; i < ready.length; i++) {
    for (const id of children.get(ready[i])) {
      pending.set(id, pending.get(id) - 1);
      if (pending.get(id) === 0) ready.push(id);
    }
  }
  const cyclic = edges.find((edge) => pending.get(edge.from) > 0 && pending.get(edge.to) > 0);
  if (cyclic) problems.error(cyclic.line, 'inheritance cannot contain a cycle');
}
