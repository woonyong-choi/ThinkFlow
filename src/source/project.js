// 이동(hop)을 보기에 투영한다. 한 이동은 보기마다 하나씩 보이고(그래프는 선 하나, 순서 보기는 메시지 하나), 첫 투영이 시간표의 시간을 정한다.
// 투영은 읽을 때 한 번 정해 두고, 선과 메시지에 문서 전체에서 이어지는 번호(composed)를 붙인다. 번호는 보기 순서와 보기 안 구성원만으로 정해져 배치에 기대지 않는다.

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 보기가 이 이름의 카드나 그룹을 담고 있는지 */
export const viewHas = (view, id) => Boolean(view.cardIds?.includes(id) || view.groupIds?.includes(id));

// cost: time O(v·e), heap O(e), stack O(1)
// vars: v = 그래프 보기 수, e = 선 수
// basis: estimate
/** 그래프 보기마다 두 끝이 모두 보기에 든 선의 문서 번호(view.edgeIds)를 정한다. 선이 모두 정해진 뒤에 부른다. */
export function assignViewEdges(figure) {
  for (const view of figure.views) {
    if (view.strategy === 'graph') view.edgeIds = figure.edges.flatMap((e, i) => (viewHas(view, e.from) && viewHas(view, e.to) ? [i] : []));
  }
}

const partsOf = (e, way) => e[`${way}Columns`] ?? [e[`${way}Cell`]];

// 열 묶음의 양쪽 주소가 있으면 같은 위치의 열 쌍이어야 한다.
// cost: time O(c), heap O(1), stack O(1)
// vars: c = 선 끝의 열 수
// basis: estimate
function matchesParts(edge, from, to) {
  const sources = partsOf(edge, 'from');
  const targets = partsOf(edge, 'to');
  if (from === undefined) return to === undefined || targets.includes(to);
  if (to === undefined) return sources.includes(from);
  const index = sources.indexOf(from);
  return index >= 0 && targets[index] === to;
}

// cost: time O(v·e), heap O(e), stack O(1)
// vars: v = 보기 수, e = 선 수
// basis: estimate
/**
 * 이동 하나를 보기마다 투영한다. 그래프 보기는 두 끝 사이의 선(같은 방향 먼저, 없으면 반대 방향을 거꾸로), 순서 보기는 메시지다.
 * @param move { from, to } 끝 이름은 `카드` 또는 `카드.칸`이다
 * @param scope { only?, graphOnly? }. only는 이 이름의 보기들만 보고(흐름 경로의 구간), graphOnly는 순서 보기를 보지 않는다(메시지가 되지 않는 시간 초과 분기)
 * @returns { projections, holdsBoth, ambiguous? }. projections는 { view, kind: 'graph', docEdge, isBack } 또는 { view, kind: 'sequence' }의 목록, holdsBoth는 두 끝을 함께 담은 그래프 보기가 있는지, ambiguous는 한 보기에서 선이 둘 이상일 때 선의 수다
 */
export function projectMove(figure, move, { only, graphOnly } = {}) {
  const [fromId, fromPart] = move.from.split('.');
  const [toId, toPart] = move.to.split('.');
  const result = { projections: [], holdsBoth: false };
  const matches = (e, [a, pa], [b, pb]) => e.from === a && e.to === b && matchesParts(e, pa, pb);
  for (const view of figure.views) {
    if ((only && !only.includes(view.id)) || !viewHas(view, fromId) || !viewHas(view, toId)) continue;
    if (view.strategy === 'sequence') {
      if (!graphOnly) result.projections.push({ view: view.id, kind: 'sequence' });
      continue;
    }
    if (view.strategy !== 'graph') continue;
    result.holdsBoth = true;
    const forward = view.edgeIds.filter((i) => matches(figure.edges[i], [fromId, fromPart], [toId, toPart]));
    const backward = view.edgeIds.filter((i) => matches(figure.edges[i], [toId, toPart], [fromId, fromPart]));
    const candidates = forward.length ? forward : backward;
    if (candidates.length > 1) return { ...result, ambiguous: candidates.length };
    if (candidates.length === 1) result.projections.push({ view: view.id, kind: 'graph', docEdge: candidates[0], isBack: !forward.length });
  }
  return result;
}

