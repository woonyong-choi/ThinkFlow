// 파일을 다 읽은 뒤 이름, 선, 이동, 카드, 밝히기 대상을 확인한다. 이동마다 따라갈 선(edge 번호, 거꾸로 여부)을 정한다.
import { checkChart } from './chart-rules.js';
import { unknownName } from './problems.js';

const CARD_SHAPES = ['box', 'external', 'store', 'person', 'table'];

// cost: time O(s·k + e² + h·e), heap O(k + e), stack O(1)
// vars: s = 문장 수, k = 이름 수, e = 선 수, h = 이동 수
// basis: estimate
/** 그림 모형의 서로 가리키는 이름과 종류별 규칙을 확인한다. 이동에는 edge, isBack을 채운다. */
export function validateFigure(figure, problems) {
  const names = collectNames(figure, problems);
  if (figure.kind === 'data') buildForeignKeys(figure, problems);
  else checkEdges(figure, names, problems);
  if (figure.kind === 'state') checkStateMarks(figure, names, problems);
  if (figure.aspect !== undefined && figure.groups.length) problems.error(figure.line, 'aspect cannot be used with groups. Set direction on groups instead');
  checkNotEmpty(figure, problems);
  if (figure.kind === 'chart') checkChart(figure, problems);
  else checkTimeline(figure, names, problems);
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 이름 수
// basis: estimate
// 도형, 그룹, 상태, 테이블, 계열 이름이 겹치지 않는지 보고 이름 → 선언을 돌려준다.
function collectNames(figure, problems) {
  const names = new Map();
  for (const item of [...figure.nodes, ...figure.groups.map((g) => ({ ...g, shape: 'group' })), ...figure.chart.series.map((s) => ({ ...s, shape: 'series' }))]) {
    const known = names.get(item.id);
    if (known) problems.error(item.line, `the name "${item.id}" is already used on line ${known.line}`);
    else names.set(item.id, item);
  }
  return names;
}

// cost: time O(e² + e·d), heap O(e), stack O(1)
// vars: e = 선 수, d = 그룹 깊이
// basis: estimate
// 선 끝 이름, 자기 자신, 그룹과 하위 도형 사이, 같은 방향 중복을 확인한다.
function checkEdges(figure, names, problems) {
  const groupOf = new Map([...figure.nodes, ...figure.groups].map((n) => [n.id, n.parent]));
  // cost: time O(d), heap O(1), stack O(1)
  // vars: d = 그룹 깊이
  // basis: estimate
  const isInside = (id, groupId) => {
    for (let p = groupOf.get(id); p; p = groupOf.get(p)) if (p === groupId) return true;
    return false;
  };
  const seen = new Map();
  figure.edges.forEach((edge) => {
    for (const end of [edge.from, edge.to]) if (!names.has(end)) problems.error(edge.line, unknownName('node', end, names.keys()));
    if (edge.from === edge.to) problems.error(edge.line, `an edge cannot go from "${edge.from}" to itself`);
    if (isInside(edge.from, edge.to) || isInside(edge.to, edge.from)) problems.error(edge.line, 'an edge cannot join a group and a node inside it');
    if (figure.kind === 'state' && [edge.from, edge.to].some((id) => names.get(id)?.shape === 'group')) problems.error(edge.line, 'a transition joins two states');
    const key = `${edge.from}\u0000${edge.to}`;
    if (seen.has(key)) problems.error(edge.line, `there is already an edge ${edge.from} -> ${edge.to} on line ${seen.get(key)}. Merge the labels into one`);
    else seen.set(key, edge.line);
  });
}

// cost: time O(c·t), heap O(c), stack O(1)
// vars: c = 열 수, t = 테이블 수
// basis: estimate
// 데이터 관계 그림의 선은 fk=로만 생긴다. 가리키는 열은 pk나 unique다.
function buildForeignKeys(figure, problems) {
  const tables = new Map(figure.nodes.map((t) => [t.id, t]));
  for (const table of figure.nodes) {
    for (const column of table.columns) {
      if (!column.fk) continue;
      const target = tables.get(column.fk.table);
      const targetColumn = target?.columns.find((c) => c.name === column.fk.column);
      if (!target) problems.error(column.line, unknownName('table', column.fk.table, tables.keys()));
      else if (!targetColumn) problems.error(column.line, unknownName(`column in "${target.id}"`, column.fk.column, target.columns.map((c) => c.name)));
      else if (!targetColumn.pk && !targetColumn.unique) problems.error(column.line, `fk must point to a pk or unique column. "${target.id}.${targetColumn.name}" is neither`);
      else figure.edges.push({ from: table.id, to: target.id, fromColumn: column.name, toColumn: targetColumn.name, label: undefined, quiet: false, dashed: false, line: column.line });
    }
  }
}

// cost: time O(s + g), heap O(s), stack O(1)
// vars: s = 도형 수, g = 그룹 수
// basis: estimate
// 안에 아무것도 없는 그룹과 테이블은 오류다.
function checkNotEmpty(figure, problems) {
  const parents = new Set([...figure.nodes, ...figure.groups].map((n) => n.parent));
  for (const group of figure.groups) if (!parents.has(group.id)) problems.error(group.line, `group "${group.id}" is empty. Put nodes inside or remove it`);
  for (const table of figure.nodes.filter((n) => n.shape === 'table')) if (!table.columns.length) problems.error(table.line, `table "${table.id}" has no columns`);
}

// cost: time O(f·k), heap O(k), stack O(1)
// vars: f = 처음·끝 상태 표시 수, k = 이름 수
// basis: estimate
// 상태 그림의 start는 하나, start와 final은 선언된 상태를 가리킨다.
function checkStateMarks(figure, names, problems) {
  if (!figure.start) problems.error(figure.line, 'a state figure needs one "start state-id" line');
  for (const mark of [figure.start, ...figure.finals].filter(Boolean)) {
    if (names.get(mark.id)?.shape !== 'state') problems.error(mark.line, unknownName('state', mark.id, figure.nodes.map((n) => n.id)));
  }
}

// cost: time O(b·(h·e + o + l)), heap O(e), stack O(1)
// vars: b = 박자 수, h = 박자의 이동 수, e = 선 수, o = 카드 줄 수, l = 밝히기 대상 수
// basis: estimate
// 단계마다 박자가 있는지, 이동이 따라갈 선이 있는지, 카드와 밝히기 대상이 맞는지 본다.
function checkTimeline(figure, names, problems) {
  const usedEdges = new Set();
  for (const step of figure.steps) {
    if (!step.beats.length) problems.error(step.line, `step "${step.label}" has no lines. Add a move, show, light, say, or wait`);
    for (const beat of step.beats) {
      for (const hop of beat.hops) resolveHop(hop, figure, names, problems, usedEdges);
      for (const op of beat.ops) checkCardTarget(op, figure, names, problems);
      for (const target of beat.light) checkLightTarget(target, beat.line, figure, names, problems);
      for (const note of beat.notes) if (!names.has(note.node)) problems.error(note.line, unknownName('participant', note.node, names.keys()));
    }
  }
  figure.edges.forEach((edge, i) => {
    if (edge.quiet && !usedEdges.has(i)) problems.warn(edge.line, `quiet edge ${edge.from} -> ${edge.to} is never passed, so it never shows. Pass it in a step or remove quiet`);
  });
  if (figure.kind === 'sequence') checkParticipantOrder(figure, problems);
}

// cost: time O(e), heap O(1), stack O(1)
// vars: e = 선 수
// basis: estimate
// 이동이 따라갈 선을 고른다. 같은 방향 선이 먼저, 없으면 반대 방향 선을 거꾸로. 순서 그림 메시지는 선이 없다.
function resolveHop(hop, figure, names, problems, usedEdges) {
  const [fromId, fromColumn] = hop.from.split('.');
  const [toId, toColumn] = hop.to.split('.');
  for (const id of [fromId, toId]) if (!names.has(id)) problems.error(hop.line, unknownName('node', id, names.keys()));
  if (figure.kind === 'sequence' || !names.has(fromId) || !names.has(toId)) return;
  const matches = (e, a, b, ca, cb) => e.from === a && e.to === b && (ca === undefined || e.fromColumn === ca) && (cb === undefined || e.toColumn === cb);
  const forward = figure.edges.map((e, i) => (matches(e, fromId, toId, fromColumn, toColumn) ? i : -1)).filter((i) => i >= 0);
  const backward = figure.edges.map((e, i) => (matches(e, toId, fromId, toColumn, fromColumn) ? i : -1)).filter((i) => i >= 0);
  const candidates = forward.length ? forward : backward;
  if (!candidates.length) {
    problems.error(hop.line, `there is no edge between "${fromId}" and "${toId}". Declare "${fromId} -> ${toId}" first`);
    return;
  }
  if (candidates.length > 1) {
    problems.error(hop.line, `there are ${candidates.length} foreign keys between "${fromId}" and "${toId}". Write the columns: ${fromId}.column -> ${toId}.column`);
    return;
  }
  hop.edge = candidates[0];
  hop.isBack = !forward.length;
  usedEdges.add(hop.edge);
  const label = figure.edges[hop.edge].label;
  if (hop.data !== undefined && hop.data === label) problems.warn(hop.line, `the moving text "${hop.data}" repeats the edge label. Remove one of them`);
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 이름 수(없는 이름 메시지)
// basis: estimate
// show, clear 대상: 구조 그림의 상자, 외부, 저장소, 사람, 데이터 그림의 테이블
function checkCardTarget(op, figure, names, problems) {
  const target = names.get(op.node);
  if (!target) problems.error(op.line, unknownName('node', op.node, names.keys()));
  else if (!CARD_SHAPES.includes(target.shape)) problems.error(op.line, `a ${target.shape} has no card. Use show on ${CARD_SHAPES.slice(0, 4).join(', ')} or table`);
}

// cost: time O(k + c), heap O(k), stack O(1)
// vars: k = 이름 수, c = 열 수
// basis: estimate
// light 대상: 도형, 그룹, 상태, 테이블, 테이블.열
function checkLightTarget(target, line, figure, names, problems) {
  const [id, column] = target.split('.');
  const item = names.get(id);
  if (!item) problems.error(line, unknownName('node', id, names.keys()));
  else if (column !== undefined && !item.columns?.some((c) => c.name === column)) problems.error(line, `table "${id}" has no column "${column}"`);
}

// cost: time O(b), heap O(p), stack O(1)
// vars: b = 메시지 수, p = 참여자 수
// basis: estimate
// 참여자 선언 순서가 처음 보내는 순서와 다르면 경고한다. 보내지 않는 참여자는 뒤에 와도 된다.
function checkParticipantOrder(figure, problems) {
  const senders = [];
  for (const beat of figure.steps.flatMap((s) => s.beats)) {
    for (const hop of beat.hops) if (!senders.includes(hop.from)) senders.push(hop.from);
  }
  const declared = figure.nodes.map((n) => n.id);
  const expected = [...senders.filter((id) => declared.includes(id)), ...declared.filter((id) => !senders.includes(id))];
  const first = declared.findIndex((id, i) => id !== expected[i]);
  if (first >= 0) problems.warn(figure.nodes[first].line, `declare participants in the order they first send: ${expected.join(', ')}`);
}
