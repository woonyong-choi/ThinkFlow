// 보기(view)의 기본 보기, 구성원 규칙, 카드가 어느 보기에든 보이는지를 확인한다. 보기가 정해지면 view.cardIds와 view.groupIds가 채워진다.
// 보기는 이름이 없어서 정해진 순서(적은 보기, 이어서 기본 보기)대로 v1, v2, ...를 붙인다. 이 번호는 시간표와 장면이 보기를 가리키는 내부 열쇠다.
import { SEQUENCE_SHAPES } from './grammar.js';
import { unknownName } from './problems.js';

// cost: time O(v·(n + g) + n·e), heap O(n + g), stack O(1)
// vars: v = 보기 수, n = 카드 수, g = 그룹 수, e = 선 수
// basis: estimate
/**
 * 보기를 정한다. 남은 차트만 있으면 차트 보기, 일반 카드와 섞이면 그래프 하나다. 추적은 시간 보기다.
 * 적은 보기의 구성원 규칙을 확인하고, 카드마다 보기에 놓였는지 본다. 오류가 있으면 모형을 믿을 수 없어 다음 단계가 건너뛴다.
 */
export function resolveViews(figure, problems) {
  const declared = figure.nodes.filter((c) => !c.isRejected);
  const cards = declared.filter((c) => c.owner === undefined);
  // refused는 구성원으로 적었지만 이유가 있어 받지 못한 카드다. 이 카드는 이미 오류가 났으니 "어느 보기에도 없다"를 덧붙이지 않는다.
  const context = { figure, cards, byId: new Map(declared.map((c) => [c.id, c])), groups: new Map(figure.groups.map((g) => [g.id, g])), problems, refused: new Set() };
  const written = figure.views.filter((v) => !v.isRejected);
  const isWhole = (v) => v.strategy === 'graph' && v.members === undefined;
  for (const view of written) {
    if (view.strategy !== 'graph') resolveSingle(view, context);
    else if (!isWhole(view)) resolveGraph(view, context, { plotOwned: new Set() });
  }
  const listed = new Set([...written.flatMap((v) => v.cardIds ?? []), ...context.refused]);
  const implicit = implicitSingles(figure, cards, listed);
  const plotOwned = new Set([...written, ...implicit].filter((v) => v.strategy === 'plot').flatMap((v) => v.cardIds));
  for (const view of written.filter(isWhole)) resolveGraph(view, context, { plotOwned });
  const rest = cards.filter((c) => !listed.has(c.id) && c.shape !== 'trace' && !plotOwned.has(c.id));
  if (rest.length && !written.some(isWhole)) implicit.push(implicitGraph(rest, context, plotOwned));
  figure.views = [...figure.views, ...implicit.sort((a, b) => a.order - b.order).map(({ order, ...view }) => view)];
  figure.views.forEach((view, i) => {
    view.id = `v${i + 1}`;
  });
  for (const card of cards) {
    if (!figure.views.some((v) => v.cardIds?.includes(card.id)) && !context.refused.has(card.id)) problems.error(card.line, `card "${card.id}" is not shown in any view. Add it to a view`);
  }
}

// cost: time O(n + v), heap O(n), stack O(1)
// vars: n = 카드 수, v = 보기 수
// basis: estimate
// 연결선은 보기 종류를 결정하지 않는다. 일반 카드와 섞이거나 그래프를 명시하면 차트도 그래프 카드다.
function implicitSingles(figure, cards, listed) {
  const hasGraph = figure.views.some((view) => view.strategy === 'graph') || cards.some((card) => !listed.has(card.id) && (card.parent || !['chart', 'trace'].includes(card.shape)));
  const make = (card, strategy) => ({ strategy, direction: 'right', label: undefined, members: [{ id: card.id, line: card.line, column: 1 }], cardIds: [card.id], groupIds: [], isImplicit: true, line: card.line, order: cards.indexOf(card) });
  return cards.flatMap((card) => {
    if (listed.has(card.id)) return [];
    if (card.shape === 'trace') return [make(card, 'time')];
    return card.shape === 'chart' && !hasGraph ? [make(card, 'plot')] : [];
  });
}

// cost: time O(n + g), heap O(n + g), stack O(1)
// vars: n = 카드 수, g = 그룹 수
// basis: estimate
// 적힌 그래프 보기가 맡지 않은 카드를 담는 기본 그래프. 그룹 안 카드는 그 그룹 나무를 온전히 담는다.
function implicitGraph(rest, context, plotOwned) {
  const view = { strategy: 'graph', direction: 'right', label: undefined, members: undefined, isImplicit: true, line: rest[0].line, order: context.cards.indexOf(rest[0]) };
  const roots = new Set(rest.map((card) => topOf(card, context.groups)));
  resolveGraph(view, context, { plotOwned, roots });
  return view;
}

// cost: time O(d), heap O(1), stack O(1)
// vars: d = 그룹 깊이
// basis: estimate
// 카드나 그룹이 들어 있는 가장 바깥 그룹(없으면 자기 자신)의 이름
function topOf(item, groups) {
  let top = item;
  while (top.parent) top = groups.get(top.parent);
  return top.id;
}

