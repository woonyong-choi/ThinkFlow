// 추적 카드 블록(`trace id "제목" [unit=ms] {` ... `}`)과 그 안의 구간 줄(`span id "이름" lane=카드 at=0 dur=100`)을 읽는다.
// 구간은 실제 시간(unit)으로 놓인다. 레인이 선언된 카드인지는 validate.js가 확인한다.
import { VALUES } from './grammar.js';
import { checkId, parentFor, rejectName, skipBlock } from './names.js';
import { readOptions } from './options.js';
import { isTinyNumber, parseNumber } from './values.js';
import { ID_PATTERN } from './words.js';

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 추적 카드를 연다. unit을 생략하면 ms다. */
export function readTrace({ tokens, line }, ctx) {
  const [, id, label, ...rest] = tokens;
  if (!checkId(id, { line, ctx }, ID_PATTERN)) {
    rejectName(id, ctx);
    skipBlock('trace', { id: id?.value, spans: [] }, { tokens, line }, ctx);
    return;
  }
  if (label?.type !== 'text' || rest.at(-1)?.type !== 'open') {
    ctx.problems.error(line, 'write trace as: trace id "title" [unit=ms] {');
    skipBlock('trace', { id: id.value, spans: [] }, { tokens, line }, ctx);
    return;
  }
  const found = readOptions(rest.slice(0, -1), { scopes: ['trace'], what: 'a trace', line, ctx });
  const card = { id: id.value, shape: 'trace', label: label.value, unit: found.unit ?? VALUES.traceUnit.default, spans: [], parent: parentFor(id, ctx), line };
  ctx.figure.nodes.push(card);
  ctx.block = { kind: 'trace', card, line };
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 추적 블록 안 줄. `}`면 닫고, 아니면 `span id "이름" lane=카드 at=시작 dur=길이`다. */
export function readSpanLine({ tokens, line, hasLexError }, ctx) {
  const { card } = ctx.block;
  if (tokens[0].type === 'close') {
    if (tokens.length > 1) ctx.problems.error(line, 'put "}" on its own line');
    ctx.block = undefined;
    return;
  }
  if (hasLexError || card.isRejected) return;
  const [head, id, label, ...rest] = tokens;
  const form = 'write a span as: span id "name" lane=card at=0 dur=100';
  if (head.value !== 'span' || id?.type !== 'word' || label?.type !== 'text') {
    ctx.problems.error(line, form);
    return;
  }
  if (!ID_PATTERN.test(id.value)) {
    ctx.problems.error(line, `"${id.value}" is not a valid name. Use lowercase letters and digits, joined by single "-", starting with a letter`);
    return;
  }
  const found = readOptions(rest, { scopes: ['span'], what: 'a span', line, ctx });
  const at = numberOf(found.at, { key: 'at', isZeroOk: true, line, ctx });
  const dur = numberOf(found.dur, { key: 'dur', isZeroOk: false, line, ctx });
  for (const key of ['lane', 'at', 'dur']) if (found[key] === undefined && !rest.some((t) => t.key === key)) ctx.problems.error(line, `a span needs ${key}=. ${form}`);
  if (card.spans.some((s) => s.id === id.value)) ctx.problems.error(line, `span "${id.value}" is already in trace "${card.id}"`);
  card.spans.push({ id: id.value, label: label.value, lane: found.lane, at, dur, line });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 숫자 선택 사항 하나. 0 이상(isZeroOk)이거나 0보다 크다. 틀리면 오류를 내고 undefined다.
function numberOf(text, { key, isZeroOk, line, ctx }) {
  if (text === undefined) return undefined;
  const number = isTinyNumber(text) ? undefined : parseNumber(text);
  const isOk = number !== undefined && (isZeroOk ? number >= 0 : number > 0);
  if (!isOk) ctx.problems.error(line, `${key} is ${isZeroOk ? 'a number of 0 or more' : 'a number above 0'}. Found "${text}"`);
  return isOk ? number : undefined;
}
