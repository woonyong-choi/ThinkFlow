// D2 원본 읽기: 노드와 라벨, 화살표 넷, 컨테이너 중첩, shape, direction, sql_table(docs/design/import.md D2).
// D2 이름은 대소문자를 가리지 않으므로 경로 열쇠는 소문자로 비교하고, 보이는 이름은 처음 쓴 꼴을 쓴다.
import { parseD2 } from './d2-parse.js';
import { change, skip, textOf } from './model.js';
import { MISSING_TEXT } from './names.js';

// shape → 카드 종류. 목록 밖 모양은 상자로 그리고 알린다.
const SHAPES = { rectangle: 'box', square: 'box', cylinder: 'store', person: 'person', 'c4-person': 'person', diamond: 'decision', circle: 'circle', queue: 'queue', sql_table: 'table' };
/** D2 queue에는 칸 수가 없다. Torso 큐는 칸 수가 필요해서 이 값으로 쓰고 알린다. */
const QUEUE_SLOTS = 4;
const DIRECTIONS = { right: 'right', down: 'down', left: 'right', up: 'down' };
// 받지 않는 예약 낱말. style과 그 아래 키는 꾸밈이라 따로 알린다.
const IGNORED = new Set(['icon', 'tooltip', 'link', 'near', 'width', 'height', 'top', 'left', 'class', 'classes', 'vars', 'layers', 'scenarios', 'steps', 'grid-rows', 'grid-columns', 'grid-gap', 'vertical-gap', 'horizontal-gap', 'source-arrowhead', 'target-arrowhead', 'tooltip', 'title', 'imports']);
const STYLE = 'style';

