// 7번: 이동 글 상자가 그림 안에 있고 이름을 가리지 않는다.
import { CHIP_GAP, sizeChip } from '../chip.js';
import { findClashes } from '../chip-clash.js';
import { issuesOfHop } from '../chip-plan.js';
import { visibleShare } from '../chip-motion.js';
import { chipLines, chipObstacles } from '../draw/boxes.js';
import { flattenRoute } from '../route.js';
import { values } from '../vendor/theme/tokens.js';

// 박자 이동의 글 상자가 보여야 하는 비율의 하한(chip-plan.js와 같은 토큰)
const SHARE_MIN = values.scale['chip-visible-share'];

// cost: time O(h·(k·p + k·a)), heap O(a), stack O(1)
// vars: h = 글 상자 있는 이동 수, k = 재는 지점 수(21), p = 경로 점 수, a = 글자 사각형 수
// basis: estimate
// 7번: 이동의 계획 지점(2프레임 간격)마다 정한 글 상자(점 위, 안 되면 아래)가 그림 안에 있고 도형 이름, 열, 그룹 제목, 도형 테두리, 선 라벨 알약을 가리지 않는다.
// 글 상자가 그림보다 넓거나 위아래 어디에도 들어가지 않으면 오류, 위아래 어디에 두어도 글자를 가리면 경고다.
export function checkChips({ scene, timeline }, problems) {
  const avoid = [...chipObstacles(scene, timeline), ...chipLines(scene)];
  const reported = new Set();
  for (const seg of timeline.segs) {
    for (const hop of seg.hops) {
      const key = `${hop.track === undefined ? hop.edge : `t${hop.track}`}\u0000${hop.data?.join('\u0000')}`;
      if (!hop.data || reported.has(key)) continue;
      reported.add(key);
      reportChip(hop, { path: pathName(hop, scene, timeline), issues: issuesOfHop(scene, hop, avoid), scene }, problems);
    }
  }
  reportClashes(findClashes(scene, timeline), problems);
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 겹침 수
// basis: estimate
// 보이는 글 상자끼리 겹침. 같은 글 쌍은 한 번만 알린다. 흐름은 겹치는 구간에서 나중에 출발한 점의 글 상자가 숨어 여기에 오지 않는다.
function reportClashes(clashes, problems) {
  const reported = new Set();
  for (const { a, b, t } of clashes) {
    const key = `${a.data.join(' ')}\u0000${b.data.join(' ')}`;
    if (reported.has(key)) continue;
    reported.add(key);
    problems.warn(b.line ?? 1, `[check 7] moving text "${b.data.join(' ')}" overlaps moving text "${a.data.join(' ')}" at ${Math.round(t)}ms of the step. Change the move times so the dots are not on screen together, or shorten the texts`);
  }
}

// 글 상자가 따라가는 길의 이름. 이동은 선이고 흐름은 지나는 도형 이름을 잇는다.
function pathName(hop, scene, timeline) {
  if (hop.track !== undefined) return `track ${timeline.tracks[hop.track].names.join(' -> ')}`;
  return `edge ${scene.edges[hop.edge].from} -> ${scene.edges[hop.edge].to}`;
}

// cost: time O(i), heap O(1), stack O(1)
// vars: i = 지점별 문제 수
// basis: estimate
function reportChip(hop, { scene, issues, path }, problems) {
  const text = hop.data.join(' ');
  const percent = (at) => Math.round((hop.isBack ? 1 - at : at) * 100);
  const outside = issues.find((issue) => issue.isOutside);
  if (outside) {
    const fix = sizeChip(hop.data).w + CHIP_GAP * 2 > scene.width ? 'Shorten the moving text' : 'Shorten the moving text or move the edge away from the figure edge';
    problems.error(hop.line ?? 1, `[check 7] moving text "${text}" leaves the figure at ${percent(outside.at)}% of ${path}. ${fix}`);
    return;
  }
  const covered = issues.find((issue) => issue.hits.length);
  if (!covered) return;
  if (hop.track !== undefined) {
    const hidden = Math.round((issues.filter((issue) => issue.hits.length).length / issues.length) * 100);
    problems.warn(hop.line ?? 1, `[check 7] moving text "${text}" is hidden for ${hidden}% of the time it is on screen because it would cover "${covered.hits[0]}" at ${percent(covered.at)}% of ${path}. Shorten the moving text or lengthen the edge so the text fits between the shapes`);
    return;
  }
  // 박자 이동의 글은 정보라서 보이는 시간이 SHARE_MIN 이상이어야 한다. 모자라면 숨는 시간을 알린다.
  const share = visibleShare({ route: flattenRoute(scene.edges[hop.edge].points), hop, chip: sizeChip(hop.data) }, hop.chipPath);
  if (share >= SHARE_MIN) return;
  problems.warn(hop.line ?? 1, `[check 7] moving text "${text}" is hidden for ${Math.round((1 - share) * 100)}% of the time it is on screen because it would cover "${covered.hits[0]}" at ${percent(covered.at)}% of ${path}. Shorten the moving text or lengthen the edge so the text fits beside the dot`);
}
