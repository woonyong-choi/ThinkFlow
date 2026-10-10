// 단일·복합 키와 참조를 테이블 단위에서 검증하고 FK 하나를 공통 연결선 하나로 만든다.
import { unknownName } from './problems.js';

// cost: time O(c + k*c + f*(c+k+log f)), heap O(c+k+f), stack O(1)
// vars: c = 전체 열 수, k = 키에 포함된 열 수, f = 외래 키에 포함된 열 수
// basis: estimate
export function checkTables(figure, problems) {
  const tables = new Map(figure.nodes.filter(node => node.shape === 'table').map(table => [table.id, table]));
  for (const table of tables.values()) normalizeKeys(table);
  for (const table of tables.values()) {
    checkKeys(table, problems);
    const seen = new Set();
    for (const key of table.foreignKeys) {
      const before = problems.errors.length;
      checkColumns(table, key.columns, key.line, problems);
      const target = tables.get(key.target.table);
      if (!target) problems.error(key.line, unknownName('table', key.target.table, tables.keys()));
      else {
        checkColumns(target, key.target.columns, key.line, problems);
        if (!target.keys.some(candidate => sameColumns(candidate.columns, key.target.columns))) problems.error(key.line, `fk must point to a pk or unique column tuple: reference a whole key of "${target.id}"`);
      }
      if (key.columns.length !== key.target.columns.length) problems.error(key.line, 'both sides of a foreign key need the same number of columns');
      if (key.ondelete === 'set-null' && key.columns.some(name => !table.columns.find(column => column.name === name)?.nullable)) problems.error(key.line, 'ondelete=set-null requires nullable on every referencing column');
      const identity = JSON.stringify([key.target.table, key.columns.map((name, index) => [name, key.target.columns[index]]).sort(([left], [right]) => left.localeCompare(right))]);
      if (seen.has(identity)) problems.error(key.line, 'this foreign key is already declared');
      seen.add(identity);
      if (problems.errors.length !== before) continue;
      figure.edges.push({ from: table.id, to: target.id, fromColumns: key.columns, toColumns: key.target.columns, label: key.columns.length > 1 ? key.label : undefined, quiet: false, dashed: false, line: key.line, isForeignKey: true, fromMultiplicity: key.fromMultiplicity, toMultiplicity: key.toMultiplicity });
    }
  }
}

// cost: time O(c+k*log k+f*log f), heap O(c+k+f), stack O(1)
// vars: c = 테이블 열 수, k = 키 수, f = 외래 키 수
// basis: estimate
function normalizeKeys(table) {
  const primary = table.columns.filter(column => column.pk);
  if (primary.length) table.keys.push({ kind: 'pk', columns: primary.map(column => column.name), line: primary[0].line });
  for (const column of table.columns) {
    if (column.unique) table.keys.push({ kind: 'unique', columns: [column.name], line: column.line });
    if (column.fk) table.foreignKeys.push({ columns: [column.name], target: { table: column.fk.table, columns: [column.fk.column] }, line: column.line, ondelete: column.ondelete, fromMultiplicity: column.fromMultiplicity, toMultiplicity: column.toMultiplicity });
    for (const name of ['pk', 'unique', 'fk', 'ondelete', 'fromMultiplicity', 'toMultiplicity']) delete column[name];
  }
  table.keys.sort((left, right) => left.line - right.line);
  table.foreignKeys.sort((left, right) => left.line - right.line);
  let uniqueCount = 0;
  for (const key of table.keys) {
    key.label = key.kind === 'pk' ? 'PK' : key.columns.length === 1 ? 'UNQ' : `UNQ${++uniqueCount}`;
  }
  let foreignKeyCount = 0;
  for (const key of table.foreignKeys) key.label = key.columns.length === 1 ? 'FK' : `FK${++foreignKeyCount}`;
}

// cost: time O(k*c), heap O(k), stack O(1)
// vars: k = 키에 포함된 열 수, c = 테이블 열 수
// basis: estimate
function checkKeys(table, problems) {
  let primary = false;
  const seen = new Set();
  for (const key of table.keys) {
    checkColumns(table, key.columns, key.line, problems);
    if (key.kind === 'pk') {
      if (primary) problems.error(key.line, 'a table has only one primary key');
      primary = true;
      for (const column of table.columns.filter(column => column.nullable && key.columns.includes(column.name))) problems.error(column.line, 'a primary key cannot be nullable');
    }
    const identity = JSON.stringify([key.kind, [...key.columns].sort()]);
    if (seen.has(identity)) problems.error(key.line, 'this key is already declared');
    seen.add(identity);
  }
}

// cost: time O(k*c), heap O(c), stack O(1)
// vars: k = 참조한 열 수, c = 테이블 열 수
// basis: estimate
function checkColumns(table, columns, line, problems) {
  for (const name of columns) {
    if (!table.columns.some(column => column.name === name)) problems.error(line, unknownName(`column in "${table.id}"`, name, table.columns.map(column => column.name)));
  }
}

// cost: time O(k*k), heap O(1), stack O(1)
// vars: k = 키의 열 수
// basis: estimate
function sameColumns(left, right) {
  return left.length === right.length && left.every(name => right.includes(name));
}
