// DBML 원본 읽기: Table(열 형식, pk, unique, not null, default, note), Ref(인라인 포함), Enum, TableGroup(docs/design/import.md DBML).
import { parseDbml, tokenize } from './dbml-parse.js';
import { change, nodeOf, skip, textOf } from './model.js';

// 관계 기호 → [왼쪽 다중성, 오른쪽 다중성]
const MULTIPLICITY = { '>': ['*', '1'], '<': ['1', '*'], '-': ['1', '1'], '<>': ['*', '*'] };
// 삭제 동작 → Torso ondelete 값
const DELETE = { cascade: 'cascade', restrict: 'restrict', 'set null': 'set-null', 'no action': 'no-action' };

// cost: time O(t + r·c), heap O(t), stack O(d)
// vars: t = 낱말 수, r = 참조 수, c = 테이블당 열 수, d = 블록 깊이
// basis: estimate
/** DBML 원본 하나를 모형에 읽는다. 참조와 묶음은 모든 테이블을 읽은 뒤에 잇는다. */
export function readDbml(text, model) {
  const context = { model, aliases: new Map(), refs: [], groups: [], enums: new Map(), text };
  for (const element of parseDbml(tokenize(text))) readElement(element, context);
  for (const group of context.groups) placeGroup(group, context);
  for (const ref of context.refs) placeRef(ref, context);
  linkEnums(context);
}

