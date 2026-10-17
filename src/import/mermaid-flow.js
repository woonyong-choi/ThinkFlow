// Mermaid 순서도(flowchart, graph) 읽기: 노드 모양, 선과 라벨, subgraph 중첩, 방향(docs/design/import.md 순서도).
import { change, ensureNode, groupOf, skip, textOf } from './model.js';
import { unquote } from './mermaid.js';

// 방향 낱말 → Torso 방향. 거꾸로 가는 방향은 없어서 같은 축의 방향으로 바꾼다.
const DIRECTIONS = { TD: 'down', TB: 'down', LR: 'right', RL: 'right', BT: 'down' };
const REVERSED = new Set(['RL', 'BT']);

// 노드 모양: [여는 글, 닫는 글, 카드 종류, 상자로 바꿨는지]. 긴 여는 글을 먼저 본다.
const SHAPES = [
  ['(((', ')))', 'circle', true],
  ['((', '))', 'circle', false],
  ['([', '])', 'box', true],
  ['[(', ')]', 'store', false],
  ['[[', ']]', 'box', true],
  ['[/', '/]', 'box', true],
  ['[/', '\\]', 'box', true],
  ['[\\', '\\]', 'box', true],
  ['[\\', '/]', 'box', true],
  ['{{', '}}', 'box', true],
  ['[', ']', 'box', false],
  ['(', ')', 'box', false],
  ['{', '}', 'decision', false],
  ['>', ']', 'box', true],
];

// 받지 않는 문장의 첫 낱말과 이유
const IGNORED = {
  classDef: 'style classes', class: 'style classes', style: 'styles', linkStyle: 'edge styles', click: 'click actions', accTitle: 'the accessibility title', accDescr: 'the accessibility description',
};

const ID = /^[\p{L}\p{N}_]+(?:-(?![->.=])[\p{L}\p{N}_]+)*/u;

