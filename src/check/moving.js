// 7번: 이동 글 상자가 그림 안에 있고 이름을 가리지 않는다.
import { CHIP_GAP, planChip, sizeChip } from '../chip.js';
import { chipLines, chipObstacles } from '../draw/boxes.js';

// cost: time O(h·(k·p + k·a)), heap O(a), stack O(1)
// vars: h = 글 상자 있는 이동 수, k = 재는 지점 수(21), p = 경로 점 수, a = 글자 사각형 수
// basis: estimate
// 7번: 이동 경로의 5% 지점마다 정한 글 상자(점 위, 안 되면 아래)가 그림 안에 있고 도형 이름, 열, 그룹 제목, 도형 테두리, 선 라벨 알약을 가리지 않는다.
// 글 상자가 그림보다 넓거나 위아래 어디에도 들어가지 않으면 오류, 위아래 어디에 두어도 글자를 가리면 경고다.
export function checkChips({ scene, timeline }, problems) {
  const avoid = [...chipObstacles(scene), ...chipLines(scene)];
  const reported = new Set();
  for (const seg of timeline.segs) {
    for (const hop of seg.hops) {
      const key = `${hop.edge}\u0000${hop.data?.join('\u0000')}`;
      if (!hop.data || reported.has(key)) continue;
      reported.add(key);
      reportChip(hop, { scene, issues: planChip(scene, hop, avoid).issues }, problems);
    }
  }
}

// cost: time O(i), heap O(1), stack O(1)
// vars: i = 지점별 문제 수
// basis: estimate
function reportChip(hop, { scene, issues }, problems) {
  const edge = scene.edges[hop.edge];
  const text = hop.data.join(' ');
  const percent = (at) => Math.round((hop.isBack ? 1 - at : at) * 100);
  const outside = issues.find((issue) => issue.isOutside);
  if (outside) {
    const fix = sizeChip(hop.data).w + CHIP_GAP * 2 > scene.width ? 'Shorten the moving text' : 'Shorten the moving text or move the edge away from the figure edge';
    problems.error(hop.line ?? 1, `[check 7] moving text "${text}" leaves the figure at ${percent(outside.at)}% of edge ${edge.from} -> ${edge.to}. ${fix}`);
    return;
  }
  const covered = issues.find((issue) => issue.hits.length);
  if (covered) problems.warn(hop.line ?? 1, `[check 7] moving text "${text}" covers "${covered.hits[0]}" at ${percent(covered.at)}% of edge ${edge.from} -> ${edge.to}, wherever it is placed (above, below, lifted, or beside the dot). Shorten the moving text or move the edge away from the shape or label`);
}
