// 공통 모형의 순서 부분(model.sequence)을 순서 보기와 장면 하나로 쓴다(docs/design/import.md 순서 그림).
// 단계(steps)의 모양:
// - { type: 'message', from, to, text, dashed?, create?, destroy?, line }
// - { type: 'note', keys, text, line }: 바로 앞 메시지의 참여자 하나에 붙는 메모
// - { type: 'activate' | 'deactivate', key, line }
// - { type: 'fragment', kind: alt|loop|opt|par, title, branches: { label, steps, line }[], line }
import { change, nodeOf, skip } from './model.js';
import { MISSING_TEXT, quote } from './names.js';

const INDENT = '  ';

// cost: time O(s·p), heap O(s), stack O(d)
// vars: s = 단계 수, p = 참여자 수, d = 구획 깊이
// basis: estimate
/** 순서 보기 블록과 장면 줄. 참여자 순서는 처음 보내는 순서로 고친다(Torso 순서 보기 규칙). */
export function emitSequence(model, ids) {
  const { sequence } = model;
  const context = { model, ids, active: new Set() };
  const body = writeSteps(sequence.steps, context, { depth: 1, isTop: true });
  const order = participantOrder(sequence, body.senders);
  if (order.join(' ') !== sequence.participants.join(' ')) {
    change(model, sequence.line, `participants are listed in the order they first send: ${order.map((key) => nodeOf(model, key).label).join(', ')}`);
  }
  if (!body.lines.length) {
    skip(model, sequence.line, 'the sequence has no messages to play, so no scene is written');
    return ['', 'view sequence {', `${INDENT}${order.map((key) => ids.node.get(key)).join(' ')}`, '}'];
  }
  return ['', 'view sequence {', `${INDENT}${order.map((key) => ids.node.get(key)).join(' ')}`, '}', '', `scene ${quote(model.title ?? 'sequence')}`, ...body.lines];
}

// cost: time O(p²), heap O(p), stack O(1)
// vars: p = 참여자 수
// basis: estimate
// 처음 보내는 순서의 참여자, 보내지 않는 참여자는 적은 순서대로 뒤에
const participantOrder = (sequence, senders) => [...senders, ...sequence.participants.filter((key) => !senders.includes(key))];

