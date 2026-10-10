// 클래스와 인터페이스의 멤버 구획 및 관계를 읽는다.
import { flagNames } from './grammar.js';
import { checkId, parentFor, rejectName, skipBlock } from './names.js';
import { readOptions } from './options.js';
import { ID_PATTERN } from './words.js';

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 낱말 수
// basis: estimate
export function readClassifier({ tokens, line }, ctx) {
  const [head, id, label, ...tail] = tokens;
  if (!checkId(id, { line, ctx }, ID_PATTERN)) {
    rejectName(id, ctx);
    skipBlock('class', { id: id?.value, members: [] }, { tokens, line }, ctx);
    return;
  }
  if (label?.type !== 'text' || tail.at(-1)?.type !== 'open') {
    ctx.problems.error(line, `write ${head.value} as: ${head.value} ${id.value} "name" [abstract] {`);
    skipBlock('class', { id: id.value, members: [] }, { tokens, line }, ctx);
    return;
  }
  const flags = readFlags(tail.slice(0, -1), 'classifier', { line, ctx });
  const classifier = { id: id.value, shape: 'classifier', classifierKind: head.value, label: label.value, ...flags, members: [], parent: parentFor(id, ctx), line };
  ctx.figure.nodes.push(classifier);
  ctx.block = { kind: 'class', card: classifier, line };
}

// cost: time O(t + m), heap O(t), stack O(1)
// vars: t = 낱말 수, m = 앞서 선언한 멤버 수
// basis: estimate
export function readMember({ tokens, line }, ctx) {
  if (tokens[0].type === 'close') {
    if (tokens.length > 1) ctx.problems.error(line, 'put "}" on its own line');
    ctx.block = undefined;
    return;
  }
  const classifier = ctx.block.card;
  const [head, id, signature, ...tail] = tokens;
  if (!['field', 'method'].includes(head.value) || id?.type !== 'word' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id.value) || signature?.type !== 'text') {
    ctx.problems.error(line, 'write a member as: field id "type" or method id "(parameters): return type"');
    return;
  }
  const flags = readFlags(tail.filter((t) => t.type !== 'option'), 'member', { line, ctx });
  const options = readOptions(tail.filter((t) => t.type === 'option'), { scopes: ['member'], what: 'a member', line, ctx });
  if (head.value === 'method' && !/^\([^]*\)/.test(signature.value)) ctx.problems.error(line, 'a method signature starts with a parenthesized parameter list');
  if (head.value === 'field' && flags.abstract) ctx.problems.error(line, 'abstract belongs to methods and classifiers, not fields');
  if (classifier.members.some((m) => m.id === id.value)) ctx.problems.error(line, `member "${id.value}" is already in "${classifier.id}"`);
  classifier.members.push({ id: id.value, kind: head.value, signature: signature.value, ...flags, ...options, line });
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 낱말 수
// basis: estimate
function readFlags(tokens, scope, { line, ctx }) {
  const found = {};
  for (const token of tokens) {
    if (token.type !== 'word' || !flagNames(scope).includes(token.value)) ctx.problems.error(line, `${scope} takes ${flagNames(scope).join(', ')}. Found "${token.key ?? token.value}"`);
    else if (found[token.value]) ctx.problems.error(line, `"${token.value}" is written twice`);
    else found[token.value] = true;
  }
  return found;
}
