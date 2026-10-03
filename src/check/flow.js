// 14번: 흐름이 점을 그리고 점 수와 값 글자가 상한 안에 있다.
import { VALUE_MAX } from '../source/grammar.js';
import { values } from '../tokens.js';

const DOTS_MAX = values.scale['flow-dots-max'];

// cost: time O(h + t + r·c), heap O(t), stack O(1)
// vars: h = 점 수, t = 흐름 수, r = 값 줄 수, c = 값이 바뀌는 횟수
// basis: estimate
// 14번: 흐름마다 점이 하나 이상 그려지고(오류), 한 그림의 점이 토큰 `scale.flow-dots-max` 이하이며(경고), 값이 바뀌어 간 글자가 `VALUE_MAX`자 이하다(오류).
export function checkFlow({ figure, timeline }, problems) {
  const dots = timeline.segs.flatMap((seg) => seg.hops.filter((hop) => hop.track !== undefined));
  (timeline.tracks ?? []).forEach((track, k) => {
    if (!dots.some((hop) => hop.track === k)) problems.error(track.line, `[check 14] track ${track.names.join(' -> ')} draws no dot because its first dot would start after the step ends. Lengthen the step with for=, or start earlier with at=`);
  });
  if (dots.length > DOTS_MAX) problems.warn(timeline.tracks[0].line, `[check 14] the flows draw ${dots.length} dots, over the limit of ${DOTS_MAX}. Raise every=, shorten for=, or remove a track`);
  for (const row of timeline.values ?? []) {
    const long = row.changes.find(([, text]) => [...text].length > VALUE_MAX);
    if (long) problems.error(figure.values.find((v) => v.id === row.id).line, `[check 14] value "${row.id}" reaches "${long[1]}", over ${VALUE_MAX} characters. Its row has room for ${VALUE_MAX}. Use smaller + or - steps or a shorter value`);
  }
}
