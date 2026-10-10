// 흐름의 선과 도형 내부 이음을 하나의 경로로 묶는다. 시간이나 사건은 계산하지 않는다.
import { flattenRoute, routeLength } from './route.js';

/** 흐름이 지나는 그래프 보기마다 하나인 구간 선 목록 { view, legs, elseLeg? }. 첫 항목이 시간을 정한다. 보기 정보가 없는 흐름은 자기 구간 하나다. */
export const trackInstances = (track) => track.instances ?? [{ legs: track.legs, ...(track.elseLeg ? { elseLeg: track.elseLeg } : {}) }];

// cost: time O(l·p), heap O(l·p), stack O(1)
// vars: l = 흐름의 선 수, p = 선의 경로 점 수
// basis: estimate
/** 구간별 경로·길이와 도형 경계의 길이 비율. track은 { path, legs } 하나의 보기 몫이다. 같은 계산을 최초 빌드와 재배치에서 사용한다. */
export function trackGeometry(track, scene) {
  const parts = track.legs.map((leg) => (leg.isBack ? [...scene.edges[leg.edge].points].reverse() : scene.edges[leg.edge].points));
  const lengths = parts.map((part) => routeLength(flattenRoute(part)));
  const joins = parts.slice(1).map((part, i) => Math.hypot(part[0].x - parts[i].at(-1).x, part[0].y - parts[i].at(-1).y));
  const total = lengths.reduce((sum, length) => sum + length, 0) + joins.reduce((sum, length) => sum + length, 0);
  const fracs = [0];
  const gaps = [];
  let covered = 0;
  lengths.forEach((length, i) => {
    covered += length;
    fracs.push(covered / total);
    if (i < joins.length) {
      gaps.push([covered / total, (covered + joins[i]) / total]);
      covered += joins[i];
    }
  });
  fracs[fracs.length - 1] = 1;
  return {
    parts,
    route: parts.flatMap((part) => flattenRoute(part)),
    lengths,
    joins,
    edges: [...new Set(track.legs.map((leg) => leg.edge))],
    legEdges: track.legs.map((leg) => leg.edge),
    names: track.path,
    nodes: track.path.map((id) => id.split('.')[0]),
    fracs,
    gaps,
  };
}
