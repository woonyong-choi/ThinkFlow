// Mermaid 순서 그림(sequenceDiagram) 읽기: 참여자, 메시지, 메모, 활성 구간, alt·loop·opt·par 구획(docs/design/import.md 순서 그림).
import { change, ensureNode, skip, textOf } from './model.js';
import { unquote } from './mermaid.js';

// 화살표 → 점선 여부와 바꿔 그린 끝. 긴 것을 먼저 본다.
const ARROWS = ['<<-->>', '<<->>', '-->>', '->>', '--x', '-x', '--)', '-)', '-->', '->'];
const MESSAGE = new RegExp(`^(.+?)\\s*(${ARROWS.map((a) => a.replace(/[()]/g, '\\$&')).join('|')})\\s*([+-]?)\\s*([^:]+?)\\s*(?::(.*))?$`);
// 구획을 여는 낱말과 Torso 구획 종류. 같은 구획 안의 대안을 여는 낱말
const FRAGMENTS = { alt: 'alt', loop: 'loop', opt: 'opt', par: 'par' };
const BRANCHES = { else: 'alt', and: 'par' };
// 구획 없이 안의 줄만 옮기는 블록
const FLATTENED = { critical: 'critical', break: 'break', rect: 'rect', box: 'box' };
// 참여자 종류(@{ "type": ... })
const PARTICIPANT_KINDS = { database: 'store', actor: 'person' };