// cost: time O(m·d + n + g), heap O(n + g), stack O(1)
// vars: m = 구성원 수, d = 그룹 깊이, n = 카드 수, g = 그룹 수
// basis: estimate
// 그래프 보기. 구성원을 적었으면 그 카드와 그룹(안쪽 전부), 적지 않았으면 추적 카드와 차트 보기에 놓인 차트를 뺀 모든 카드다. 그룹 나무는 온전히 담긴다.
// scope는 { plotOwned, roots }이고 roots를 주면 적지 않은 보기가 그 바깥 이름의 카드와 그룹 나무만 담는다(기본 그래프).
function resolveGraph(view, { figure, cards, byId, groups, problems, refused }, { plotOwned, roots }) {
  const included = new Set();
  const includedGroups = new Set();
  const addGroupTree = (id) => {
    includedGroups.add(id);
    for (const g of figure.groups) if (g.parent === id) addGroupTree(g.id);
    for (const c of cards) if (c.parent === id) included.add(c.id);
  };
  if (view.members === undefined) {
    const isRoot = (id) => !roots || roots.has(id);
    for (const c of cards.filter((card) => !card.parent && isRoot(card.id))) included.add(c.id);
    for (const g of figure.groups.filter((group) => !group.parent && isRoot(group.id))) addGroupTree(g.id);
    for (const c of cards) if (c.shape === 'trace' || plotOwned.has(c.id)) included.delete(c.id);
    pruneEmptyGroups(view, { figure, included, includedGroups });
  } else {
    for (const m of view.members) memberInGraph(m, { view, byId, groups, problems, included, includedGroups, addGroupTree, figure, refused });
    for (const m of view.members) checkNestedMember(m, { byId, groups, includedGroups, problems });
  }
  view.cardIds = cards.filter((c) => included.has(c.id)).map((c) => c.id);
  view.groupIds = figure.groups.filter((g) => includedGroups.has(g.id)).map((g) => g.id);
}

// 구성원 하나가 카드인지 그룹인지 보고 그래프에 담는다. 추적 카드는 담지 못한다.
function memberInGraph(m, { byId, groups, problems, included, addGroupTree, refused }) {
  if (groups.has(m.id)) addGroupTree(m.id);
  else if (!byId.has(m.id)) problems.error(m.line, unknownName('card', m.id, [...byId.keys(), ...groups.keys()]), { column: m.column });
  else if (byId.get(m.id).owner) problems.error(m.line, `chart "${m.id}" belongs inside "${byId.get(m.id).owner}". Put its owner in the view`, { column: m.column });
  else if (byId.get(m.id).shape === 'trace') {
    refused.add(m.id);
    problems.error(m.line, `a trace card cannot be in a graph view. List "${m.id}" in a time view`, { column: m.column });
  } else included.add(m.id);
}

// 카드나 그룹이 어떤 그룹 안에 있으면 그 그룹의 나무가 통째로 담겨야 한다. 바깥 그룹을 적지 않고 안쪽만 적으면 오류다.
function checkNestedMember(m, { byId, groups, includedGroups, problems }) {
  const item = byId.get(m.id) ?? groups.get(m.id);
  if (!item?.parent) return;
  let root = item.parent;
  while (groups.get(root)?.parent) root = groups.get(root).parent;
  if (!includedGroups.has(root)) problems.error(m.line, `list group "${root}" instead of "${m.id}". A group is shown whole`, { column: m.column });
}

// 구성원을 적지 않은 그래프에서 담을 카드가 모두 빠진 그룹은 빼고, 그 그룹을 품은 그룹이 비면 그것도 뺀다.
function pruneEmptyGroups(view, { figure, included, includedGroups }) {
  for (let changed = true; changed; ) {
    changed = false;
    for (const g of figure.groups) {
      if (!includedGroups.has(g.id)) continue;
      const hasChild = figure.groups.some((child) => child.parent === g.id && includedGroups.has(child.id)) || [...included].some((id) => figure.nodes.find((n) => n.id === id)?.parent === g.id);
      if (!hasChild) {
        includedGroups.delete(g.id);
        changed = true;
      }
    }
  }
}

// 카드가 이 보기의 구성원이 될 수 없는 이유. 받을 수 있으면 undefined다.
function refusal(view, card) {
  if (card.owner) return `chart "${card.id}" belongs inside "${card.owner}". Put its owner in the view`;
  if (view.strategy === 'sequence' && !SEQUENCE_SHAPES.includes(card.shape)) return `a ${card.shape} card cannot be a sequence participant. Use ${SEQUENCE_SHAPES.join(', ')}`;
  if (view.strategy === 'plot' && card.shape !== 'chart') return `a plot view shows a chart card. "${card.id}" is a ${card.shape}`;
  if (view.strategy === 'time' && card.shape !== 'trace') return `a time view shows a trace card. "${card.id}" is a ${card.shape}`;
  return undefined;
}

// cost: time O(m), heap O(m), stack O(1)
// vars: m = 구성원 수
// basis: estimate
// 순서, 차트, 시간 보기. 구성원은 카드 이름이고 순서 보기는 참여자 모양의 카드만, 차트 보기는 차트 카드 하나, 시간 보기는 추적 카드 하나다.
function resolveSingle(view, { byId, problems, refused }) {
  const members = view.members ?? [];
  view.cardIds = [];
  view.groupIds = [];
  for (const m of members) {
    const card = byId.get(m.id);
    if (!card) {
      problems.error(m.line, unknownName('card', m.id, byId.keys()), { column: m.column });
      continue;
    }
    const reason = refusal(view, card);
    if (reason) {
      refused.add(card.id);
      problems.error(m.line, reason, { column: m.column });
    } else view.cardIds.push(card.id);
  }
  if ((view.strategy === 'plot' || view.strategy === 'time') && members.length !== 1) problems.error(view.line, `a ${view.strategy} view lists exactly one ${view.strategy === 'plot' ? 'chart' : 'trace'} card. Found ${members.length}`);
  if (view.strategy === 'sequence' && !members.length) problems.error(view.line, 'a sequence view lists its participants');
}
