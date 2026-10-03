// 흐름 단계 문장(`step ... for=시간`, `track a -> b -> c ...`)을 읽는다. 선이 있는지와 시간이 맞는지는 flow-check.js가 확인한다.
import { readMoveOptions, readTime } from './move-options.js';
import { valueNames } from './grammar.js';
import { readOptions } from './options.js';
import { parseTime } from './values.js';

const TRACK_FORM = 'write a track as: track a, b -> c -> d ["text"] [at=time] [every=time] [time=time] [tone=name] [set="id+1@node"]';

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 선택 사항 수
// basis: estimate
/** 단계의 선택 사항(`for=`)을 읽어 단계 길이(ms)를 돌려준다. 없거나 틀리면 undefined다. */
export function readStepOptions(options, { line, ctx }) {
  const found = readOptions(options, { scopes: ['step'], what: 'a step', line, ctx });
  if (found.for === undefined) return undefined;
  const ms = parseTime(found.for);
  if (ms === undefined) ctx.problems.error(line, `for is a positive time such as 12s. Found "${found.for}"`);
  return ms;
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
  if (!sources.length || !path.length || texts.length > 1 || rest.length > texts.length + options.length) {
    ctx.problems.error(line, TRACK_FORM);
    return;
  }
  const { found, timeMs, tone, sets } = readMoveOptions(options, { scope: 'track', line, ctx });
  const atMs = readTime(found.at, { key: 'at', isZeroOk: true, line, ctx });
  const everyMs = readTime(found.every, { key: 'every', line, ctx });
  sources.forEach((source, i) => {
    // 출발 시각을 적지 않으면 출발지가 every 안에서 고르게 엇갈려 출발한다.
    const start = atMs ?? Math.round(((everyMs ?? 0) * i) / sources.length);
    ctx.step.tracks.push({ path: [source, ...path], source, data: texts[0]?.value, atMs: start, everyMs, timeMs, tone: tone ?? toneOfSource(source, ctx), sets, line });
  });
}

// cost: time O(v), heap O(1), stack O(1)
// vars: v = 점 색 수
// basis: estimate
// tone을 적지 않은 흐름의 색. 그림 전체에서 출발지 이름마다 문법 표의 점 색 순서대로 하나씩 받고, 같은 이름은 늘 같은 색이다.
function toneOfSource(source, ctx) {
  ctx.sourceTones ??= new Map();
  if (!ctx.sourceTones.has(source)) ctx.sourceTones.set(source, valueNames('tone')[ctx.sourceTones.size % valueNames('tone').length]);
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
