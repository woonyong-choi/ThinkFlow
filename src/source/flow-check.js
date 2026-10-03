// 흐름 단계의 선을 확인한다. 흐름은 선언된 선들을 이어 지나므로, 구간마다 박자의 이동과 같은 규칙으로 따라갈 선을 정한다.

// cost: time O(t·p·e), heap O(p), stack O(1)
// vars: t = 흐름 수, p = 흐름 경로의 도형 수, e = 선 수
// basis: estimate
/**
 * 단계 하나의 흐름을 확인한다. 흐름마다 구간별 선(legs: { edge, isBack })을 채운다.
 * @param deps { figure, names, problems, resolveHop, usedEdges }. resolveHop은 이동이 따라갈 선을 정하는 함수(validate.js)다
 */
export function checkFlowStep(step, deps) {
  const { figure, problems, resolveHop, usedEdges } = deps;
  if (step.forMs !== undefined && !step.tracks.length) problems.error(step.line, 'for sets the length of a step with tracks. Add a track line or remove for');
  for (const track of step.tracks) {
    track.legs = track.path.slice(1).map((to, i) => {
      const leg = { from: track.path[i], to, line: track.line };
      resolveHop(leg, deps, usedEdges);
      return leg;
    });
    const labels = track.legs.filter((leg) => leg.edge !== undefined).map((leg) => figure.edges[leg.edge].label);
    if (track.data !== undefined && labels.includes(track.data)) problems.warn(track.line, `[check 8] the moving text "${track.data}" repeats an edge label. Remove one of them`);
  }
}
