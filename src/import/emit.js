// 공통 모형(model.js)을 Torso 원본 글로 쓴다. 이름 정하기, Torso가 받지 않는 선 거르기, 같은 방향 선 합치기, 외래 키 고르기를 여기서 한 번만 한다.
// 줄 순서는 파일 구조(머리, 선언, 시간 흐름)를 따른다(docs/design/figure-syntax.md 파일 구조, docs/design/import.md 쓰기).
import { emitSequence } from './emit-sequence.js';
import { change, groupOf, nodeOf, skip } from './model.js';
import { MISSING_TEXT, createColumnNames, createNames, quote, typeWord } from './names.js';

const INDENT = '  ';

// cost: time O(n + g + e·n), heap O(n + g + e), stack O(g)
// vars: n = 카드 수, g = 그룹 수, e = 선 수
// basis: estimate
/** 모형을 원본 글로 쓴다. 진단은 모형의 problems에 쌓는다. */
export function emit(model) {
  for (const table of model.nodes.filter((n) => n.kind === 'table' && !n.columns?.length)) {
    change(model, table.line, `the table "${table.label || table.key}" has no columns, so it is drawn as a box. A table needs a column`);
    table.kind = 'box';
  }
  const groups = keptGroups(model);
  const ids = assignIds(model, groups);
  const lines = ['torso'];
  if (model.title) lines.push(`title ${quote(model.title)}`);
  lines.push('');
  const edges = resolveEdges(model, ids, groups);
  writeTree(lines, { model, ids, groups }, undefined, 0);
  writeStates(lines, model, ids);
  if (edges.length) lines.push('', ...edges.map((edge) => edgeLine(edge, ids)));
  if (model.chart) lines.push(...chartLines(model.chart, ids));
  const hasGraph = model.nodes.some((n) => !model.sequence?.participants.includes(n.key));
  if (hasGraph && model.direction === 'down') lines.push('', 'view graph down');
  if (model.sequence) lines.push(...emitSequence(model, ids));
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

// cost: time O(g·(n + g)), heap O(g), stack O(g)
// vars: g = 그룹 수, n = 카드 수
// basis: estimate
// 카드를 하나라도 담은 그룹. Torso는 빈 그룹을 받지 않아 빈 그룹은 경고하고 뺀다(그 안의 빈 그룹도 같이).
function keptGroups(model) {
  const holds = (key) => model.nodes.some((n) => n.parent === key) || model.groups.some((g) => g.parent === key && holds(g.key));
  const kept = new Set();
  for (const group of model.groups) {
    if (holds(group.key)) kept.add(group.key);
    else skip(model, group.line, `the empty group "${group.label}" is not imported. A Torso group needs a card inside`);
  }
  return kept;
}

// cost: time O(n + g + c), heap O(n + g + c), stack O(1)
// vars: n = 카드 수, g = 그룹 수, c = 열 수
// basis: estimate
// key에서 Torso 이름으로 가는 표. 카드와 그룹은 한 이름 공간이고 테이블은 `_`로 잇는다. 테이블 열 이름도 여기서 정한다.
function assignIds(model, groups) {
  const names = createNames();
  const ids = { node: new Map(), group: new Map(), column: new Map() };
  for (const group of model.groups) if (groups.has(group.key)) ids.group.set(group.key, names.take(group.name ?? group.key, { fallback: 'group' }));
  for (const node of model.nodes) {
    const isTable = node.kind === 'table';
    ids.node.set(node.key, names.take(node.key, isTable ? { joiner: '_', fallback: 'table' } : {}));
    if (isTable) ids.column.set(node.key, columnNames(model, node));
  }
  if (model.chart) ids.chart = names.take(model.chart.title, { fallback: 'chart' });
  return ids;
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 테이블 열 수
// basis: estimate
// 테이블 하나의 열 이름 표 { 원래 이름: Torso 이름 }. 바꾼 이름은 그림에 보이는 글이 달라지므로 경고한다.
function columnNames(model, table) {
  const names = createColumnNames();
  const map = new Map();
  for (const column of table.columns) {
    const { name, isChanged } = names.take(column.name);
    if (isChanged) change(model, column.line, `column "${column.name}" is written as "${name}". A column name uses letters, digits, and "_", starting with a letter`);
    map.set(column.name, name);
  }
  return map;
}

// cost: time O(n·g), heap O(n), stack O(g)
// vars: n = 카드 수, g = 그룹 수
// basis: estimate
// 그룹 parent 안의 그룹과 카드를 선언 순서대로 쓴다. 빠진 그룹 안의 카드는 바깥 그룹에 쓴다.
function writeTree(lines, context, parent, depth) {
  const { model, groups } = context;
  const parentOf = (item) => {
    let key = item.parent;
    while (key !== undefined && !groups.has(key)) key = groupOf(model, key)?.parent;
    return key;
  };
  const pad = INDENT.repeat(depth);
  for (const group of model.groups.filter((g) => groups.has(g.key) && parentOf(g) === parent)) {
    const direction = group.direction === 'down' ? ' direction=down' : '';
    const border = group.dashed ? ' dashed' : '';
    const id = context.ids.group.get(group.key);
    lines.push(`${pad}group ${id} ${quote(group.label || id)}${direction}${border} {`);
    writeTree(lines, context, group.key, depth + 1);
    lines.push(`${pad}}`);
  }
  for (const node of model.nodes.filter((n) => parentOf(n) === parent)) lines.push(...nodeLines(node, context).map((line) => `${pad}${line}`));
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 카드 본문 줄 수
// basis: estimate
// 카드 하나의 선언 줄. 종류마다 Torso 카드 낱말 하나로 옮긴다.
function nodeLines(node, { model, ids }) {
  const id = ids.node.get(node.key);
  const label = quote(node.label || node.key || id);
  const sub = node.sub ? ` ${quote(node.sub)}` : '';
  switch (node.kind) {
    case 'table':
      return tableLines(node, { model, ids });
    case 'circle':
      return [`box ${id} ${label} shape=circle`];
    case 'store':
      return [`store ${id} ${label}${sub}`];
    case 'external':
      return [`external ${id} ${label}${sub}`];
    case 'person':
      return [`person ${id} ${label}`];
    case 'decision':
      return [`decision ${id} ${label}`];
    case 'queue':
      return [`queue ${id} ${label} slots=${node.slots}`];
    case 'state':
      return [`state ${id} ${label}`];
    case 'class':
      return classLines(node, { model, id, label });
    default:
      if (!node.texts?.length) return [`box ${id} ${label}${sub}`];
      return [`box ${id} ${label}${sub} {`, ...node.texts.map((text) => `${INDENT}text ${quote(text)} mono`), '}'];
  }
}

// cost: time O(m), heap O(m), stack O(1)
// vars: m = 멤버 수
// basis: estimate
// 클래스·인터페이스 블록: `class id "이름" [abstract] {` 멤버 줄 `}`. 멤버 이름은 카드 안에서 겹치지 않게 열 이름과 같은 규칙으로 고친다.
function classLines(node, { model, id, label }) {
  const names = createColumnNames();
  const lines = [`${node.classifier} ${id} ${label}${node.abstract ? ' abstract' : ''} {`];
  for (const member of node.members) {
    const { name, isChanged } = names.take(member.name);
    if (isChanged) change(model, member.line, `member "${member.name}" is written as "${name}". A member name uses letters, digits, and "_", starting with a letter, once per class`);
    const parts = [member.kind, name, quote(member.signature)];
    if (member.visibility) parts.push(`visibility=${member.visibility}`);
    if (member.isStatic) parts.push('static');
    if (member.isAbstract) parts.push('abstract');
    lines.push(`${INDENT}${parts.join(' ')}`);
  }
  lines.push('}');
  return lines;
}

// cost: time O(c·k), heap O(c), stack O(1)
// vars: c = 열 수, k = 키 수
// basis: estimate
// 테이블 블록. 열 줄 뒤에 여러 열 키(`pk (a, b)`, `unique (a, b)`)와 여러 열 외래 키를 쓴다.
function tableLines(table, { model, ids }) {
  const names = ids.column.get(table.key);
  const id = ids.node.get(table.key);
  const lines = [`table ${id} ${quote(table.label || id)} {`];
  for (const column of table.columns) lines.push(`${INDENT}${columnLine(column, { model, ids, names })}`);
  for (const key of table.keys ?? []) {
    if (key.columns.length > 1) lines.push(`${INDENT}${key.kind} (${key.columns.map((c) => names.get(c)).join(', ')})`);
  }
  for (const fk of table.foreignKeys ?? []) {
    if (!fk.isDrawn) continue;
    const target = nodeOf(model, fk.key);
    const targets = fk.targets.map((c) => ids.column.get(target.key).get(c));
    lines.push(`${INDENT}fk (${fk.columns.map((c) => names.get(c)).join(', ')}) -> ${ids.node.get(fk.key)} (${targets.join(', ')})${fkOptions(fk)}`);
  }
  lines.push('}');
  return lines;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 열 한 줄: `이름 타입 [pk] [unique] [nullable|required] [fk=테이블.열 ...]`
function columnLine(column, { ids, names }) {
  const parts = [names.get(column.name), typeWord(column.type || MISSING_TEXT)];
  if (column.pk) parts.push('pk');
  if (column.unique) parts.push('unique');
  if (column.nullable) parts.push('nullable');
  if (column.required) parts.push('required');
  if (column.fk?.isDrawn) parts.push(`fk=${ids.node.get(column.fk.key)}.${ids.column.get(column.fk.key).get(column.fk.column)}${fkOptions(column.fk)}`);
  return parts.join(' ');
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
const fkOptions = (fk) => `${fk.ondelete ? ` ondelete=${fk.ondelete}` : ''}${multiplicity(fk.mult)}`;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
const multiplicity = (mult) => (mult ? ` from=${quote(mult.from)} to=${quote(mult.to)}` : '');

// cost: time O(s + f), heap O(1), stack O(1)
// vars: s = 처음 상태 수, f = 끝 상태 수
// basis: estimate
// 처음 상태 하나와 끝 상태들. Torso는 처음 상태를 하나만 받으므로 둘째부터는 경고하고 뺀다.
function writeStates(lines, model, ids) {
  const out = [];
  const isState = ({ key, line }, word) => {
    const node = nodeOf(model, key);
    if (node?.kind === 'state') return true;
    skip(model, line, `"${node?.label ?? key}" as a ${word} state is not imported. Only a state can be one`);
    return false;
  };
  for (const start of model.starts.filter((s) => isState(s, 'start'))) {
    if (!out.length) out.push(`start ${ids.node.get(start.key)}`);
    else skip(model, start.line, `a second start state "${nodeOf(model, start.key).label}" is not imported. A figure has one start state`);
  }
  const finals = model.finals.filter((f) => isState(f, 'final'));
  for (const key of new Set(finals.map((f) => f.key))) out.push(`final ${ids.node.get(key)}`);
  if (out.length) lines.push('', ...out);
}

// cost: time O(e·(n + g)), heap O(e), stack O(g)
// vars: e = 선 수, n = 카드 수, g = 그룹 수
// basis: estimate
// 그릴 선 목록. 외래 키가 될 수 없는 참조는 관계선으로 옮기고, Torso가 받지 않는 선은 경고하고 빼고, 같은 방향 선은 하나로 합친다.
function resolveEdges(model, ids, groups) {
  const edges = [...model.edges, ...foreignKeyEdges(model)];
  const kept = [];
  for (const edge of edges) {
    const reason = rejectReason(edge, model, groups);
    if (reason) {
      skip(model, edge.line, reason);
      continue;
    }
    const tidy = tidyEdge(edge, model);
    const same = kept.find((k) => sameEnd(k.from, tidy.from) && sameEnd(k.to, tidy.to));
    if (!same) kept.push(tidy);
    else mergeEdge(same, tidy, model);
  }
  return kept;
}

const sameEnd = (a, b) => a.key === b.key && a.part === b.part;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 같은 방향 선 둘을 하나로. Torso는 같은 방향 선을 하나만 받는다. 라벨은 쉼표로 잇는다.
function mergeEdge(kept, edge, model) {
  const labels = [kept.label, edge.label].filter(Boolean);
  const label = [...new Set(labels)].join(', ') || undefined;
  change(model, edge.line, `this edge repeats an edge on line ${kept.line} and is merged into it${label ? ` with the label "${label}"` : ''}. Torso keeps one edge per direction`);
  kept.label = label;
}

// cost: time O(n + g), heap O(1), stack O(g)
// vars: n = 카드 수, g = 그룹 수
// basis: estimate
// 선을 받지 않는 이유. 받으면 undefined다. 끝이 없는 선, 빠진 그룹, 자기 자신으로 가는 선, 그룹과 그 안을 잇는 선이다.
function rejectReason(edge, model, groups) {
  const describe = (end) => `"${end.part ? `${end.key}.${end.part}` : end.key}"`;
  const resolve = (end) => nodeOf(model, end.key) ?? (groups.has(end.key) ? groupOf(model, end.key) : undefined);
  const [from, to] = [resolve(edge.from), resolve(edge.to)];
  if (!from || !to) return `the edge ${describe(edge.from)} -> ${describe(edge.to)} is not imported. ${describe(!from ? edge.from : edge.to)} is not a card here`;
  if (edge.from.key === edge.to.key) {
    const isSelfAllowed = from.kind === 'state' || (from.kind === 'table' && edge.from.part && edge.to.part && edge.from.part !== edge.to.part);
    if (!isSelfAllowed) return `the edge from ${describe(edge.from)} to itself is not imported. Only a state or two different columns of one table connect to themselves`;
  }
  const isInside = (key, groupKey) => {
    for (let at = nodeOf(model, key)?.parent ?? groupOf(model, key)?.parent; at !== undefined; at = groupOf(model, at)?.parent) if (at === groupKey) return true;
    return false;
  };
  if (isInside(edge.to.key, edge.from.key) || isInside(edge.from.key, edge.to.key)) return `the edge ${describe(edge.from)} -> ${describe(edge.to)} is not imported. A group does not connect to a card inside it`;
  return undefined;
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 카드 수
// basis: estimate
// Torso 규칙에 맞게 다듬은 선. 다중성과 관계 종류는 두 끝이 모두 테이블이거나 모두 클래스일 때만 받고(관계 종류의 기본 association은 적지 않는다), 두 상태를 잇는 전이는 사건 글이 있어야 한다.
function tidyEdge(edge, model) {
  const [from, to] = [nodeOf(model, edge.from.key), nodeOf(model, edge.to.key)];
  const isPair = from?.kind === to?.kind && (from?.kind === 'table' || from?.kind === 'class');
  const tidy = { ...edge };
  if (!isPair && (edge.mult || edge.relation)) {
    if (edge.mult) change(model, edge.line, `the cardinality ${edge.mult.from} to ${edge.mult.to} is not drawn. Only an edge between two tables or two classes shows cardinality`);
    else if (edge.relation !== 'association') change(model, edge.line, `the ${edge.relation} relation is drawn as a plain line. Only an edge between two classes shows a relation kind`);
    // 다중성이 있던 관계(개체 관계, 참조)는 방향이 없어 화살촉 없는 선이다. 클래스 관계는 원래 화살촉을 둔다.
    if (edge.mult) tidy.head = 'none';
    tidy.mult = undefined;
    tidy.relation = undefined;
  }
  if (from?.kind === 'state' && to?.kind === 'state' && !edge.label) {
    change(model, edge.line, `a transition needs an event label, so "${MISSING_TEXT}" is written. Write the event in place of it`);
    tidy.label = MISSING_TEXT;
  }
  return tidy;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선 한 줄: `a[.칸] -> b[.칸] ["라벨"] [dashed] [head=..] [relation=..] [from= to=]`
function edgeLine(edge, ids) {
  const end = ({ key, part }) => {
    const id = ids.node.get(key) ?? ids.group.get(key);
    return part === undefined ? id : `${id}.${ids.column.get(key).get(part)}`;
  };
  const parts = [end(edge.from), '->', end(edge.to)];
  if (edge.label) parts.push(quote(edge.label));
  if (edge.dashed) parts.push('dashed');
  if (edge.head && edge.head !== 'end') parts.push(`head=${edge.head}`);
  if (edge.relation && edge.relation !== 'association') parts.push(`relation=${edge.relation}`);
  return parts.join(' ') + multiplicity(edge.mult);
}

// cost: time O(t·c), heap O(t), stack O(1)
// vars: t = 테이블 수, c = 테이블당 열과 키 수
// basis: estimate
// 외래 키마다 그대로 그릴지(fk=) 관계선으로 옮길지 정한다. 가리키는 쪽이 기본 키나 고유 키 전체가 아니면 Torso 외래 키가 될 수 없어 관계선이다.
function foreignKeyEdges(model) {
  const edges = [];
  for (const table of model.nodes.filter((n) => n.kind === 'table')) {
    for (const column of table.columns) {
      if (!column.fk) continue;
      const fk = { ...column.fk, columns: [column.name], targets: [column.fk.column] };
      column.fk.isDrawn = canDraw(model, table, fk, column);
      if (!column.fk.isDrawn) edges.push(...fallbackEdge(model, table, fk));
    }
    for (const fk of table.foreignKeys ?? []) {
      fk.isDrawn = canDraw(model, table, fk);
      if (!fk.isDrawn) edges.push(...fallbackEdge(model, table, fk));
    }
  }
  return edges;
}

// cost: time O(c·k), heap O(1), stack O(1)
// vars: c = 열 수, k = 키 수
// basis: estimate
// Torso 외래 키로 그릴 수 있는가. 가리키는 열 묶음이 그 테이블의 기본 키나 고유 키 전체여야 한다. set-null 삭제는 nullable 열이 있어야 한다.
function canDraw(model, table, fk, column) {
  const target = nodeOf(model, fk.key);
  if (fk.key === table.key && fk.columns.some((c, i) => c === fk.targets[i])) return false;
  if (target?.kind !== 'table' || !fk.targets.every((c) => target.columns.some((t) => t.name === c))) return false;
  if (!isWholeKey(target, fk.targets)) return false;
  if (fk.ondelete === 'set-null') {
    const columns = fk.columns.map((name) => table.columns.find((c) => c.name === name));
    if (columns.some((c) => c.required)) {
      change(model, fk.line, 'the delete action "set null" is not drawn because the column is not null');
      fk.ondelete = undefined;
      if (column) column.fk.ondelete = undefined;
    } else for (const c of columns) c.nullable = true;
  }
  return true;
}

// cost: time O(c·k), heap O(1), stack O(1)
// vars: c = 열 수, k = 키 수
// basis: estimate
// 열 묶음이 테이블의 기본 키나 고유 키 하나와 같은가(순서는 보지 않는다)
function isWholeKey(table, columns) {
  const same = (key) => key.length === columns.length && key.every((c) => columns.includes(c));
  const pk = table.columns.filter((c) => c.pk).map((c) => c.name);
  const keys = [pk, ...table.columns.filter((c) => c.unique).map((c) => [c.name]), ...(table.keys ?? []).map((k) => k.columns)];
  return keys.some((key) => key.length && same(key));
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 외래 키 열 수
// basis: estimate
// 외래 키로 그릴 수 없는 참조의 관계선. 열 하나면 열끼리, 여러 열이면 테이블끼리 잇는다. 참조할 수 없는 대상이면 건너뛴다.
function fallbackEdge(model, table, fk) {
  const target = nodeOf(model, fk.key);
  if (fk.key === table.key && fk.columns.some((c, i) => c === fk.targets[i])) {
    skip(model, fk.line, `the reference from "${table.key}.${fk.columns[0]}" to itself is not imported. A column does not reference itself`);
    return [];
  }
  if (target?.kind !== 'table') {
    skip(model, fk.line, `the reference to "${fk.key}" is not imported. It is not a table here`);
    return [];
  }
  const missing = fk.targets.find((c) => !target.columns.some((t) => t.name === c));
  if (missing) {
    skip(model, fk.line, `the reference to "${fk.key}.${missing}" is not imported. The table has no such column`);
    return [];
  }
  change(model, fk.line, `the reference to ${target.label} (${fk.targets.join(', ')}) is drawn as a relation, not a foreign key. A foreign key points to a whole primary or unique key`);
  const isSingle = fk.columns.length === 1;
  return [{
    from: { key: table.key, part: isSingle ? fk.columns[0] : undefined },
    to: { key: fk.key, part: isSingle ? fk.targets[0] : undefined },
    relation: 'association',
    mult: fk.mult,
    line: fk.line,
  }];
}

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 차트 행 수
// basis: estimate
// 차트 카드 블록. 지금 가져오는 차트는 원 차트(pie) 하나다.
function chartLines(chart, ids) {
  return ['', `chart ${ids.chart} ${quote(chart.title)} ${chart.kind} {`, ...chart.rows.map((row) => `${INDENT}row ${quote(row.label)} value=${row.value}`), '}'];
}
