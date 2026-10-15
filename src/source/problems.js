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
    this.name = 'FigureError';
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
    // 메시지 끝에는 마침표를 두지 않는다. 덧붙이는 제안(` Did you mean "x"?`)이 없을 때 남는 마침표도 같이 뗀다.
    message: (check ? message.slice(check[0].length) : message).replace(/([^.])\.$/, '$1'),
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
/** 두 글의 편집 거리(이웃한 두 글자 바꿈도 한 번으로 센다). 이름과 낱말 오타에 가까운 것을 고를 때 쓴다. */
function editDistance(a, b) {
  let before = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) current[j] = Math.min(current[j], before[j - 2] + 1);
    }
    [before, previous] = [previous, current];
  }
  return previous[b.length];
}

// 제안으로 받는 가장 큰 편집 거리. 짧은 낱말은 한 글자만 고쳐도 다른 낱말이 되므로 한 번만 받는다.
const NEAR_MAX = 2;
const SHORT_WORD = 3;
// 줄인 꼴(`alternative`에 대한 `alt`)로 보는 앞부분의 가장 짧은 길이
const PREFIX_MIN = 3;

// cost: time O(k·n²), heap O(k), stack O(1)
// vars: k = 후보 수, n = 낱말 글자 수
// basis: estimate
/**
 * 오타로 보이는 낱말에 가장 가까운 후보 하나. 편집 거리가 2 이하(3글자 이하는 1)인 후보이고, 없으면 한쪽이 다른 쪽의 앞부분인 후보다(줄여 쓰거나 늘여 쓴 낱말).
 * 거리가 같으면 한쪽이 다른 쪽의 앞부분인 것, 첫 글자가 같은 것, 후보 순서가 앞선 것 순이다. 같은 낱말이나 가까운 것이 없으면 undefined다.
 */
export function closest(word, candidates) {
  const text = String(word);
  const lower = text.toLowerCase();
  let best;
  for (const candidate of new Set(candidates)) {
    if (candidate === text) return undefined;
    const distance = editDistance(lower, candidate.toLowerCase());
    const limit = Math.min(text.length, candidate.length) <= SHORT_WORD ? 1 : NEAR_MAX;
    const isStem = lower.startsWith(candidate) || candidate.startsWith(lower);
    const isPrefix = isStem && Math.min(text.length, candidate.length) >= PREFIX_MIN;
    if (distance > limit && !isPrefix) continue;
    // 거리, 앞부분 관계가 아닌지, 첫 글자가 다른지 순으로 작은 것이 낫다.
    const score = [distance > limit ? NEAR_MAX + 1 : distance, Number(!isStem), Number(candidate[0] !== lower[0])];
    const index = best ? score.findIndex((v, i) => v !== best.score[i]) : -1;
    if (!best || (index >= 0 && score[index] < best.score[index])) best = { candidate, score };
  }
  return best?.candidate;
}

// cost: time O(k·n²), heap O(k), stack O(1)
// vars: k = 후보 수, n = 낱말 글자 수
// basis: estimate
/** 진단 끝에 붙이는 ` Did you mean "x"?`. 가까운 후보가 없으면 빈 글이다. */
export function didYouMean(word, candidates) {
  const near = closest(word, candidates);
  return near === undefined ? '' : ` Did you mean "${near}"?`;
}

// cost: time O(k·n²), heap O(k), stack O(1)
// vars: k = 이름 수, n = 이름 글자 수
// basis: estimate
/** 없는 이름 오류 메시지. 가까운 이름이 있으면 제안하고, 요청한 경우 선언된 이름 목록을 붙인다. */
export function unknownName(kind, name, known, { shouldList = true } = {}) {
  const sorted = [...known].sort();
  return `unknown ${kind} "${name}".${didYouMean(name, sorted)}${shouldList ? ` Declared: ${sorted.join(', ') || 'none'}` : ''}`;
}
