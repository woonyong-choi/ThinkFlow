// 클래스 관계의 끝 종류와 순환 상속을 확인한다.

// cost: time O(n + e), heap O(n + e), stack O(1)
// vars: n = 분류자와 그룹 수, e = 관계 수
// basis: estimate
export function checkClassRelations(figure, problems) {
  const nodes = new Map(figure.nodes.map((node) => [node.id, node]));
  // 관계 종류는 두 끝이 모두 클래스나 인터페이스인 선에만 정해진다(validate.js).
  for (const edge of figure.edges.filter((e) => e.relation !== undefined)) {
    checkMultiplicities(edge, problems);
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) continue;
    if (edge.relation === 'inheritance' && from.classifierKind !== to.classifierKind) problems.error(edge.line, 'inheritance joins two classes or two interfaces');
    if (edge.relation === 'realization' && (from.classifierKind !== 'class' || to.classifierKind !== 'interface')) problems.error(edge.line, 'realization goes from a class to an interface');
    if (['aggregation', 'composition'].includes(edge.relation) && from.classifierKind !== 'class') problems.error(edge.line, 'the whole of an aggregation or composition must be a class');
  }
  checkInheritanceCycles(figure, problems);
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 다중성 표시 글자 수
// basis: estimate
function checkMultiplicities(edge, problems) {
  for (const key of ['fromMultiplicity', 'toMultiplicity']) {
    const text = edge[key];
    if (text === undefined) continue;
    const allowed = ['association', 'aggregation', 'composition'].includes(edge.relation);
    if (!allowed) problems.error(edge.line, 'multiplicity belongs to association, aggregation, or composition');
    const bounds = multiplicityBounds(text);
    if (!bounds) problems.error(edge.line, `invalid multiplicity "${text}". Use a nonnegative integer, *, or an ordered range such as 0..1 or 1..*`);
    else if (edge.relation === 'composition' && key === 'fromMultiplicity' && bounds.upper > 1) problems.error(edge.line, 'a composite part has at most one whole; from multiplicity must not exceed 1');
  }
}

function multiplicityBounds(text) {
  if (!/^(?:\*|0|[1-9]\d*)(?:\.\.(?:\*|0|[1-9]\d*))?$/.test(text)) return undefined;
  const [low, high] = text.split('..');
  if (low === '*' && high !== undefined) return undefined;
  const lower = low === '*' ? 0 : Number(low);
  const upperText = high ?? low;
  const upper = upperText === '*' ? Infinity : Number(upperText);
  if (!Number.isSafeInteger(lower) || (upper !== Infinity && !Number.isSafeInteger(upper)) || lower > upper) return undefined;
  return { lower, upper };
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
