// Mermaid 개체 관계 그림(erDiagram) 읽기: 개체와 속성, 관계와 양쪽 기수(docs/design/import.md 개체 관계 그림).
import { change, ensureNode, skip, textOf } from './model.js';
import { unquote } from './mermaid.js';

// 기수 표기 → 다중성. 왼쪽 표기와 오른쪽 표기는 거울 꼴이다.
const LEFT = { '|o': '0..1', '||': '1', '}o': '0..*', '}|': '1..*' };
const RIGHT = { 'o|': '0..1', '||': '1', 'o{': '0..*', '|{': '1..*' };
const NAME = String.raw`(?:"[^"]+"|[\p{L}\p{N}_-]+)(?:\[[^\]]*\])?`;
const RELATION = new RegExp(String.raw`^(${NAME})\s+(\|o|\|\||\}o|\}\|)(--|\.\.)(o\||\|\||o\{|\|\{)\s+(${NAME})\s*(?::\s*(.*))?$`, 'u');
const ENTITY = new RegExp(String.raw`^(${NAME})\s*(\{)?\s*(\})?$`, 'u');
const ATTRIBUTE = /^(\S+)\s+(\*?[\p{L}\p{N}_-]+)((?:\s+(?:PK|FK|UK)\s*,?)*)\s*(?:"([^"]*)")?$/u;

const DIRECTIONS = { TB: 'down', TD: 'down', BT: 'down', LR: 'right', RL: 'right' };

// cost: time O(n·e), heap O(n), stack O(1)
// vars: n = 줄 수, e = 개체 수
// basis: estimate
/** 개체 관계 그림 하나를 모형에 읽는다. 속성이 있는 개체는 테이블, 없는 개체는 상자다(Torso 테이블은 열이 하나 이상이다). */
export function readEr({ lines }, model) {
  model.direction = 'down';
  const context = { model, open: undefined };
  for (const { text, line } of lines) readLine(text, line, context);
  for (const node of model.nodes) {
    if (node.columns?.length) node.kind = 'table';
    else {
      delete node.columns;
      change(model, node.line, `the entity "${node.label}" has no attributes, so it is drawn as a box. A table needs a column`);
    }
  }
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 줄 글자 수
// basis: estimate
function readLine(text, line, context) {
  const { model } = context;
  if (context.open) {
    if (text === '}') context.open = undefined;
    else readAttribute(text, line, context);
    return;
  }
  const word = text.split(/\s+/)[0];
  if (word === 'direction') {
    model.direction = DIRECTIONS[text.split(/\s+/)[1]] ?? model.direction;
    return;
  }
  if (/^(classDef|class|style|accTitle|accDescr)\b/.test(word)) return void skip(model, line, `"${word}" is not imported`);
  const relation = RELATION.exec(text);
  if (relation) return void readRelation(relation, line, model);
  const entity = ENTITY.exec(text);
  if (entity) {
    const node = entityOf(entity[1], line, model);
    if (entity[2] && !entity[3]) context.open = node;
    return;
  }
  skip(model, line, `"${text}" is not imported. It is not a Mermaid entity or relationship`);
}

// cost: time O(e), heap O(1), stack O(1)
// vars: e = 개체 수
// basis: estimate
// 개체 이름(`CUSTOMER`, `"LINE ITEM"`, `p[Person]`). 대괄호 안은 보이는 이름이다.
function entityOf(raw, line, model) {
  const aliased = /^(.+?)\[(.*)\]$/.exec(raw);
  const key = unquote(aliased ? aliased[1] : raw);
  const node = ensureNode(model, key, { line, columns: [] });
  if (aliased) node.label = textOf(model, unquote(aliased[2]), line) || key;
  return node;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 속성 줄 `타입 이름 [PK|FK|UK, ...] ["설명"]`. FK는 가리키는 열이 없어 표시하지 않고, 설명은 Torso 열에 자리가 없다.
function readAttribute(text, line, { model, open }) {
  const attribute = ATTRIBUTE.exec(text);
  if (!attribute) return void skip(model, line, `the attribute "${text}" is not imported. Write it as: type name [PK|FK|UK] ["comment"]`);
  const [, type, name, keys = '', comment] = attribute;
  const marks = keys.split(/[\s,]+/).filter(Boolean);
  open.columns.push({ name: name.replace(/^\*/, ''), type, pk: marks.includes('PK'), unique: marks.includes('UK'), line });
  if (marks.includes('FK')) skip(model, line, `the FK mark on "${name}" is not imported. An ER attribute does not name the column it references; the relationship line shows the link`);
  if (comment) skip(model, line, `the comment on "${name}" is not imported. A column has no comment`);
}

// cost: time O(e), heap O(1), stack O(1)
// vars: e = 개체 수
// basis: estimate
// 관계 `A ||--o{ B : 글`. 왼쪽 표기가 A 쪽, 오른쪽 표기가 B 쪽 다중성이다. `..`은 식별하지 않는 관계라 점선이다.
function readRelation([, rawFrom, left, line_, right, rawTo, label = ''], line, model) {
  const from = entityOf(rawFrom, line, model);
  const to = entityOf(rawTo, line, model);
  model.edges.push({
    from: { key: from.key },
    to: { key: to.key },
    label: textOf(model, unquote(label), line) || undefined,
    dashed: line_ === '..',
    relation: 'association',
    mult: { from: LEFT[left], to: RIGHT[right] },
    line,
  });
}
