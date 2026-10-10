// 시퀀스 제어 구획의 블록을 읽고, 그림에 필요한 전체 메시지와 재생 계획을 분리한다.
import { valueNames } from './grammar.js';
import { emptyBeat } from './steps.js';

// 파서와 계획 순회의 호출 스택을 제한하는 문법 한도. 스타일 값이 아니다.
const MAX_DEPTH = 64;
const KINDS = valueNames('fragmentType');
const BRANCHED = new Set(['alt', 'par']);

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 줄의 낱말 수
// basis: estimate
/** 제어 줄 또는 블록 안에서 허용하지 않는 줄이면 소비하고 true를 돌려준다. */
export function readSequenceControl(statement, ctx) {
  if (ctx.section !== 'timeline' && statement.tokens[0].value !== 'fragment') return false;
  const [head] = statement.tokens;
  const stack = ctx.sequenceBlocks ??= [];
  const top = stack.at(-1);
  if (statement.tokens[1]?.type === 'arrow' && (!top?.control || !BRANCHED.has(top.control.kind))) return false;
  if (head.type === 'close' && top) {
    if (statement.tokens.length !== 1) ctx.problems.error(statement.line, 'write a closing brace on its own line');
    stack.pop();
    ctx.step = top.parent;
    return true;
  }
  if (['fragment', 'branch'].includes(head.value)) {
    openControl(statement, ctx);
    return true;
  }
  if (!top) return false;
  if (top.control && BRANCHED.has(top.control.kind)) ctx.problems.error(statement.line, 'alt and par contain branch blocks');
  else if (!['note', 'wait'].includes(head.value)) ctx.problems.error(statement.line, 'a fragment body contains messages, note, wait, or nested fragments');
  else return false;
  return true;
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 줄의 낱말 수
// basis: estimate
function openControl({ tokens, line }, ctx) {
  const stack = ctx.sequenceBlocks;
  if (!ctx.step) { ctx.problems.error(line, 'start the timeline with a scene before a fragment'); return; }
  if (stack.length >= MAX_DEPTH) { ctx.problems.error(line, `sequence blocks cannot nest deeper than ${MAX_DEPTH}`); return; }
  const isBranch = tokens[0].value === 'branch';
  const label = tokens[isBranch ? 1 : 2];
  const options = tokens.slice(isBranch ? 2 : 3, -1);
  if (label?.type !== 'text' || tokens.at(-1).type !== 'open' || options.some((t) => t.type !== 'option')) {
    ctx.problems.error(line, isBranch ? 'write branch as: branch "condition" {' : 'write fragment as: fragment alt|loop|par|opt "label" [choose="condition"] [times=3] [run=on|off] {');
    return;
  }
  if (isBranch) return openBranch({ label: label.value, line, options }, ctx);
  const kind = tokens[1]?.value;
  const given = Object.fromEntries(options.map((t) => [t.key, t.value]));
  const option = { alt: 'choose', loop: 'times', opt: 'run' }[kind];
  const valid = KINDS.includes(kind) && options.length === Object.keys(given).length && options.every((t) => t.key === option && t.valueType === (kind === 'alt' ? 'text' : 'word'));
  const times = Number(given.times);
  if (!valid || (kind === 'opt' && !valueNames('fragmentRun').includes(given.run)) || (kind === 'alt' && !given.choose) || (kind === 'loop' && (!/^[1-9]\d*$/.test(given.times ?? '') || !Number.isSafeInteger(times)))) {
    ctx.problems.error(line, 'alt needs choose="branch label", loop needs positive whole times=, opt needs run=on|off, and par takes no options');
    return;
  }
  if (stack.at(-1)?.control && BRANCHED.has(stack.at(-1).control.kind)) { ctx.problems.error(line, 'put a nested fragment inside a branch'); return; }
  const control = { kind, label: label.value, line, choose: given.choose, run: given.run, times: kind === 'loop' ? times : undefined, body: [], branches: [], depth: stack.filter((b) => b.control).length };
  ctx.step.beats.push({ ...emptyBeat(line), control });
  stack.push({ parent: ctx.step, control, line });
  ctx.step = { ...ctx.step, beats: control.body };
  ctx.section = 'timeline';
}

// cost: time O(b), heap O(1), stack O(1)
// vars: b = 같은 구획의 대안 수
// basis: estimate
function openBranch({ label, line, options }, ctx) {
  const control = ctx.sequenceBlocks.at(-1)?.control;
  if (!control || !BRANCHED.has(control.kind) || options.length) { ctx.problems.error(line, 'branch belongs directly to alt or par and takes only a label'); return; }
  if (control.branches.some((branch) => branch.label === label)) ctx.problems.error(line, `branch "${label}" appears twice`);
  const branch = { label, line, body: [] };
  control.branches.push(branch);
  ctx.sequenceBlocks.push({ parent: ctx.step, branch, line });
  ctx.step = { ...ctx.step, beats: branch.body };
}

// cost: time O(b), heap O(b), stack O(d)
// vars: b = 원본 박자 수, d = 구획 깊이(최대 MAX_DEPTH)
// basis: estimate
/** 모든 대안을 이름 검사와 배치에 남기고 실제 선택·반복·병렬 실행은 시간표 생성 때 정한다. */
export function prepareSequenceFragments(figure, problems) {
  if (!figure.steps.some((step) => step.beats.some((beat) => beat.control))) return;
  figure.fragments = [];
  figure.sequenceMessages = [];
  for (const step of figure.steps) {
    step.sequencePlan = step.beats;
    step.beats = flatten(step.sequencePlan, { figure, problems }, false);
  }
}

// cost: time O(b), heap O(b), stack O(d)
// vars: b = 하위 박자 수, d = 구획 깊이
// basis: estimate
function flatten(beats, ctx, inside) {
  return beats.flatMap((beat) => {
    if (beat.control) return flattenControl(beat.control, ctx);
    if (inside && (beat.activations?.length || beat.hops.some((hop) => hop.create || hop.destroy))) ctx.problems.error(beat.line, 'participant creation, destruction, and activation belong outside fragments');
    if (beat.hops.length) {
      for (const hop of beat.hops) hop.messageIndex = ctx.figure.sequenceMessages.length;
      ctx.figure.sequenceMessages.push(beat);
    }
    return [beat];
  });
}

// cost: time O(b), heap O(b), stack O(d)
// vars: b = 하위 박자 수, d = 구획 깊이
// basis: estimate
function flattenControl(control, ctx) {
  const { figure, problems } = ctx;
  control.first = figure.sequenceMessages.length;
  figure.fragments.push(control);
  if (BRANCHED.has(control.kind) && control.branches.length < 2) problems.error(control.line, 'alt and par need at least two branch blocks');
  if (control.kind === 'alt' && !control.branches.some((branch) => branch.label === control.choose)) problems.error(control.line, `choose="${control.choose}" does not name a branch`);
  const bodies = BRANCHED.has(control.kind) ? control.branches : [{ body: control.body, line: control.line }];
  const beats = bodies.flatMap((branch) => {
    branch.first = figure.sequenceMessages.length;
    const result = flatten(branch.body, ctx, true);
    branch.last = figure.sequenceMessages.length - 1;
    if (branch.last < branch.first) problems.error(branch.line, 'a fragment operand needs at least one message');
    return result;
  });
  control.last = figure.sequenceMessages.length - 1;
  return beats;
}
