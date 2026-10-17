// Mermaid 클래스 그림(classDiagram) 읽기: 클래스와 멤버, 주석(<<interface>> 등), 관계와 양쪽 다중성, namespace(docs/design/import.md 클래스 그림).
import { change, ensureNode, skip, textOf } from './model.js';
import { MISSING_TEXT } from './names.js';
import { unquote } from './mermaid.js';

const DIRECTIONS = { TB: 'down', TD: 'down', BT: 'down', LR: 'right', RL: 'right' };
const VISIBILITY = { '+': 'public', '-': 'private', '#': 'protected', '~': 'package' };
const NAME = String.raw`[\p{L}\p{N}_]+(?:~[^~\s]*(?:~[^~\s]*)*~)?`;
// 관계: `A ["다중성"] 왼쪽끝 선 오른쪽끝 ["다중성"] B [: 글]`. 끝은 `<|`, `*`, `o`, `<`(왼쪽)와 `|>`, `*`, `o`, `>`(오른쪽), 선은 `--`(실선)과 `..`(점선)이다.
const RELATION = new RegExp(String.raw`^(${NAME})\s*(?:"([^"]*)"\s*)?(<\||\*|o|<)?(--|\.\.)(\|>|\*|o|>)?\s*(?:"([^"]*)"\s*)?(${NAME})\s*(?::\s*(.*))?$`, 'u');
const DECLARE = new RegExp(String.raw`^class\s+(${NAME})(?:\s*\["([^"]*)"\])?(?::::[\w-]+)?\s*(\{)?\s*(\})?$`, 'u');
const MEMBER_OF = new RegExp(String.raw`^(${NAME})\s*:\s*(.+)$`, 'u');
const ANNOTATION = /^<<\s*([\w-]+)\s*>>\s*(.*)$/;
const IGNORED = /^(classDef|cssClass|style|click|link|callback|accTitle|accDescr)\b/;

