// 시간 흐름 문장(scene과 박자 줄)을 읽는다. 이름이 선언됐는지는 validate.js가 확인한다.
import { readStepOptions, readTrack, checkMixedStep } from './flow.js';
import { readActivation } from './sequence-life.js';
import { readContent } from './content.js';
import { readMoveOptions } from './move-options.js';
import { isOverTimeLimit, overLimitMessage, parseNumber, parseTime, timeHint } from './values.js';
import { ID_PATTERN } from './words.js';

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 시간 흐름 문장 하나를 읽어 지금 장면에 더한다. word는 문장 첫 낱말이거나 이동 줄이면 'hop'이다. */
export function readTimeline(word, statement, ctx) {
  const handlers = { scene: readScene, hop: readHops, track: readTrack, show: readShow, clear: readClear, light: readLight, wait: readWait, note: readNote, reveal: readReveal, activate: readActivation, deactivate: readActivation };
  if (word !== 'scene') checkMixedStep(word, statement.line, ctx);
  handlers[word](statement, ctx);
}

/** 빈 박자. 박자 줄마다 하나씩 만든다. */
export function emptyBeat(line) {
  return { line, hops: [], ops: [], light: [], chartLight: [], waitMs: 0, reveal: [], notes: [], isPause: false };
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `scene "이름" [mode=static|once|loop] [speed=1] [for=12s] [keep="값, 값"] [set="식, 식"] [status="도형=종류"]`
function readScene({ tokens, line }, ctx) {
  const plain = tokens.filter((t) => t.type !== 'option');
  const [, label, surplus] = plain;
  if (label?.type !== 'text' || surplus) {
    const column = label?.type === 'text' ? surplus.column : undefined;
    ctx.problems.error(line, 'write a scene as: scene "name" [mode=static|once|loop] [speed=1] [for=12s] [keep=names] [set=exprs] [status=list]', { column });
  }
  // `--scene`은 숫자 모양 값을 장면 번호로 읽는다. 숫자만으로 된 이름은 번호와 겹쳐 이름으로 고를 수 없으므로 받지 않는다.
  if (label?.type === 'text' && /^\d+$/.test(label.value)) ctx.problems.error(line, `scene "${label.value}" is only digits, which --scene reads as a scene number. Add a word to the name, such as "step ${label.value}"`);
  const { found, forMs, keep, sets, status } = readStepOptions(tokens.filter((t) => t.type === 'option'), { line, ctx });
  const speed = readSpeed(found.speed, { line, ctx });
  ctx.step = { label: label?.value ?? '', mode: found.mode, speed, line, beats: [], tracks: [], forMs, keep, sets, status, hasConditions: false };
  ctx.figure.steps.push(ctx.step);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 장면의 재생 배속. 0보다 큰 유한한 숫자(기본 1)이고 재생 속도일 뿐 시간표의 ms는 바꾸지 않는다. mode는 적지 않으면 줄이 있는 장면은 once, 줄이 없는 장면은 static이다(validate.js가 줄을 센 뒤 정한다).
function readSpeed(text, { line, ctx }) {
  if (text === undefined) return 1;
  const number = parseNumber(text);
  if (number !== undefined && number > 0) return number;
  ctx.problems.error(line, `speed is a number above 0, such as speed=2. Found "${text}"`, { code: 'invalid-speed' });
  return 1;
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `a -> b "글" time=3s & c -> d`. 순서 보기에 보이는 이동은 메시지 하나이고 글이 필수다(validate.js가 확인한다).
function readHops({ tokens, line }, ctx) {
  const beat = pushBeat(ctx, line);
  const groups = [[]];
  for (const t of tokens) {
    if (t.type === 'amp') groups.push([]);
    else groups.at(-1).push(t);
  }
  for (const group of groups) {
    const [from, arrow, to, ...rest] = group;
    if (from?.type !== 'word' || arrow?.type !== 'arrow' || to?.type !== 'word') {
      ctx.problems.error(line, 'write a move as: a -> b ["text"] [time=2s]');
      continue;
    }
    const texts = rest.filter((t) => t.type === 'text');
    if (texts.length > 1) ctx.problems.error(line, 'the move text is written twice in one move', { column: texts[1].column });
    const { found, timeMs, tone, sets, lost, condition } = readMoveOptions(rest.filter((t) => t.type !== 'text'), { scope: 'hop', line, ctx });
    const hop = { from: from.value, to: to.value, data: texts[0]?.value, timeMs, dashed: false, tone, sets, lost, ...(condition ? { condition } : {}), line };
    // 순서 보기의 dashed, create, destroy. 만들어지는 참여자로 가는 메시지는 점선이다.
    for (const flag of ['dashed', 'create', 'destroy']) if (found[flag]) hop[flag] = true;
    if (hop.create) hop.dashed = true;
    beat.hops.push(hop);
  }
}

// `show id "글"` 또는 `show id graph "가 -> 나"`.
function readShow({ tokens, line }, ctx) {
  const [, id, ...body] = tokens;
  if (id?.type !== 'word') {
    ctx.problems.error(line, 'write show as: show id "text"');
    return;
  }
  const beat = attachBeat(ctx, line);
  const row = readContent({ tokens: body, line }, ctx);
  if (row) beat.ops.push({ type: 'show', node: id.value, row, line });
}

// `clear id`
function readClear({ tokens, line }, ctx) {
  const [, id, extra] = tokens;
  if (id?.type !== 'word' || extra) {
    ctx.problems.error(line, 'write clear as: clear id');
    return;
  }
  const hasContent = ctx.figure.nodes.some((node) => node.id === id.value && node.content?.length);
  if (!ctx.step.beats.length && !hasContent) {
    ctx.problems.error(line, 'a scene cannot start with clear. There is no card to clear yet');
    ctx.step.hasError = true;
    return;
  }
  attachBeat(ctx, line).ops.push({ type: 'clear', node: id.value, line });
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// 카드와 칸: `light a b.part`. 차트 카드: `light 차트 "항목"`, `light 차트 x=값`, `light 차트 "행" "열"`.
function readLight({ tokens, line }, ctx) {
  const args = tokens.slice(1);
  const beat = pushBeat(ctx, line);
  if (!args.length) ctx.problems.error(line, 'light needs at least one target');
  if (!args.some((t) => t.type === 'text' || t.type === 'option')) {
    for (const t of args) {
      if (t.type === 'word') beat.light.push(t.value);
      else ctx.problems.error(line, `light takes names. Found "${t.value}"`);
    }
    return;
  }
  const [target, ...rest] = args;
  const isX = rest.length === 1 && rest[0].type === 'option' && rest[0].key === 'x' && parseNumber(rest[0].value) !== undefined;
  const isTexts = rest.length >= 1 && rest.length <= 2 && rest.every((t) => t.type === 'text');
  if (target.type !== 'word') ctx.problems.error(line, 'write a chart light as: light chart "item", light chart x=value, or light chart "row" "column"');
  else if (isX) beat.chartLight.push({ chart: target.value, x: parseNumber(rest[0].value), line });
  else if (isTexts) beat.chartLight.push({ chart: target.value, names: rest.map((t) => t.value), line });
  else ctx.problems.error(line, 'in a chart, write light chart "item", light chart x=value, or light chart "row" "column"');
}

// `wait 2s`
function readWait({ tokens, line }, ctx) {
  const [, time, extra] = tokens;
  const ms = parseTime(time?.value);
  if (time?.type === 'word' && ms === undefined && !extra && isOverTimeLimit(time.value)) ctx.problems.error(line, overLimitMessage('wait', time.value), { code: 'time-limit' });
  else if (time?.type !== 'word' || ms === undefined || extra) ctx.problems.error(line, `write wait as: wait 2s.${time?.type === 'word' && !extra ? timeHint(time.value) : ''}`, { column: time?.column });
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
// `reveal 차트.계열 …`. 계열이 없는 차트는 `reveal 차트`로 통째로 드러낸다.
function readReveal({ tokens, line }, ctx) {
  const ids = tokens.slice(1);
  if (!ids.length || ids.some((t) => t.type !== 'word')) ctx.problems.error(line, 'write reveal as: reveal chart.series');
  const beat = pushBeat(ctx, line);
  for (const t of ids.filter((w) => w.type === 'word')) {
    const [chart, series, ...more] = t.value.split('.');
    if (more.length || !ID_PATTERN.test(chart) || (series !== undefined && !ID_PATTERN.test(series))) ctx.problems.error(line, `write a series as chart.series. Found "${t.value}"`);
    else beat.reveal.push({ chart, series, line });
  }
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
