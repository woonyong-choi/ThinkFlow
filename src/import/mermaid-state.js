// Mermaid 상태 그림(stateDiagram, stateDiagram-v2) 읽기: 상태, 전이와 사건, 처음·끝 상태, 묶은 상태, 갈림길(docs/design/import.md 상태 그림).
import { change, ensureNode, groupOf, skip, textOf } from './model.js';
import { unquote } from './mermaid.js';

const TRANSITION = /^(.+?)\s*-->\s*(.+?)\s*(?::(.*))?$/;
const DIRECTIONS = { TB: 'down', TD: 'down', BT: 'down', LR: 'right', RL: 'right' };
const START = '[*]';

// cost: time O(n + t·g), heap O(n), stack O(d)
// vars: n = 줄 수, t = 전이 수, g = 묶은 상태 수, d = 묶음 깊이
// basis: estimate
/** 상태 그림 하나를 모형에 읽는다. */
export function readState({ lines }, model) {
  model.direction = 'down';
  const context = { model, stack: [], transitions: [], inNote: undefined };
  for (const { text, line } of lines) readLine(text, line, context);
  if (context.inNote) skip(model, context.inNote, 'the note has no "end note". The rest of the file is part of it');
  for (const open of context.stack) skip(model, open.line, `the composite state "${open.label}" has no "}". It is closed at the end of the file`);
  // 묶음으로 선언되기 전에 이름이 나와 상태로 만든 카드는 그 묶음이다.
  model.nodes = model.nodes.filter((node) => !groupOf(model, node.key));
  model.starts = model.starts.flatMap((start) => intoGroup(start, model));
  model.finals = model.finals.filter(({ key, line }) => !groupOf(model, key) || void skip(model, line, `the composite state "${key}" as a final state is not imported`));
  for (const transition of context.transitions) placeTransition(transition, model);
}