// cost: time O(v·p), heap O(v), stack O(1)
// vars: v = 보기 수, p = 경로의 도형 수
// basis: estimate
/** 흐름 경로가 통째로 놓인 그래프 보기 전부(보기 순서). 흐름은 보기마다 점 하나씩 지나고 첫 보기가 시간을 정한다. 없으면 빈 목록이다. 흐름은 순서 보기에 메시지가 되지 않는다. */
export function viewsOfPath(figure, path) {
  const ids = path.map((p) => p.split('.')[0]);
  return figure.views.filter((view) => view.strategy === 'graph' && ids.every((id) => viewHas(view, id)));
}

// cost: time O(h + v·e), heap O(h), stack O(1)
// vars: h = 이동 수, v = 보기 수, e = 선 수
// basis: estimate
/**
 * 투영에 번호를 붙인다. 순서 보기의 메시지는 문서 순서로 번호를 받고, 보기마다 앞 보기들의 선·메시지 수를 더한 시작 번호(edgeBase)를 갖는다.
 * 이동의 edge와 isBack은 첫 투영의 값이고(시간표가 이 선으로 시간을 정한다). 흐름 구간(leg)은 edge를 가진다.
 */
export function numberProjections(figure) {
  const messages = new Map(figure.views.filter((v) => v.strategy === 'sequence').map((v) => [v.id, []]));
  const moves = [];
  for (const step of figure.steps) {
    for (const beat of step.beats) {
      for (const hop of beat.hops) {
        for (const p of hop.projections ?? []) if (p.kind === 'sequence') p.message = messages.get(p.view).push({ hop, beat }) - 1;
        moves.push(hop);
        if (hop.elseLeg) moves.push(hop.elseLeg);
      }
    }
  }
  let base = 0;
  for (const view of figure.views) {
    view.edgeBase = base;
    view.messages = messages.get(view.id);
    base += view.strategy === 'graph' ? view.edgeIds.length : (view.messages?.length ?? 0);
  }
  const byId = new Map(figure.views.map((v) => [v.id, v]));
  // 번호가 없는 투영(메시지가 되지 않은 순서 보기 투영)은 NaN 선 번호가 되기 전에 여기서 멈춘다.
  const composed = (p) => {
    const view = byId.get(p.view);
    const index = p.kind === 'graph' ? view.edgeIds.indexOf(p.docEdge) : p.message;
    if (!(index >= 0)) throw new Error(`the ${p.kind} projection in view "${p.view}" has no line or message number`);
    return view.edgeBase + index;
  };
  for (const hop of moves) {
    for (const p of hop.projections ?? []) p.edge = composed(p);
    const [owner] = hop.projections ?? [];
    if (!owner) continue;
    hop.edge = owner.edge;
    hop.isBack = owner.kind === 'graph' ? owner.isBack : false;
  }
  for (const step of figure.steps) for (const track of step.tracks) numberTrack(track, composed);
}

// cost: time O(l·v), heap O(l·v), stack O(1)
// vars: l = 흐름의 구간 수, v = 흐름이 지나는 그래프 보기 수
// basis: estimate
/**
 * 흐름의 구간(legs)과 시간 초과 분기(elseLeg)에 선 번호를 붙이고, 보기마다 구간 선을 모은 instances를 만든다.
 * instances[0]이 시간을 정하는 첫 보기이고 구간의 edge, isBack도 그 보기의 값이다. 모든 구간에 선이 있는 보기만 instance가 된다.
 */
function numberTrack(track, composed) {
  const legs = [...(track.legs ?? []), ...(track.elseLeg ? [track.elseLeg] : [])];
  for (const leg of legs) {
    for (const p of leg.projections ?? []) p.edge = composed(p);
    const [owner] = leg.projections ?? [];
    if (!owner) continue;
    leg.edge = owner.edge;
    leg.isBack = owner.isBack;
  }
  const pick = (leg, view) => {
    const { edge, isBack } = leg.projections.find((p) => p.view === view);
    return { edge, isBack };
  };
  const has = (leg, view) => leg.projections?.some((p) => p.view === view);
  const views = (track.legs?.[0]?.projections ?? []).map((p) => p.view).filter((view) => legs.every((leg) => has(leg, view)));
  track.instances = views.map((view) => ({ view, legs: track.legs.map((leg) => pick(leg, view)), ...(track.elseLeg ? { elseLeg: pick(track.elseLeg, view) } : {}) }));
}
