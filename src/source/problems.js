// 원본을 읽다 찾은 오류와 경고를 모은다. 오류는 한 번에 모두 알리기 위해 던지지 않고 쌓는다.

/** 원본 오류. 메시지는 `{줄}: {무엇} . {고치는 방법}` 형식으로 cli가 파일 이름을 붙여 쓴다. */
export class FigureError extends Error {
  // cost: time O(p), heap O(p), stack O(1)
  // vars: p = 문제 수
  // basis: estimate
  constructor(problems) {
    super(problems.map((p) => `${p.line}: ${p.message}`).join('\n'));
    this.problems = problems;
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 오류와 경고를 모으는 그릇을 만든다.
 * @returns { error(line, message), warn(line, message), errors, warnings, throwIfAny() }
 */
export function createProblems() {
  const errors = [];
  const warnings = [];
  return {
    errors,
    warnings,
    error: (line, message) => errors.push({ line, message, level: 'error' }),
    warn: (line, message) => warnings.push({ line, message, level: 'warning' }),
    // cost: time O(e log e), heap O(e), stack O(1)
    // vars: e = 오류 수
    // basis: estimate
    throwIfAny() {
      if (errors.length) throw new FigureError([...errors].sort((a, b) => a.line - b.line));
    },
  };
}

// cost: time O(a·b), heap O(b), stack O(1)
// vars: a, b = 두 글자 수
// basis: estimate
/** 두 글의 편집 거리. 이름 오타에 가까운 이름을 고를 때 쓴다. */
export function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

// cost: time O(k·n²), heap O(k), stack O(1)
// vars: k = 이름 수, n = 이름 글자 수
// basis: estimate
/** 없는 이름 오류 메시지. 편집 거리 2 이하의 이름이 있으면 제안하고, 선언된 이름 목록을 붙인다. */
export function unknownName(kind, name, known) {
  const sorted = [...known].sort();
  const near = sorted.map((k) => [k, editDistance(name, k)]).filter(([, d]) => d <= 2).sort((a, b) => a[1] - b[1])[0];
  const hint = near ? ` Did you mean "${near[0]}"?` : '';
  return `unknown ${kind} "${name}".${hint} Declared: ${sorted.join(', ') || 'none'}`;
}
