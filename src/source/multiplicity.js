// 클래스와 테이블 연결의 다중성을 같은 규칙으로 검사한다. 생략한 값은 추정하지 않는다.

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 다중성 표시 글자 수
// basis: estimate
export function checkMultiplicities(edge, problems) {
  for (const key of ['fromMultiplicity', 'toMultiplicity']) {
    const text = edge[key];
    if (text === undefined) continue;
    const allowed = edge.relation === undefined || ['association', 'aggregation', 'composition'].includes(edge.relation);
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