// cost: time O(n·p), heap O(n), stack O(1)
// vars: n = 줄 수, p = 참여자 수
// basis: estimate
/** 순서 그림 하나를 모형에 읽는다. */
export function readSequence({ head, lines }, model) {
  const context = { model, top: [], stack: [], pending: { create: new Set(), destroy: new Set() } };
  model.sequence = { participants: [], steps: context.top, line: head.line };
  for (const { text, line } of lines) readLine(text, line, context);
  for (const open of context.stack) skip(model, open.line, `the "${open.word}" block has no "end". It is closed at the end of the file`);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 지금 단계를 넣을 목록. 구획 안이면 그 대안의 목록이다.
const steps = (context) => context.stack.findLast((entry) => entry.branch)?.branch.steps ?? context.top;

// cost: time O(n + p), heap O(n), stack O(1)
// vars: n = 줄 글자 수, p = 참여자 수
// basis: estimate
function readLine(text, line, context) {
  const { model } = context;
  const word = text.split(/\s+/)[0];
  const tail = text.slice(word.length).trim();
  if (word === 'participant' || word === 'actor') return declare(word, tail, line, context);
  if (word === 'create' && /^(participant|actor)\s/.test(tail)) {
    const [kind, ...name] = tail.split(/\s+/);
    const key = declare(kind, name.join(' '), line, context);
    if (key) context.pending.create.add(key);
    return undefined;
  }
  if (word === 'destroy') return void context.pending.destroy.add(participant(tail, line, context));
  if (word === 'title') return void (model.title = textOf(model, tail, line));
  if (Object.hasOwn(FRAGMENTS, word)) return openFragment(word, tail, line, context);
  if (Object.hasOwn(BRANCHES, word)) return nextBranch(word, tail, line, context);
  if (word === 'option') return nextBranch('option', tail, line, context);
  if (Object.hasOwn(FLATTENED, word)) {
    change(model, line, `the ${word} block is not drawn. Its messages are imported in order`);
    return void context.stack.push({ word, line });
  }
  if (word === 'end') return closeBlock(line, context);
  if (word === 'activate' || word === 'deactivate') return void steps(context).push({ type: word, key: participant(tail, line, context), line });
  if (/^note$/i.test(word)) return readNote(tail, line, context);
  if (word === 'autonumber') return skip(model, line, 'autonumber is not imported. Torso numbers edges with no=, not messages');
  if (/^(accTitle|accDescr|links?|properties|details)\b/.test(word)) return skip(model, line, `"${word}" is not imported`);
  const message = MESSAGE.exec(text);
  if (message) return readMessage(message, line, context);
  return skip(model, line, `"${text}" is not imported. It is not a Mermaid sequence statement`);
}

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 참여자 수
// basis: estimate
// `participant A [as 이름]`, `actor A [as 이름]`, `participant A@{ "type": "database" }`. 참여자 이름(key)을 돌려준다.
function declare(word, tail, line, context) {
  const { model } = context;
  const data = /@\{(.*)\}/.exec(tail);
  const bare = tail.replace(/@\{.*\}/, '').trim();
  const [, name, alias] = /^(.+?)(?:\s+as\s+(.+))?$/.exec(bare) ?? [];
  if (!name) return skip(model, line, `"${word}" needs a name`);
  let kind = word === 'actor' ? 'person' : 'box';
  if (data) {
    const type = /"type"\s*:\s*"(\w+)"/.exec(data[1])?.[1];
    kind = PARTICIPANT_KINDS[type] ?? kind;
    if (type && !PARTICIPANT_KINDS[type] && type !== 'participant') change(model, line, `the participant type "${type}" is drawn as a box`);
  }
  const key = unquote(name);
  const node = ensureNode(model, key, { line });
  node.kind = kind;
  node.label = textOf(model, unquote(alias ?? name), line) || key;
  if (!model.sequence.participants.includes(key)) model.sequence.participants.push(key);
  return key;
}

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 참여자 수
// basis: estimate
// 이름으로 참여자를 찾고, 없으면 상자 참여자로 만든다(Mermaid도 메시지에 처음 나온 이름을 참여자로 만든다).
function participant(raw, line, { model }) {
  const key = unquote(raw.trim());
  ensureNode(model, key, { line, label: key });
  if (!model.sequence.participants.includes(key)) model.sequence.participants.push(key);
  return key;
}

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 참여자 수
// basis: estimate
// 메시지 하나. `+`는 받는 쪽 활성, `-`는 보내는 쪽 비활성이다. 바로 앞 `create`, `destroy`가 가리킨 참여자의 생성과 소멸을 붙인다.
function readMessage([, rawFrom, arrow, mark, rawTo, rawText = ''], line, context) {
  const { model, pending } = context;
  const from = participant(rawFrom, line, context);
  const to = participant(rawTo, line, context);
  if (arrow.startsWith('<<')) change(model, line, `the two-way message ${rawFrom.trim()} ${arrow} ${rawTo.trim()} is drawn one way`);
  else if (/[x)]$/.test(arrow)) change(model, line, `the arrow ${arrow} is drawn as a message arrow`);
  const message = { type: 'message', from, to, text: textOf(model, unquote(rawText), line), dashed: arrow.startsWith('--') || arrow.startsWith('<<--'), line };
  if (pending.create.delete(to)) message.create = true;
  if (pending.destroy.delete(to)) message.destroy = true;
  if (pending.destroy.has(from)) {
    skip(model, line, `destroy ${model.nodes.find((n) => n.key === from).label} on a message it sends is not imported. Torso ends the receiver's lifeline`);
    pending.destroy.delete(from);
  }
  const list = steps(context);
  list.push(message);
  if (mark === '+') list.push({ type: 'activate', key: to, line });
  if (mark === '-') list.push({ type: 'deactivate', key: from, line });
}

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 참여자 수
// basis: estimate
// `Note right of A: 글`, `Note left of A: 글`, `Note over A[, B]: 글`
function readNote(tail, line, context) {
  const note = /^(?:right of|left of|over)\s+([^:]+?)\s*:(.*)$/i.exec(tail);
  if (!note) return skip(context.model, line, 'this note is not imported. Write it as Note right of A: text');
  const keys = note[1].split(',').map((name) => participant(name, line, context));
  steps(context).push({ type: 'note', keys, text: textOf(context.model, unquote(note[2]), line), line });
  return undefined;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function openFragment(word, tail, line, context) {
  const branch = { label: textOf(context.model, tail, line), steps: [], line };
  const fragment = { type: 'fragment', kind: FRAGMENTS[word], title: branch.label, branches: [branch], line };
  steps(context).push(fragment);
  context.stack.push({ word, line, fragment, branch });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// `else`, `and`는 열린 구획의 다음 대안이다. `option`(critical의 대안)은 구획 없이 이어 옮긴다.
function nextBranch(word, tail, line, context) {
  const { model, stack } = context;
  const open = stack.at(-1);
  if (word === 'option' && open?.word === 'critical') return undefined;
  if (!open?.fragment || open.fragment.kind !== BRANCHES[word]) return skip(model, line, `"${word}" outside ${BRANCHES[word] ?? 'critical'} is not imported`);
  open.branch = { label: textOf(model, tail, line), steps: [], line };
  open.fragment.branches.push(open.branch);
  return undefined;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function closeBlock(line, { model, stack }) {
  if (!stack.pop()) skip(model, line, '"end" without an open block is not imported');
}
