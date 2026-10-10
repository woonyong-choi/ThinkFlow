// 시간표 구간 하나를 만든다. 박자 구간(timeline.js)과 흐름 구간(timeline-flow.js)이 같은 필드 구성과 시각 보내기를 쓴다.
import { makeDiagnostic, FigureError } from './source/problems.js';
import { TIME_LIMIT_MS } from './source/values.js';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 구간을 만들고 시각 run.t를 그 길이만큼 앞으로 보낸다. 필드 순서는 시간표 JSON이 그대로 따른다.
 * @param run 시간표를 지나며 이어지는 값 { t }
 * @param fields { line, si, bi, length, move, hops, nodesOn, partsOn, card, charts, status?, extra }. card는 { before, after, at }이고 charts는 차트 카드 id → { series, growing, lights }(차트 카드가 없으면 빈 객체), status는 장면의 도형 상태 `{ node, kind }` 목록(없거나 비면 필드를 쓰지 않는다), extra는 구간 끝에 더하는 필드다
 */
export function createSeg(run, fields) {
  const { si, bi, length, card } = fields;
  if (!(run.t + length <= TIME_LIMIT_MS)) throw new FigureError([makeDiagnostic({ severity: 'error', line: fields.line, message: `the figure runs longer than the limit of 1h (${TIME_LIMIT_MS}ms) at this line. Shorten a time or remove a scene` }, { code: 'time-limit' })]);
  const seg = {
    si,
    bi,
    t0: run.t,
    t1: run.t + length,
    move: fields.move,
    hops: fields.hops,
    nodesOn: fields.nodesOn,
    partsOn: fields.partsOn,
    cards: card.after,
    cardsBefore: card.before,
    cardsAt: card.at,
    ...(Object.keys(fields.charts ?? {}).length ? { charts: fields.charts } : {}),
    ...(fields.status?.length ? { status: fields.status } : {}),
    ...fields.extra,
  };
  run.t = seg.t1;
  return seg;
}
