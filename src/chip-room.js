// 흐름 글 상자가 도형 이름을 가려 많이 숨거나 박자 이동의 글 상자가 보이는 시간의 6할을 못 채우는 그림에서, 글 상자가 지나는 선의 간격이 얼마나 필요한지 정한다(docs/design/layout.md 이동 글 간격).
// 배치가 그 선에 간격을 요구하도록 다시 배치할 때 쓰는 값이고, 숨음이 없는 그림은 건드리지 않는다. 이동 시간이나 원본의 시각은 바꾸지 않는다.
// 박자 이동은 층 간격에 더해 선 옆을 쓸고 지나는 폭(옆 폭, sweep)도 요구한다. 배치 뒤 선 옆에 자리를 고르는 그룹 제목과 끝 라벨(다중성)이 그 폭 밖에 선다.
import { CHIP_CLEAR, CHIP_GAP, sizeChip } from './chip.js';
import { issuesOfHop } from './chip-plan.js';
import { chipLines, chipObstacles } from './draw/boxes.js';
import { values } from './vendor/theme/tokens.js';

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
 * 글 상자가 도형 이름을 가려 보이는 시간의 25% 넘게 숨는(그림 검사 7번이 경고하는) 흐름과, 보이는 시간이 6할을 못 채우는 박자 이동이 지나는 선마다 필요한 간격(px)을 돌려준다.
 * 간격은 글 상자 폭(세로 그림은 높이)에 글 상자 간격 두 쪽을 더한 값이고, 이미 요구한 간격(asked)이 있으면 거기에 토큰 `scale.chip-room-step`을 더한다.
 * 박자 이동은 옆 폭 `{ x, y }`도 요구한다: 세로 구간은 글 상자 반 폭과 CHIP_CLEAR(x), 가로 구간은 글 상자 높이와 CHIP_GAP(y)이다. 옆 폭은 글 상자 크기에서 한 번 정해지고 되풀이해 키우지 않는다.
 * @param context { scene, timeline, avoid, directions }. directions는 그래프 보기 이름 → 그 보기의 바깥 방향이다
 * @param asked 지난 배치가 요구한 Map<`보기\u0000선 번호`(보기 안 순서), px>
 * @returns Map<`보기\u0000선 번호`, px>와 옆 폭 Map<`보기\u0000선 번호\u0000sweep`, { x, y }>. 숨는 흐름이 없으면 빈 Map이다
 */
function chipRoomNeeds({ scene, timeline, avoid, directions }, asked = new Map()) {
  const needs = new Map();
  for (const seg of timeline.segs) {
    for (const hop of seg.hops) addHopNeeds(needs, hop, { scene, timeline, avoid, directions, asked });
  }
  return needs;
}

/** 요구한 층 간격을 보기별로 가른다(옆 폭 키는 뺀다). Map<보기 이름, Map<보기 안 선 번호, px>> */
export function roomByView(asked) {
  const byView = new Map();
  for (const [key, px] of asked) {
    const [view, index, kind] = key.split('\u0000');
    if (kind) continue;
    byView.set(view, (byView.get(view) ?? new Map()).set(Number(index), px));
  }
  return byView;
}

/** 요구한 옆 폭을 보기별로 가른다(옆 폭 키만). Map<보기 이름, Map<보기 안 선 번호, { x, y }>> */
export function sweepByView(asked) {
  const byView = new Map();
  for (const [key, sweep] of asked) {
    const [view, index, kind] = key.split('\u0000');
    if (kind === 'sweep') byView.set(view, (byView.get(view) ?? new Map()).set(Number(index), sweep));
  }
  return byView;
}

