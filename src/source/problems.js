// 원본을 읽다 찾은 진단(오류, 경고)을 모은다. 오류는 한 번에 모두 알리기 위해 던지지 않고 쌓는다.
// 진단 하나의 모양은 { severity, code, line, column, message }다(docs/design/figure-syntax.md의 진단 절).

const CHECK_PREFIX = /^\[check (\d+)\] /;

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
 * 진단 하나를 만든다. 첫 인자는 { severity, line, message }다. `[check N] ` 머리말이 있으면 code `check-N`으로 옮기고 메시지에서 뗀다.
 * column을 모르면 그 줄의 첫 글자 자리다(1부터. 줄 0은 0).
 * @param lines 원본 줄 목록. 기본 column을 구하는 데 쓴다
 * @param extra { code?, column? }
 */
export function makeDiagnostic({ severity, line, message }, extra = {}, lines = []) {
  const check = CHECK_PREFIX.exec(message);
  const firstColumn = line > 0 ? (lines[line - 1] ?? '').search(/\S/) + 1 || 1 : 0;
  const diagnostic = {
    severity,
    code: extra.code ?? (check ? `check-${check[1]}` : 'syntax'),
    line,
    column: extra.column ?? firstColumn,
    message: check ? message.slice(check[0].length) : message,
  };
  return diagnostic;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 진단을 모으는 그릇을 만든다.
 * @param source 원본 글. 진단의 기본 column을 구하는 데 쓰고, 없어도 된다
 * @returns { error, warn, errors, warnings, throwIfAny() }. 메서드는 (line, message, extra?)를 받는다
 */
export function createProblems(source = '') {
  const lines = source.split('\n');
  const errors = [];
  const warnings = [];
  // 같은 줄의 같은 메시지는 한 번만 남긴다. 한 줄의 낱말마다 같은 진단이 되풀이되는 일을 막기 위해서다.
  const collect = (list, severity) => (line, message, extra) => {
    const diagnostic = makeDiagnostic({ severity, line, message }, extra, lines);
    if (!list.some((d) => d.line === line && d.message === diagnostic.message && d.column === diagnostic.column)) list.push(diagnostic);
  };
  return {
    errors,
    warnings,
    error: collect(errors, 'error'),
    warn: collect(warnings, 'warning'),
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
function editDistance(a, b) {
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
