// 14번: 흐름이 점을 그리고 점 수, 큐 값이 상한 안에 있다.
import { values } from '../vendor/theme/tokens.js';

const DOTS_MAX = values.scale['flow-dots-max'];

// cost: time O(h + t + r·c), heap O(t), stack O(1)
// vars: h = 점 수, t = 흐름 수, r = 값 줄 수, c = 값이 바뀌는 횟수
// basis: estimate
// 14번: 흐름마다 점이 하나 이상 그려지고(오류, 사라짐 lost나 조건 when, wait가 있는 흐름은 점이 없을 수 있어 제외), 한 그림의 점이 토큰 `scale.flow-dots-max` 이하이며(경고), 큐 값이 0 이상 칸 수 이하다(경고).
// 값 글자의 길이는 제한하지 않는다. 카드의 값 자리가 값이 가질 모든 글의 실제 폭으로 정해지고, 넘치는 글은 자리 폭에서 줄을 나눈다.
export function checkFlow({ figure, timeline }, problems) {
  const dots = timeline.segs.flatMap((seg) => seg.hops.filter((hop) => hop.track !== undefined));
  // 점이 없을 수 있는 흐름: 사라짐(`lost`)이 있거나 조건(`when`, `wait`)이 점을 막을 수 있다.
  const mayBeEmpty = figure.steps.flatMap((step) => step.tracks).map((track) => track.lost !== undefined || Boolean(track.condition?.when || track.condition?.wait));
  // 시간표의 길은 흐름이 지나는 그래프 보기마다 하나라 흐름 번호(source)로 흐름을 찾는다
  (timeline.tracks ?? []).forEach((track, k) => {
    if (!mayBeEmpty[track.source ?? k] && !dots.some((hop) => hop.track === k)) problems.error(track.line, `[check 14] track ${track.names.join(' -> ')} draws no dot because its first dot would start after the step ends. Lengthen the step with for=, or start earlier with at=`);
  });
  if (dots.length > DOTS_MAX) problems.warn(timeline.tracks?.[0]?.line ?? figure.line, `[check 14] the flows draw ${dots.length} dots, over the limit of ${DOTS_MAX}. Raise every=, shorten for=, or remove a track`);
  const warned = new Set();
  for (const row of timeline.values ?? []) if (row.slots !== undefined) checkQueue(row, { figure, warned }, problems);
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 값이 바뀌는 횟수
// basis: estimate
// 큐 값이 0칸 아래로 내려가거나 칸 수를 넘으면 경고한다. 그림은 음수를 0칸, 칸 수 초과를 가득 찬 칸으로 그린다. 큐마다 어긋난 쪽(아래, 위)에서 처음 닿은 값 하나만 알린다.
function checkQueue(row, { figure, warned }, problems) {
  const line = figure.values.find((v) => v.id === row.id).line;
  const reached = [row.initial, ...row.changes.map(([, text]) => text)];
  const below = reached.find((text) => Number(text) < 0);
  const over = reached.find((text) => Number(text) > row.slots);
  if (below !== undefined && !warned.has(`${row.id}<`)) {
    warned.add(`${row.id}<`);
    problems.warn(line, `[check 14] queue "${row.id}" reaches ${below}, below 0. It draws as 0 filled slots. Start from a higher count or take out less than was put in`);
  }
  if (over !== undefined && !warned.has(`${row.id}>`)) {
    warned.add(`${row.id}>`);
    problems.warn(line, `[check 14] queue "${row.id}" reaches ${over}, over its ${row.slots} slots. It draws as full. Raise slots= or put in less than is taken out`);
  }
}
