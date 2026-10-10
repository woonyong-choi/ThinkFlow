// 문서 모형을 보기 하나의 모형으로 줄인다. 배치, 크기, 검사는 보기 모형을 받아 같은 코드로 돈다.
// 그래프 보기는 담은 카드와 그룹, 두 끝이 모두 보기에 든 선이고, 순서 보기는 참여자와 자기에게 투영된 메시지다.
// 카드의 정체(이름, 시간표의 상태)는 문서 하나라 보기가 여럿이어도 같은 카드가 여러 곳에 그려질 뿐이다.

const baseOf = (id) => id.split('.')[0];

// cost: time O(n + g + e), heap O(n + g + e), stack O(1)
// vars: n = 카드 수, g = 그룹 수, e = 선 수
// basis: estimate
/**
 * 보기 모형을 만든다.
 * @param view 문서의 보기(source/views-check.js가 cardIds와 groupIds를, source/project.js가 edgeIds, messages를 채웠다)
 * @returns strategy가 graph, sequence면 배치가 받는 모형이고, plot과 time이면 { strategy, viewId, card }다
 */
export function viewFigure(figure, view) {
  if (view.strategy === 'graph') return graphFigure(figure, view);
  if (view.strategy === 'sequence') return sequenceFigure(figure, view);
  return { strategy: view.strategy, viewId: view.id, label: view.label, card: figure.nodes.find((n) => n.id === view.cardIds[0]), line: view.line };
}

// cost: time O(n + g + e), heap O(n + g + e), stack O(1)
// vars: n = 카드 수, g = 그룹 수, e = 선 수
// basis: estimate
// 그래프 보기: 담은 카드와 그룹, 두 끝이 모두 든 선(docEdge는 문서 선 번호). edgeMap[지역 번호]가 문서 선 번호다.
function graphFigure(figure, view) {
  const cards = new Set(view.cardIds);
  const groups = new Set(view.groupIds);
  return {
    strategy: 'graph',
    viewId: view.id,
    label: view.label,
    line: figure.line,
    aspect: figure.aspect,
    width: figure.width,
    direction: view.direction,
    nodes: figure.nodes.filter((n) => cards.has(n.id)),
    groups: figure.groups.filter((g) => groups.has(g.id)),
    edges: view.edgeIds.map((i) => ({ ...figure.edges[i], docEdge: i })),
    edgeMap: view.edgeIds,
    start: figure.start && cards.has(figure.start.id) ? figure.start : undefined,
    finals: figure.finals.filter((f) => cards.has(f.id)),
    iconSets: figure.iconSets,
    values: figure.values,
    rejectedNames: figure.rejectedNames,
    steps: figure.steps,
  };
}

// cost: time O(m + f), heap O(m + f), stack O(1)
// vars: m = 메시지 수, f = 구획 수
// basis: estimate
/**
 * 순서 보기: 참여자는 적은 순서이고, 단계마다 자기에게 투영된 메시지 박자만 한 메시지씩 담는다(메모와 활성은 이 보기의 참여자 것만).
 * 구획(fragment)이 있으면 문서 전체 메시지 번호를 이 보기의 번호로 옮긴다.
 */
export function sequenceFigure(figure, view) {
  const members = new Set(view.cardIds);
  const selected = new Map(view.messages.map((m, i) => [m.hop, i]));
  const steps = figure.steps.map((step) => ({
    ...step,
    beats: step.beats.flatMap((beat) =>
      beat.hops
        .filter((hop) => selected.has(hop))
        .map((hop) => ({ ...beat, hops: [{ ...hop, from: baseOf(hop.from), to: baseOf(hop.to) }], notes: beat.notes.filter((n) => members.has(n.node)), activations: (beat.activations ?? []).filter((a) => members.has(a.node)) })),
    ),
  }));
  return {
    strategy: 'sequence',
    viewId: view.id,
    label: view.label,
    line: figure.line,
    nodes: view.cardIds.map((id) => figure.nodes.find((n) => n.id === id)),
    groups: [],
    edges: [],
    steps,
    fragments: remapFragments(figure.fragments, view.messages.map(({ hop }) => hop.messageIndex)),
    iconSets: figure.iconSets,
    values: figure.values,
    rejectedNames: figure.rejectedNames,
  };
}

// cost: time O(f·m), heap O(f), stack O(1)
// vars: f = 구획 수, m = 메시지 수
// basis: estimate
// 구획이 가리키는 문서 전체 메시지 번호의 범위를 이 보기의 메시지 번호 범위로 옮긴다. 이 보기에 메시지가 없는 구획과 대안은 뺀다.
function remapFragments(fragments, globalNumbers) {
  if (!fragments) return undefined;
  const before = (n) => globalNumbers.filter((g) => g < n).length;
  const range = (item) => ({ first: before(item.first), last: before(item.last + 1) - 1 });
  return fragments
    .map((control) => ({ ...control, ...range(control), branches: control.branches.map((b) => ({ ...b, ...range(b) })).filter((b) => b.last >= b.first) }))
    .filter((control) => control.last >= control.first);
}
