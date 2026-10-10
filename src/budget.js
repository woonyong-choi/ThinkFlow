// 이름 있는 생성 예산. 그림 하나를 만드는 동안 실제로 늘어나는 양(그리는 요소 수, 경로 명령 수 같은 단위)마다 기본 한도가 있고, 사용자가 `--budget 이름=값`(Action은 `budget` 입력)으로 올릴 수 있다.
// 초과는 조용히 줄이지 않고 필요한 양, 지금 한도, 올리는 방법을 알리는 `budget-exceeded` 진단이고, 큰 할당 전에 검사해 파일을 쓰기 전에 끝난다(docs/design/grid.md 예산).
import { FigureError, makeDiagnostic } from './source/problems.js';

/**
 * 예산 이름 → { limit, unit }. limit은 기본 한도이고 unit은 진단 글이 세는 단위다. 새 예산은 여기에 이름과 기본 한도를 더하고, 기본 한도는 측정으로 정해 근거를 문서에 적는다.
 * 격자의 두 예산은 docs/design/grid.md 예산 절의 측정에서 정했다.
 */
const BUDGETS =Object.freeze({
  'grid-elements': { limit: 500_000, unit: 'SVG elements drawn by grids' },
  'grid-path-commands': { limit: 1_000_000, unit: 'path commands in the empty-area paths of grids' },
  // 흐름 조건과 대기를 계산하는 이벤트(docs/design/playback.md 이벤트 예산). 기본 한도는 같은 문서의 측정에서 정했다.
  events: { limit: 300_000, unit: 'events (departures, arrivals, value updates, wait evaluations and releases)' },
  chain: { limit: 5_000, unit: 'events at one moment' },
  // 이동 글 상자 계획 하나의 공간 색인(docs/design/grid.md 예산). 기본 한도는 같은 문서의 측정에서 정했다.
  'chip-index': { limit: 2_000_000, unit: 'entries in the spatial index of one moving-text plan' },
});

/** 예산 이름 목록 */
export const BUDGET_NAMES = Object.keys(BUDGETS);

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * `이름=값` 글 하나를 읽는다. 이름이 목록에 없거나 값이 양의 안전한 정수가 아니면 { error }다.
 * @returns { name, value } | { error }
 */
function parseBudgetPair(text) {
  const match = /^([^=]*)=(.*)$/.exec(text);
  if (!match) return { error: `--budget takes name=value, found "${text}". Names: ${BUDGET_NAMES.join(', ')}` };
  const [, name, raw] = match;
  if (!Object.hasOwn(BUDGETS, name)) return { error: `unknown budget "${name}". Names: ${BUDGET_NAMES.join(', ')}` };
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) return { error: `budget ${name} is a positive whole number up to ${Number.MAX_SAFE_INTEGER}, found "${raw}"` };
  return { name, value: Number(raw) };
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 올린 예산 수
// basis: estimate
/**
 * 올린 예산 목록(`이름=값` 글)을 { 이름: 값 }으로 읽는다. 같은 이름을 여러 번 쓰면 마지막 값이다. 틀리면 { error }다.
 * @returns { budget } | { error }
 */
export function parseBudgetList(items) {
  const budget = {};
  for (const item of items) {
    const pair = parseBudgetPair(item);
    if (pair.error) return { error: pair.error };
    budget[pair.name] = pair.value;
  }
  return { budget };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 예산 수
// basis: estimate
/**
 * 기본 한도에 올린 값을 덮어 쓴 한도 표. 이름이나 값이 틀린 올린 값은 TypeError다(명령줄은 parseBudgetList가 먼저 거른다).
 * @param overrides { 이름: 양의 안전한 정수 }
 * @returns { 이름: 한도 }
 */
export function resolveBudget(overrides = {}) {
  const limits = Object.fromEntries(BUDGET_NAMES.map((name) => [name, BUDGETS[name].limit]));
  for (const [name, value] of Object.entries(overrides)) {
    const { error } = parseBudgetPair(`${name}=${value}`);
    if (error) throw new TypeError(error);
    limits[name] = value;
  }
  return limits;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 사용량을 모으는 그릇. add로 도형(격자)마다 양을 더하고, verify가 합계가 한도를 넘은 예산마다 `budget-exceeded` 오류를 하나씩 던진다.
 * @param limits resolveBudget이 돌려준 한도 표
 */
export function createMeter(limits) {
  const used = new Map();
  return {
    add(name, amount, { line, what }) {
      const entry = used.get(name) ?? { total: 0 };
      entry.total += amount;
      entry.over ??= entry.total > limits[name] ? { line, what } : undefined;
      used.set(name, entry);
    },
    // cost: time O(n), heap O(n), stack O(1)
    // vars: n = 예산 수
    // basis: estimate
    verify() {
      const over = [...used].filter(([name, entry]) => entry.total > limits[name]);
      if (over.length) throw new FigureError(over.map(([name, entry]) => diagnose(name, entry, limits[name])));
    },
  };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 초과 진단 하나. 합계가 처음 한도를 넘은 도형의 줄에 붙고, 필요한 양과 한도, 올리는 방법을 적는다.
function diagnose(name, { total, over }, limit) {
  const { unit } = BUDGETS[name];
  const message = `this figure needs ${total} ${unit}, over the budget ${name}=${limit}, and ${over.what} is where the total passes it. Raise it with --budget ${name}=${total} (the Action input budget: ${name}=${total}), or shrink the grids`;
  return makeDiagnostic({ severity: 'error', line: over.line, message }, { code: 'budget-exceeded' });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 이벤트 예산(`events`, `chain`)을 넘었을 때의 오류. 필요한 양을 아직 모르는 동적 이벤트는 넘은 줄과 시각을, 문장으로 센 합계(needed)는 필요한 양을 알린다. 파일을 쓰기 전에 끝난다.
 * @param name 예산 이름
 * @param limit 지금 한도
 * @param where { line, t?, needed? }. t는 넘은 시각(그림 전체 ms), needed는 미리 센 필요한 양이다
 * @returns FigureError (code `budget-exceeded`)
 */
export function eventBudgetError(name, limit, { line, t, needed }) {
  const { unit } = BUDGETS[name];
  const raise = needed ?? limit * 2;
  const cause = needed === undefined ? `the figure passes the budget ${name}=${limit} at ${t}ms, counting ${unit}` : `this figure needs ${needed} ${unit} counted from its departures, over the budget ${name}=${limit}`;
  const message = `${cause}. Raise it with --budget ${name}=${raise} (the Action input budget: ${name}=${raise}), or reduce the waits, tracks, and departures`;
  return new FigureError([makeDiagnostic({ severity: 'error', line, message }, { code: 'budget-exceeded' })]);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 글 상자 계획의 공간 색인이 예산 `chip-index`를 넘을 때의 오류. 색인을 만들기 전에 센 항목 수(needed)를 알리고, 파일을 쓰기 전에 끝난다.
 * @param limit 지금 한도
 * @param where { line, needed }. line은 계획을 세운 이동의 줄이다
 * @returns FigureError (code `budget-exceeded`)
 */
export function indexBudgetError(limit, { line, needed }) {
  const { unit } = BUDGETS['chip-index'];
  const message = `this figure's moving text needs ${needed} ${unit}, over the budget chip-index=${limit}. Raise it with --budget chip-index=${needed} (the Action input budget: chip-index=${needed}), or reduce the shapes, lines, and cells that moving text must avoid`;
  return new FigureError([makeDiagnostic({ severity: 'error', line, message }, { code: 'budget-exceeded' })]);
}
