// 흐름 장면의 선을 확인한다. 흐름은 선언된 선들을 이어 지나므로, 경로가 통째로 놓인 그래프 보기마다 구간별로 박자의 이동과 같은 규칙으로 따라갈 선을 정한다.
import { viewsOfPath } from './project.js';

// cost: time O(t·(p·v·e)), heap O(p·v), stack O(1)
// vars: t = 흐름 수, p = 흐름 경로의 도형 수, v = 보기 수, e = 선 수
// basis: estimate
/**
 * 장면 하나의 흐름을 확인한다. 흐름마다 구간별 선(legs: { from, to, projections, projection, isBack })을 채운다. projections는 경로가 든 그래프 보기마다 하나이고
 * 첫 보기가 시간을 정한다(projection, isBack은 그 보기의 값). 순서 보기에는 메시지가 되지 않는다.
 * @param deps { figure, names, problems, resolveHop, usedEdges }. resolveHop은 이동이 따라갈 선을 정하는 함수(validate.js)다
 */
export function checkFlowStep(step, deps) {
  const { figure, problems, resolveHop, usedEdges } = deps;
  if (step.forMs !== undefined && !step.tracks.length) problems.error(step.line, 'for sets the length of a scene with tracks. Add a track line or remove for');
  for (const track of step.tracks) {
    const elseNode = track.condition?.elseNode;
    const views = viewsOfPath(figure, elseNode ? [...track.path, elseNode] : track.path);
    const before = problems.errors.length;
    const scope = views.length ? { only: views.map((view) => view.id) } : undefined;
    track.legs = track.path.slice(1).map((to, i) => {
      const leg = { from: track.path[i], to, line: track.line };
      resolveHop(leg, deps, usedEdges, scope);
      return leg;
    });
    if (elseNode) resolveHop((track.elseLeg = { from: track.source, to: elseNode, line: track.line }), deps, usedEdges, scope);
    if (!views.length && problems.errors.length === before) problems.error(track.line, `the track ${track.path.join(' -> ')}${elseNode ? ` (else ${elseNode})` : ''} must lie inside one graph view. A track is drawn in graph views only`);
    const labels = track.legs.filter((leg) => leg.projection).map((leg) => figure.edges[leg.projection.docEdge].label);
    if (track.data !== undefined && labels.includes(track.data)) problems.warn(track.line, `[check 8] the moving text "${track.data}" repeats an edge label. Remove one of them`);
  }
}
