// 흐름 단계 문장(`step ... for=시간`, `track a -> b -> c ...`)을 읽는다. 선이 있는지와 시간이 맞는지는 flow-check.js가 확인한다.
import { readMoveOptions, readTime } from './move-options.js';
import { readOptions } from './options.js';
import { valueNames } from './grammar.js';
import { readSets } from './value.js';
import { ID_PATTERN } from './words.js';
import { isOverTimeLimit, overLimitMessage, parseTime, TIME_LIMIT_MS } from './values.js';

const TRACK_FORM = 'write a track as: track a, b -> c -> d ["text"] [at=time] [every=time] [time=time] [legs="time, -"] [tone=name] [set="id+1@node"] [lost=60%] [when="condition"] [wait="condition"] [timeout=time] [else=node] [stuck] [reserve="id+1, id=word"]';
const STATUS_FORM = 'write status as: status="node=ok, node=warn"';
// 구간 시간의 합을 `time=`과 견주는 오차(ms). 소수 초(`1.1s`)를 밀리초로 바꾸며 생기는 부동소수점 오차를 같은 값으로 본다.
const LEG_EPSILON_MS = 1e-6;

// cost: time O(t + k + e), heap O(t + k + e), stack O(1)
// vars: t = 선택 사항 수, k = keep 항목 수, e = 식 수
// basis: estimate
/**
 * 단계의 선택 사항(`for=`, `keep=`, `set=`, `status=`)을 읽는다.
 * @returns { forMs, keep, sets, status }. forMs는 단계 길이(ms)이고 없거나 틀리면 undefined, keep은 { id, line } 목록, sets는 단계 시작 재설정 식 목록, status는 `{ node, kind }` 목록이다(없으면 빈 목록)
 */
