// 구조, 순서, 상태, 데이터 관계 그림의 선언 문장을 읽는다. 이름 확인과 겹침 확인은 validate.js가 파일을 다 읽은 뒤 한다.
import { DIRECTIONS, FLAGS, ID_PATTERN, RESERVED, TABLE_PATTERN } from './words.js';

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 도형, 그룹, 상태, 처음과 끝 상태, 테이블 선언 하나를 읽는다. */
export function readDeclaration(statement, ctx) {
  const word = statement.tokens[0].value;
  if (word === 'group') readGroup(statement, ctx);
  else if (word === 'table') readTable(statement, ctx);
  else if (word === 'start' || word === 'final') readStateMark(statement, ctx);
  else if (['person', 'box', 'external', 'store', 'decision', 'state'].includes(word)) readNode(statement, ctx);
  else ctx.problems.error(statement.line, `unknown statement "${word}"`);
}

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `box id "이름" ["부제"]`. 사람, 갈림길, 상태는 부제가 없다.
function readNode({ tokens, line }, ctx) {
  const [head, id, label, sub, ...rest] = tokens;
  const shape = head.value;
  const takesSub = ['box', 'external', 'store'].includes(shape);
  if (!checkId(id, line, ctx, ID_PATTERN)) return;
  if (label?.type !== 'text') {
    ctx.problems.error(line, `write ${shape} as: ${shape} ${id.value} "${shape === 'decision' ? 'question' : 'name'}"`);
    return;
  }
  if (sub && (sub.type !== 'text' || !takesSub)) ctx.problems.error(line, takesSub ? 'the subtitle must be quoted text' : `${shape} takes no subtitle`);
  if (rest.length) ctx.problems.error(line, `${shape} takes no more words or options`);
  ctx.figure.nodes.push({ id: id.value, shape, label: label.value, sub: sub?.type === 'text' ? sub.value : undefined, parent: currentGroup(ctx), line });
}

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `group id "이름" [direction=down] {`
function readGroup({ tokens, line }, ctx) {
  const [, id, label, ...rest] = tokens;
  if (!checkId(id, line, ctx, ID_PATTERN)) return;
  if (label?.type !== 'text') ctx.problems.error(line, `write group as: group ${id.value} "name" {`);
  const openAt = rest.findIndex((t) => t.type === 'open');
  if (openAt === -1) ctx.problems.error(line, 'end the group line with "{"');
  else if (openAt < rest.length - 1) ctx.problems.error(line, 'end the group line with "{" and put the group contents on the next lines');
  let direction;
  for (const t of openAt === -1 ? rest : rest.slice(0, openAt)) {
    if (t.type === 'option' && t.key === 'direction' && DIRECTIONS.includes(t.value) && t.valueType === 'word') direction = t.value;
    else ctx.problems.error(line, 'a group takes only direction=right or direction=down');
  }
  const group = { id: id.value, label: label?.value ?? '', direction, parent: currentGroup(ctx), line, hasError: openAt !== rest.length - 1 };
  ctx.figure.groups.push(group);
  ctx.groups.push(group);
}

/** `}`로 그룹이나 테이블을 닫는다. */
export function closeGroup({ tokens, line }, ctx) {
  if (tokens.length > 1) ctx.problems.error(line, 'put "}" on its own line');
  if (!ctx.groups.length) ctx.problems.error(line, 'there is no open group to close');
  else ctx.groups.pop();
}

// cost: time O(f), heap O(1), stack O(1)
// vars: f = 끝 상태 수
// basis: estimate
// `start id`, `final id`
function readStateMark({ tokens, line }, ctx) {
  const [head, id, extra] = tokens;
  if (id?.type !== 'word' || extra) {
    ctx.problems.error(line, `write ${head.value} as: ${head.value} state-id`);
    return;
  }
  if (head.value === 'start') {
    if (ctx.figure.start) ctx.problems.error(line, `there is already a start state "${ctx.figure.start.id}" (line ${ctx.figure.start.line})`);
    else ctx.figure.start = { id: id.value, line };
  } else {
    const known = ctx.figure.finals.find((f) => f.id === id.value);
    if (known) ctx.problems.error(line, `"${id.value}" is already a final state (line ${known.line})`);
    else ctx.figure.finals.push({ id: id.value, line });
  }
}

