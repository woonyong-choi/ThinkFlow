// 사건 시간표는 그대로 두고 새 배치의 경로와 거리 비율만 연결한다.
import { FigureError, makeDiagnostic } from './source/problems.js';
import { boundaryMap, remapPace } from './track-pace.js';
import { trackGeometry, trackInstances } from './track-geometry.js';

// cost: time O(t·p + h·l² + n), heap O(n + t·p), stack O(1)
// vars: t = 흐름 수, p = 경로 점 수, h = 이동 수, l = 흐름의 선 수, n = 시간표 크기
// basis: estimate
/** 기존 사건과 시각을 복사하고 경로만 새 장면에 대응시킨다. 이벤트 처리기는 호출하지 않는다. */
export function reflowTimeline(reference, { figure, scene }) {
  const ends = (edges) => edges.map(({ from, to }) => [from, to]);
  if (JSON.stringify(ends(reference.scene.edges)) !== JSON.stringify(ends(scene.edges))) fail(figure.line, 'edge order or endpoints changed');
  const timeline = structuredClone(reference.timeline);
  // 흐름 하나는 지나는 그래프 보기마다 길 하나(timeline.tracks의 항목)다
  const sources = figure.steps.flatMap((step) => step.tracks.flatMap((track) => trackInstances(track).map((instance) => ({ track, instance }))));
  const previous = reference.timeline.tracks ?? [];
  if (sources.length !== previous.length) fail(figure.line, 'track count changed');
  const geometry = sources.map(({ track, instance }) => trackGeometry({ path: track.path, legs: instance.legs }, scene));
  // 도형에 들어가고 나오는 경계를 같은 사건 자리로 대응한다. 0시간 이음이 새 배치에서 길어지면 순간 이동이 필요하므로 거절한다.
  const mappings = geometry.map((track, i) => {
    if (previous[i].gaps.length !== track.gaps.length) fail(previous[i].line, 'route boundaries changed');
    return boundaryMap(previous[i], track, () => fail(previous[i].line, 'a zero-length junction became a moving interval'));
  });
  if (timeline.tracks) timeline.tracks = geometry.map(({ parts, route, names, gaps }, i) => ({ ...previous[i], parts, route, names, gaps }));
  for (const seg of timeline.segs) {
    for (const hop of seg.hops) {
      delete hop.chipPath;
      delete hop.chipFade;
      if (hop.track === undefined) continue;
      hop.gaps = geometry[hop.track].gaps;
      if (mappings[hop.track].length > 2) hop.pace = remapPace(hop.pace, mappings[hop.track]);
    }
  }
  return timeline;
}

function fail(line, reason) {
  throw new FigureError([makeDiagnostic({ severity: 'error', line, message: `cannot preserve the timetable while reflowing: ${reason}` }, { code: 'layout-timing' })]);
}
