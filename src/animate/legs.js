// 점 하나가 선마다 올라 있는 시각 구간. 선 켜짐과 고정 라벨 알약의 활성 색이 점이 선 위에 있는 동안만 켜지도록 시간표의 이동(hop)에서 읽는다.
import { arrivalOffsetMs } from '../easing.js';

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 이동이 지나는 선 수
// basis: estimate
/**
 * 이동 하나가 각 선에 올라 있는 이동 시작 뒤 구간 { edge, from, to }(ms). 박자의 이동(hop.edge)은 선 하나에 이동 내내 있고,
 * 흐름의 점(hop.track)은 길 계획(legEdges)대로 구간마다 그 선에 있는 동안이며 도형 안을 지나는 이음(gaps)은 어느 선에도 속하지 않는다. 사라지는 점(cut)은 거기까지다.
 * 정본이 아닌 이동(선 번호나 이음이 없거나 어긋남)은 근사하지 않고 오류다. 재생기(player/sample.js)도 같은 규칙이다.
 */
export function hopLegs(hop) {
  const end = hop.cut ?? hop.ms;
  const isTrack = hop.track !== undefined;
  const edges = isTrack ? hop.legEdges : [hop.edge];
  const gaps = hop.gaps ?? [];
  if (!(hop.ms > 0 && Number.isFinite(hop.ms)) || !Array.isArray(edges) || !edges.length || !edges.every(Number.isInteger) || (isTrack && gaps.length !== edges.length - 1)) {
    throw new Error(`hop is not canonical: ${isTrack ? `track ${hop.track}` : `edge ${hop.edge}`}, ms ${hop.ms}, legEdges ${JSON.stringify(hop.legEdges)}, gaps ${JSON.stringify(hop.gaps)}`);
  }
  const spanOf = (k) => (isTrack ? [k === 0 ? 0 : gaps[k - 1][1], k === edges.length - 1 ? 1 : gaps[k][0]] : [0, 1]);
  return edges.flatMap((edge, k) => {
    const [from, to] = spanOf(k).map((fraction) => arrivalOffsetMs(fraction, hop.ms, hop.pace));
    return from < end && from < to ? [{ edge, from, to: Math.min(to, end) }] : [];
  });
}
