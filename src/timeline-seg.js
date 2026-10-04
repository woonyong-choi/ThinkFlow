// 시간표 구간 하나를 만든다. 박자 구간(timeline.js)과 흐름 구간(timeline-flow.js)이 같은 필드 구성과 시각 보내기를 쓴다.
import { makeDiagnostic, FigureError } from './source/problems.js';
import { TIME_LIMIT_MS } from './source/values.js';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 구간을 만들고 시각 run.t를 그 길이만큼 앞으로 보낸다. 필드 순서는 시간표 JSON이 그대로 따른다.
 * @param run 시간표를 지나며 이어지는 값 { t, revealed, hasReveal, seriesIds }
 * @param fields { line, si, bi, length, labelShifts, move, hops, edgesOn, nodesOn, partsOn, card, caption, growing, lights, extra }. card는 { before, after, at }이고 extra는 구간 끝에 더하는 필드다
 */
export function createSeg(run, fields) {
  const { si, bi, length, card } = fields;
  if (!(run.t + length <= TIME_LIMIT_MS)) throw new FigureError([makeDiagnostic({ severity: 'error', line: fields.line, message: `the figure runs longer than the limit of 1h (${TIME_LIMIT_MS}ms) at this line. Shorten a time or remove a step` }, { code: 'time-limit' })]);
  const seg = {
    si,
    bi,
    t0: run.t,
    t1: run.t + length,
    labelShifts: fields.labelShifts,
    move: fields.move,
    hops: fields.hops,
    edgesOn: fields.edgesOn,
    nodesOn: fields.nodesOn,
    partsOn: fields.partsOn,
    cards: card.after,
    cardsBefore: card.before,
    cardsAt: card.at,
    caption: fields.caption,
    series: run.hasReveal ? [...run.revealed] : run.seriesIds,
    growing: fields.growing,
    lights: fields.lights,
    ...fields.extra,
  };
  run.t = seg.t1;
  return seg;
}
