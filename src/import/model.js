// 가져오기의 공통 모형. Mermaid, DBML, D2 읽기는 모두 이 모형을 채우고, 원본 글은 emit.js 한 곳이 쓴다.
// 그래서 같은 뜻(카드, 그룹, 선, 외래 키, 메시지, 차트 행)은 형식과 상관없이 같은 Torso 문법 하나로 옮겨진다(docs/design/import.md 공통 모형).
import { createProblems } from '../source/problems.js';
import { cleanText } from './names.js';

/**
 * 빈 모형과 진단 그릇을 만든다. 카드와 그룹은 원본의 이름(key)으로 가리키고, Torso 이름은 쓸 때 정한다.
 * - groups: { key, name?, label, parent?, direction?, dashed?, line }[]. name은 이름(id)을 만들 글이고 없으면 key다. dashed는 점선 테두리다
 * - nodes: { key, kind, label, sub?, parent?, columns?, keys?, foreignKeys?, texts?, slots?, classifier?, abstract?, members?, line }[]. kind는 box, external, circle, store, person, decision, queue, state, table, class다. 점선 테두리 상자는 external이다.
 *   class의 classifier는 class나 interface, members는 { kind: field|method, name, signature, visibility?, isStatic?, isAbstract?, line }[]다
 * - edges: { from: { key, part? }, to: { key, part? }, label?, dashed?, head?, mult?: { from, to }, line }[]
 * - starts, finals: { key, line }[]
 * - sequence: { participants: key[], steps } | undefined. steps는 emit-sequence.js가 정한다
 * - chart: { kind, title, rows: { label, value, line }[], line } | undefined
 * @param text 가져올 원본 글. 진단의 기본 column을 구하는 데 쓴다
 */
export function createModel(text) {
  return {
    title: undefined,
    direction: undefined,
    groups: [],
    nodes: [],
    edges: [],
    starts: [],
    finals: [],
    sequence: undefined,
    chart: undefined,
    problems: createProblems(text),
  };
}

/** 받지 않아 건너뛴 문장의 경고 code */
export const SKIP = 'import-skip';
/** 받았지만 모양이나 글을 바꿔 옮긴 문장의 경고 code */
export const CHANGE = 'import-change';
/** 가져올 수 없는 원본의 오류 code */
export const FAIL = 'import';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 건너뛴 문장 경고. 메시지는 `무엇 is not imported` 꼴로 끝에 이유를 붙인다. */
export const skip = (model, line, message) => model.problems.warn(line, message, { code: SKIP });

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 바꿔 옮긴 문장 경고 */
export const change = (model, line, message) => model.problems.warn(line, message, { code: CHANGE });

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 카드 수
// basis: estimate
/** key로 카드를 찾는다. */
export const nodeOf = (model, key) => model.nodes.find((n) => n.key === key);

// cost: time O(g), heap O(1), stack O(1)
// vars: g = 그룹 수
// basis: estimate
/** key로 그룹을 찾는다. */
export const groupOf = (model, key) => model.groups.find((g) => g.key === key);

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 카드 수
// basis: estimate
/** 카드가 없으면 만들고, 있으면 그대로 돌려준다. 늦게 알게 된 라벨과 모양은 부르는 쪽이 고친다. */
export function ensureNode(model, key, defaults) {
  const found = nodeOf(model, key);
  if (found) return found;
  const node = { key, kind: 'box', label: key, ...defaults };
  model.nodes.push(node);
  return node;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 다른 도구의 글을 Torso 글 한 줄로 고친다(names.js cleanText). 짝 없는 백틱을 지웠으면 알린다. */
export function textOf(model, raw, line) {
  const { text, isTickDropped } = cleanText(raw);
  if (isTickDropped) change(model, line, 'an unmatched backtick is removed from the text');
  return text;
}