// cost: time O(n·c), heap O(n), stack O(1)
// vars: n = 줄 수, c = 클래스 수
// basis: estimate
/** 클래스 그림 하나를 모형에 읽는다. 기본 방향은 Mermaid와 같이 아래다. */
export function readClass({ lines }, model) {
  model.direction = 'down';
  const context = { model, open: undefined, namespace: undefined, isNoteBlock: false };
  for (const { text, line } of lines) readLine(text, line, context);
  if (context.open) skip(model, context.open.line, `the class "${context.open.label}" has no "}". It is closed at the end of the file`);
  for (const node of model.nodes) finishClass(node, model);
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 줄 글자 수
// basis: estimate
function readLine(text, line, context) {
  const { model } = context;
  if (context.open) return void readInside(text, line, context);
  if (text === '}') {
    if (context.namespace) context.namespace = undefined;
    else skip(model, line, '"}" without a class or namespace is not imported');
    return;
  }
  const word = text.split(/\s+/)[0];
  if (word === 'direction') {
    const value = DIRECTIONS[text.split(/\s+/)[1]];
    if (value) model.direction = value;
    else skip(model, line, `"${text}" is not imported. Directions are TB, TD, BT, LR, RL`);
    return;
  }
  if (word === 'namespace') return void openNamespace(text, line, context);
  if (/^note\b/.test(word)) return void skip(model, line, 'the note is not imported. A Torso class has no notes');
  if (IGNORED.test(word)) return void skip(model, line, `"${word}" is not imported. Colors, links, and accessibility text are not part of a Torso class`);
  const annotation = ANNOTATION.exec(text);
  if (annotation) {
    if (!annotation[2]) return void skip(model, line, `the annotation "<<${annotation[1]}>>" outside a class is not imported. Write it as <<${annotation[1]}>> ClassName`);
    return void annotate(classOf(annotation[2].trim(), line, context), annotation[1], line);
  }
  const declared = DECLARE.exec(text);
  if (declared) {
    const node = classOf(declared[1], line, context);
    if (declared[2] !== undefined) node.label = textOf(model, unquote(declared[2]), line) || node.label;
    if (/:::/.test(text)) skip(model, line, 'the style class (":::") is not imported. Colors come from the design tokens');
    if (declared[3] && !declared[4]) context.open = node;
    return;
  }
  const relation = RELATION.exec(text);
  if (relation) return void readRelation(relation, line, context);
  const member = MEMBER_OF.exec(text);
  if (member) return void classOf(member[1], line, context).rawMembers.push({ text: member[2].trim(), line });
  skip(model, line, `"${text}" is not imported. It is not a Mermaid class, member, or relationship`);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 클래스 블록 안의 줄: 닫는 `}`, 주석, 멤버
function readInside(text, line, context) {
  const node = context.open;
  if (text === '}') {
    context.open = undefined;
    return;
  }
  const annotation = ANNOTATION.exec(text);
  if (annotation && !annotation[2]) annotate(node, annotation[1], line);
  else node.rawMembers.push({ text, line });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// `namespace 이름 {`. namespace는 그룹이고 중첩하지 않는다(Mermaid도 중첩하지 않는다).
function openNamespace(text, line, context) {
  const named = /^namespace\s+([\p{L}\p{N}_.-]+)\s*\{?$/u.exec(text);
  if (!named) return void skip(context.model, line, `"${text}" is not imported. Write it as namespace Name {`);
  const group = { key: `namespace:${named[1]}`, name: named[1], label: named[1], line };
  context.model.groups.push(group);
  context.namespace = group;
}

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 클래스 수
// basis: estimate
// 이름으로 클래스 카드를 찾거나 만든다. 제네릭(`Shape~T~`)은 이름에서 떼어 보이는 이름에 `Shape<T>`로 둔다. namespace 안에서 처음 나온 클래스는 그 그룹에 든다.
function classOf(raw, line, { model, namespace }) {
  const tilde = raw.indexOf('~');
  const key = tilde < 0 ? raw : raw.slice(0, tilde);
  const node = ensureNode(model, key, { kind: 'class', classifier: 'class', members: [], rawMembers: [], line, parent: namespace?.key });
  if (tilde >= 0) node.label = `${key}${generic(raw.slice(tilde))}`;
  return node;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 클래스 주석. interface와 abstract는 Torso에 같은 뜻이 있고, enumeration은 enum 상자, 나머지는 그리지 않는다.
function annotate(node, word, line) {
  node.annotation = { word: word.toLowerCase(), line };
}

// cost: time O(m), heap O(m), stack O(1)
// vars: m = 멤버 수
// basis: estimate
// 모은 멤버 줄을 주석에 맞춰 읽는다. enumeration은 DBML enum과 같은 상자(`box id "이름" "enum" { text "값" mono }`)다.
function finishClass(node, model) {
  const word = node.annotation?.word;
  if (word === 'enumeration' || word === 'enum') {
    Object.assign(node, { kind: 'box', sub: 'enum', texts: node.rawMembers.map((m) => textOf(model, m.text, m.line)).filter(Boolean) });
    return;
  }
  if (word === 'interface') node.classifier = 'interface';
  else if (word === 'abstract') node.abstract = true;
  else if (word) change(model, node.annotation.line, `the annotation "<<${word}>>" of "${node.label}" is not drawn. Torso marks interface and abstract only`);
  for (const { text, line } of node.rawMembers) {
    const member = readMember(text, line, model);
    if (member) node.members.push(member);
  }
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 멤버 글자 수
// basis: estimate
// 멤버 한 줄. 메서드는 `[보임]이름(매개변수)[*|$] [반환 타입]`, 필드는 `[보임][타입 ]이름[$]`이나 `[보임]이름: 타입`이다.
// `*`는 추상, `$`는 정적이다. 타입이 없는 필드는 Torso 필드에 타입이 있어야 해서 `…`를 쓰고 알린다.
function readMember(raw, line, model) {
  const visibility = VISIBILITY[raw[0]];
  const text = visibility ? raw.slice(1).trim() : raw;
  const method = /^([^\s(]+)\s*\(([^)]*)\)\s*([*$]{0,2})\s*(.*)$/.exec(text);
  if (method) {
    const [, name, params, marks, returns] = method;
    const signature = `(${generic(params.trim())})${returns.trim() ? `: ${generic(returns.trim())}` : ''}`;
    return { kind: 'method', name, signature, visibility, isStatic: marks.includes('$'), isAbstract: marks.includes('*'), line };
  }
  const colon = /^([^\s:]+)\s*:\s*(.+)$/.exec(text);
  const spaced = /^(?:(.+?)\s+)?(\S+)$/.exec(text);
  const [rawName, rawType] = colon ? [colon[1], colon[2]] : [spaced[2], spaced[1]];
  const mark = /[$*]$/.exec(colon ? rawType : rawName)?.[0];
  const strip = (part) => (part && mark && part.endsWith(mark) ? part.slice(0, -1).trim() : part);
  const [name, type] = colon ? [rawName, strip(rawType)] : [strip(rawName), rawType];
  if (!type) change(model, line, `the field "${name}" has no type, so "${MISSING_TEXT}" is written. Write its type in place of it`);
  if (mark === '*') change(model, line, `the field "${name}" is marked abstract, which only a method can be. The mark is not drawn`);
  return { kind: 'field', name, signature: type ? generic(type) : MISSING_TEXT, visibility, isStatic: mark === '$', line };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** Mermaid 제네릭 표기 `List~List~int~~`를 `List<List<int>>`로 바꾼다. 뒤에 낱말 글자가 오는 `~`는 열고, 아니면 닫는다. */
export function generic(text) {
  return text.replace(/~/g, (_, at) => (/[\p{L}\p{N}_?]/u.test(text[at + 1] ?? '') ? '<' : '>'));
}

// 관계 끝 표기의 뜻. 화살촉이 가리키는 쪽이 부모(상속·실현), 전체(합성·집합), 대상(연관·의존)이다.
const HEAD_KIND = { '<|': 'parent', '|>': 'parent', '*': 'whole', o: 'whole', '<': 'target', '>': 'target' };

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 클래스 수
// basis: estimate
// 관계 하나. Torso 선은 자식 → 부모, 전체 → 부분, 출발 → 대상으로 쓰므로 표기에 따라 두 끝을 정한다.
function readRelation([, rawA, multA, leftEnd, line_, rightEnd, multB, rawB, label = ''], line, context) {
  const { model } = context;
  const a = classOf(rawA, line, context);
  const b = classOf(rawB, line, context);
  const isDashed = line_ === '..';
  let end = rightEnd;
  let isFromA = true;
  if (leftEnd && rightEnd) {
    if (leftEnd === '<' && rightEnd === '>') end = 'both';
    else change(model, line, `the two-ended relation ${leftEnd}${line_}${rightEnd} is drawn with its right end only. A Torso relation has one kind`);
  } else if (leftEnd) {
    end = leftEnd;
    isFromA = false;
  }
  const kind = end === 'both' ? 'target' : HEAD_KIND[end];
  // 합성과 집합은 마름모가 붙은 쪽(전체)에서 나간다. 화살촉이 붙은 쪽은 선이 닿는 쪽이다.
  if (kind === 'whole') isFromA = !isFromA;
  const [from, to] = isFromA ? [a, b] : [b, a];
  const [multFrom, multTo] = isFromA ? [multA, multB] : [multB, multA];
  const edge = { from: { key: from.key }, to: { key: to.key }, label: textOf(model, unquote(label), line) || undefined, line };
  edge.relation = relationOf(kind, end, isDashed);
  if (!kind) edge.head = 'none';
  if (end === 'both') edge.head = 'both';
  if (!kind && isDashed) edge.dashed = true;
  if (multFrom !== undefined || multTo !== undefined) edge.mult = multiplicity(multFrom, multTo, line, model);
  model.edges.push(edge);
}

// Torso 다중성 꼴: 0 이상의 정수, `*`, `0..1`·`1..*` 같은 범위(src/source의 다중성 규칙)
const MULTIPLICITY = /^(\d+|\*)(?:\.\.(\d+|\*))?$/;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 양쪽 다중성. Mermaid 다중성은 아무 글이라 `n`, `many`는 `*`로 읽고, 한쪽만 있으면 다른 쪽은 `*`다. 꼴이 맞지 않으면 다중성 없이 쓴다.
function multiplicity(rawFrom, rawTo, line, model) {
  const read = (raw) => (raw === undefined || raw.trim() === '' ? '*' : raw.trim().replace(/\b(?:n|N|many|Many)\b/g, '*'));
  const mult = { from: read(rawFrom), to: read(rawTo) };
  if (!MULTIPLICITY.test(mult.from) || !MULTIPLICITY.test(mult.to)) {
    change(model, line, `the cardinality "${rawFrom ?? ''}" to "${rawTo ?? ''}" is not drawn. A cardinality is a number, *, or a range such as 0..1 or 1..*`);
    return undefined;
  }
  if ((rawFrom === undefined) !== (rawTo === undefined)) change(model, line, 'a relation with cardinality on one end only is drawn with "*" on the other end. Torso writes both ends');
  else if (mult.from !== rawFrom.trim() || mult.to !== rawTo.trim()) change(model, line, `the cardinality "${rawFrom}" to "${rawTo}" is written as "${mult.from}" to "${mult.to}"`);
  return mult;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 끝 표기와 선 모양 → Torso 관계 종류
function relationOf(kind, end, isDashed) {
  if (kind === 'parent') return isDashed ? 'realization' : 'inheritance';
  if (kind === 'whole') return end === '*' ? 'composition' : 'aggregation';
  return isDashed && kind ? 'dependency' : 'association';
}
