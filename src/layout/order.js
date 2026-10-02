// 그룹 안 자식을 흐름 순서로 놓는다. 순환이 있을 때 어느 선이 되돌아가는 선이 될지를 선언 순서로 정하기 위해서다(docs/design/layout.md 되돌아가는 선).

// cost: time O(c² + a), heap O(c + a), stack O(c)
// vars: c = 그룹 하나의 자식 수, a = 그 그룹 안 선 조각 수
// basis: estimate
/**
 * 모든 그룹의 자식 순서를 정하고, 순환이 있는 그룹에 `hasBack`을 적는다. 선언 순서를 지키되 순환을 끊는 선(되돌아가는 선)만 거스르는 순서다.
 * elkjs의 `cycleBreaking.strategy: MODEL_ORDER`는 모델 순서를 거스르는 선만 뒤집으므로, 이 순서와 함께 쓰면 되돌아가는 선만 뒤집힌다.
 */
export function orderByFlow(model) {
  const arcs = new Map([...model.containers.keys()].map((k) => [k, []]));
  for (const list of model.pieces.values()) for (const p of list) arcs.get(p.container).push([ownerOf(p.from), ownerOf(p.to)]);
  // 그룹을 도형보다 앞에 모아 두었으므로 먼저 원본 줄 순서로 되돌린다. 줄이 없는 처음 점은 맨 앞, 끝 겹원은 맨 뒤다.
  const lineOf = (id) => {
    const node = model.nodes.get(id);
    if (node?.shape === 'start') return -1;
    if (node?.shape === 'final') return Number.MAX_SAFE_INTEGER;
    return node?.line ?? model.containers.get(id).line;
  };
  for (const c of model.containers.values()) {
    const { order, hasBack } = flowOrder([...c.children].sort((a, b) => lineOf(a) - lineOf(b)), arcs.get(c.id));
    c.children = order;
    c.hasBack = hasBack;
  }
}

// 연결점 아이디(`도형::way::선 번호`)는 그 연결점이 달린 도형이나 그룹으로 본다.
function ownerOf(id) {
  return id.split('::')[0];
}

// cost: time O(c² + a), heap O(c + a), stack O(c)
// vars: c = 자식 수, a = 선 조각 수
// basis: estimate
function flowOrder(children, links) {
  const known = new Set(children);
  const out = new Map(children.map((id) => [id, []]));
  for (const [from, to] of links) if (from !== to && known.has(from) && known.has(to)) out.get(from).push(to);
  const back = backArcs(children, out);
  const waiting = new Map(children.map((id) => [id, 0]));
  for (const [from, targets] of out) for (const to of targets) if (!back.has(`${from}>${to}`)) waiting.set(to, waiting.get(to) + 1);
  const order = [];
  const left = [...children];
  while (left.length) {
    const next = left.findIndex((id) => waiting.get(id) === 0);
    const [id] = left.splice(next, 1);
    order.push(id);
    for (const to of out.get(id)) if (!back.has(`${id}>${to}`)) waiting.set(to, waiting.get(to) - 1);
  }
  return { order, hasBack: back.size > 0 };
}

// cost: time O(c + a), heap O(c + a), stack O(c)
// vars: c = 자식 수, a = 선 조각 수
// basis: estimate
// 선언 순서대로 깊이 우선으로 따라가다 지금 따라가는 길 위의 도형으로 되돌아오는 선. 순환을 끊는 선이다.
function backArcs(children, out) {
  const back = new Set();
  const state = new Map();
  // cost: time O(c + a), heap O(c), stack O(c)
  // vars: c = 자식 수, a = 선 조각 수
  // basis: estimate
  const visit = (id) => {
    state.set(id, 'open');
    for (const to of out.get(id)) {
      if (state.get(to) === 'open') back.add(`${id}>${to}`);
      else if (!state.has(to)) visit(to);
    }
    state.set(id, 'done');
  };
  for (const id of children) if (!state.has(id)) visit(id);
  return back;
}