// cost: time O(g), heap O(1), stack O(1)
// vars: g = 묶은 상태 수
// basis: estimate
// 처음 상태가 묶음이면 그 묶음의 처음 상태로 바꾼다.
function intoGroup(start, model) {
  const group = groupOf(model, start.key);
  if (!group) return [start];
  if (!group.initial) return void skip(model, start.line, `the start "${group.label}" is not imported. The composite state has no [*] start inside`) ?? [];
  return [{ key: group.initial, line: start.line }];
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 줄 글자 수
// basis: estimate
function readLine(text, line, context) {
  const { model, stack } = context;
  if (context.inNote) {
    if (/^end\s+note$/i.test(text)) context.inNote = undefined;
    return undefined;
  }
  if (text === '}') {
    if (!stack.pop()) skip(model, line, '"}" without a composite state is not imported');
    return undefined;
  }
  const word = text.split(/\s+/)[0];
  if (/^note$/i.test(word)) {
    if (!text.includes(':')) context.inNote = line;
    return skip(model, line, 'the note is not imported. A Torso state has no notes');
  }
  if (word === 'state') return readStateLine(text.slice(5).trim(), line, context);
  if (word === 'direction') {
    const value = DIRECTIONS[text.split(/\s+/)[1]];
    if (value && stack.length) stack.at(-1).direction = value;
    else if (value) model.direction = value;
    return undefined;
  }
  if (text === '--') return skip(model, line, 'the concurrent region "--" is not imported. Its states stay in one composite state');
  if (/^(classDef|class|style|hide|accTitle|accDescr)\b/.test(word)) return skip(model, line, `"${word}" is not imported. Colors and sizes come from the design tokens`);
  const transition = TRANSITION.exec(text);
  if (transition) return readTransition(transition, line, context);
  const described = /^([^:\s]+)\s*:\s*(.+)$/.exec(text);
  if (described) {
    mention(cleanKey(described[1], line, context), line, context);
    return skip(model, line, `the description of "${described[1]}" is not imported. A Torso state shows its name`);
  }
  if (/^[\w-]+$/.test(text)) return void mention(cleanKey(text, line, context), line, context);
  return skip(model, line, `"${text}" is not imported. It is not a Mermaid state statement`);
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 글자 수
// basis: estimate
// `state 이름 {`, `state "글" as 이름 [{]`, `state 이름 <<choice|fork|join>>`, `state 이름 : 설명`
function readStateLine(rest, line, context) {
  const { model, stack } = context;
  const opens = rest.endsWith('{');
  const body = opens ? rest.slice(0, -1).trim() : rest;
  const aliased = /^"([^"]*)"\s+as\s+(\S+)$/.exec(body) ?? /^(\S+)\s+as\s+"([^"]*)"$/.exec(body)?.slice(0, 3).reverse();
  const special = /^(\S+)\s+<<(\w+)>>$/.exec(body);
  const described = /^(\S+)\s*:\s*(.+)$/.exec(body);
  const key = cleanKey(aliased ? aliased[2] : special ? special[1] : described ? described[1] : body, line, context);
  const label = aliased ? textOf(model, aliased[1], line) : undefined;
  if (opens) {
    model.groups.push({ key, label: label || key, parent: stack.at(-1)?.key, direction: stack.at(-1)?.direction ?? model.direction, line });
    stack.push(groupOf(model, key));
    return;
  }
  const node = mention(key, line, context);
  if (label) node.label = label;
  if (special?.[2] === 'choice') node.kind = 'decision';
  else if (special) change(model, line, `the ${special[2]} state "${key}" is drawn as a state`);
  if (described) skip(model, line, `the description of "${key}" is not imported. A Torso state shows its name`);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 이름 뒤 `:::클래스`를 떼고 알린다.
function cleanKey(raw, line, { model }) {
  const [key, style] = unquote(raw).split(':::');
  if (style !== undefined) skip(model, line, `the style class on "${key}" is not imported. Colors come from the design tokens`);
  return key.trim();
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 상태 수
// basis: estimate
// 이름이 나온 상태. 처음 나온 묶음 안에 놓는다. 묶은 상태 자신의 이름이면 카드를 만들지 않는다.
function mention(key, line, { model, stack }) {
  if (groupOf(model, key)) return groupOf(model, key);
  const node = ensureNode(model, key, { kind: 'state', line });
  if (node.parent === undefined && stack.length) node.parent = stack.at(-1).key;
  return node;
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 상태 수
// basis: estimate
// 전이 하나. `[*]`는 처음·끝 상태이고, 묶은 상태 안의 `[*]`는 그 묶음으로 들어오는 전이가 닿을 상태를 정한다.
function readTransition([, rawFrom, rawTo, event], line, context) {
  const { model, stack } = context;
  const inside = stack.at(-1);
  const [from, to] = [cleanKey(rawFrom, line, context), cleanKey(rawTo, line, context)];
  if (from === START && to === START) return skip(model, line, '[*] --> [*] is not imported');
  if ((from === START || to === START) && event?.trim()) skip(model, line, `the event "${event.trim()}" on a start or end transition is not imported. The start dot and the end ring take no label`);
  if (from === START) {
    mention(to, line, context);
    if (inside) inside.initial ??= to;
    else model.starts.push({ key: to, line });
    return undefined;
  }
  if (to === START) {
    mention(from, line, context);
    if (inside) skip(model, line, `the end of the composite state "${inside.label}" is not imported. A final state is drawn only at the top level`);
    else model.finals.push({ key: from, line });
    return undefined;
  }
  mention(from, line, context);
  mention(to, line, context);
  context.transitions.push({ from, to, label: textOf(model, event ?? '', line) || undefined, line });
  return undefined;
}

// cost: time O(g), heap O(1), stack O(1)
// vars: g = 묶은 상태 수
// basis: estimate
// 전이를 선으로 놓는다. Torso 그룹은 전이의 끝이 될 수 없어서, 묶음으로 들어오는 전이는 그 묶음의 처음 상태로 보내고 묶음에서 나가는 전이는 건너뛴다.
function placeTransition({ from, to, label, line }, model) {
  const group = groupOf(model, from);
  if (group) return skip(model, line, `the transition from the composite state "${group.label}" is not imported. A transition starts at a state`);
  const target = groupOf(model, to);
  let end = to;
  if (target) {
    if (!target.initial) return skip(model, line, `the transition into the composite state "${target.label}" is not imported. It has no [*] start inside`);
    change(model, line, `the transition into "${target.label}" goes to its start state "${target.initial}"`);
    end = target.initial;
  }
  model.edges.push({ from: { key: from }, to: { key: end }, label, line });
  return undefined;
}
