// 시간 흐름 문장(step과 박자 줄)을 읽는다. 이름이 선언됐는지는 validate.js가 확인한다.
import { readStepOptions, readTrack, checkMixedStep } from './flow.js';
import { parseMiniGraph } from './minigraph.js';
import { readMoveOptions } from './move-options.js';
import { isOverTimeLimit, overLimitMessage, parseNumber, parseTime } from './values.js';
import { flagNames, optionsOf, valueNames } from './grammar.js';

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 시간 흐름 문장 하나를 읽어 지금 단계에 더한다. word는 문장 첫 낱말이거나 이동 줄이면 'hop'이다. */
export function readTimeline(word, statement, ctx) {
  const handlers = { step: readStep, hop: readHops, track: readTrack, show: readShow, clear: readClear, light: readLight, say: readSay, wait: readWait, note: readNote, reveal: readReveal };
  if (word !== 'step') checkMixedStep(word, statement.line, ctx);
  handlers[word](statement, ctx);
}

/** 빈 박자. 박자 줄마다 하나씩 만든다. */
function emptyBeat(line) {
  return { line, hops: [], ops: [], light: [], chartLight: [], say: undefined, waitMs: 0, reveal: [], notes: [], isPause: false };
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `step "이름" ["설명"] [for=12s] [keep="값, 값"] [set="식, 식"] [status="도형=종류"]`
function readStep({ tokens, line }, ctx) {
  const [, label, caption, extra] = tokens.filter((t) => t.type !== 'option');
  if (label?.type !== 'text' || (caption && caption.type !== 'text') || extra) {
    ctx.problems.error(line, 'write a step as: step "name" ["caption"] [for=12s] [keep=names] [set=exprs] [status=list]');
  }
  const { forMs, keep, sets, status } = readStepOptions(tokens.filter((t) => t.type === 'option'), { line, ctx });
  ctx.step = { label: label?.value ?? '', caption: caption?.type === 'text' ? caption.value : undefined, line, beats: [], tracks: [], forMs, keep, sets, status, hasConditions: false };
  ctx.figure.steps.push(ctx.step);
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `a -> b "글" time=3s & c -> d`. 순서 그림에서는 메시지 하나이고 글이 필수다.
function readHops({ tokens, line }, ctx) {
  const beat = pushBeat(ctx, line);
  const groups = [[]];
  for (const t of tokens) {
    if (t.type === 'amp') groups.push([]);
    else groups.at(-1).push(t);
  }
  const isSequence = ctx.figure.kind === 'sequence';
  if (isSequence && groups.length > 1) ctx.problems.error(line, 'a sequence message cannot use "&". Write one message per line');
  for (const group of groups) {
    const [from, arrow, to, ...rest] = group;
    if (from?.type !== 'word' || arrow?.type !== 'arrow' || to?.type !== 'word') {
      ctx.problems.error(line, 'write a move as: a -> b ["text"] [time=2s]');
      continue;
    }
    const stuck = rest.filter((t) => t.type === 'word' && t.value === 'stuck');
    if (stuck.length > 1) ctx.problems.error(line, 'stuck is written twice in one move');
    const { timeMs, tone, sets, lost, condition } = readMoveOptions(rest.filter((t) => t.type === 'option'), { scope: 'hop', line, ctx, isStuck: stuck.length > 0 });
    const hop = { from: from.value, to: to.value, data: undefined, timeMs, dashed: false, tone, sets, lost, ...(condition ? { condition } : {}), line };
    for (const t of rest.filter((w) => w.type !== 'option' && !stuck.includes(w))) readHopWord(t, hop, { isSequence, line, ctx });
    if (isSequence && hop.data === undefined) ctx.problems.error(line, 'a sequence message needs text: a -> b "message"');
    beat.hops.push(hop);
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 이동 줄의 글과 순서 그림의 dashed. 선택 사항(time=, tone=, set=)은 readMoveOptions가 읽는다.
function readHopWord(t, hop, { isSequence, line, ctx }) {
  if (t.type === 'text' && hop.data === undefined) hop.data = t.value;
  else if (isSequence && t.type === 'word' && t.value === 'dashed' && !hop.dashed) hop.dashed = true;
  else if ((t.type === 'text' && hop.data !== undefined) || (t.value === 'dashed' && hop.dashed)) ctx.problems.error(line, `${t.type === 'text' ? 'the move text' : 'dashed'} is written twice in one move`);
  else ctx.problems.error(line, `a move takes a quoted text, time=, tone=, set=, lost=, when=, wait=, timeout=, else=, and stuck. Found "${t.value}"`);
}

// cost: time O(t + g), heap O(g), stack O(1)
// vars: t = 문장 낱말 수, g = 관계 그래프 글자 수
// basis: estimate
// `show id "글" [tag=".."] [tone=..] [meta=".."] [mark=".."] [mono]` 또는 `show id graph "가 -> 나" [lit=".."]`
function readShow({ tokens, line }, ctx) {
  const [, id, first, ...rest] = tokens;
  if (id?.type !== 'word') {
    ctx.problems.error(line, 'write show as: show id "text"');
    return;
  }
  const beat = attachBeat(ctx, line);
  if (first?.type === 'word' && first.value === 'graph') {
    const [text, ...more] = rest;
    if (text?.type !== 'text') {
      ctx.problems.error(line, 'write a graph row as: show id graph "a -> b; a -> c" [lit="a"]');
      return;
    }
    const lit = more.find((t) => t.type === 'option' && t.key === 'lit' && t.valueType === 'text');
    if (more.length !== (lit ? 1 : 0)) ctx.problems.error(line, 'a graph row takes only lit="names"');
    const graph = parseMiniGraph(text.value, lit?.value ?? '');
    if (graph.error) ctx.problems.error(line, graph.error);
    else beat.ops.push({ type: 'show', node: id.value, row: { graph }, line });
    return;
  }
  if (first?.type !== 'text') {
    ctx.problems.error(line, 'write show as: show id "text"');
    return;
  }
  const row = { text: first.value };
  for (const t of rest) readRowOption(t, row, { line, ctx });
  checkRowLengths(row, line, ctx);
  if (row.tone !== undefined && row.tag === undefined) ctx.problems.error(line, 'tone colors a tag. Add tag="..." or remove tone');
  beat.ops.push({ type: 'show', node: id.value, row, line });
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 선택 사항 수
// basis: estimate
// 글자 수 상한이 있는 선택 사항(mark)을 넘으면 오류다. 카드 오른쪽 끝에 들어갈 자리가 정해져 있기 때문이다.
function checkRowLengths(row, line, ctx) {
  for (const [key, spec] of Object.entries(optionsOf('show'))) {
    const isTooLong = spec.maxLength && row[key] !== undefined && [...row[key]].length > spec.maxLength;
    if (isTooLong) ctx.problems.error(line, `${key} is at most ${spec.maxLength} characters`);
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 카드 줄 선택 사항 하나. 키와 값 목록은 grammar.js의 show 범위다.
function readRowOption(t, row, { line, ctx }) {
  const spec = t.type === 'option' ? optionsOf('show')[t.key] : undefined;
  if (t.type === 'word' && flagNames('show').includes(t.value) && !row.isMono) row.isMono = true;
  else if (spec && spec.type !== 'flag' && row[t.key] === undefined) readRowValue(t, { spec, row }, { line, ctx });
  else {
    const keys = Object.entries(optionsOf('show')).filter(([, o]) => o.type !== 'flag').map(([key]) => `${key}=`);
    ctx.problems.error(line, `a card row takes ${keys.join(', ')}, and ${flagNames('show').join(', ')} once each. Found "${t.key ?? t.value}"`);
  }
}

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 값 목록의 값 수
// basis: estimate
// 카드 줄 선택 사항의 값. 값 목록이 있으면 그 안의 값만 받는다. 옛 값은 normalize.js가 이미 바꿔 놓았다.
function readRowValue(t, { spec, row }, { line, ctx }) {
  if (spec.values && (t.valueType !== 'word' || !valueNames(spec.values).includes(t.value))) ctx.problems.error(line, `${t.key} is one of ${valueNames(spec.values).join(', ')}`);
  else if (!spec.values && t.valueType !== 'text') ctx.problems.error(line, `write ${t.key} as quoted text: ${t.key}="..."`);
  else row[t.key] = t.value;
}

// `clear id`
function readClear({ tokens, line }, ctx) {
  const [, id, extra] = tokens;
  if (id?.type !== 'word' || extra) {
    ctx.problems.error(line, 'write clear as: clear id');
    return;
  }
  if (!ctx.step.beats.length) {
    ctx.problems.error(line, 'a step cannot start with clear. There is no card to clear yet');
    ctx.step.hasError = true;
    return;
  }
  attachBeat(ctx, line).ops.push({ type: 'clear', node: id.value, line });
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// 그림: `light a b`. 차트: `light "항목"`, `light x=값`, `light "행" "열"`.
function readLight({ tokens, line }, ctx) {
  const args = tokens.slice(1);
  const beat = pushBeat(ctx, line);
  if (!args.length) ctx.problems.error(line, 'light needs at least one target');
  if (ctx.figure.kind !== 'chart') {
    for (const t of args) {
      if (t.type === 'word') beat.light.push(t.value);
      else ctx.problems.error(line, `light takes names. Found "${t.value}"`);
    }
    return;
  }
  const isX = args.length === 1 && args[0].type === 'option' && args[0].key === 'x' && parseNumber(args[0].value) !== undefined;
  const isTexts = args.length <= 2 && args.every((t) => t.type === 'text');
  if (isX) beat.chartLight.push({ x: parseNumber(args[0].value), line });
  else if (isTexts) beat.chartLight.push({ names: args.map((t) => t.value), line });
  else ctx.problems.error(line, 'in a chart, write light "item", light x=value, or light "row" "column"');
}

// `say "설명"`
function readSay({ tokens, line }, ctx) {
  const [, text, extra] = tokens;
  if (text?.type !== 'text' || extra) ctx.problems.error(line, 'write say as: say "caption"');
  pushBeat(ctx, line).say = text?.value;
}

// `wait 2s`
function readWait({ tokens, line }, ctx) {
  const [, time, extra] = tokens;
  const ms = parseTime(time?.value);
  if (time?.type === 'word' && ms === undefined && !extra && isOverTimeLimit(time.value)) ctx.problems.error(line, overLimitMessage('wait', time.value), { code: 'time-limit' });
  else if (time?.type !== 'word' || ms === undefined || extra) ctx.problems.error(line, 'write wait as: wait 2s');
  pushBeat(ctx, line).waitMs = ms ?? 0;
}

// `note id "글"`. 바로 앞 메시지 박자에 붙는다.
function readNote({ tokens, line }, ctx) {
  const [, id, text, extra] = tokens;
  if (id?.type !== 'word' || text?.type !== 'text' || extra) {
    ctx.problems.error(line, 'write note as: note id "text"');
    return;
  }
  const beat = ctx.step.beats.at(-1);
  const hop = beat?.hops[0];
  if (ctx.previous !== 'hop' || !hop) {
    ctx.problems.error(line, 'write a note on the line right after a message');
    return;
  }
  if (id.value !== hop.from && id.value !== hop.to) {
    ctx.problems.error(line, `a note points at "${hop.from}" or "${hop.to}", the participants of the message above`);
    return;
  }
  beat.notes.push({ node: id.value, text: text.value, line });
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `reveal 계열`
function readReveal({ tokens, line }, ctx) {
  const ids = tokens.slice(1);
  if (!ids.length || ids.some((t) => t.type !== 'word')) ctx.problems.error(line, 'write reveal as: reveal series-id');
  pushBeat(ctx, line).reveal.push(...ids.filter((t) => t.type === 'word').map((t) => t.value));
}

function pushBeat(ctx, line) {
  const beat = emptyBeat(line);
  ctx.step.beats.push(beat);
  return beat;
}

// show, clear는 바로 앞 박자에 붙는다. 단계 첫 줄이면 멈추는 박자를 만든다.
function attachBeat(ctx, line) {
  const last = ctx.step.beats.at(-1);
  if (last) return last;
  const beat = pushBeat(ctx, line);
  beat.isPause = true;
  return beat;
}
