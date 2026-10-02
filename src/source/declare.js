// 구조, 순서, 상태, 데이터 관계 그림의 선언 문장을 읽는다. 이름 확인과 겹침 확인은 validate.js가 파일을 다 읽은 뒤 한다.
import { STATEMENTS, flagNames, valueNames } from './grammar.js';
import { COLUMN_PATTERN, FK_PATTERN, ID_PATTERN, TABLE_PATTERN } from './words.js';

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 도형, 그룹, 상태, 처음과 끝 상태, 테이블 선언 하나를 읽는다. */
export function readDeclaration(statement, ctx) {
  const word = statement.tokens[0].value;
  if (word === 'group') readGroup(statement, ctx);
  else if (word === 'table') readTable(statement, ctx);
  else if (word === 'start' || word === 'final') readStateMark(statement, ctx);
  else if (STATEMENTS[word]?.node) readNode(statement, ctx);
  else ctx.problems.error(statement.line, `unknown statement "${word}"`);
}

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `box id "이름" ["부제"]`. 사람, 갈림길, 상태는 부제가 없다.
function readNode({ tokens, line }, ctx) {
  const [head, id, label, sub, ...rest] = tokens;
  const shape = head.value;
  const takesSub = STATEMENTS[shape].node.hasSub;
  if (!checkId(id, { line, ctx }, ID_PATTERN)) return rejectName(id, ctx);
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
  if (!checkId(id, { line, ctx }, ID_PATTERN)) {
    rejectName(id, ctx);
    // 닫는 `}`가 짝을 찾도록 자리만 연다.
    if (tokens.at(-1).type === 'open') ctx.groups.push({ isRejected: true, line });
    return;
  }
  if (label?.type !== 'text') ctx.problems.error(line, `write group as: group ${id.value} "name" {`);
  const openAt = rest.findIndex((t) => t.type === 'open');
  if (openAt === -1) ctx.problems.error(line, 'end the group line with "{"');
  else if (openAt < rest.length - 1) ctx.problems.error(line, 'end the group line with "{" and put the group contents on the next lines');
  let direction;
  for (const t of openAt === -1 ? rest : rest.slice(0, openAt)) {
    if (t.type === 'option' && t.key === 'direction' && valueNames('direction').includes(t.value) && t.valueType === 'word') direction = t.value;
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
  if (!checkId(id, { line, ctx }, TABLE_PATTERN)) {
    rejectName(id, ctx);
    // 열 줄을 그 테이블의 열로 읽어 넘기도록 버린 테이블 자리를 연다.
    if (tokens.at(-1).type === 'open') ctx.table = { id: id?.value, columns: [], isRejected: true };
    return;
  }
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
/** 테이블 안 줄. `}`면 테이블을 닫고, 아니면 `열 타입 [pk] [unique] [fk=테이블.열]`이다. 열 이름은 대소문자를 가린다. */
export function readColumn({ tokens, line }, ctx) {
  const [name, type, ...rest] = tokens;
  if (name.type === 'close') {
    if (tokens.length > 1) ctx.problems.error(line, 'put "}" on its own line');
    ctx.table = undefined;
    return;
  }
  if (name.type !== 'word' || !COLUMN_PATTERN.test(name.value)) {
    ctx.problems.error(line, 'a column name uses letters, digits, and "_", starting with a letter');
    return;
  }
  if (!type || (type.type !== 'word' && type.type !== 'text') || flagNames('column').includes(type.value)) {
    ctx.problems.error(line, `write the column as: ${name.value} type [pk] [unique] [fk=table.column]`);
    return;
  }
  if (type.type === 'word' && !/^[a-z][a-z0-9_]*$/i.test(type.value)) {
    // 괄호나 쉼표가 든 타입은 따옴표 글로 적는다. 적는 방법을 하나로 두기 위해서다.
    ctx.problems.error(line, `write a type with symbols as quoted text: "${type.value}"`);
    return;
  }
  const column = { name: name.value, type: type.value, pk: false, unique: false, fk: undefined, line };
  for (const t of rest) {
    if (t.type === 'word' && flagNames('column').includes(t.value)) column[t.value] = true;
    else if (t.type === 'option' && t.key === 'fk' && FK_PATTERN.test(t.value)) {
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
    else if (t.type === 'word' && flagNames('edge').includes(t.value)) {
      if (edge[t.value]) ctx.problems.error(line, `"${t.value}" is written twice`);
      edge[t.value] = true;
    } else ctx.problems.error(line, `an edge takes a quoted label, quiet, and dashed. Found "${t.value}"`);
  }
  if (ctx.figure.kind === 'state' && edge.label === undefined) ctx.problems.error(line, 'a transition needs an event label: a -> b "event"');
  ctx.figure.edges.push(edge);
}

// 버린 선언의 이름과, 그 선언이 있던 그룹을 적는다. 그 그룹은 비어 보여도 원인이 이름 오류라 빈 그룹 오류를 덧붙이지 않는다.
function rejectName(token, ctx) {
  if (token?.type === 'word') ctx.figure.rejectedNames.add(token.value);
  const parent = currentGroup(ctx);
  if (parent) ctx.figure.rejectedNames.add(`group:${parent}`);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 이름 낱말 형식을 확인한다. 문장 종류는 첫 낱말 자리로 정해서 예약어도 이름이 된다.
function checkId(token, { line, ctx }, pattern) {
  if (token?.type !== 'word') {
    ctx.problems.error(line, 'write a name (id) after the statement word');
    return false;
  }
  if (!pattern.test(token.value)) {
    const joiner = pattern === TABLE_PATTERN ? '_' : '-';
    ctx.problems.error(line, `"${token.value}" is not a valid name. Use lowercase letters and digits, joined by single "${joiner}", starting with a letter`);
    return false;
  }
  return true;
}

function currentGroup(ctx) {
  return ctx.groups.at(-1)?.id;
}
