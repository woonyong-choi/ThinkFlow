// 테이블의 키 선언과 열별 약식을 같은 열 묶음으로 읽는다.
import { readOptions } from './options.js';
import { COLUMN_PATTERN, TABLE_PATTERN } from './words.js';

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 선택 사항의 전체 글자 수
// basis: estimate
export function readForeignKeyOptions(tokens, line, ctx) {
  const options = readOptions(tokens, { scopes: ['foreignKey', 'multiplicity'], what: 'a foreign key', line, ctx });
  return { ondelete: options.ondelete, fromMultiplicity: options.from, toMultiplicity: options.to };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 선언 낱말과 열 이름의 전체 글자 수
// basis: estimate
export function readTableKey({ tokens, line }, ctx) {
  const kind = tokens[0].value;
  const source = readColumnList(tokens, 1, line, ctx.problems);
  if (!source) return;
  const table = ctx.block.card;
  if (kind !== 'fk') {
    if (tokens[source.nextIndex]) ctx.problems.error(line, `${kind} takes only a column list`);
    else table.keys.push({ kind, columns: source.columns, line });
    return;
  }
  const [arrow, target] = tokens.slice(source.nextIndex);
  if (arrow?.type !== 'arrow' || target?.type !== 'word' || !TABLE_PATTERN.test(target.value)) {
    ctx.problems.error(line, 'write a foreign key as: fk (column, ...) -> table (column, ...)');
    return;
  }
  const destination = readColumnList(tokens, source.nextIndex + 2, line, ctx.problems);
  if (!destination) return;
  table.foreignKeys.push({ columns: source.columns, target: { table: target.value, columns: destination.columns }, line, ...readForeignKeyOptions(tokens.slice(destination.nextIndex), line, ctx) });
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 열 목록의 글자 수
// basis: estimate
function readColumnList(tokens, start, line, problems) {
  let end = start;
  while (end < tokens.length && tokens[end].type === 'word' && !tokens[end].value.includes(')')) end++;
  const written = tokens.slice(start, end + 1);
  const text = written.map(token => token.value).join(' ');
  const columns = text.startsWith('(') && text.endsWith(')') ? text.slice(1, -1).split(',').map(name => name.trim()) : [];
  if (!columns.length || written.some(token => token.type !== 'word') || columns.some(name => !COLUMN_PATTERN.test(name))) {
    problems.error(line, 'write a nonempty column list as (column, ...)');
    return;
  }
  if (new Set(columns).size !== columns.length) {
    problems.error(line, 'a column is written twice in the same key');
    return;
  }
  return { columns, nextIndex: end + 1 };
}
