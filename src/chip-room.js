// 흐름 글 상자가 도형 이름을 가려 많이 숨는 그림에서, 글 상자가 지나는 선의 간격이 얼마나 필요한지 정한다(docs/design/layout.md 이동 글 간격).
// 배치가 그 선에 간격을 요구하도록 다시 배치할 때 쓰는 값이고, 숨음이 없는 그림은 건드리지 않는다.
import { CHIP_GAP, sizeChip } from './chip.js';
import { issuesOfHop } from './chip-plan.js';
import { chipLines, chipObstacles } from './draw/boxes.js';
import { values } from './tokens.js';

const STEP = values.scale['chip-room-step'];
const TRIES = values.scale['chip-room-tries'];

// cost: time O(g), heap O(g), stack O(1)
// vars: g = 도형 안을 지나는 구간 수
// basis: estimate
// 흐름 길 위 진행 비율 at이 놓인 선(구간) 번호. 구간은 도형 안을 지나는 구간(gaps) 사이다.
function legAt(at, gaps) {
  const k = gaps.findIndex(([from]) => at < from);
  return k < 0 ? gaps.length : k;
}

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 흐름이 지나는 선 수
// basis: estimate
// 흐름 구간 k가 지나는 선의 번호. 길이 k번째와 k+1번째 도형을 잇는 선(거꾸로 선언했어도)이고, 찾지 못하면 흐름이 지나는 모든 선이다.
function edgesOfLeg(k, { hop, names, scene }) {
  const [a, b] = [names[k], names[k + 1]];
  const found = hop.edges.filter((e) => {
    const [from, to] = [scene.edges[e].from.split('.')[0], scene.edges[e].to.split('.')[0]];
    return (from === a && to === b) || (from === b && to === a);
  });
  return found.length ? found : hop.edges;
}

// cost: time O(h·i), heap O(e), stack O(1)
// vars: h = 글 상자 있는 흐름 점 수, i = 지점별 문제 수
// basis: estimate
/**
 * 글 상자가 도형 이름을 가려 보이는 시간의 25% 넘게 숨는(그림 검사 7번이 경고하는) 흐름이 지나는 선마다 필요한 간격(px)을 돌려준다.
 * 간격은 글 상자 폭(세로 그림은 높이)에 글 상자 간격 두 쪽을 더한 값이고, 이미 요구한 간격(asked)이 있으면 거기에 토큰 `scale.chip-room-step`을 더한다.
 * @param context { scene, timeline, avoid, direction }. direction은 그림의 바깥 방향이다
 * @param asked 지난 배치가 요구한 Map<선 번호(원본 순서), px>
 * @returns Map<선 번호, px>. 숨는 흐름이 없으면 빈 Map이다
 */
export function chipRoomNeeds({ scene, timeline, avoid, direction }, asked = new Map()) {
  const needs = new Map();
  for (const seg of timeline.segs) {
    for (const hop of seg.hops) {
      if (!hop.data || hop.track === undefined) continue;
      const issues = issuesOfHop(scene, hop, avoid).filter((issue) => issue.hits.length);
      if (!issues.length) continue;
      const { names, gaps } = timeline.tracks[hop.track];
      const nodes = names.map((id) => id.split('.')[0]);
      const chip = sizeChip(hop.data);
      const base = (direction === 'down' ? chip.h : chip.w) + CHIP_GAP * 2;
      for (const issue of issues) {
        for (const e of edgesOfLeg(legAt(issue.at, gaps), { hop, names: nodes, scene })) {
          const index = scene.edges[e].index;
          needs.set(index, Math.max(needs.get(index) ?? 0, asked.has(index) ? asked.get(index) + STEP : base));
        }
      }
    }
  }
  return needs;
}

// 흐름 글 상자가 이름을 가려 25% 넘게 숨는다고 7번이 알린 경고인지
const isHiddenChipWarning = (d) => d.code === 'check-7' && d.message.includes('is hidden for');

// cost: time O(chip-room-tries·(elk + check)), heap O(s + e), stack O(1)
// vars: elk = 배치 시간, check = 그림 검사 시간, s = 도형 수, e = 선 수
// basis: estimate
/**
 * 흐름 글 상자가 숨는다는 7번 경고가 난 그림만, 숨는 흐름이 지나는 선의 간격을 글 상자 폭에 맞춰 늘려 다시 배치한다(토큰 `scale.chip-room-tries`번까지, 매번 `scale.chip-room-step`px 더).
 * 경고 수가 줄고 배치 검사 오류가 늘지 않는 배치 가운데 경고가 가장 적은 것을 쓴다. 풀리지 않으면 처음 배치와 경고를 그대로 두고 글은 지우지 않는다. 경고가 없는 그림은 그대로 돌려준다.
 * @param first 처음 배치 { scene, timeline, local }
 * @param helpers { attempt, failures }. attempt(figure)는 배치와 검사를 한 번 하는 함수, failures(결과)는 배치 검사 오류 수다
 */
export async function widenForHiddenChips(figure, first, { attempt, failures }) {
  const hidden = (result) => result.local.warnings.filter(isHiddenChipWarning).length;
  if (figure.kind === 'sequence' || !hidden(first)) return first;
  let best = first;
  let [current, asked] = [first, new Map()];
  for (let i = 0; i < TRIES && hidden(current); i++) {
    asked = chipRoomNeeds({ ...current, avoid: [...chipObstacles(current.scene), ...chipLines(current.scene)], direction: figure.direction }, asked);
    if (!asked.size) break;
    current = await attempt({ ...figure, chipRoom: asked });
    if (failures(current) <= failures(first) && hidden(current) < hidden(best)) best = current;
  }
  return best;
}