// `table id "이름" {`
function readTable({ tokens, line }, ctx) {
  const [, id, label, open, extra] = tokens;
  if (!checkId(id, line, ctx, TABLE_PATTERN)) return;
  if (label?.type !== 'text' || open?.type !== 'open' || extra) {
    ctx.problems.error(line, `write table as: table ${id.value} "name" {`);
    return;
  }
  const table = { id: id.value, shape: 'table', label: label.value, columns: [], parent: undefined, line };
  ctx.figure.nodes.push(table);
  ctx.table = table;
}

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 테이블 안 줄. `}`면 테이블을 닫고, 아니면 `열 타입 [pk] [unique] [fk=테이블.열]`이다. 열 이름에는 예약어 제한이 없다. */
export function readColumn({ tokens, line }, ctx) {
  const [name, type, ...rest] = tokens;
  if (name.type === 'close') {
    if (tokens.length > 1) ctx.problems.error(line, 'put "}" on its own line');
    ctx.table = undefined;
    return;
  }
  if (name.type !== 'word' || !TABLE_PATTERN.test(name.value)) {
    ctx.problems.error(line, 'a column name uses lowercase letters, digits, and "_", starting with a letter');
    return;
  }
  if (!type || (type.type !== 'word' && type.type !== 'text') || ['pk', 'unique'].includes(type.value)) {
    ctx.problems.error(line, `write the column as: ${name.value} type [pk] [unique] [fk=table.column]`);
    return;
  }
  const column = { name: name.value, type: type.value, pk: false, unique: false, fk: undefined, line };
  for (const t of rest) {
    if (t.type === 'word' && (t.value === 'pk' || t.value === 'unique')) column[t.value] = true;
    else if (t.type === 'option' && t.key === 'fk' && /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(t.value)) {
      const [table, col] = t.value.split('.');
      column.fk = { table, column: col };
    } else ctx.problems.error(line, `unknown column option "${t.key ?? t.value}". Use pk, unique, or fk=table.column`);
  }
  if (ctx.table.columns.some((c) => c.name === column.name)) ctx.problems.error(line, `column "${column.name}" is already in table "${ctx.table.id}"`);
  ctx.table.columns.push(column);
}

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 선언 부분의 `a -> b ["라벨"] [quiet] [dashed]`. 구조 그림은 선, 상태 그림은 전이다. */
export function readEdge({ tokens, line }, ctx) {
  const [from, , to, ...rest] = tokens;
  if (from.type !== 'word' || to?.type !== 'word') {
    ctx.problems.error(line, 'write an edge as: a -> b "label"');
    return;
  }
  const edge = { from: from.value, to: to.value, label: undefined, quiet: false, dashed: false, line };
  for (const t of rest) {
    if (t.type === 'text' && edge.label === undefined) edge.label = t.value;
    else if (t.type === 'word' && (t.value === 'quiet' || t.value === 'dashed')) {
      if (edge[t.value]) ctx.problems.error(line, `"${t.value}" is written twice`);
      edge[t.value] = true;
    } else ctx.problems.error(line, `an edge takes a quoted label, quiet, and dashed. Found "${t.value}"`);
  }
  if (ctx.figure.kind === 'state' && edge.label === undefined) ctx.problems.error(line, 'a transition needs an event label: a -> b "event"');
  ctx.figure.edges.push(edge);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 이름 낱말 형식과 예약어를 확인한다.
function checkId(token, line, ctx, pattern) {
  if (token?.type !== 'word') {
    ctx.problems.error(line, 'write a name (id) after the statement word');
    return false;
  }
  if (!pattern.test(token.value)) {
    ctx.problems.error(line, `"${token.value}" is not a valid name. Use lowercase letters, digits, and "-", starting with a letter`);
    return false;
  }
  if (RESERVED.has(token.value) || FLAGS.includes(token.value)) {
    ctx.problems.error(line, `"${token.value}" is a reserved word. Choose another name`);
    return false;
  }
  return true;
}

function currentGroup(ctx) {
  return ctx.groups.at(-1)?.id;
}