// cost: time O(i·e), heap O(1), stack O(1)
// vars: i = 이동이 지나는 가림 지점 수, e = 한 구간의 선 수
// basis: estimate
// 이동 하나가 지나는 선마다 필요한 간격을 needs에 더한다. 글 상자가 없거나 흐름이 아니거나 가려지는 곳이 없으면 아무것도 더하지 않는다.
function addHopNeeds(needs, hop, { scene, timeline, avoid, directions, asked }) {
  if (!hop.data) return;
  const issues = issuesOfHop(scene, hop, avoid).filter((issue) => issue.hits.length);
  if (!issues.length) return;
  const chip = sizeChip(hop.data);
  const ask = (e) => {
    const { view, index } = scene.edges[e];
    if (!directions.has(view)) return;
    const key = `${view}\u0000${index}`;
    const base = (directions.get(view) === 'down' ? chip.h : chip.w) + CHIP_GAP * 2;
    needs.set(key, Math.max(needs.get(key) ?? 0, asked.has(key) ? asked.get(key) + STEP : base));
  };
  // 박자 이동은 선 하나에 있으므로 그 선의 간격과 옆 폭을 요구한다. 보이는 시간이 모자란 만큼 글 상자 폭만큼 간격을 늘려 깨끗한 자리를 만든다.
  if (hop.track === undefined) {
    askSweep(needs, hop, { scene, directions, chip });
    return ask(hop.edge);
  }
  const { names, gaps } = timeline.tracks[hop.track];
  const nodes = names.map((id) => id.split('.')[0]);
  for (const issue of issues) for (const e of edgesOfLeg(legAt(issue.at, gaps), { hop, names: nodes, scene })) ask(e);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 박자 이동은 선 옆을 쓸고 지나는 폭을 요구한다. 세로 구간은 점 위 글 상자 반 폭과 CHIP_CLEAR(x), 가로 구간은 글 상자 높이와 CHIP_GAP(y)이다. 배치 뒤 선 옆에 놓는 그룹 제목과 끝 라벨이 이 폭 밖에 선다.
function askSweep(needs, hop, { scene, directions, chip }) {
  const { view, index } = scene.edges[hop.edge];
  if (!directions.has(view)) return;
  const key = `${view}\u0000${index}\u0000sweep`;
  const had = needs.get(key) ?? { x: 0, y: 0 };
  needs.set(key, { x: Math.max(had.x, chip.w / 2 + CHIP_CLEAR), y: Math.max(had.y, chip.h + CHIP_GAP) });
}

// 글 상자가 이름을 가려 숨는다(흐름은 시간의 25% 넘게, 박자 이동은 6할을 못 채우게)고 7번이 알린 경고인지
const isHiddenChipWarning = (d) => d.code === 'check-7' && d.message.includes('is hidden for');

// cost: time O(chip-room-tries·(elk + check)), heap O(s + e), stack O(1)
// vars: elk = 배치 시간, check = 그림 검사 시간, s = 도형 수, e = 선 수
// basis: estimate
/**
 * 흐름 글 상자가 숨는다는 7번 경고가 난 그림만, 숨는 흐름이 지나는 선의 간격을 글 상자 폭에 맞춰 늘려 다시 배치한다(토큰 `scale.chip-room-tries`번까지, 매번 `scale.chip-room-step`px 더).
 * 경고 수가 줄고 배치 검사 오류가 늘지 않는 배치 가운데 경고가 가장 적은 것을 쓴다. 풀리지 않으면 처음 배치와 경고를 그대로 두고 글은 지우지 않는다. 경고가 없는 그림은 그대로 돌려준다.
 * @param first 처음 배치 { scene, timeline, local }
 * @param helpers { attempt, failures, directions }. attempt(asked)는 요구한 간격(Map<`보기\u0000선 번호`, px>)으로 배치와 검사를 한 번 하는 함수, failures(결과)는 배치 검사 오류 수, directions는 그래프 보기 이름 → 바깥 방향이다
 */
export async function widenForHiddenChips(first, { attempt, failures, directions }) {
  const hidden = (result) => result.local.warnings.filter(isHiddenChipWarning).length;
  if (!directions.size || !hidden(first)) return first;
  let best = first;
  let [current, asked] = [first, new Map()];
  for (let i = 0; i < TRIES && hidden(current); i++) {
    asked = chipRoomNeeds({ ...current, avoid: [...chipObstacles(current.scene, current.timeline), ...chipLines(current.scene)], directions }, asked);
    if (!asked.size) break;
    current = await attempt(asked);
    if (failures(current) <= failures(first) && hidden(current) < hidden(best)) best = current;
  }
  return best;
}
