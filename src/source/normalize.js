// 옛 이름을 지금 문법의 이름으로 바꿔 읽는다. 폐기(deprecated) 항목은 grammar.js 표의 replace가 정하므로 낱말마다 땜질하지 않는다.
// 문장 낱말, 선택 사항 키, 선택 사항 값, 그림 종류와 그 둘째 낱말이 모두 같은 규칙을 따른다.
import { KINDS, OPTIONS, STATEMENTS, VALUES, optionsOf } from './grammar.js';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 표에서 이름의 항목을 찾는다. 없으면 undefined다.
function entryOf(table, name) {
  return Object.hasOwn(table, name) ? table[name] : undefined;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 이름 하나를 표와 맞춰 본다. 판이 모자라면 오류를 내고, 폐기 항목이면 폐기 진단과 fix를 내고 새 이름을 돌려준다.
function resolveName(name, { table, category, label, line, column, ctx }) {
  const entry = entryOf(table, name);
  if (!entry) return name;
  if (entry.since > ctx.version) {
    ctx.problems.error(line, `${label} "${name}" needs grammar version ${entry.since}. Write "daphnis ${entry.since}" as the first line`, { code: 'version-required', column });
  }
  const { deprecated } = entry;
  if (!deprecated) return name;
  const note = deprecated.note ? `. ${deprecated.note}` : '';
  const message = `${label} "${name}" is deprecated since version ${deprecated.since} and now reads as "${deprecated.replace}". Use "${deprecated.replace}"${note}`;
  ctx.problems.deprecate(line, message, { code: `deprecated-${category}`, column, fix: { line, column, length: name.length, text: deprecated.replace } });
  return deprecated.replace;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 낱말 자리의 값을 값 목록과 맞춰 본다. 낱말(word)이 아니면 건드리지 않는다. */
function resolveValue(token, list, { line, ctx }) {
  if (!list || token?.type !== 'word') return;
  token.value = resolveName(token.value, { table: VALUES[list].items, category: 'value', label: `${list} value`, line, column: token.column, ctx });
}

// cost: time O(t·s), heap O(1), stack O(1)
// vars: t = 문장 낱말 수, s = 범위 수
// basis: estimate
// `키=값` 낱말의 키와 값을 지금 이름으로 바꾼다. 키는 `범위.키` 이름으로 찾는다.
function resolveOptions(tokens, scopes, at) {
  for (const token of tokens) {
    const scope = token.type === 'option' ? scopes.find((s) => entryOf(OPTIONS, `${s}.${token.key}`)) : undefined;
    if (scope) resolveOption(token, scope, at);
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선택 사항 하나. 키가 폐기면 새 키로 바꾸고, 새 키의 값 목록으로 값을 맞춰 본다.
function resolveOption(token, scope, { line, ctx }) {
  const options = optionsOf(scope);
  token.key = resolveName(token.key, { table: options, category: 'option', label: 'option', line, column: token.column, ctx });
  const list = options[token.key]?.values;
  if (token.valueType !== 'word' || !list) return;
  token.value = resolveName(token.value, { table: VALUES[list].items, category: 'value', label: `${token.key} value`, line, column: token.valueColumn, ctx });
}

// cost: time O(t·s), heap O(1), stack O(1)
// vars: t = 문장 낱말 수, s = 범위 수
// basis: estimate
/**
 * 문장 하나의 옛 이름을 지금 이름으로 바꾼다(낱말을 직접 고친다).
 * @param word 문장 첫 낱말, 선 줄은 'edge'나 'hop', 테이블 열 줄은 'column'
 * @param isHeadWord 첫 낱말이 문장 낱말 자리인지. 선 줄과 열 줄의 첫 낱말은 이름이라 바꾸지 않는다
 * @returns 지금 이름의 문장 낱말
 */
export function normalizeStatement({ tokens, line }, { word, isHeadWord }, ctx) {
  let resolved = word;
  if (isHeadWord) {
    resolved = resolveName(word, { table: STATEMENTS, category: 'statement', label: 'statement word', line, column: tokens[0].column, ctx });
    tokens[0].value = resolved;
    STATEMENTS[resolved]?.positional?.forEach((list, i) => resolveValue(tokens[i + 1], list, { line, ctx }));
  }
  resolveOptions(tokens, STATEMENTS[resolved]?.scopes ?? [resolved], { line, ctx });
  return resolved;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 그림 종류 문장의 종류와 둘째 낱말(방향, 차트 종류)을 지금 이름으로 바꾼다. 종류 낱말이 아니면 건드리지 않는다. */
export function normalizeKind({ tokens, line }, ctx) {
  const [kind, second] = tokens;
  if (kind.type !== 'word') return;
  kind.value = resolveName(kind.value, { table: KINDS, category: 'kind', label: 'kind', line, column: kind.column, ctx });
  resolveValue(second, entryOf(KINDS, kind.value)?.argument, { line, ctx });
}