export function readStepOptions(options, { line, ctx }) {
  const found = readOptions(options, { scopes: ['step'], what: 'a step', line, ctx });
  return { forMs: readStepLength(found.for, { line, ctx }), keep: readKeep(found.keep, { line, ctx }), sets: readStepSets(found.set, { line, ctx }), status: readStatus(found.status, { line, ctx }) };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 단계 길이(`for=`)를 밀리초로. 틀리면 오류를 내고 undefined다.
function readStepLength(text, { line, ctx }) {
  if (text === undefined) return undefined;
  const ms = parseTime(text);
  if (ms === undefined && isOverTimeLimit(text)) ctx.problems.error(line, overLimitMessage('for', text), { code: 'time-limit' });
  else if (ms === undefined) ctx.problems.error(line, `for is a positive time such as 12s. Found "${text}"`);
  return ms;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 상태 항목 수
// basis: estimate
// `status="도형=종류, 도형=종류"`를 `{ node, kind }` 목록으로. 도형이 있는지와 상태를 받는 도형인지는 validate.js가 본다. 구조 그림(flow)에서만 쓴다.
function readStatus(text, { line, ctx }) {
  if (text === undefined) return [];
  if (ctx.figure.kind !== 'flow') {
    ctx.problems.error(line, 'status belongs to flow figures only, where steps light shapes');
    return [];
  }
  const kinds = valueNames('status');
  const entries = [];
  for (const part of text.split(',').map((item) => item.trim())) {
    const [node, kind, ...more] = part.split('=').map((piece) => piece.trim());
    if (!node || !kind || more.length) ctx.problems.error(line, `${STATUS_FORM}. Found "${part}"`);
    else if (!kinds.includes(kind)) ctx.problems.error(line, `status kind is one of ${kinds.join(', ')}. Found "${kind}"`);
    else if (entries.some((entry) => entry.node === node)) ctx.problems.error(line, `status names "${node}" twice in one step. Keep one kind per shape`);
    else entries.push({ node, kind });
  }
  return entries;
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = keep 항목 수
// basis: estimate
// `keep="값, 값"`. 값 이름 꼴이 아닌 항목, 같은 이름 두 번, 앞 단계가 없는 첫 단계의 keep은 오류다. 이름이 선언됐는지와 참조 값인지는 value-check.js가 확인한다.
function readKeep(text, { line, ctx }) {
  if (text === undefined) return [];
  if (ctx.figure.kind !== 'flow') ctx.problems.error(line, 'keep belongs to flow figures only, where value lines declare what is kept');
  if (!ctx.figure.steps.length) ctx.problems.error(line, 'keep carries values over from the step before, and the first step has none. Remove keep=, since the first step starts from from=');
  const kept = [];
  for (const id of text.split(',').map((item) => item.trim())) {
    if (!ID_PATTERN.test(id)) ctx.problems.error(line, `keep is a list of value names such as keep="a, b". Found "${id}"`);
    else if (kept.some((k) => k.id === id)) ctx.problems.error(line, `"${id}" is kept twice in one step. Write each value once`);
    else kept.push({ id, line });
  }
  return kept;
}

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 식 수
// basis: estimate
// 단계 `set="식, 식"`. 단계가 시작할 때 값을 정하므로 `@도형`은 쓸 수 없다.
function readStepSets(text, { line, ctx }) {
  if (text === undefined) return [];
  if (ctx.figure.kind !== 'flow') {
    ctx.problems.error(line, 'set belongs to flow figures only, where value lines declare what changes');
    return [];
  }
  const sets = readSets(text, { line, ctx });
  if (sets.some((e) => e.at !== undefined)) ctx.problems.error(line, 'a step set applies when the step starts, so it takes no @node. Put @node in a set= of a move or track');
  return sets;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 한 단계에 박자 줄(이동, show, light, say, wait)과 흐름 줄(track)을 섞으면 오류다. 한 단계의 시간이 두 가지 뜻이 되기 때문이다. */
export function checkMixedStep(word, line, ctx) {
  const { step, problems } = ctx;
  if (word === 'track' && step.beats.length) problems.error(line, 'a step takes beats (moves, show, light, say, wait) or tracks, not both. Put the track in its own step');
  else if (word !== 'track' && step.tracks.length) problems.error(line, `a step with tracks takes no "${word === 'hop' ? 'a -> b' : word}" line. Put it in its own step`);
}

// cost: time O(t + n·e), heap O(t + n·e), stack O(1)
// vars: t = 문장 낱말 수, n = 출발지 수, e = 식 수
// basis: estimate
// `track a, b, c -> x -> y ["글"] [at=time] [every=time] [time=time] [tone=name] [set="식"]`. 출발지마다 흐름 하나로 펼친다.
export function readTrack({ tokens, line }, ctx) {
  const { sources, path, rest } = splitPath(tokens);
  const texts = rest.filter((t) => t.type === 'text');
  const options = rest.filter((t) => t.type === 'option');
  const stuck = rest.filter((t) => t.type === 'word' && t.value === 'stuck');
  if (!sources.length || !path.length || texts.length > 1 || rest.length > texts.length + options.length + stuck.length) {
    ctx.problems.error(line, TRACK_FORM);
    return;
  }
  if (stuck.length > 1) ctx.problems.error(line, 'stuck is written twice in one track');
  const { found, timeMs, tone, sets, lost, condition } = readMoveOptions(options, { scope: 'track', line, ctx, isStuck: stuck.length > 0 });
  const atMs = readTime(found.at, { key: 'at', isZeroOk: true, line, ctx });
  const everyMs = readTime(found.every, { key: 'every', line, ctx });
  const legTimes = readLegs(found.legs, { lineCount: path.length, timeMs, line, ctx });
  sources.forEach((source, i) => {
    // 출발 시각을 적지 않으면 출발지가 every 안에서 고르게 엇갈려 출발한다.
    const start = atMs ?? Math.round(((everyMs ?? 0) * i) / sources.length);
    ctx.step.tracks.push({ path: [source, ...path], source, data: texts[0]?.value, atMs: start, everyMs, timeMs, tone: tone ?? toneOfSource(source, ctx), sets, lost, legTimes, ...(condition ? { condition } : {}), line });
  });
}

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 구간 수
// basis: estimate
/**
 * `legs="1s, -, 3s"`를 구간마다 이동 시간(ms, 정하지 않은 `-`는 null) 목록으로 읽는다. 항목 수는 경로의 선 수와 같고 둘 이상이다.
 * 합계가 맞는지는 여기서 본다(길이를 몰라도 정해지는 조건): 정한 시간의 합이 1시간을 넘으면 `time-limit`이고, `time=`이 있으면 합이 `time=`을 넘거나 같은데 `-` 구간이 있을 때, `-` 구간이 없는데 합이 `time=`과 다를 때 `leg-time`이다.
 * @returns ms 또는 null의 목록. 없거나 틀리면 undefined다
 */
function readLegs(text, { lineCount, timeMs, line, ctx }) {
  if (text === undefined) return undefined;
  const items = text.split(',').map((item) => item.trim());
  const times = items.map((item) => (item === '-' ? null : readLegTime(item, { line, ctx })));
  if (times.includes(undefined)) return undefined;
  if (lineCount < 2) ctx.problems.error(line, 'legs sets the time of each line of a path with two or more lines. Use time= for a path of one line');
  else if (times.length !== lineCount) ctx.problems.error(line, `legs has ${times.length} entries, but the path has ${lineCount} lines. Write one time or - per line`);
  else return checkLegSum(times, { timeMs, line, ctx }) ? times : undefined;
  return undefined;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 구간 시간 항목 하나(`900ms`, `2s`)를 밀리초로. 상한을 넘으면 `time-limit`, 틀리면 `syntax` 오류를 내고 undefined다.
function readLegTime(item, { line, ctx }) {
  const ms = parseTime(item);
  if (ms !== undefined) return ms;
  if (isOverTimeLimit(item)) ctx.problems.error(line, overLimitMessage('legs', item), { code: 'time-limit' });
  else ctx.problems.error(line, `legs takes a positive time such as 900ms or 2s, or - for a line whose time is left to the rest. Found "${item}"`);
  return undefined;
}

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 구간 수
// basis: estimate
// 정한 구간 시간의 합을 본다. 맞으면 true다.
function checkLegSum(times, { timeMs, line, ctx }) {
  const sum = times.reduce((total, ms) => total + (ms ?? 0), 0);
  const hasUnset = times.includes(null);
  const show = (ms) => `${ms / 1000}s`;
  if (sum > TIME_LIMIT_MS) ctx.problems.error(line, `legs add up to ${show(sum)}, over the limit of 1h (${TIME_LIMIT_MS}ms). Shorten a leg`, { code: 'time-limit' });
  else if (timeMs !== undefined && hasUnset && sum >= timeMs - LEG_EPSILON_MS) ctx.problems.error(line, `legs set ${show(sum)} of time=${show(timeMs)}, which leaves no time for the lines marked -. Shorten a leg or raise time=`, { code: 'leg-time' });
  else if (timeMs !== undefined && !hasUnset && Math.abs(sum - timeMs) > LEG_EPSILON_MS) ctx.problems.error(line, `legs add up to ${show(sum)}, but time= is ${show(timeMs)}. Make them equal or mark a line with -`, { code: 'leg-time' });
  else return true;
  return false;
}

// 이름 없이 자동으로 받는 흐름 색의 순서. 첫째 출발지는 브랜드 파랑, 둘째는 보라, 셋째부터는 진한 회색이다.
const AUTO_TONES = ['brand', 'purple', 'gray'];

// cost: time O(v), heap O(1), stack O(1)
// vars: v = 점 색 수
// basis: estimate
// tone을 적지 않은 흐름의 색. 그림 전체에서 출발지 이름마다 AUTO_TONES 순서(브랜드 파랑, 보라, 그다음은 모두 진한 회색)로 받고, 같은 이름은 늘 같은 색이다.
function toneOfSource(source, ctx) {
  ctx.sourceTones ??= new Map();
  if (!ctx.sourceTones.has(source)) ctx.sourceTones.set(source, AUTO_TONES[Math.min(ctx.sourceTones.size, AUTO_TONES.length - 1)]);
  return ctx.sourceTones.get(source);
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `track` 뒤 `a, b, c -> x -> y`를 출발지 목록과 이어지는 이름 목록으로 읽고, 나머지 낱말을 돌려준다.
function splitPath(tokens) {
  const sources = [];
  let i = 1;
  while (tokens[i]?.type === 'word') sources.push(...tokens[i++].value.split(',').filter(Boolean));
  const path = [];
  while (tokens[i]?.type === 'arrow' && tokens[i + 1]?.type === 'word') {
    path.push(tokens[i + 1].value);
    i += 2;
  }
  return { sources, path, rest: tokens.slice(i) };
}
