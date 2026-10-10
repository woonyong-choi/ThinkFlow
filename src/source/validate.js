// 파일을 다 읽은 뒤 이름, 선, 칸, 보기, 이동, 카드, 밝히기 대상을 확인한다. 이동마다 보기별 투영(선, 메시지)을 정한다.
import { walkUp } from './ancestry.js';
import { checkChartCards } from './chart-check.js';
import { checkClassRelations } from './class-check.js';
import { checkMultiplicities } from './multiplicity.js';
import { checkFlowStep } from './flow-check.js';
import { CARD_SHAPES, PART_SHAPES, STATUS_SHAPES } from './grammar.js';
import { checkIcons } from './icons.js';
import { checkSequenceViews, checkTraces } from './view-rules.js';
import { assignViewEdges, projectMove, numberProjections, viewHas } from './project.js';
import { emptyBeat } from './steps.js';
import { resolveViews } from './views-check.js';
import { unknownName } from './problems.js';
import { checkValues, checkValuesShown, isCardDrawn } from './value-check.js';

// cost: time O(s·k + e² + h·e), heap O(k + e), stack O(1)
// vars: s = 문장 수, k = 이름 수, e = 선 수, h = 이동 수
// basis: estimate
/** 문서 모형의 서로 가리키는 이름과 카드별 규칙을 확인한다. 이동에는 projections, edge, isBack을 채운다. */
export function validateFigure(figure, problems) {
  const before = problems.errors.length;
  const names = collectNames(figure, problems);
  // 이름이 겹치면 이름으로 찾는 부모와 선 끝이 모호해서, 이름에 기대는 확인을 하지 않고 중복 오류만 알린다.
  if (problems.errors.length > before) return;
  buildForeignKeys(figure, problems);
  checkEdges(figure, names, problems);
  checkClassRelations(figure, problems);
  checkStateMarks(figure, names, problems);
  checkIcons(figure, problems);
  checkTraces(figure, names, problems);
  checkValues(figure, names, problems);
  checkNotEmpty(figure, problems);
  const viewsBefore = problems.errors.length;
  resolveViews(figure, problems);
  if (problems.errors.length > viewsBefore) return;
  assignViewEdges(figure);
  checkDrawable(figure, names, problems);
  checkValuesShown(figure, names, problems);
  for (const card of figure.nodes) for (const row of card.content ?? []) {
    if (!row.valueId) checkCardTarget({ type: 'content', node: card.id, line: row.line }, { figure, names }, problems);
  }
  checkChartCards(figure, names, problems);
  checkTimeline(figure, names, problems);
  if (problems.errors.length > before) return;
  numberProjections(figure);
  checkSequenceViews(figure, problems);
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 이름 수
// basis: estimate
// 카드, 그룹, 값 이름이 겹치지 않는지 보고 이름 → 선언을 돌려준다. 칸(열, 멤버, 칸 격자의 칸, 구간)과 차트 계열은 카드 안의 이름이라 여기 들지 않고, 보기는 이름이 없다.
function collectNames(figure, problems) {
  const names = new Map();
  const items = [...figure.nodes, ...figure.groups.map((g) => ({ ...g, shape: 'group' })), ...figure.values.filter((v) => !v.queue).map((v) => ({ ...v, shape: 'value' }))];
  for (const item of items) {
    const known = names.get(item.id);
    if (known) problems.error(item.line, `the name "${item.id}" is already used (line ${known.line})`);
    else names.set(item.id, item);
  }
  return names;
}

// cost: time O(e² + e·d), heap O(e), stack O(1)
// vars: e = 선 수, d = 그룹 깊이
// basis: estimate
// 선 끝 이름과 칸, 자기 자신, 그룹과 하위 도형 사이, 같은 방향 중복, 클래스 관계와 상태 전이의 규칙을 확인한다.
function checkEdges(figure, names, problems) {
  const groupOf = new Map([...figure.nodes, ...figure.groups].map((n) => [n.id, n.parent]));
  // cost: time O(d), heap O(d), stack O(1)
  // vars: d = 그룹 깊이
  // basis: estimate
  const isInside = (id, groupId) => walkUp(groupOf.get(id), (p) => groupOf.get(p), groupOf.size).includes(groupId);
  const seen = new Map();
  figure.edges.forEach((edge) => {
    splitPartEnds(edge, names, problems);
    for (const end of [edge.from, edge.to]) if (!names.has(end) && !figure.rejectedNames.has(end)) problems.error(edge.line, unknownName('card', end, names.keys()));
    const [from, to] = [names.get(edge.from), names.get(edge.to)];
    for (const end of [from, to]) if (end?.owner) problems.error(edge.line, `chart "${end.id}" belongs inside "${end.owner}". Connect its owner`);
    // 상태의 자기 전이와 클래스의 자기 관계를 허용한다. 나머지는 한 격자의 서로 다른 두 칸을 잇는 선만 허용한다.
    if (edge.from === edge.to && !['state', 'classifier'].includes(from?.shape)) checkSelfEdge(edge, from, problems);
    if (isInside(edge.from, edge.to) || isInside(edge.to, edge.from)) problems.error(edge.line, 'an edge cannot join a group and a node inside it');
    if ([from, to].some((end) => end?.shape === 'state') && [from, to].some((end) => end?.shape === 'group')) problems.error(edge.line, 'a transition joins two states');
    resolveRelation(edge, { from, to }, problems);
    const key = `${edge.from}.${edge.fromCell ?? edge.fromColumn ?? ''}\u0000${edge.to}.${edge.toCell ?? edge.toColumn ?? ''}`;
    if (seen.has(key)) problems.error(edge.line, `there is already an edge ${endName(edge, 'from')} -> ${endName(edge, 'to')} (line ${seen.get(key)}). Merge the labels into one`);
    else seen.set(key, edge.line);
  });
}

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 카드의 칸 수
// basis: estimate
// 선 끝의 `카드.칸`을 카드 이름(from, to)과 칸 이름으로 가른다. 테이블과 API는 열(fromColumn, toColumn), 칸 격자는 칸(fromCell, toCell)이다.
// 클래스 멤버와 칸이 없는 카드는 연결점이 아니다. gap은 생략된 항목들이라 선 끝이 될 수 없다.
function splitPartEnds(edge, names, problems) {
  for (const way of ['from', 'to']) {
    const written = edge[way];
    const [id, part, ...more] = written.split('.');
    if (part === undefined) continue;
    const card = names.get(id);
    // 카드를 몰라도 이름은 남겨, 같은 선에 모르는 이름 오류가 하나로 나오게 한다.
    edge[way] = id;
    if (!card) continue;
    if (more.length) problems.error(edge.line, `write a part as card.part. Found "${written}"`);
    else if (card.shape === 'classifier') problems.error(edge.line, `class members are not ports. Connect "${id}"`);
    else if (!PART_SHAPES.includes(card.shape)) problems.error(edge.line, `a ${card.shape} has no parts. Connect "${id}"`);
    else readPart(edge, way, { card, part, written }, problems);
  }
}

function readPart(edge, way, { card, part, written }, problems) {
  if (card.shape === 'grid') {
    const found = card.cells.find((c) => c.id === part);
    if (!found) problems.error(edge.line, unknownName('cell', part, card.cells.map((c) => c.id)));
    else if (found.kind === 'gap') problems.error(edge.line, `"${written}" is a gap, which stands for omitted entries. Connect an item instead`);
    else edge[`${way}Cell`] = part;
  } else if (!card.columns.some((c) => c.name === part)) problems.error(edge.line, `${card.shape} "${card.id}" has no ${card.shape === 'api' ? 'field' : 'column'} "${part}"`);
  else edge[`${way}Column`] = part;
}

// 선 끝의 알림 이름: `카드.칸` 또는 이름
function endName(edge, way) {
  const part = edge[`${way}Cell`] ?? edge[`${way}Column`];
  return part ? `${edge[way]}.${part}` : edge[way];
}

// 같은 도형 안의 선. 한 격자의 서로 다른 두 칸을 잇는 선과, 테이블이나 API의 서로 다른 두 열을 잇는 선(자기 참조 외래 키)만 허용한다.
// 격자의 칸 선은 라벨을 받지 않는다(둘 자리가 없다). 열 선은 라벨을 받는다. 같은 칸끼리, 카드 전체를 잇는 선, 한쪽만 열인 선은 뜻이 정해지지 않아 거절한다.
function checkSelfEdge(edge, card, problems) {
  if (card?.columns) {
    const isPair = edge.fromColumn && edge.toColumn && edge.fromColumn !== edge.toColumn;
    if (!isPair) problems.error(edge.line, `an edge cannot go from "${endName(edge, 'from')}" to itself. A ${card.shape} can join two different columns of its own, such as ${card.id}.parent_id -> ${card.id}.id`);
    return;
  }
  if (!edge.fromCell || !edge.toCell || edge.fromCell === edge.toCell) problems.error(edge.line, `an edge cannot go from "${endName(edge, 'from')}" to itself. Only states and classes have self edges, and a grid can join two different cells`);
  else if (edge.label !== undefined) problems.error(edge.line, 'an edge between two cells of one grid takes no label');
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 다중성 표시 글자 수
// basis: estimate
// 선 끝 종류로 정해지는 규칙. 두 끝이 클래스나 인터페이스면 관계 종류(기본 association)와 점선, 머리가 정해지고,
// 두 테이블도 from=, to=와 association을 받는다. 외래 키 여부와 다중성은 별개이며 생략한 값은 추정하지 않는다.
function resolveRelation(edge, { from, to }, problems) {
  const isClassPair = from?.shape === 'classifier' && to?.shape === 'classifier';
  const isTablePair = from?.shape === 'table' && to?.shape === 'table';
  const hasRelationOptions = edge.relation !== undefined || edge.fromMultiplicity !== undefined || edge.toMultiplicity !== undefined;
  if (isClassPair) {
    edge.relation ??= 'association';
    if (['dependency', 'realization'].includes(edge.relation)) edge.dashed = true;
    edge.head ??= edge.relation === 'association' ? 'none' : 'end';
  } else if (isTablePair) {
    if (edge.relation !== undefined && edge.relation !== 'association') problems.error(edge.line, 'a table relation can only use association');
  } else if (hasRelationOptions && from && to) problems.error(edge.line, 'relation=, from=, and to= join two classes, interfaces, or tables');
  if (isClassPair || isTablePair) checkMultiplicities(edge, problems);
  if (from?.shape === 'state' && to?.shape === 'state' && edge.label === undefined) problems.error(edge.line, 'a transition needs an event label: a -> b "event"');
}

// cost: time O(c·t), heap O(c), stack O(1)
// vars: c = 열 수, t = 테이블 수
// basis: estimate
// 테이블 열의 fk=는 선이 된다. 가리키는 열은 pk나 unique다.
function buildForeignKeys(figure, problems) {
  const tables = new Map(figure.nodes.filter((n) => n.shape === 'table').map((t) => [t.id, t]));
  for (const table of tables.values()) {
    for (const column of table.columns) {
      if (!column.fk) continue;
      const target = tables.get(column.fk.table);
      const targetColumn = target?.columns.find((c) => c.name === column.fk.column);
      if (!target) problems.error(column.line, unknownName('table', column.fk.table, tables.keys()));
      else if (!targetColumn) problems.error(column.line, unknownName(`column in "${target.id}"`, column.fk.column, target.columns.map((c) => c.name)));
      else if (!targetColumn.pk && !targetColumn.unique) problems.error(column.line, `fk must point to a pk or unique column. "${target.id}.${targetColumn.name}" is neither`);
      else figure.edges.push({ from: table.id, to: target.id, fromColumn: column.name, toColumn: targetColumn.name, label: undefined, quiet: false, dashed: false, line: column.line, isForeignKey: true, fromMultiplicity: column.fromMultiplicity, toMultiplicity: column.toMultiplicity });
    }
  }
}

// cost: time O(e·v), heap O(1), stack O(1)
// vars: e = 선 수, v = 보기 수
// basis: estimate
// 모든 선은 두 끝을 함께 담은 그래프 보기가 하나 이상 있어 그려진다. 외래 키 선은 열 줄에서 알린다.
// 끝 이름을 풀지 못한 선(모르는 이름, 거절된 선언)은 선 끝 확인이 이미 원인을 알렸으므로 그려지지 않는다고 다시 알리지 않는다.
function checkDrawable(figure, names, problems) {
  for (const edge of figure.edges) {
    if (!names.has(edge.from) || !names.has(edge.to)) continue;
    if (figure.views.some((view) => view.strategy === 'graph' && viewHas(view, edge.from) && viewHas(view, edge.to))) continue;
    problems.error(edge.line, `edge ${edge.from} -> ${edge.to} is not drawn: no graph view holds both "${edge.from}" and "${edge.to}"`);
  }
}

// cost: time O(s + g), heap O(s), stack O(1)
// vars: s = 카드 수, g = 그룹 수
// basis: estimate
// 카드가 없는 문서, 안에 아무것도 없는 그룹과 테이블, API, 추적은 오류다.
function checkNotEmpty(figure, problems) {
  // 선언 줄 오류로 카드가 빠졌으면 그 오류가 원인이라 덧붙이지 않는다.
  if (!figure.nodes.length && !problems.errors.length) problems.error(figure.line ?? 1, 'a figure needs at least one card');
  const parents = new Set([...figure.nodes, ...figure.groups].map((n) => n.parent));
  for (const group of figure.groups) if (!parents.has(group.id) && !group.hasError && !figure.rejectedNames.has(`group:${group.id}`)) problems.error(group.line, `group "${group.id}" is empty. Put nodes inside or remove it`);
  for (const card of figure.nodes.filter((n) => ['table', 'api'].includes(n.shape) && !n.isRejected)) if (!card.columns.length) problems.error(card.line, `${card.shape} "${card.id}" has no ${card.shape === 'api' ? 'fields' : 'columns'}`);
}

// cost: time O(f·k), heap O(k), stack O(1)
// vars: f = 처음·끝 상태 표시 수, k = 이름 수
// basis: estimate
// start와 final은 선언된 상태를 가리킨다. start는 없어도 된다(둘 이상은 읽을 때 오류).
function checkStateMarks(figure, names, problems) {
  for (const mark of [figure.start, ...figure.finals].filter(Boolean)) {
    if (names.get(mark.id)?.shape !== 'state') problems.error(mark.line, unknownName('state', mark.id, figure.nodes.filter((n) => n.shape === 'state').map((n) => n.id)));
  }
}

// cost: time O(b·(h·e + o + l)), heap O(e), stack O(1)
// vars: b = 박자 수, h = 박자의 이동 수, e = 선 수, o = 카드 줄 수, l = 밝히기 대상 수
// basis: estimate
// 장면마다 박자가 있는지, 이동이 투영될 선과 메시지가 있는지, 카드와 밝히기 대상이 맞는지 본다.
function checkTimeline(figure, names, problems) {
  const usedEdges = new Set();
  for (const step of figure.steps) {
    // mode를 적지 않은 장면은 줄이 없으면 정지(static), 줄이 있으면 한 번 재생(once)한다. 적은 mode가 우선한다.
    // 정지 장면은 줄이 없어도 된다: 처음 구성 그대로의 정지 모습이다. 길이 0인 빈 박자 하나로 두어, 시간표와 그리기가 다른 장면과 같은 길을 간다(움직임도 효과도 없어 표시 길이 0).
    // 재생하는 장면(once, loop)은 줄이 없으면 재생할 것이 없어 오류다.
    const isEmpty = !step.beats.length && !step.tracks.length;
    step.mode ??= isEmpty ? 'static' : 'once';
    if (isEmpty && !step.hasError) {
      if (step.mode === 'static') step.beats.push(emptyBeat(step.line));
      else problems.error(step.line, `scene "${step.label}" has no lines. Add a move, show, light, reveal, or wait, or write mode=static for a still composition`);
    }
    checkFlowStep(step, { figure, names, problems, resolveHop, usedEdges });
    for (const { node } of step.status ?? []) checkStatusTarget(node, { line: step.line, figure, names }, problems);
    for (const beat of step.beats) checkBeat(beat, { figure, names, problems, usedEdges });
  }
  figure.edges.forEach((edge, i) => {
    if (edge.quiet && !usedEdges.has(i)) problems.warn(edge.line, `[check 11] quiet edge ${edge.from} -> ${edge.to} is never passed, so it never shows. Pass it in a scene or remove quiet`);
  });
}

// cost: time O(h·e + o + l), heap O(h), stack O(1)
// vars: h = 박자의 이동 수, e = 선 수, o = 카드 줄 수, l = 밝히기 대상 수
// basis: estimate
// 박자 하나의 이동, 카드 줄, 밝히기, 차트 움직임, 메모, 순서 보기 전용 문장.
function checkBeat(beat, { figure, names, problems, usedEdges }) {
  const deps = { figure, names, problems };
  for (const hop of beat.hops) {
    resolveHop(hop, deps, usedEdges);
    // 시간 초과로 끝난 점이 갈 선도 이동처럼 고른다(출발 도형에서 `else` 도형으로).
    if (hop.condition?.elseNode) resolveHop((hop.elseLeg = { from: hop.from, to: hop.condition.elseNode, line: hop.line }), deps, usedEdges, { graphOnly: true });
    checkSequenceHop(hop, { beatSize: beat.hops.length, figure }, problems);
  }
  for (const op of beat.ops) checkCardTarget(op, deps, problems);
  for (const target of beat.light) checkLightTarget(target, { line: beat.line, ...deps }, problems);
  for (const { chart, line } of [...beat.chartLight, ...beat.reveal]) checkChartTarget(chart, { line, ...deps }, problems);
  for (const note of beat.notes) checkSequenceMember(note.node, `note ${note.node}`, { line: note.line, ...deps }, problems);
  for (const action of beat.activations ?? []) checkSequenceMember(action.node, `${action.kind} ${action.node}`, { line: action.line, ...deps }, problems);
}

// cost: time O(v), heap O(1), stack O(1)
// vars: v = 보기 수
// basis: estimate
// 순서 보기에 보이는 이동은 글이 있고 한 줄에 하나다. dashed, create, destroy는 순서 보기의 낱말이라 두 끝을 담은 순서 보기가 있어야 한다.
function checkSequenceHop(hop, { beatSize, figure }, problems) {
  const isSequence = hop.projections?.some((p) => p.kind === 'sequence');
  if (isSequence && hop.data === undefined) problems.error(hop.line, 'a sequence message needs text: a -> b "message"');
  if (isSequence && beatSize > 1) problems.error(hop.line, 'a sequence message cannot use "&". Write one message per line');
  const flag = ['dashed', 'create', 'destroy'].find((key) => hop[key]);
  if (flag && hop.projections && !isSequence) problems.error(hop.line, `"${flag}" belongs to a sequence message, and no sequence view holds both "${hop.from}" and "${hop.to}"`);
}

// cost: time O(v), heap O(1), stack O(1)
// vars: v = 보기 수
// basis: estimate
// 메모, 활성은 순서 보기에 놓인 참여자에게만 붙는다.
function checkSequenceMember(id, what, { line, figure, names }, problems) {
  if (!names.has(id) && !figure.rejectedNames.has(id)) return problems.error(line, unknownName('participant', id, figure.nodes.map((n) => n.id)));
  if (!figure.views.some((view) => view.strategy === 'sequence' && viewHas(view, id))) problems.error(line, `"${what}" needs "${id}" in a sequence view`);
  return undefined;
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 이름 수(없는 이름 메시지)
// basis: estimate
// 차트 카드를 가리키는 light, reveal 대상. 이름이 있는데 차트가 아니면 그 도형을 알린다.
function checkChartTarget(id, { line, figure, names }, problems) {
  const target = names.get(id);
  if (target?.shape === 'chart' || figure.rejectedNames.has(id)) return;
  if (target) problems.error(line, `"${id}" is a ${target.shape}, not a chart. light "item" and reveal belong to a chart card`);
  else problems.error(line, unknownName('chart', id, figure.nodes.filter((n) => n.shape === 'chart').map((n) => n.id)));
}

// cost: time O(e), heap O(1), stack O(1)
// vars: e = 선 수
// basis: estimate
/**
 * 이동이 보일 선과 메시지를 고른다. 보기마다 같은 방향 선이 먼저, 없으면 반대 방향 선을 거꾸로 고르고, 순서 보기는 메시지가 된다.
 * 첫 투영이 시간표의 시간을 정하고 나머지는 같은 시각과 길이로 따라 움직인다. scope가 있으면 { only: 보기 이름들 }의 그래프 보기만 본다(흐름 경로의 구간)
 * 또는 { graphOnly: true }로 순서 보기를 보지 않는다(시간 초과 분기는 메시지가 아니라 선을 지난다).
 */
function resolveHop(hop, { figure, names, problems }, usedEdges, scope) {
  const [fromId] = hop.from.split('.');
  const [toId] = hop.to.split('.');
  if (!checkPartRefs([hop.from, hop.to], { names, line: hop.line }, problems)) return;
  for (const id of [fromId, toId]) if (!names.has(id) && !figure.rejectedNames.has(id)) problems.error(hop.line, unknownName('card', id, names.keys()));
  if (!names.has(fromId) || !names.has(toId)) return;
  const result = projectMove(figure, hop, scope);
  if (result.ambiguous) {
    problems.error(hop.line, `there are ${result.ambiguous} edges between "${fromId}" and "${toId}". Write the columns or cells: ${fromId}.part -> ${toId}.part`);
    return;
  }
  if (!result.projections.length) {
    problems.error(hop.line, result.holdsBoth || scope ? `there is no edge between "${fromId}" and "${toId}". Declare "${fromId} -> ${toId}" first` : `move ${fromId} -> ${toId} is not shown: no graph view holds an edge between them and no sequence view holds both`);
    return;
  }
  hop.projections = result.projections;
  const graph = result.projections.find((p) => p.kind === 'graph');
  for (const p of result.projections) if (p.kind === 'graph') usedEdges.add(p.docEdge);
  if (scope) {
    hop.projection = graph;
    hop.isBack = graph?.isBack;
  }
  const label = graph ? figure.edges[graph.docEdge].label : undefined;
  if (hop.data !== undefined && hop.data === label) problems.warn(hop.line, `[check 8] the moving text "${hop.data}" repeats the edge label. Remove one of them`);
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 이름 수(없는 이름 메시지)
// basis: estimate
// show, clear 대상: 카드를 쓰는 도형(상자, 외부, 저장소, 사람, 테이블, API)이고 카드를 그리는 그래프 보기에 놓인 것
function checkCardTarget(op, { figure, names }, problems) {
  const target = names.get(op.node);
  if (!target && !figure.rejectedNames.has(op.node)) problems.error(op.line, unknownName('card', op.node, names.keys()));
  else if (target && !CARD_SHAPES.includes(target.shape)) problems.error(op.line, `a ${target.shape} has no card. Use show on ${CARD_SHAPES.join(', ')}`);
  else if (target && !isCardDrawn(figure, op.node)) problems.error(op.line, `${op.type} "${op.node}" needs a card, and no graph view shows "${op.node}". A sequence view draws only the head. Put "${op.node}" in a graph view`);
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 이름 수(없는 이름 메시지)
// basis: estimate
// 장면 상태(`status`) 대상: 상자, 외부, 저장소, 사람, 큐, 갈림길. 그룹, 격자, 값 이름은 상태 알약을 달 도형이 아니다.
function checkStatusTarget(id, { line, figure, names }, problems) {
  const target = names.get(id);
  if (!target && !figure.rejectedNames.has(id)) problems.error(line, unknownName('card', id, names.keys()));
  else if (target && !STATUS_SHAPES.includes(target.shape)) problems.error(line, `a ${target.shape} takes no status. Use status on ${STATUS_SHAPES.join(', ')}`);
}

// cost: time O(k + c), heap O(k), stack O(1)
// vars: k = 이름 수, c = 칸 수
// basis: estimate
// light 대상: 카드, 그룹, 테이블·API 칸, 격자 칸, 추적 구간
function checkLightTarget(target, { line, figure, names }, problems) {
  const [id, part] = target.split('.');
  const item = names.get(id);
  if (!checkPartRefs([target], { names, line }, problems)) return;
  if (!item && !figure.rejectedNames.has(id)) problems.error(line, unknownName('card', id, names.keys()));
  else if (item && part !== undefined) checkPart({ item, part, target, line }, problems);
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 칸 수
// basis: estimate
// 카드 안 부분: 테이블과 API의 칸, 격자의 item, 추적의 구간. gap은 생략된 항목들이라 밝히지 못한다.
function checkPart({ item, part, target, line }, problems) {
  if (item.shape === 'grid') {
    const cell = item.cells.find((c) => c.id === part);
    if (!cell) problems.error(line, unknownName('cell', part, item.cells.map((c) => c.id)));
    else if (cell.kind === 'gap') problems.error(line, `"${target}" is a gap, which stands for omitted entries. Light an item instead`);
  } else if (item.shape === 'trace') {
    if (!item.spans.some((s) => s.id === part)) problems.error(line, unknownName('span', part, item.spans.map((s) => s.id)));
  } else if (['table', 'api'].includes(item.shape)) {
    if (!item.columns.some((c) => c.name === part)) problems.error(line, `${item.shape} "${item.id}" has no ${item.shape === 'api' ? 'field' : 'column'} "${part}"`);
  } else problems.error(line, `a ${item.shape} has no parts. Light "${item.id}"`);
}

// cost: time O(r), heap O(1), stack O(1)
// vars: r = 이름 수
// basis: estimate
// `카드.칸` 꼴 이름은 점 하나로만 쓴다. 칸이 없는 카드에 칸을 쓰면 오류다. 맞으면 true다.
function checkPartRefs(refs, { names, line }, problems) {
  const bad = refs.find((ref) => ref.split('.').length > 2);
  if (bad) {
    problems.error(line, `write a part as card.part. Found "${bad}"`);
    return false;
  }
  for (const ref of refs.filter((r) => r.includes('.'))) {
    const [id, part] = ref.split('.');
    const card = names.get(id);
    if (card && !['table', 'api', 'grid', 'trace'].includes(card.shape)) {
      problems.error(line, card.shape === 'classifier' ? `class members are not ports. Connect "${id}"` : `a ${card.shape} has no parts. "${id}.${part}" is not a part`);
      return false;
    }
  }
  return true;
}
