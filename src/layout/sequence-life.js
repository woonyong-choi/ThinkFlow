// 생명선 구간과 활성 막대를 메시지의 실제 끝 위치에서 만든다.
import { values } from '../vendor/theme/tokens.js';

const SPACE = values.spacing;
const ACTIVATION_WIDTH =SPACE["3"];

// cost: time O(p + m + a), heap O(p + a), stack O(1)
// vars: p = 참여자 수, m = 메시지 수, a = 활성 명령 수
// basis: estimate
/**
 * 생성 메시지의 머리 위치, 소멸 표식, 활성 구간을 장면에 반영한다. 활성 막대와 소멸 표식은 메시지가 속한 장면 번호(si)를 갖는다.
 * 장면이 바뀌면 겹쳐 쌓인 활성 깊이는 처음으로 돌아간다(장면마다 행이 첫 행부터 다시 쌓이므로 앞 장면의 열린 막대와 이어지지 않는다).
 * 장면은 서로 이어지지 않는 대안이라 한 장면의 생성과 소멸이 다른 장면의 모습을 바꾸지 않는다. 참여자 머리는 하나뿐이므로 머리를 생성 행으로 내리는 것은 참여자가 나오는 모든 장면이 같은 행에서 만들 때뿐이고(한 장면뿐인 그림은 늘 그렇다),
 * 그 밖에는 머리가 처음 자리에 있고 생성 메시지는 생명선에 닿는다. 소멸이 있는 참여자는 여럿인 장면에서 장면마다 자기 생명선(`si`)을 가져 한 장면의 소멸이 다른 장면의 생명선을 자르지 않는다.
 * @param owners 메시지마다의 장면 번호
 * @param sceneCount 장면 수(메시지가 없는 장면도 센다)
 */
export function placeSequenceLife(scene, messages, owners, sceneCount) {
  const items = new Map(scene.items.map((item) => [item.id, item]));
  const lines = new Map(scene.lifelines.map((line) => [line.id, line]));
  const heads = headMoves(scene, messages, owners);
  let stacks = new Map(scene.items.map((item) => [item.id, []]));
  const activations = [];
  const destructions = [];
  const ends = new Map();
  messages.forEach((beat, index) => {
    const hop = beat.hops[0];
    const edge = scene.edges[index];
    const end = edge.points.at(-1);
    const si = owners[index];
    if (index && si !== owners[index - 1]) stacks = new Map(scene.items.map((item) => [item.id, []]));
    if (hop.create && heads.has(hop.to)) placeCreation(items.get(hop.to), lines.get(hop.to), edge);
    if (hop.destroy) {
      ends.set(hop.to, new Map([...(ends.get(hop.to) ?? []), [si, end.y]]));
      destructions.push({ node: hop.to, x: lines.get(hop.to).x, y: end.y, si });
      for (const bar of stacks.get(hop.to)) bar.h = end.y - bar.y;
      stacks.get(hop.to).length = 0;
      const direction = Math.sign(edge.points.at(-2).x - end.x);
      end.x += direction * (SPACE["2"] + SPACE["1"]);
    }
    for (const action of beat.activations ?? []) placeActivation(action, { lines, stacks, activations, si }, end.y);
  });
  scene.lifelines = endLifelines(scene.lifelines, ends, sceneCount > 1 ? Array.from({ length: sceneCount }, (_, si) => si) : undefined);
  scene.activations = activations;
  scene.destructions = destructions;
}

// cost: time O(m), heap O(p), stack O(1)
// vars: m = 메시지 수, p = 참여자 수
// basis: estimate
// 머리를 생성 행으로 내릴 참여자. 참여자가 나오는 모든 장면이 같은 높이에서 만들 때뿐이다. 한 장면뿐인 그림은 생성한 참여자가 모두 해당한다.
function headMoves(scene, messages, owners) {
  const appears = new Map();
  const made = new Map();
  messages.forEach((beat, index) => {
    const hop = beat.hops[0];
    for (const id of [hop.from, hop.to, ...(beat.activations ?? []).map((action) => action.node), ...(beat.notes ?? []).map((note) => note.node)]) appears.set(id, new Set([...(appears.get(id) ?? []), owners[index]]));
    if (hop.create) made.set(hop.to, new Map([...(made.get(hop.to) ?? []), [owners[index], scene.edges[index].points.at(-1).y]]));
  });
  return new Set([...made].filter(([id, rows]) => rows.size === appears.get(id).size && new Set(rows.values()).size === 1).map(([id]) => id));
}

// cost: time O(p·s), heap O(p·s), stack O(1)
// vars: p = 참여자 수, s = 장면 수
// basis: estimate
// 소멸한 참여자의 생명선 끝. 장면이 하나면 그 끝에서 자르고, 여럿이면 장면마다 생명선을 따로 둔다(소멸이 없는 장면은 아래 끝까지).
function endLifelines(lines, ends, scenes) {
  return lines.flatMap((line) => {
    const cuts = ends.get(line.id);
    if (!cuts) return [line];
    if (!scenes) return [{ ...line, y2: [...cuts.values()][0] }];
    return scenes.map((si) => ({ ...line, y2: cuts.get(si) ?? line.y2, si }));
  });
}

function placeCreation(item, line, edge) {
  const end = edge.points.at(-1);
  item.y = end.y - item.h / 2;
  line.y1 = item.y + item.h + item.marginBottom;
  const isFromLeft = edge.points[0].x < end.x;
  end.x = isFromLeft ? item.x : item.x + item.w;
  edge.labelAt.x = (edge.points[0].x + end.x) / 2;
}

function placeActivation(action, ctx, y) {
  const stack = ctx.stacks.get(action.node);
  if (action.kind === 'activate') {
    const line = ctx.lines.get(action.node);
    const top = Math.max(y, line.y1);
    const bar = { node: action.node, depth: stack.length, x: line.x - ACTIVATION_WIDTH / 2 + stack.length * ACTIVATION_WIDTH / 2, y: top, w: ACTIVATION_WIDTH, h: 0, si: ctx.si };
    stack.push(bar);
    ctx.activations.push(bar);
  } else {
    // 앞 장면에서 연 막대는 장면이 바뀌며 닫힌 것으로 본다(막대는 자기 장면 안에서만 보인다).
    const bar = stack.pop();
    if (bar) bar.h = Math.max(SPACE["1"], y - bar.y);
  }
}