// cost: time O(t), heap O(t), stack O(d)
// vars: t = 요소 낱말 수, d = 블록 깊이
// basis: estimate
function readElement(element, context) {
  const { model } = context;
  switch (element.kind) {
    case 'project':
      model.title = textOf(model, element.header[1]?.value ?? '', element.line) || undefined;
      for (const line of element.body ?? []) skip(model, line.line, `the project setting "${line.tokens[0]?.value}" is not imported`);
      return;
    case 'table':
      return readTable(element, context);
    case 'ref':
      return readRefElement(element, context);
    case 'enum':
      return readEnum(element, context);
    case 'tablegroup':
      return void context.groups.push(element);
    default:
      skip(model, element.line, `"${element.header.map((t) => t.value).join(' ')}" is not imported. DBML elements read here are Project, Table, Ref, Enum, and TableGroup`);
  }
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 이름 낱말 수
// basis: estimate
// 점으로 이은 이름(`schema.table`, `"my table"`)을 읽고 { name, rest }를 돌려준다.
function dottedName(tokens) {
  const parts = [];
  let i = 0;
  while (tokens[i] && (tokens[i].type === 'word' || tokens[i].type === 'string')) {
    parts.push(tokens[i].value);
    if (tokens[i + 1]?.value !== '.' || tokens[i + 1]?.type !== 'punct') {
      i++;
      break;
    }
    i += 2;
  }
  return { parts, rest: tokens.slice(i) };
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 설정 낱말 수
// basis: estimate
// 대괄호 설정 `[a, b: c, ...]`을 쉼표로 나눈 항목 { key, value, tokens }의 목록으로. 대괄호가 없으면 빈 목록이다.
function settings(tokens) {
  const open = tokens.findIndex((t) => t.type === 'punct' && t.value === '[');
  if (open < 0) return { items: [], before: tokens };
  const close = tokens.findLastIndex((t) => t.type === 'punct' && t.value === ']');
  const inner = tokens.slice(open + 1, close < 0 ? tokens.length : close);
  const items = [];
  let current = [];
  let depth = 0;
  for (const token of [...inner, { type: 'punct', value: ',' }]) {
    if (token.type === 'punct' && token.value === '(') depth++;
    if (token.type === 'punct' && token.value === ')') depth--;
    if (depth === 0 && token.type === 'punct' && token.value === ',') {
      if (current.length) items.push(settingItem(current));
      current = [];
    } else current.push(token);
  }
  return { items, before: tokens.slice(0, open) };
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 항목 낱말 수
// basis: estimate
function settingItem(tokens) {
  const colon = tokens.findIndex((t) => t.type === 'punct' && t.value === ':');
  const keyTokens = colon < 0 ? tokens : tokens.slice(0, colon);
  return { key: keyTokens.map((t) => t.value).join(' ').toLowerCase(), value: colon < 0 ? undefined : tokens.slice(colon + 1), line: tokens[0].line };
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 테이블 낱말 수
// basis: estimate
// `Table [schema.]name [as alias] [settings] { 열 줄, indexes { }, Note }`
function readTable(element, context) {
  const { model } = context;
  const { parts, rest } = dottedName(element.header.slice(1));
  const key = parts.join('.');
  const alias = rest[0]?.value?.toLowerCase() === 'as' ? rest[1]?.value : undefined;
  if (alias) context.aliases.set(alias, key);
  if (settings(rest).items.length) skip(model, element.line, `the table settings of "${key}" are not imported. Colors come from the design tokens`);
  const table = { key, kind: 'table', label: key, columns: [], keys: [], foreignKeys: [], line: element.line };
  for (const line of element.body ?? []) readTableLine(line, table, context);
  model.nodes.push(table);
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 줄 낱말 수
// basis: estimate
function readTableLine(line, table, context) {
  const { model } = context;
  const head = line.tokens[0];
  const word = head?.value?.toLowerCase();
  if (word === 'note' && (line.tokens[1]?.value === ':' || line.block)) return skip(model, line.line, `the note of table "${table.key}" is not imported. A table card has no note`);
  if (word === 'indexes' && line.block) return readIndexes(line.block, table, context);
  if (head?.type === 'punct' && head.value === '~') return skip(model, line.line, 'the table partial is not imported');
  if (line.block) return skip(model, line.line, `the block "${word}" in table "${table.key}" is not imported`);
  return readColumn(line, table, context);
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 줄 낱말 수
// basis: estimate
// 열 줄 `이름 타입 [설정]`. 타입은 이름 뒤부터 설정 앞까지의 원본 글이다(`varchar(255)`, `decimal(10, 2)`).
function readColumn(line, table, context) {
  const { model, text } = context;
  const [name, ...rest] = line.tokens;
  const { items, before } = settings(rest);
  if (!before.length || (name.type !== 'word' && name.type !== 'string')) return skip(model, line.line, 'this table line is not imported. A column is: name type [settings]');
  const type = text.slice(before[0].start, before.at(-1).end).replace(/^"|"$/g, '');
  const column = { name: name.value, type, line: line.line };
  table.columns.push(column);
  for (const item of items) readColumnSetting(item, { column, table, context });
  return undefined;
}

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 설정 낱말 수
// basis: estimate
// 열 설정 하나. pk, unique, not null, null은 열 표시로 옮긴다. default, note, increment, check는 Torso 열에 자리가 없어 건너뛴다.
function readColumnSetting(item, { column, table, context }) {
  const { model } = context;
  const { key } = item;
  if (key === 'pk' || key === 'primary key') column.pk = true;
  else if (key === 'unique') column.unique = true;
  else if (key === 'not null') column.required = true;
  else if (key === 'null') column.nullable = true;
  else if (key === 'ref') context.refs.push({ ...inlineRef(item, table, column), line: item.line });
  else if (['default', 'note', 'increment', 'check'].includes(key)) skip(model, item.line, `the ${key} of column "${column.name}" is not imported. A Torso column shows its name, type, keys, and null rule`);
  else skip(model, item.line, `the column setting "${key}" is not imported`);
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 설정 낱말 수
// basis: estimate
// 인라인 참조 `ref: > users.id`. 왼쪽 끝은 이 열이다.
function inlineRef(item, table, column) {
  const [op, ...target] = item.value ?? [];
  return { left: { table: table.key, columns: [column.name] }, op: opOf(op, target), right: endpoint(target), settings: [] };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 관계 기호 낱말. `<>`, `>`, `<`, `-`.
const opOf = (token) => (token?.type === 'punct' && MULTIPLICITY[token.value] ? token.value : undefined);

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 끝 낱말 수
// basis: estimate
// 참조의 한 끝 `[schema.]table.column` 또는 `table.(a, b)`. 못 읽으면 undefined다.
function endpoint(tokens) {
  const list = tokens.findIndex((t) => t.type === 'punct' && t.value === '(');
  if (list >= 0) {
    const { parts } = dottedName(tokens.slice(0, list));
    const columns = tokens.slice(list + 1).filter((t) => t.type === 'word' || t.type === 'string').map((t) => t.value);
    return parts.length && columns.length ? { table: parts.join('.'), columns } : undefined;
  }
  const { parts } = dottedName(tokens);
  return parts.length >= 2 ? { table: parts.slice(0, -1).join('.'), columns: [parts.at(-1)] } : undefined;
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 참조 낱말 수
// basis: estimate
// `Ref [이름]: a.x > b.y [delete: cascade]`과 블록 꼴 `Ref [이름] { a.x > b.y }`
function readRefElement(element, context) {
  const lines = element.body ? element.body.map((line) => line.tokens) : [element.header.slice(element.header.findIndex((t) => t.value === ':') + 1)];
  for (const tokens of lines) {
    const { items, before } = settings(tokens);
    const at = before.findIndex((t) => opOf(t));
    const ref = at < 0 ? undefined : { left: endpoint(before.slice(0, at)), op: before[at].value, right: endpoint(before.slice(at + 1)), settings: items };
    if (!ref?.left || !ref.right) skip(context.model, tokens[0]?.line ?? element.line, 'this reference is not imported. Write it as: Ref: table.column > table.column');
    else context.refs.push({ ...ref, line: tokens[0].line });
  }
}

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 값 수
// basis: estimate
// `Enum [schema.]name { 값 [note: '...'] }`는 값 목록을 고정폭 줄로 담은 카드다. 열 타입이 이 이름이면 그 열에서 카드로 선을 잇는다.
function readEnum(element, context) {
  const { model } = context;
  const { parts } = dottedName(element.header.slice(1));
  const key = parts.join('.');
  const values = [];
  for (const line of element.body ?? []) {
    const { items, before } = settings(line.tokens);
    if (before[0]) values.push(textOf(model, before[0].value, line.line));
    if (items.length) skip(model, line.line, `the setting of enum value "${before[0]?.value}" is not imported`);
  }
  if (!values.length) return skip(model, element.line, `the enum "${key}" has no values and is not imported`);
  context.enums.set(key, element.line);
  model.nodes.push({ key, kind: 'box', label: key, sub: 'enum', texts: values, line: element.line });
  return undefined;
}

// cost: time O(c·e), heap O(1), stack O(1)
// vars: c = 전체 열 수, e = enum 수
// basis: estimate
// 열 타입이 enum 이름(스키마를 붙이거나 뗀 꼴)이면 열에서 enum 카드로 선을 잇는다.
function linkEnums({ model, enums }) {
  if (!enums.size) return;
  const find = (type) => [...enums.keys()].find((key) => key === type || key.split('.').at(-1) === type);
  for (const table of model.nodes.filter((n) => n.kind === 'table')) {
    for (const column of table.columns) {
      const key = find(column.type);
      if (key) model.edges.push({ from: { key: table.key, part: column.name }, to: { key }, line: column.line });
    }
  }
}

// cost: time O(m), heap O(1), stack O(1)
// vars: m = 묶음 줄 수
// basis: estimate
// `TableGroup 이름 { 테이블 }`. 테이블은 묶음 하나에만 놓인다.
function placeGroup(element, context) {
  const { model } = context;
  const { parts, rest } = dottedName(element.header.slice(1));
  const key = parts.join('.');
  if (settings(rest).items.length) skip(model, element.line, `the settings of table group "${key}" are not imported`);
  model.groups.push({ key: `group:${key}`, name: key, label: key, line: element.line });
  for (const line of element.body ?? []) {
    const name = dottedName(line.tokens).parts.join('.');
    if (line.tokens[0]?.value?.toLowerCase() === 'note') skip(model, line.line, `the note of table group "${key}" is not imported`);
    const table = nodeOf(model, context.aliases.get(name) ?? name);
    if (line.tokens[0]?.value?.toLowerCase() === 'note') continue;
    if (!table) skip(model, line.line, `"${name}" in table group "${key}" is not imported. There is no such table`);
    else if (table.parent) skip(model, line.line, `"${name}" is already in another table group. A table is in one group`);
    else table.parent = `group:${key}`;
  }
}

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 테이블 열 수
// basis: estimate
// 참조 하나를 외래 키로 놓는다. `<`는 두 끝을 바꾼 `>`이고, `-`는 키를 가리키는 쪽을 참조하는 쪽으로 고르며, `<>`는 외래 키가 아닌 관계선이다.
function placeRef(ref, context) {
  const { model } = context;
  let { left, right } = ref;
  const resolve = (end) => ({ ...end, table: context.aliases.get(end.table) ?? end.table });
  [left, right] = [resolve(left ?? {}), resolve(right ?? {})];
  if (!ref.op || !left.columns || !right.columns) return skip(model, ref.line, 'this reference is not imported. Write it as: ref: > table.column');
  const ondelete = deleteAction(ref, model);
  const [from, to] = ref.op === '<' || (ref.op === '-' && isKey(model, left) && !isKey(model, right)) ? [right, left] : [left, right];
  const [fromMult, toMult] = ref.op === '<' ? MULTIPLICITY['>'] : MULTIPLICITY[ref.op];
  const table = nodeOf(model, from.table);
  if (table?.kind !== 'table') return skip(model, ref.line, `the reference from "${from.table}" is not imported. There is no such table`);
  const missing = from.columns.find((c) => !table.columns.some((col) => col.name === c));
  if (missing) return skip(model, ref.line, `the reference from "${from.table}.${missing}" is not imported. The table has no such column`);
  const mult = { from: fromMult, to: toMult };
  if (ref.op === '<>') {
    const isSingle = from.columns.length === 1 && to.columns.length === 1;
    model.edges.push({ from: { key: from.table, part: isSingle ? from.columns[0] : undefined }, to: { key: to.table, part: isSingle ? to.columns[0] : undefined }, relation: 'association', mult, line: ref.line });
    return undefined;
  }
  const column = table.columns.find((c) => c.name === from.columns[0]);
  const fk = { key: to.table, ondelete, mult, line: ref.line };
  if (from.columns.length === 1 && to.columns.length === 1 && !column.fk) column.fk = { ...fk, column: to.columns[0] };
  else table.foreignKeys.push({ ...fk, columns: from.columns, targets: to.columns });
  return undefined;
}

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 테이블 열 수
// basis: estimate
// 끝의 열 묶음이 그 테이블의 기본 키나 고유 키인가(일대일 참조에서 가리키는 쪽을 고를 때)
function isKey(model, end) {
  const table = nodeOf(model, end.table);
  if (!table || end.columns.length !== 1) return false;
  const column = table.columns?.find((c) => c.name === end.columns[0]);
  return Boolean(column?.pk || column?.unique);
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 참조 설정 수
// basis: estimate
// 참조 설정의 `delete:`를 ondelete 값으로. update와 색 같은 다른 설정은 건너뛴다.
function deleteAction(ref, model) {
  let action;
  for (const item of ref.settings) {
    const value = (item.value ?? []).map((t) => t.value).join(' ').toLowerCase();
    if (item.key === 'delete' && DELETE[value]) action = DELETE[value];
    else skip(model, item.line, `the reference setting "${item.key}${value ? `: ${value}` : ''}" is not imported${item.key === 'delete' ? '. Delete actions are cascade, restrict, set null, no action' : ''}`);
  }
  if (ref.op === '<>' && action) {
    change(model, ref.line, 'the delete action of a many-to-many reference is not drawn');
    return undefined;
  }
  return action;
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 색인 낱말 수
// basis: estimate
// `indexes { (a, b) [pk]  (a, b) [unique]  c [unique] }`. 기본 키와 고유 키만 키로 옮기고 그 밖의 색인은 건너뛴다.
function readIndexes(lines, table, { model }) {
  for (const line of lines) {
    const { items, before } = settings(line.tokens);
    const columns = before.filter((t) => t.type === 'word' || t.type === 'string').map((t) => t.value);
    const kind = items.some((i) => i.key === 'pk') ? 'pk' : items.some((i) => i.key === 'unique') ? 'unique' : undefined;
    const isExpression = before.some((t) => t.type === 'expr');
    const unknown = columns.find((name) => !table.columns.some((c) => c.name === name));
    if (unknown) {
      skip(model, line.line, `this index is not imported. "${unknown}" is not a column of "${table.key}"`);
      continue;
    }
    if (!kind || isExpression || !columns.length) {
      skip(model, line.line, 'this index is not imported. Only primary key and unique indexes on columns are drawn');
      continue;
    }
    if (columns.length === 1) {
      const column = table.columns.find((c) => c.name === columns[0]);
      if (column) column[kind] = true;
    } else table.keys.push({ kind, columns, line: line.line });
  }
}
