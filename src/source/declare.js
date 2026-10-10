// 도형, 그룹, 상태, 테이블, API 카드와 선 선언 문장을 읽는다. 이름 확인과 겹침 확인은 validate.js가 파일을 다 읽은 뒤 한다.
import { STATEMENTS, flagNames, valueNames } from './grammar.js';
import { readGroup } from './group.js';
import { checkId, parentFor, rejectName, skipBlock } from './names.js';
import { readNode } from './node.js';
import { readOptions } from './options.js';
import { readForeignKeyOptions, readTableKey } from './table-keys.js';
import { COLUMN_PATTERN, FK_PATTERN, ID_PATTERN, TABLE_PATTERN } from './words.js';

// API 카드의 제목. `메서드 경로`이고 경로는 `/`로 시작하거나 전체 주소다.
const API_LABEL = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) (\/\S*|https?:\/\/\S+)$/;
// 표와 API 카드가 아이콘을 따로 받지 않으므로 공통 카드 머리에 놓는 의미 아이콘(데이터, 게이트웨이). 클래스는 UML 표기라 아이콘이 없다.
const TABLE_ICON = 'db';
const API_ICON = 'apigw';
// 블록을 여는 줄 뒤에 올 수 있는 것은 `{`뿐이다.
const OPEN_FORM = (word, id) => `write ${word} as: ${word} ${id} "name" {`;

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 도형, 그룹, 처음과 끝 상태 선언 하나를 읽는다. 블록을 여는 카드는 blocks.js가 맡는다. */
export function readDeclaration(statement, ctx) {
  const word = statement.tokens[0].value;
  if (word === 'group') readGroup(statement, ctx);
  else if (word === 'start' || word === 'final') readStateMark(statement, ctx);
  else if (STATEMENTS[word]?.node) readNode(statement, ctx);
  else ctx.problems.error(statement.line, `unknown statement "${word}"`);
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

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 블록 카드 하나를 목록에 넣고 열린 블록으로 정한다. 이름을 버린 카드는 안쪽 줄을 읽어 넘기도록 자리만 연다.
function pushBlockCard(card, kind, ctx) {
  ctx.figure.nodes.push(card);
  ctx.block = { kind, card, line: card.line };
}

// `table id "이름" {`
export function readTable({ tokens, line }, ctx) {
  const [, id, label, open, extra] = tokens;
  if (!checkId(id, { line, ctx }, TABLE_PATTERN)) {
    rejectName(id, ctx);
    skipBlock('table', { id: id?.value, columns: [] }, { tokens, line }, ctx);
    return;
  }
  if (label?.type !== 'text' || open?.type !== 'open' || extra) {
    ctx.problems.error(line, OPEN_FORM('table', id.value));
    skipBlock('table', { id: id.value, columns: [] }, { tokens, line }, ctx);
    return;
  }
  pushBlockCard({ id: id.value, shape: 'table', label: label.value, icon: TABLE_ICON, columns: [], keys: [], foreignKeys: [], parent: parentFor(id, ctx), line }, 'table', ctx);
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `api id "METHOD /경로" {`. 칸(필드)은 테이블 열처럼 `이름 타입`이다.
export function readApi({ tokens, line }, ctx) {
  const [, id, label, open, extra] = tokens;
  if (!checkId(id, { line, ctx }, ID_PATTERN)) {
    rejectName(id, ctx);
    skipBlock('api', { id: id?.value, columns: [] }, { tokens, line }, ctx);
    return;
  }
  if (label?.type !== 'text' || open?.type !== 'open' || extra) {
    ctx.problems.error(line, `write api as: api ${id.value} "POST /orders" {`);
    skipBlock('api', { id: id.value, columns: [] }, { tokens, line }, ctx);
    return;
  }
  const form = API_LABEL.exec(label.value);
  if (!form) ctx.problems.error(line, `an api title is a method and a path such as "POST /orders". Methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS. Found "${label.value}"`);
  pushBlockCard({ id: id.value, shape: 'api', label: label.value, icon: API_ICON, method: form?.[1], url: form?.[2], columns: [], parent: parentFor(id, ctx), line }, 'api', ctx);
}

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 테이블과 API 안 줄. `}`면 블록을 닫고, 아니면 테이블은 `열 타입 [pk] [unique] [fk=테이블.열]`, API는 `칸 타입`이다. 이름은 대소문자를 가린다. */
export function readColumn({ tokens, line }, ctx) {
  const [name, type, ...rest] = tokens;
  const card = ctx.block.card;
  const isApi = ctx.block.kind === 'api';
  if (name.type === 'close') {
    if (tokens.length > 1) ctx.problems.error(line, 'put "}" on its own line');
    ctx.block = undefined;
    return;
  }
  if (!isApi && STATEMENTS[name.value]?.in === 'table' && type?.type === 'word' && type.value.startsWith('(')) {
    readTableKey({ tokens, line }, ctx);
    return;
  }
  if (name.type !== 'word' || !COLUMN_PATTERN.test(name.value)) {
    ctx.problems.error(line, `${isApi ? 'a field' : 'a column'} name uses letters, digits, and "_", starting with a letter`);
    return;
  }
  if (!type || (type.type !== 'word' && type.type !== 'text') || flagNames('column').includes(type.value)) {
    ctx.problems.error(line, `write the ${isApi ? 'field' : 'column'} as: ${name.value} type${isApi ? '' : ' [pk] [unique] [fk=table.column]'}`);
    return;
  }
  if (type.type === 'word' && !/^[a-z][a-z0-9_]*$/i.test(type.value)) {
    // 괄호나 쉼표가 든 타입은 따옴표 글로 적는다. 적는 방법을 하나로 두기 위해서다.
    ctx.problems.error(line, `write a type with symbols as quoted text: "${type.value}"`);
    return;
  }
  const column = { name: name.value, type: type.value, pk: false, unique: false, fk: undefined, line };
  if (isApi && rest.length) ctx.problems.error(line, `an api field takes a name and a type only. Found "${rest[0].key ?? rest[0].value}"`);
  else readColumnOptions(rest, column, ctx);
  if (card.columns.some((c) => c.name === column.name)) ctx.problems.error(line, `${isApi ? 'field' : 'column'} "${column.name}" is already in ${card.shape ?? ctx.block.kind} "${card.id}"`);
  card.columns.push(column);
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 열 선택 사항 수
// basis: estimate
function readColumnOptions(rest, column, ctx) {
  const { line } = column;
  const seen = new Set();
  const referenceOptions = [];
  for (const t of rest) {
    const key = t.key ?? t.value;
    if (seen.has(key)) {
      ctx.problems.error(line, `"${key}" is written twice`);
      continue;
    }
    seen.add(key);
    if (t.type === 'word' && flagNames('column').includes(t.value)) column[t.value] = true;
    else if (t.type === 'option' && t.key === 'fk' && FK_PATTERN.test(t.value)) {
      const [table, col] = t.value.split('.');
      column.fk = { table, column: col };
    } else if (t.type === 'option' && ['ondelete', 'from', 'to'].includes(t.key)) {
      referenceOptions.push(t);
    } else ctx.problems.error(line, `unknown column option "${t.key ?? t.value}". Use pk, unique, nullable, required, fk=table.column, ondelete=policy, from=, or to=`);
  }
  Object.assign(column, readForeignKeyOptions(referenceOptions, line, ctx));
  if (column.nullable && column.required) ctx.problems.error(line, 'nullable and required cannot be combined');
  for (const key of ['ondelete', 'fromMultiplicity', 'toMultiplicity']) {
    if (column[key] !== undefined && !column.fk) ctx.problems.error(line, `${key.replace('Multiplicity', '')} requires fk=table.column`);
  }
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/**
 * 선언 부분의 `a[.칸] -> b[.칸] ["라벨"] [quiet] [dashed] [head=] [no=] [relation=] [from=] [to=]`. 모든 카드가 이 한 꼴을 쓴다.
 * 선 끝이 어떤 카드인지에 따라 쓸 수 있는 선택 사항이 정해지는 검사는 validate.js가 한다.
 */
export function readEdge({ tokens, line }, ctx) {
  const [from, , to, ...rest] = tokens;
  if (from.type !== 'word' || to?.type !== 'word') {
    ctx.problems.error(line, 'write an edge as: a -> b "label"');
    return;
  }
  const edge = { from: from.value, to: to.value, label: undefined, quiet: false, dashed: false, head: undefined, no: undefined, line };
  const labels = rest.filter((t) => t.type === 'text');
  if (labels.length > 1) ctx.problems.error(line, 'an edge takes one label');
  edge.label = labels[0]?.value;
  const options = [];
  for (const t of rest.filter((w) => w.type !== 'text')) {
    if (t.type === 'word' && flagNames('edge').includes(t.value)) {
      if (edge[t.value]) ctx.problems.error(line, `"${t.value}" is written twice`);
      edge[t.value] = true;
    } else if (t.type === 'option' && t.key === 'head') readHead(t, edge, { line, ctx });
    else if (t.type === 'option') options.push(t);
    else ctx.problems.error(line, `an edge takes a quoted label, quiet, dashed, head=, no=, relation=, from=, and to=. Found "${t.value}"`);
  }
  const found = readOptions(options, { scopes: ['edge', 'relation', 'multiplicity'], what: 'an edge', line, ctx });
  edge.no = found.no;
  if (found.relation !== undefined) edge.relation = found.relation;
  if (found.from !== undefined) edge.fromMultiplicity = found.from;
  if (found.to !== undefined) edge.toMultiplicity = found.to;
  ctx.figure.edges.push(edge);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// `head=` 한 번. 값은 head 목록의 이름이다.
function readHead(t, edge, { line, ctx }) {
  if (edge.head !== undefined) ctx.problems.error(line, '"head" is written twice');
  else if (t.valueType !== 'word' || !valueNames('head').includes(t.value)) ctx.problems.error(line, `head is one of ${valueNames('head').join(', ')}`);
  else edge.head = t.value;
}