// cost: time O(n), heap O(n), stack O(d)
// vars: n = 원본 글자 수, d = subgraph 깊이
// basis: estimate
/** 순서도 하나를 모형에 읽는다. */
export function readFlowchart({ head, lines }, model) {
  const word = head.text.split(/\s+/)[1]?.replace(/;$/, '');
  model.direction = direction(word, head.line, model) ?? 'down';
  const context = { model, stack: [], shaped: new Set(), dashed: new Map() };
  for (const { text, line } of lines) {
    for (const part of splitStatements(text)) readStatement(part, line, context);
  }
  for (const open of context.stack) skip(model, open.line, `subgraph "${open.label}" has no "end". It is closed at the end of the file`);
  // subgraph 이름을 선 끝으로 쓴 곳은 그 그룹을 가리킨다. 모양 없이 이름만 나온 같은 이름의 노드는 그룹이다.
  model.nodes = model.nodes.filter((node) => context.shaped.has(node.key) || !groupOf(model, node.key));
  applyDashes(context);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// `style id 속성들`. 점선(stroke-dasharray가 0이 아님)만 옮기고, 색과 굵기는 디자인 정본이 정하므로 알린다.
function readStyle(text, line, { model, dashed }) {
  const [, id, props = ''] = /^style\s+(\S+)\s*(.*)$/.exec(text) ?? [];
  if (!id) return skip(model, line, 'styles ("style") are not imported. Colors and sizes come from the design tokens');
  const entries = props.split(',').map((entry) => entry.split(':').map((part) => part.trim()));
  const dash = entries.find(([key]) => key === 'stroke-dasharray');
  if (dash && /[1-9]/.test(dash[1] ?? '')) dashed.set(id, line);
  if (entries.some(([key]) => key && key !== 'stroke-dasharray')) skip(model, line, `the colors and sizes in the style of "${id}" are not imported. They come from the design tokens`);
  return undefined;
}

// cost: time O(s·(k + g)), heap O(1), stack O(1)
// vars: s = 점선 style 수, k = 노드 수, g = 그룹 수
// basis: estimate
// 점선 style을 그룹(점선 테두리)과 상자(점선 윤곽의 외부 카드)에 붙인다. 다른 모양은 모양을 지키고 알린다.
function applyDashes({ model, dashed }) {
  for (const [id, line] of dashed) {
    const group = groupOf(model, id);
    const node = model.nodes.find((n) => n.key === id);
    if (group) group.dashed = true;
    else if (node?.kind === 'box') node.kind = 'external';
    else if (node) change(model, line, `the dashed outline of "${id}" is not drawn. Only a box becomes a dashed external card`);
    else skip(model, line, `the style of "${id}" is not imported. No node or subgraph has this id`);
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 방향 낱말을 읽는다. 거꾸로 가는 방향은 알리고 같은 축 방향으로 바꾼다. 없으면 undefined다.
function direction(word, line, model) {
  if (!word) return undefined;
  if (!Object.hasOwn(DIRECTIONS, word)) {
    skip(model, line, `the direction "${word}" is not imported. Directions are TD, TB, LR, RL, BT`);
    return undefined;
  }
  if (REVERSED.has(word)) change(model, line, `the direction ${word} is drawn as ${DIRECTIONS[word]}. A Torso graph flows right or down`);
  return DIRECTIONS[word];
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 줄 글자 수
// basis: estimate
// `;`로 나눈 문장들. 따옴표와 괄호 안의 `;`는 글자다.
function splitStatements(text) {
  const out = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    else if (!quoted && '[({'.includes(c)) depth++;
    else if (!quoted && '])}'.includes(c)) depth = Math.max(0, depth - 1);
    else if (!quoted && depth === 0 && c === ';') {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 문장 글자 수
// basis: estimate
// 문장 하나: subgraph, end, direction, 꾸밈 문장, 아니면 노드와 선
function readStatement(text, line, context) {
  const { model, stack } = context;
  const word = text.split(/\s+/)[0];
  if (word === 'subgraph') return openGroup(text.slice('subgraph'.length).trim(), line, context);
  if (text === 'end') {
    if (stack.pop()) return undefined;
    return skip(model, line, '"end" without a subgraph is not imported');
  }
  if (word === 'direction') {
    const value = direction(text.split(/\s+/)[1], line, model);
    if (value && stack.length) stack.at(-1).direction = value;
    else if (value) model.direction = value;
    return undefined;
  }
  if (word === 'style') return readStyle(text, line, context);
  if (Object.hasOwn(IGNORED, word.replace(/:$/, ''))) return skip(model, line, `${IGNORED[word.replace(/:$/, '')]} ("${word}") are not imported. Colors and sizes come from the design tokens`);
  return readChain(text, line, context);
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 글자 수
// basis: estimate
// `subgraph id [제목]`, `subgraph id["제목"]`, `subgraph "제목"`, `subgraph 제목`
function openGroup(rest, line, { model, stack }) {
  const titled = /^([^\s[]+)\s*\[(.*)\]$/.exec(rest);
  const key = titled ? titled[1] : unquote(rest) || `subgraph-${line}`;
  const label = textOf(model, unquote(titled ? titled[2] : rest), line) || key;
  const parent = stack.at(-1);
  const group = { key, label, parent: parent?.key, direction: parent?.direction ?? model.direction, line };
  model.groups.push(group);
  stack.push(group);
}

// cost: time O(n·k), heap O(n), stack O(1)
// vars: n = 문장 글자 수, k = 한 끝에 `&`로 묶은 노드 수
// basis: estimate
// 노드 목록과 선이 번갈아 오는 문장. `a & b --> c`는 두 선이다. 읽지 못하는 곳이 있으면 그 문장 전체를 건너뛴다.
function readChain(text, line, context) {
  const { model } = context;
  const cursor = { text, at: 0 };
  const parsed = [];
  let left = readNodes(cursor);
  if (!left) return skip(model, line, `"${text}" is not imported. It is not a node or an edge`);
  parsed.push({ nodes: left });
  while (rest(cursor)) {
    const link = readLink(cursor);
    const right = link && readNodes(cursor);
    if (!right) return skip(model, line, `"${text}" is not imported. The part "${rest(cursor) || text}" is not an edge to a node`);
    parsed.push({ link, nodes: right });
  }
  for (const step of parsed) for (const node of step.nodes) placeNode(node, line, context);
  for (let i = 1; i < parsed.length; i++) {
    for (const from of parsed[i - 1].nodes) for (const to of parsed[i].nodes) addEdge({ from: from.key, to: to.key, link: parsed[i].link, line }, model);
  }
  return undefined;
}

const rest = (cursor) => cursor.text.slice(cursor.at).trim();

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 남은 글자 수
// basis: estimate
// `&`로 묶은 노드 하나 이상. 못 읽으면 undefined다.
function readNodes(cursor) {
  const nodes = [];
  do {
    const node = readNode(cursor);
    if (!node) return undefined;
    nodes.push(node);
  } while (eat(cursor, /^\s*&\s*/));
  return nodes;
}

const eat = (cursor, pattern) => {
  const found = pattern.exec(cursor.text.slice(cursor.at));
  if (found) cursor.at += found[0].length;
  return found;
};

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 남은 글자 수
// basis: estimate
// 노드 하나: 이름, 모양과 라벨, `:::클래스`, `@{ ... }`. { key, label?, kind?, isBoxed?, styled?, extended? }다.
function readNode(cursor) {
  eat(cursor, /^\s*/);
  const id = eat(cursor, ID);
  if (!id) return undefined;
  const node = { key: id[0] };
  const after = cursor.text.slice(cursor.at);
  const shape = SHAPES.find(([open, close]) => after.startsWith(open) && closingAt(after, open, close) >= 0);
  if (shape) {
    const [open, close, kind, isBoxed] = shape;
    const end = closingAt(after, open, close);
    Object.assign(node, { label: after.slice(open.length, end), kind, isBoxed });
    cursor.at += end + close.length;
  } else if (after.startsWith('@{')) {
    const end = after.indexOf('}');
    cursor.at += end < 0 ? after.length : end + 1;
    node.extended = true;
  }
  if (eat(cursor, /^:::[\w-]+/)) node.styled = true;
  return node;
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 글자 수
// basis: estimate
// 모양을 닫는 글의 자리. 따옴표 라벨은 따옴표 뒤에서 찾는다. 없으면 -1이다.
function closingAt(text, open, close) {
  let from = open.length;
  if (text[from] === '"') {
    const quoteEnd = text.indexOf('"', from + 1);
    if (quoteEnd < 0) return -1;
    from = quoteEnd + 1;
  }
  return text.indexOf(close, from);
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 남은 글자 수
// basis: estimate
// 선 하나: 화살표 모양과 라벨. { label?, dashed, thick, head, odd, hidden }다. 못 읽으면 undefined다.
function readLink(cursor) {
  eat(cursor, /^\s*/);
  const texted = eat(cursor, /^([<ox])?(--|==|-\.)(?![->=.])\s*(.*?)\s*(-{2,}[>ox]|-{3,}|={2,}[>ox]|={3,}|\.-+[>ox]?)(?=[\s\p{L}\p{N}_]|$)/u);
  const plain = texted ?? eat(cursor, /^([<ox])?()()(-{2,}>|-{3,}|-{2,}[ox](?=\s)|={2,}>|={3,}|={2,}[ox](?=\s)|-\.+-[>ox]?|~~~)/);
  if (!plain) return undefined;
  const [, start = '', open, text, body] = plain;
  const end = body.at(-1);
  const hasEnd = '>ox'.includes(end) && body !== '~~~' && !(/^-\.+-$/.test(body));
  const piped = eat(cursor, /^\s*\|([^|]*)\|/);
  const kind = open || body;
  return {
    label: piped ? piped[1] : text,
    dashed: kind.includes('.'),
    thick: kind.startsWith('='),
    hidden: body === '~~~',
    odd: 'ox'.includes(start || '-') || (hasEnd && end !== '>'),
    head: start && hasEnd ? 'both' : hasEnd ? 'end' : 'none',
  };
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 카드 수
// basis: estimate
// 노드를 모형에 놓는다. 모양이 있으면 종류와 라벨을 바꾸고(나중 것이 이긴다), subgraph 안에서 처음 그룹을 얻는다.
function placeNode(found, line, { model, stack, shaped }) {
  const node = ensureNode(model, found.key, { line });
  if (found.kind) {
    node.kind = found.kind;
    node.label = textOf(model, unquote(found.label), line) || found.key;
    shaped.add(found.key);
    if (found.isBoxed) change(model, line, `the node shape of "${found.key}" is drawn as ${found.kind === 'circle' ? 'a circle' : 'a box'}`);
  }
  if (found.extended) change(model, line, `the shape data "@{ ... }" of "${found.key}" is not imported. The node is a box`);
  if (found.styled) skip(model, line, `the style class on "${found.key}" is not imported. Colors come from the design tokens`);
  if (node.parent === undefined && stack.length) node.parent = stack.at(-1).key;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선 하나를 모형에 더한다. 굵은 선과 원·엑스 끝은 Torso에 없어 보통 선으로 쓰고 알린다.
function addEdge({ from, to, link, line }, model) {
  if (link.hidden) return skip(model, line, `the invisible link ${from} ~~~ ${to} is not imported`);
  if (link.thick) change(model, line, `the thick edge ${from} -> ${to} is drawn as a normal edge. Torso has one edge weight`);
  if (link.odd) change(model, line, `the circle or cross end of ${from} -> ${to} is drawn as an arrowhead`);
  model.edges.push({ from: { key: from }, to: { key: to }, label: textOf(model, unquote(link.label ?? ''), line) || undefined, dashed: link.dashed, head: link.head, line });
  return undefined;
}
