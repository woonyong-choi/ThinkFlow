// 값 선언과 값 바꾸기 식을 파일을 다 읽은 뒤 확인한다. 도형 이름, 참조 사슬, 식이 가리키는 값과 도형이 맞는지 본다.
import { CARD_SHAPES } from './grammar.js';
import { unknownName } from './problems.js';
import { NUMBER_PATTERN } from './words.js';

// cost: time O(v² + e·v), heap O(v), stack O(1)
// vars: v = 값 수, e = 식 수
// basis: estimate
/** 값 선언(놓일 도형, 참조 사슬), `on` 줄, 모든 이동과 흐름의 값 바꾸기 식을 확인한다. */
export function checkValues(figure, names, problems) {
  const byId = new Map(figure.values.map((v) => [v.id, v]));
  for (const value of figure.values.filter((v) => !v.queue)) checkDeclaration(value, { byId, names, figure }, problems);
  for (const { node, line } of figure.arrivals) if (!names.has(node) && !figure.rejectedNames.has(node)) problems.error(line, unknownName('node', node, names.keys()));
  if (!problems.errors.length) checkSets(figure, byId, problems);
}

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 값 수
// basis: estimate
// 값 하나: 놓일 도형이 카드를 쓰는 도형이고, 참조 대상이 있으며, 참조가 돌아 제자리로 오지 않는다.
function checkDeclaration(value, { byId, names, figure }, problems) {
  const target = names.get(value.on);
  if (value.on !== undefined && !target && !figure.rejectedNames.has(value.on)) problems.error(value.line, unknownName('node', value.on, figure.nodes.map((n) => n.id)));
  else if (target && !CARD_SHAPES.includes(target.shape)) problems.error(value.line, `a ${target.shape} has no card. Put a value on ${CARD_SHAPES.slice(0, 4).join(', ')}`);
  if (value.ref === undefined) return;
  if (!byId.has(value.ref)) problems.error(value.line, unknownName('value', value.ref, byId.keys()));
  else checkChain(value, byId, problems);
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 참조 사슬 길이
// basis: estimate
// 참조를 따라가다 처음 값으로 돌아오면 순환이다. 사슬 중간에 없는 값이 있으면 그 값의 선언 줄이 따로 알리므로 여기서는 멈춘다.
function checkChain(value, byId, problems) {
  const chain = [value.id];
  for (let next = value.ref; next !== undefined && byId.has(next); next = byId.get(next).ref) {
    if (chain.includes(next)) {
      problems.error(value.line, `value "${value.id}" refers to itself through ${[...chain, next].join(' -> ')}. A reference chain must end at a value with from=`);
      return;
    }
    chain.push(next);
  }
}

// cost: time O(e·v), heap O(v), stack O(1)
// vars: e = 식 수, v = 값 수
// basis: estimate
// 식마다: 참조 값에 쓰지 않고, @도형이 경로에서 하나로 정해지고, 낱말 값에 +, -를 쓰지 않는다.
function checkSets(figure, byId, problems) {
  const moves = movesOf(figure);
  const words = wordValues(moves, byId);
  for (const { sets, nodes } of moves) for (const e of sets) checkExpression(e, { nodes, byId, isWord: words.has(e.id) }, problems);
}

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 경로의 도형 수
// basis: estimate
// 식 하나. nodes는 경로의 도형 이름이고 `on` 줄의 식은 경로가 없다.
function checkExpression(e, { nodes, byId, isWord }, problems) {
  const { ref, queue } = byId.get(e.id);
  const visits = nodes.filter((n) => n === e.at).length;
  if (queue && !Number.isInteger(Number(e.operand))) problems.error(e.line, `"${e.id}" is a queue, so it counts filled slots in whole numbers. Found "${e.id}${e.op}${e.operand}"`);
  else if (ref !== undefined) problems.error(e.line, `"${e.id}" is a reference to "${ref}". Set "${ref}" instead, and "${e.id}" follows it`);
  else if (e.at !== undefined && visits === 0) problems.error(e.line, `@${e.at} is not on this path (${nodes.join(' -> ')}). A set applies where the dot reaches a node on its path`);
  else if (visits > 1) problems.error(e.line, `@${e.at} is ambiguous: the path (${nodes.join(' -> ')}) reaches it ${visits} times. Use an on line for the node, or a path that passes it once`);
  else if (e.op !== '=' && isWord) problems.error(e.line, `"${e.id}${e.op}${e.operand}" does a sum, but "${e.id}" holds a word. Use = for words`);
}

// cost: time O(s·h), heap O(h), stack O(1)
// vars: s = 단계 수, h = 단계의 이동과 흐름 수
// basis: estimate
/** 식이 있는 이동, 흐름, `on` 줄 모두. nodes는 경로의 도형 이름이다(칸 이름은 뗀다). `on` 줄은 nodes가 비어 있다. */
export function movesOf(figure) {
  const base = (id) => id.split('.')[0];
  return [
    ...figure.arrivals.map((a) => ({ sets: a.sets, nodes: [] })),
    ...figure.steps.flatMap((step) => [
      ...step.beats.flatMap((beat) => beat.hops.filter((h) => h.sets.length).map((h) => ({ sets: h.sets, nodes: [base(h.from), base(h.to)] }))),
      ...step.tracks.filter((t) => t.sets.length).map((t) => ({ sets: t.sets, nodes: t.path.map(base) })),
    ]),
  ];
}

// cost: time O(v·e), heap O(v), stack O(1)
// vars: v = 값 수, e = 식 수
// basis: estimate
// 낱말을 담는 값: 처음 값이 낱말이거나 낱말을 쓰는 식이 있는 값.
function wordValues(moves, byId) {
  const words = new Set([...byId.values()].filter((v) => v.ref === undefined && !NUMBER_PATTERN.test(v.from)).map((v) => v.id));
  for (const e of moves.flatMap((m) => m.sets)) if (e.op === '=' && !NUMBER_PATTERN.test(e.operand)) words.add(e.id);
  return words;
}