// cost: time O(s·p), heap O(s), stack O(d)
// vars: s = 단계 수, p = 참여자 수, d = 구획 깊이
// basis: estimate
// 단계 목록을 줄로 쓴다. 메모와 활성 구간은 바로 앞 메시지 뒤(메모가 먼저)에 놓는다. 구획 안에는 활성 구간과 생성·소멸을 둘 수 없다.
function writeSteps(steps, context, { depth, isTop }) {
  const { model } = context;
  const lines = [];
  const senders = [];
  let beat;
  const flush = () => {
    if (beat) lines.push(...beat.lines, ...beat.notes, ...beat.acts);
    beat = undefined;
  };
  const pad = INDENT.repeat(depth);
  for (const step of steps) {
    if (step.type === 'message') {
      flush();
      beat = { message: step, lines: [`${pad}${messageLine(step, context, isTop)}`], notes: [], acts: [] };
      if (!senders.includes(step.from)) senders.push(step.from);
    } else if (step.type === 'note') {
      const line = noteLine(step, beat, context);
      if (line) beat.notes.push(`${pad}${line}`);
    } else if (step.type === 'activate' || step.type === 'deactivate') {
      const line = activationLine(step, beat, { ...context, isTop });
      if (line) beat.acts.push(`${pad}${line}`);
    } else {
      flush();
      const fragment = fragmentLines(step, context, depth);
      lines.push(...fragment.lines);
      for (const key of fragment.senders) if (!senders.includes(key)) senders.push(key);
    }
  }
  flush();
  return { lines, senders, hasMessage: lines.length > 0 };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 메시지 한 줄. 글이 없으면 빈 자리 표시를 넣고 알린다. 구획 안의 생성·소멸은 Torso가 받지 않아 뺀다.
function messageLine(step, { model, ids }, isTop) {
  let text = step.text;
  if (!text) {
    change(model, step.line, `a message needs text, so "${MISSING_TEXT}" is written. Write the message in place of it`);
    text = MISSING_TEXT;
  }
  const parts = [ids.node.get(step.from), '->', ids.node.get(step.to), quote(text)];
  if (step.dashed) parts.push('dashed');
  for (const flag of ['create', 'destroy']) {
    if (!step[flag]) continue;
    if (isTop) parts.push(flag);
    else skip(model, step.line, `${flag} inside a fragment is not imported. Create and destroy a participant outside alt, loop, opt, and par`);
  }
  return parts.join(' ');
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 메모가 가리킨 참여자 수
// basis: estimate
// 메모 한 줄. Torso 메모는 바로 앞 메시지의 보내는 쪽이나 받는 쪽에 붙으므로, 가리킨 참여자 가운데 그 메시지에 든 첫 참여자에 단다.
function noteLine(step, beat, { model, ids }) {
  const target = beat && step.keys.find((key) => key === beat.message.from || key === beat.message.to);
  if (!target) {
    skip(model, step.line, 'this note is not imported. A Torso note follows a message and points at its sender or receiver');
    return undefined;
  }
  return `note ${ids.node.get(target)} ${quote(step.text || MISSING_TEXT)}`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 활성 구간 한 줄. 메시지 뒤, 구획 밖에서만 받고, 이미 열린 구간을 다시 열거나 열지 않은 구간을 닫는 줄은 뺀다.
function activationLine(step, beat, { model, ids, active, isTop }) {
  const label = nodeOf(model, step.key).label;
  const reason = !isTop ? 'inside a fragment' : !beat ? 'without a message right before it' : step.type === 'activate' && active.has(step.key) ? 'while it is already active' : step.type === 'deactivate' && !active.has(step.key) ? 'while it is not active' : undefined;
  if (reason) {
    skip(model, step.line, `${step.type} ${label} ${reason} is not imported`);
    return undefined;
  }
  if (step.type === 'activate') active.add(step.key);
  else active.delete(step.key);
  return `${step.type} ${ids.node.get(step.key)}`;
}

// cost: time O(s·p), heap O(s), stack O(d)
// vars: s = 구획 안 단계 수, p = 참여자 수, d = 구획 깊이
// basis: estimate
// 구획 하나. 메시지가 없는 대안은 빼고, 대안이 하나만 남은 alt는 opt, par은 구획 없이 쓴다. loop의 횟수와 opt의 재생 여부는 원본에 없어 한 번 재생으로 쓴다.
function fragmentLines(step, context, depth) {
  const { model } = context;
  const pad = INDENT.repeat(depth);
  const branches = [];
  for (const branch of step.branches) {
    const body = writeSteps(branch.steps, context, { depth: depth + (step.kind === 'alt' || step.kind === 'par' ? 2 : 1), isTop: false });
    if (body.hasMessage) branches.push({ ...branch, body });
    else skip(model, branch.line, `the ${step.kind} block "${branch.label || step.title || step.kind}" has no messages and is not imported`);
  }
  const senders = [...new Set(branches.flatMap((b) => b.body.senders))];
  if (!branches.length) return { lines: [], senders };
  const title = quote(step.title || step.kind);
  if (step.kind === 'loop' || step.kind === 'opt') {
    const option = step.kind === 'loop' ? 'times=1' : 'run=on';
    return { lines: [`${pad}fragment ${step.kind} ${title} ${option} {`, ...branches[0].body.lines, `${pad}}`], senders };
  }
  if (branches.length === 1) {
    if (step.kind === 'par') {
      change(model, step.line, 'a par block with one branch is written without the block. One branch runs in order');
      const flat = writeSteps(branches[0].steps, context, { depth, isTop: false });
      return { lines: flat.lines, senders };
    }
    change(model, step.line, 'an alt block with one branch is written as opt. Torso alt needs two branches');
    const flat = writeSteps(branches[0].steps, context, { depth: depth + 1, isTop: false });
    return { lines: [`${pad}fragment opt ${title} run=on {`, ...flat.lines, `${pad}}`], senders };
  }
  const labels = uniqueLabels(branches.map((b) => b.label || (step.kind === 'alt' ? 'else' : 'and')));
  const choose = step.kind === 'alt' ? ` choose=${quote(labels[0])}` : '';
  const lines = [`${pad}fragment ${step.kind} ${title}${choose} {`];
  for (const [i, branch] of branches.entries()) lines.push(`${pad}${INDENT}branch ${quote(labels[i])} {`, ...branch.body.lines, `${pad}${INDENT}}`);
  lines.push(`${pad}}`);
  return { lines, senders };
}

// cost: time O(b²), heap O(b), stack O(1)
// vars: b = 대안 수
// basis: estimate
// 겹치지 않는 대안 이름. 같은 이름 뒤에는 번호를 붙인다.
function uniqueLabels(labels) {
  const out = [];
  for (const label of labels) {
    let name = label;
    for (let n = 2; out.includes(name); n++) name = `${label} ${n}`;
    out.push(name);
  }
  return out;
}
