// 같은 흐름의 두 기하(다른 배치, 다른 그래프 보기)에서 도형에 들어가고 나오는 경계를 같은 사건 자리로 대응시키고, 그 대응으로 이동 시간 꺾은선(pace)을 옮긴다.
import { paceLength, paceProgress } from './easing.js';

const bounds = (gaps) => [0, ...gaps.flat(), 1];

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 경로의 선 수
// basis: estimate
/**
 * 경계마다 [앞 기하의 길이 비율, 뒤 기하의 길이 비율]을 짝짓는다. 처음과 끝은 늘 든다.
 * 앞에서 길이가 0인 이음이 뒤에서 길어지면 점이 순간 이동해야 한다. onJump가 있으면 그것을 부르고(재배치는 거절한다), 없으면 그 경계를 건너뛰어 앞뒤 구간 안에서 지나간다(보기 사이 정렬).
 */
export function boundaryMap(previous, next, onJump) {
  const from = bounds(previous.gaps);
  const to = bounds(next.gaps);
  const points = [];
  for (const [i, value] of from.entries()) {
    if (i && value === from[i - 1]) {
      if (to[i] !== to[i - 1]) onJump?.();
    } else points.push([value, to[i]]);
  }
  return points;
}

// cost: time O(l²), heap O(l), stack O(1)
// vars: l = 구간 꺾은선과 도형 경계 수
// basis: estimate
/** 기존 속도 꺾은선과 경계 시각을 모두 남겨 합성한다. 중간 도착·대기 해제·사라짐 시각은 달라지지 않는다. */
export function remapPace(pace, mapping) {
  const progress = new Set([...(pace ?? []).map(([at]) => at), ...mapping.map(([length]) => paceProgress(pace, length))]);
  return [...progress].sort((a, b) => a - b).map((at) => [at, paceLength(mapping, paceLength(pace, at))]);
}

// cost: time O(l²), heap O(l), stack O(1)
// vars: l = 경로의 선 수
// basis: estimate
/** 시간을 정한 보기(owner)의 pace를 다른 보기(mirror)의 기하로 옮긴다. 두 보기에서 점이 같은 시각에 같은 도형에 닿는다. 선이 하나뿐이면 옮길 경계가 없어 그대로다. */
export function mirrorPace(owner, pace, mirror) {
  const mapping = boundaryMap(owner, mirror);
  return mapping.length > 2 ? remapPace(pace, mapping) : pace;
}