// cost: time O(b), heap O(1), stack O(1)
// vars: b = 블록 문장 수
// basis: estimate
// D2의 그림 제목 관례: 맨 위의 글 모양 노드(`title: 글 {shape: text; near: top-center}`). Torso 그림 제목(`title`)으로 옮긴다.
function isTitle(path, item) {
  if (path.length !== 1 || !item.value || item.value.kind === 'array') return false;
  return (item.block ?? []).some((prop) => prop.paths[0]?.join('.').toLowerCase() === 'shape' && prop.value?.text === 'text');
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// `style.stroke-dash: n`(n > 0)인가. Torso는 점선의 간격을 고르지 않고 점선 여부만 옮긴다.
function isDash(path, item) {
  return path.length === 2 && path[0].toLowerCase() === STYLE && path[1].toLowerCase() === 'stroke-dash' && Number(item.value?.text) > 0;
}

// cost: time O(n + k·k), heap O(n + k), stack O(d)
// vars: n = 원본 글자 수, k = 노드 수, d = 블록 깊이
// basis: estimate
/** D2 원본 하나를 모형에 읽는다. */
export function readD2(text, model) {
  model.direction = 'down';
  const context = { model, nodes: new Map(), edges: [] };
  const items = parseD2(text, (line, message) => skip(model, line, message));
  walk(items, [], context);
  finish(context);
}

// cost: time O(s·d), heap O(s), stack O(d)
// vars: s = 문장 수, d = 블록 깊이
// basis: estimate
// 문장 목록을 scope(경로 마디 목록) 안에서 읽는다.
function walk(items, scope, context) {
  for (const item of items) {
    if (item.isRef) skip(context.model, item.line, 'the edge reference "(a -> b)[0]" is not imported. Write the label on the edge line');
    else if (item.ops.length) readEdges(item, scope, context);
    else readKey(item, scope, context);
  }
}

// cost: time O(d), heap O(d), stack O(1)
// vars: d = 경로 깊이
// basis: estimate
// scope 안의 상대 경로를 전체 경로로. `_`는 바깥 컨테이너다. 빈 마디나 `*`가 든 경로는 undefined다.
function absolute(scope, path) {
  const out = [...scope];
  for (const segment of path) {
    if (segment === '_') out.pop();
    else if (!segment || segment.includes('*') || segment.startsWith('...@')) return undefined;
    else out.push(segment);
  }
  return out.length ? out : undefined;
}

const keyOf = (segments) => segments.map((s) => s.toLowerCase()).join('.');

// cost: time O(d), heap O(d), stack O(1)
// vars: d = 경로 깊이
// basis: estimate
// 경로의 노드와 그 위 컨테이너를 모두 만든다(D2는 `a.b.c`가 a, a.b를 함께 선언한다).
function declare(segments, line, { nodes }) {
  for (let i = 1; i <= segments.length; i++) {
    const key = keyOf(segments.slice(0, i));
    if (!nodes.has(key)) nodes.set(key, { key, segments: segments.slice(0, i), parent: i > 1 ? keyOf(segments.slice(0, i - 1)) : undefined, line });
  }
  return nodes.get(keyOf(segments));
}

// cost: time O(s·d), heap O(s), stack O(d)
// vars: s = 블록 문장 수, d = 블록 깊이
// basis: estimate
// 화살표가 없는 문장: 노드 선언, 또는 끝 마디가 예약 낱말인 속성(`a.shape: cylinder`)
function readKey(item, scope, context) {
  const { model } = context;
  const raw = item.paths[0];
  const path = absolute(scope, raw);
  if (!path) return skip(model, item.line, `"${raw.join('.')}" is not imported. Globs, spreads, and empty keys are not read`);
  const styleAt = path.findIndex((s) => s.toLowerCase() === STYLE);
  if (styleAt > 0 && isDash(path.slice(styleAt), item)) return void (declare(path.slice(0, styleAt), item.line, context).dashed = true);
  if (styleAt >= 0) return skip(model, item.line, `the style "${raw.join('.')}" is not imported. Colors and sizes come from the design tokens`);
  const last = path.at(-1).toLowerCase();
  const owner = path.slice(0, -1);
  if (isTitle(path, item)) return void (model.title = labelOf(item, model));
  if (last === 'label') return setLabel(owner, item, context);
  if (last === 'shape') return setShape(owner, item, context);
  if (last === 'direction') return setDirection(owner, item, context);
  if (last === 'constraint' && owner.length) return void (declare(owner, item.line, context).constraint = item.value?.text);
  if (IGNORED.has(last)) return skip(model, item.line, `"${last}" is not imported`);
  const node = declare(path, item.line, context);
  if (item.value?.text === 'null') return skip(model, item.line, `"${raw.join('.')}: null" is not imported. Remove the key instead`);
  if (item.value) node.value = labelOf(item, model);
  if (item.block) walk(item.block, path, context);
  return undefined;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 값 글을 라벨로. 블록 글(`|md ...|`)은 한 줄 글로 옮기고 알린다.
function labelOf(item, model) {
  if (item.value.kind === 'block') change(model, item.line, `the ${item.value.lang} block label is written as one line of plain text`);
  if (item.value.kind === 'array') return undefined;
  return textOf(model, item.value.text, item.line);
}

// cost: time O(d), heap O(1), stack O(1)
// vars: d = 경로 깊이
// basis: estimate
function setLabel(owner, item, context) {
  if (!owner.length) return skip(context.model, item.line, 'a label without a key is not imported');
  if (item.block) skip(context.model, item.line, 'the label settings in the block are not imported');
  declare(owner, item.line, context).label = labelOf(item, context.model);
  return undefined;
}

// cost: time O(d), heap O(1), stack O(1)
// vars: d = 경로 깊이
// basis: estimate
function setShape(owner, item, context) {
  if (!owner.length) return skip(context.model, item.line, 'a shape without a key is not imported');
  declare(owner, item.line, context).shape = { name: item.value?.text?.toLowerCase(), line: item.line };
  return undefined;
}

// cost: time O(d), heap O(1), stack O(1)
// vars: d = 경로 깊이
// basis: estimate
// 맨 위 direction은 그림의 방향이고 컨테이너 안 direction은 그룹 방향이다. 거꾸로 가는 방향은 같은 축으로 바꾼다.
function setDirection(owner, item, { model, ...context }) {
  const word = item.value?.text?.toLowerCase();
  if (!Object.hasOwn(DIRECTIONS, word ?? '')) return skip(model, item.line, `the direction "${word}" is not imported. Directions are right, down, left, up`);
  if (word === 'left' || word === 'up') change(model, item.line, `the direction ${word} is drawn as ${DIRECTIONS[word]}. A Torso graph flows right or down`);
  if (owner.length) declare(owner, item.line, { model, ...context }).direction = DIRECTIONS[word];
  else model.direction = DIRECTIONS[word];
  return undefined;
}

// cost: time O(p·d), heap O(p), stack O(d)
// vars: p = 화살표로 이은 경로 수, d = 경로 깊이
// basis: estimate
// `a -> b -> c: 라벨 { ... }`. 라벨은 이은 선 모두에 붙는다. `<-`는 거꾸로 적은 선, `<->`는 양 끝 화살촉, `--`는 화살촉 없는 선이다.
function readEdges(item, scope, context) {
  const { model } = context;
  const paths = item.paths.map((p) => absolute(scope, p));
  if (paths.some((p) => !p || p.some((s) => s.toLowerCase() === STYLE))) return skip(model, item.line, 'this edge is not imported. An end is empty, a glob, or a style key');
  for (const path of paths) declare(path, item.line, context);
  let label = item.value ? labelOf(item, model) : undefined;
  let dashed = false;
  for (const prop of item.block ?? []) {
    const key = prop.paths[0]?.join('.').toLowerCase();
    if (!prop.ops.length && key === 'label' && prop.value) label = labelOf(prop, model);
    else if (!prop.ops.length && isDash(prop.paths[0] ?? [], prop)) dashed = true;
    else skip(model, prop.line, `the edge setting "${key}" is not imported. An edge takes a label`);
  }
  for (let i = 0; i < item.ops.length; i++) {
    const op = item.ops[i];
    const [from, to] = op === '<-' ? [paths[i + 1], paths[i]] : [paths[i], paths[i + 1]];
    context.edges.push({ from: keyOf(from), to: keyOf(to), label, dashed, head: op === '<->' ? 'both' : op === '--' ? 'none' : 'end', line: item.line });
  }
  return undefined;
}

// cost: time O(k·k + e), heap O(k + e), stack O(1)
// vars: k = 노드 수, e = 선 수
// basis: estimate
// 노드를 카드, 그룹, 테이블 열로 나누고 선을 모형에 옮긴다. 자식이 있는 노드는 그룹이고, sql_table의 자식은 열이다.
function finish({ model, nodes, edges }) {
  const all = [...nodes.values()];
  const isTable = (node) => node?.shape?.name === 'sql_table';
  const parentOf = (node) => nodes.get(node.parent);
  // 컨테이너 방향은 적지 않으면 바깥 컨테이너, 맨 위는 그림의 방향을 따른다(D2와 같다).
  const directionOf = (node) => node.direction ?? (node.parent ? directionOf(parentOf(node)) : model.direction);
  const columns = new Set(all.filter((node) => isTable(parentOf(node) ?? {})).map((node) => node.key));
  for (const node of all) {
    if (columns.has(node.key)) continue;
    if (node.parent && columns.has(node.parent)) {
      skip(model, node.line, `"${node.segments.join('.')}" inside a table column is not imported`);
      continue;
    }
    const label = node.label ?? node.value ?? node.segments.at(-1);
    const hasChildren = all.some((other) => other.parent === node.key);
    if (hasChildren && !isTable(node)) addGroup(node, label, { model, direction: directionOf(node) });
    else addNode(node, label, { model, all });
  }
  for (const edge of edges) {
    const end = (key) => (columns.has(key) ? { key: nodes.get(key).parent, part: nodes.get(key).segments.at(-1) } : { key });
    const [from, to] = [end(edge.from), end(edge.to)];
    if (!asForeignKey({ from, to, edge }, model)) model.edges.push({ from, to, label: edge.label || undefined, dashed: edge.dashed || undefined, head: edge.head, line: edge.line });
  }
  for (const column of model.nodes.flatMap((n) => n.columns ?? [])) {
    if (column.isForeign && !column.fk) skip(model, column.line, `the foreign_key mark on "${column.name}" is not imported. No edge goes from this column to a column of another table`);
    delete column.isForeign;
  }
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 카드 수
// basis: estimate
// foreign_key 열에서 다른 열로 가는 라벨 없는 화살표는 외래 키다(DBML의 ref와 같은 뜻이라 같은 fk= 문법으로 옮긴다). 옮겼으면 true다.
function asForeignKey({ from, to, edge }, model) {
  if (edge.head !== 'end' || edge.label || from.part === undefined || to.part === undefined) return false;
  const column = model.nodes.find((n) => n.key === from.key)?.columns?.find((c) => c.name === from.part);
  if (!column?.isForeign || column.fk) return false;
  column.fk = { key: to.key, column: to.part, line: edge.line };
  return true;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function addGroup(node, label, { model, direction }) {
  if (node.shape && node.shape.name !== 'rectangle') change(model, node.shape.line, `the shape "${node.shape.name}" of the container "${label}" is not drawn. A container is a group`);
  model.groups.push({ key: node.key, label: label || node.key, parent: node.parent, direction, dashed: node.dashed || undefined, line: node.line });
}

// cost: time O(k), heap O(c), stack O(1)
// vars: k = 노드 수, c = 테이블 열 수
// basis: estimate
// 카드 하나. sql_table은 자식 노드를 열로 읽는다(값이 타입, constraint가 키).
function addNode(node, label, { model, all }) {
  const shape = node.shape?.name;
  let kind = shape === undefined ? 'box' : SHAPES[shape];
  if (shape !== undefined && !kind) {
    change(model, node.shape.line, `the shape "${shape}" of "${label}" is drawn as a box`);
    kind = 'box';
  }
  // 점선 테두리 상자는 Torso의 외부 카드(점선 윤곽)다. 다른 모양의 점선은 모양을 지키고 알린다.
  if (node.dashed && kind === 'box') kind = 'external';
  else if (node.dashed) change(model, node.line, `the dashed outline of "${label}" is not drawn. Only a box becomes a dashed external card`);
  const card = { key: node.key, kind, label: label || node.key, parent: node.parent, line: node.line };
  if (kind === 'queue') {
    card.slots = QUEUE_SLOTS;
    change(model, node.shape.line, `the queue "${label}" is drawn with ${QUEUE_SLOTS} slots. A D2 queue has no slot count`);
  }
  if (kind === 'table') card.columns = all.filter((other) => other.parent === node.key).map((column) => tableColumn(column, model));
  model.nodes.push(card);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// sql_table 열 하나: `이름: 타입 {constraint: primary_key}`. constraint는 하나이거나 배열(`[primary_key; unique]`)이다.
function tableColumn(column, model) {
  const constraints = (column.constraint ?? '').split(/[;,\s]+/).filter(Boolean);
  for (const word of constraints.filter((c) => !['primary_key', 'unique', 'foreign_key'].includes(c))) skip(model, column.line, `the constraint "${word}" is not imported`);
  const type = column.label ?? column.value;
  if (!type) change(model, column.line, `the column "${column.segments.at(-1)}" has no type, so "${MISSING_TEXT}" is written`);
  return { name: column.segments.at(-1), type: type || MISSING_TEXT, pk: constraints.includes('primary_key'), unique: constraints.includes('unique'), isForeign: constraints.includes('foreign_key'), line: column.line };
}
