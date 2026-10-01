// 시간 흐름 문장(step과 박자 줄)을 읽는다. 이름이 선언됐는지는 validate.js가 확인한다.
import { parseMiniGraph } from './minigraph.js';
import { parseTime } from './values.js';
import { NUMBER_PATTERN, TONES } from './words.js';

const ROW_OPTIONS = ['tag', 'tone', 'meta', 'mark'];

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 시간 흐름 문장 하나를 읽어 지금 단계에 더한다. word는 문장 첫 낱말이거나 이동 줄이면 'hop'이다. */
export function readTimeline(word, statement, ctx) {
  const handlers = { step: readStep, hop: readHops, show: readShow, clear: readClear, light: readLight, say: readSay, wait: readWait, note: readNote, reveal: readReveal };
  handlers[word](statement, ctx);
}

/** 빈 박자. 박자 줄마다 하나씩 만든다. */
export function emptyBeat(line) {
  return { line, hops: [], ops: [], light: [], chartLight: [], say: undefined, waitMs: 0, reveal: [], notes: [], isPause: false };
}

// `step "이름" ["설명"]`
function readStep({ tokens, line }, ctx) {
  const [, label, caption, extra] = tokens;
  if (label?.type !== 'text' || (caption && caption.type !== 'text') || extra) {
    ctx.problems.error(line, 'write a step as: step "name" ["caption"]');
  }
  ctx.step = { label: label?.value ?? '', caption: caption?.type === 'text' ? caption.value : undefined, line, beats: [] };
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
    const hop = { from: from.value, to: to.value, data: undefined, timeMs: undefined, dashed: false, line };
    for (const t of rest) readHopOption(t, hop, isSequence, line, ctx);
    if (isSequence && hop.data === undefined) ctx.problems.error(line, 'a sequence message needs text: a -> b "message"');
    beat.hops.push(hop);
  }
}

// 이동 줄의 글, time=, 순서 그림의 dashed
function readHopOption(t, hop, isSequence, line, ctx) {
  if (t.type === 'text' && hop.data === undefined) hop.data = t.value;
  else if (t.type === 'option' && t.key === 'time' && t.valueType === 'word' && hop.timeMs === undefined) {
    hop.timeMs = parseTime(t.value);
    if (hop.timeMs === undefined) ctx.problems.error(line, `time is a positive time such as 900ms or 2s. Found "${t.value}"`);
  } else if (isSequence && t.type === 'word' && t.value === 'dashed' && !hop.dashed) hop.dashed = true;
  else if (isRepeated(t, hop)) ctx.problems.error(line, `${t.type === 'text' ? 'the move text' : t.type === 'option' ? 'time' : 'dashed'} is written twice in one move`);
  else ctx.problems.error(line, `a move takes a quoted text and time=. Found "${t.value}"`);
}

function isRepeated(t, hop) {
  if (t.type === 'text') return hop.data !== undefined;
  if (t.type === 'option') return t.key === 'time' && hop.timeMs !== undefined;
  return t.value === 'dashed' && hop.dashed;
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
  for (const t of rest) readRowOption(t, row, line, ctx);
  if (row.mark !== undefined && [...row.mark].length > 8) ctx.problems.error(line, 'mark is at most 8 characters');
  if (row.tone !== undefined && row.tag === undefined) ctx.problems.error(line, 'tone colors a tag. Add tag="..." or remove tone');
  beat.ops.push({ type: 'show', node: id.value, row, line });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 카드 줄 선택 사항 하나
function readRowOption(t, row, line, ctx) {
  if (t.type === 'word' && t.value === 'mono' && !row.isMono) row.isMono = true;
  else if (t.type === 'option' && ROW_OPTIONS.includes(t.key) && row[t.key] === undefined) {
    const isTone = t.key === 'tone';
    if (isTone && (t.valueType !== 'word' || !TONES.includes(t.value))) ctx.problems.error(line, `tone is one of ${TONES.join(', ')}`);
    else if (!isTone && t.valueType !== 'text') ctx.problems.error(line, `write ${t.key} as quoted text: ${t.key}="..."`);
    else row[t.key] = t.value;
  } else ctx.problems.error(line, `a card row takes tag=, tone=, meta=, mark=, and mono once each. Found "${t.key ?? t.value}"`);
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
  const isX = args.length === 1 && args[0].type === 'option' && args[0].key === 'x' && NUMBER_PATTERN.test(args[0].value);
  const isTexts = args.length <= 2 && args.every((t) => t.type === 'text');
  if (isX) beat.chartLight.push({ x: Number(args[0].value), line });
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
  if (time?.type !== 'word' || ms === undefined || extra) ctx.problems.error(line, 'write wait as: wait 2s');
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
