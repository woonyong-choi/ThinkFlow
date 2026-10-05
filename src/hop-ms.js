// 점이 선 하나를 지나는 시간. 박자의 이동과 흐름(track)이 같은 규칙을 쓴다(docs/design/figure-syntax.md 이동 시간).
import { flattenRoute, routeLength } from './route.js';
import { values } from './tokens.js';

const DWELL = values.duration;
const HOP_REF = values.size.packet['hop-ref'];

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
// 이동 시간은 선 길이에 비례한다. 기준 길이를 speed(기본 duration.hop)에 지나되, 아주 짧은 선만 최소 시간으로 올린다. 최대는 없다. 같은 속도로 보이게 하려는 것이다.
// 최소는 speed를 기본값에서 바꾼 비율만큼 같이 늘고 줄어, 빠르게 한 그림이 최소 시간에 막히지 않는다.
export function hopMs(points, speed) {
  return lengthMs(routeLength(flattenRoute(points)), speed);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 길이(px)로 정한 이동 시간. hopMs가 선 하나의 길이로, 구간별 이동 시간(`legs=`)이 구간 길이로 같은 규칙을 쓴다. */
export function lengthMs(length, speed) {
  const scale = speed / DWELL.hop;
  const ms = (length / HOP_REF) * speed;
  return Math.round(Math.max(DWELL['hop-min'] * scale, ms));
}
