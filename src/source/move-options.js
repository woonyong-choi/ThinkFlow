// 이동 줄과 흐름 줄이 함께 쓰는 선택 사항(time=, tone=, set=). 문법 표(grammar.js)의 `hop.*`, `track.*` 항목대로 읽고, 시간과 값 바꾸기 식을 한 규칙으로 해석한다.
import { optionsOf } from './grammar.js';
import { readOptions } from './options.js';
import { readSets } from './value.js';
import { isOverTimeLimit, overLimitMessage, parseTime } from './values.js';

const WHAT = { hop: 'a move', track: 'a track' };
const PERCENT_PATTERN = /^(\d+(?:\.\d+)?)%$/;
/** `lost=`가 가리키는 비율의 상한(퍼센트) */
const LOST_MAX = 100;

// cost: time O(t + e), heap O(t + e), stack O(1)
// vars: t = 선택 사항 수, e = 식 수
// basis: estimate
/**
 * 선택 사항 낱말들을 읽는다. scope는 `hop`이나 `track`이다.
 * @returns { found, timeMs, tone, sets, lost }. found는 읽은 값 그대로({ at, every ... }), timeMs는 time=을 밀리초로, sets는 set= 식 목록, lost는 lost=를 0에서 1 사이 비율로(없으면 undefined)다
 */
export function readMoveOptions(options, { scope, line, ctx }) {
  const found = readOptions(options, { scopes: [scope], what: WHAT[scope], line, ctx });
  const isSetKnown = 'set' in optionsOf(scope) && ctx.figure.kind === 'flow';
  if (found.set !== undefined && !isSetKnown) ctx.problems.error(line, 'set belongs to flow figures only, where value lines declare what changes');
  return { found, timeMs: readTime(found.time, { key: 'time', line, ctx }), tone: found.tone, sets: found.set === undefined || !isSetKnown ? [] : readSets(found.set, { line, ctx }), lost: readLost(found.lost, { line, ctx }) };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// `lost=60%`를 경로 전체 길이의 비율(0에서 1)로. `%`가 없거나 0 이상 100 이하가 아니면 오류다. 구조 그림(flow)에서만 쓴다.
function readLost(text, { line, ctx }) {
  if (text === undefined) return undefined;
  if (ctx.figure.kind !== 'flow') {
    ctx.problems.error(line, 'lost belongs to flow figures only, where a dot has a path to be lost on');
    return undefined;
  }
  const percent = PERCENT_PATTERN.exec(text);
  if (!percent || Number(percent[1]) > LOST_MAX) {
    ctx.problems.error(line, `lost is a percent from 0% to ${LOST_MAX}% of the path, such as lost=60%. Found "${text}"`);
    return undefined;
  }
  return Number(percent[1]) / LOST_MAX;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 시간 선택 사항 하나를 밀리초로. 틀리면 오류를 내고 undefined다. isZeroOk면 0도 받는다(출발 시각). */
export function readTime(text, { key, isZeroOk = false, line, ctx }) {
  if (text === undefined) return undefined;
  const ms = parseTime(text, isZeroOk);
  if (ms === undefined && isOverTimeLimit(text)) ctx.problems.error(line, overLimitMessage(key, text), { code: 'time-limit' });
  else if (ms === undefined) ctx.problems.error(line, `${key} is ${isZeroOk ? 'a time such as 0s, 900ms, or 2s' : 'a positive time such as 900ms or 2s'}. Found "${text}"`);
  return ms;
}
