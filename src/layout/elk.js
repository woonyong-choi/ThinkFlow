// 배치 모형을 elkjs 그래프로 바꾼다. 선택 사항 값은 모두 토큰이다(docs/design/layout.md 간격과 결정성).
import { FIGURE_PAD } from '../canvas.js';
import { groupTitleWidth, hasPill, isOnLinePill, sizePill } from '../measure/sizes.js';
import { values } from '../tokens.js';
import { ROOT } from './model.js';
import { isBodyShape, outerBox, spreadBodyPorts } from './ports.js';

const SPACE = values.space;
const SIZE = values.size;
const ELK_DIRECTION = { right: 'RIGHT', down: 'DOWN' };
// 라벨을 선 위 가운데에 얹는다. 라벨마다 주는 elkjs 선택 사항이다.
const LABEL_OPTIONS = { 'elk.edgeLabels.inline': 'true', 'elk.edgeLabels.placement': 'CENTER' };

// 글 상자 간격 요구(chipRoom)를 elkjs에 알리는 보이지 않는 라벨. 선 끝 쪽에 선 옆으로 두는 라벨은 층 사이 간격을 (기본 간격 + 라벨 크기 + 라벨 간격)으로 만든다.
const ROOM_OPTIONS = { 'elk.edgeLabels.inline': 'false', 'elk.edgeLabels.placement': 'HEAD' };

// cost: time O(s + e·d), heap O(s + e·d), stack O(d)
// vars: s = 도형 수, e = 선 수, d = 그룹 깊이
// basis: estimate
/** 모형을 elkjs 그래프로 바꾼다. 그룹이 안쪽 그래프이고 선 조각은 그룹마다 모인다. */
export function toElk(model, figure) {
  const byContainer = edgesByContainer(model, figure);
  const ctx = { model, figure, byContainer, alignRight: figure.aspect !== undefined && figure.groups.length > 0, isSafe: figure.safeLayout === true };
  return containerToElk(model.containers.get(ROOT), ctx);
}

// cost: time O(e·k), heap O(e·k), stack O(1)
// vars: e = 선 수, k = 선의 조각 수
// basis: estimate
function edgesByContainer({ containers, pieces, edges, isSafe }, figure) {
  const byContainer = new Map([...containers.keys()].map((k) => [k, []]));
  for (const [index, list] of pieces) {
    const edge = edges.find((e) => e.index === index);
    list.forEach((p, k) => {
      // 번호만 있는 알약은 선을 다 그린 뒤 얹으므로(read.js) 자리를 요구하지 않는다. 안전 배치는 얹을 자리가 없을 때의 대비라 알약도 자리를 받는다.
      const labels = p.hasLabel && (edge.label !== undefined || (hasPill(edge) && (isSafe || !isOnLinePill(edge)))) && !isBeside(edge, containers.get(p.container)) ? [{ id: `label::${index}`, text: edge.label ?? String(edge.no), ...sizeOf(sizePill(edge.label, edge.no)), layoutOptions: LABEL_OPTIONS }] : [];
      const room = figure.chipRoom?.get(index);
      if (room !== undefined) labels.push(roomLabel(`room::${index}::${k}`, room, containers.get(p.container).direction));
      byContainer.get(p.container).push({ id: `${index}::${k}`, sources: [p.from], targets: [p.to], labels });
    });
  }
  return byContainer;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 층 사이 간격이 room(px)이 되게 하는 보이지 않는 라벨. 층이 놓이는 방향의 크기만 갖고(right는 너비, down은 높이) 다른 쪽은 1이다.
function roomLabel(id, room, direction) {
  const extent = Math.max(1, room - SPACE['30'] - SPACE['2']);
  return { id, text: ' ', width: direction === 'down' ? 1 : extent, height: direction === 'down' ? extent : 1, layoutOptions: ROOM_OPTIONS };
}

// 세로로 쌓는 층의 quiet 선 라벨은 층 사이에 자리를 만들지 않고 선 옆에 둔다(read.js). 숨은 선 때문에 층 간격이 벌어져 보이지 않게 하려는 것이다.
function isBeside(edge, container) {
  return edge.quiet && container.direction === 'down';
}

// 줄 바꿈한 그림에서 그룹이 있으면, 그룹이 든 열만 넓어져 같은 열의 상자가 가운데나 왼쪽에 놓이고 칸 간격이 줄마다 달라진다.
// 바깥 층 도형을 모두 열의 오른쪽 끝에 붙이면 상자 사이 간격이 줄마다 같다. 이 선택 사항은 도형마다 줘야 한다(층 전체에 주면 무시된다).
function alignOf(parent, ctx) {
  return ctx.alignRight && parent === ROOT ? { 'elk.alignment': 'RIGHT' } : {};
}

// cost: time O(c + p), heap O(c + p), stack O(d)
// vars: c = 자식 수, p = 연결점 수, d = 그룹 깊이
// basis: estimate
function containerToElk(c, ctx) {
  const children = c.children.map((id) => (ctx.model.containers.has(id) ? containerToElk(ctx.model.containers.get(id), ctx) : nodeToElk(ctx.model.nodes.get(id), ctx)));
  return {
    id: c.id,
    children,
    edges: ctx.byContainer.get(c.id),
    ports: c.ports.map((p) => ({ id: p.id, width: 0, height: 0, layoutOptions: { 'elk.port.side': p.side } })),
    layoutOptions: containerOptions(c, ctx),
  };
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 도형의 연결점 수
// basis: estimate
function nodeToElk(n, ctx) {
  const outer = outerBox(n.size);
  const ports = n.ports.map((p) => ({ id: p.id, width: 0, height: 0, ...(p.position ?? {}), layoutOptions: { 'elk.port.side': p.side } }));
  // 사람과 원통: 첫 배치는 순서를 맡기고(FIXED_SIDE), 둘째 배치는 그 순서로 몸통 범위에 고정한다(FIXED_POS).
  const isFirstPass = isBodyShape(n) && !n.portOrder;
  if (isBodyShape(n) && n.portOrder) spreadBodyPorts(ports, n.size, n.portOrder);
  return {
    id: n.id,
    width: outer.w,
    height: outer.h,
    ports,
    layoutOptions: { 'elk.portConstraints': portConstraint(ports, isFirstPass), ...alignOf(n.parent, ctx) },
  };
}

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 도형의 연결점 수
// basis: estimate
// 연결점 제약. 위치까지 정한 연결점이 있으면 위치 고정, 면만 정한 것이면 면 고정, 없으면 자유다.
function portConstraint(ports, isFirstPass) {
  if (!ports.length) return 'FREE';
  return isFirstPass || ports.every((p) => p.x === undefined) ? 'FIXED_SIDE' : 'FIXED_POS';
}

function containerOptions(c, ctx) {
  return {
    'elk.algorithm': 'layered',
    'elk.direction': ELK_DIRECTION[c.direction],
    'elk.hierarchyHandling': 'SEPARATE_CHILDREN',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.randomSeed': '1',
    'elk.layered.considerModelOrder.strategy': ctx.isSafe ? 'NONE' : 'NODES_AND_EDGES',
    // 순환이 있으면 자식 순서(order.js)를 거스르는 선, 곧 순환을 끊는 선만 거꾸로 놓아 먼저 적은 도형이 앞(왼쪽, 위)에 오게 한다.
    // 순환이 없는 그룹은 MODEL_ORDER로 바꾸면 선 높이가 달라지는 그림이 있어(memory 예제) 처음 설정을 지킨다.
    // 안전 배치(처음 배치가 실패한 뒤의 두 번째 시도)는 모델 순서를 쓰지 않는 기본 순환 처리로 한다.
    'elk.layered.cycleBreaking.strategy': cycleStrategy(c, ctx),
    'elk.spacing.nodeNode': String(SPACE['16']),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(SPACE['30']),
    'elk.spacing.edgeEdge': String(SPACE['5']),
    'elk.spacing.edgeNode': String(SPACE['8']),
    'elk.spacing.edgeLabel': String(SPACE['2']),
    'elk.layered.spacing.edgeNodeBetweenLayers': String(SPACE['8']),
    'elk.edgeLabels.placement': 'CENTER',
    'elk.edgeLabels.inline': 'true',
    'elk.portConstraints': c.ports.length ? 'FIXED_SIDE' : 'FREE',
    // 그룹 경계 연결점은 면 가운데에 모아, 그룹 안 도형으로 가는 선이 그룹 모서리를 돌지 않게 한다.
    'elk.portAlignment.default': 'CENTER',
    'elk.portAlignment.north': 'CENTER',
    'elk.portAlignment.south': 'CENTER',
    'elk.portAlignment.east': 'CENTER',
    'elk.portAlignment.west': 'CENTER',
    ...(c.id === ROOT ? rootOptions(ctx.figure) : groupOptions(c, ctx)),
  };
}

function cycleStrategy(c, ctx) {
  if (ctx.isSafe) return 'GREEDY';
  return c.hasBack ? 'MODEL_ORDER' : 'GREEDY_MODEL_ORDER';
}

function rootOptions(figure) {
  const pad = FIGURE_PAD;
  return { 'elk.padding': `[top=${pad},left=${pad},bottom=${pad},right=${pad}]`, ...(figure.aspect !== undefined ? wrapOptions(figure.aspect) : {}) };
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 그룹 이름 글자 수
// basis: estimate
function groupOptions(c, ctx) {
  return {
    // 제목이 선을 비킬 자리가 없던 그룹은 오른쪽 안쪽 여백을 제목 덩어리만큼 넓혀, 선 오른쪽 끝 너머에 제목이 설 자리를 만든다.
    'elk.padding': `[top=${SIZE.group.title + SPACE['6']},left=${SPACE['12']},bottom=${SPACE['12']},right=${SPACE['12'] + (ctx.figure.wideGroups?.has(c.id) ? groupTitleWidth(c) : 0)}]`,
    // 그룹 안은 연결점에서 도형까지 선이 곧게 가도록 네트워크 심플렉스 배치로 놓는다(그룹 모서리로 도는 선을 줄인다). 선이 붙는 그림 검사에 걸리면 안전 배치가 기본 배치로 다시 놓는다.
    ...(ctx.isSafe ? {} : { 'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX' }),
    'elk.nodeSize.constraints': 'MINIMUM_SIZE',
    'elk.nodeSize.minimum': `(${minGroupWidth(c)}, ${SIZE.group.title})`,
    ...alignOf(c.parent, ctx),
  };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 바깥 층(root)을 줄 바꿈하는 elkjs 선택 사항. 그룹은 SEPARATE_CHILDREN이라 한 덩어리 도형으로 줄 바꿈된다.
// 고른 근거는 docs/design/layout.md 줄 바꿈 절이다.
function wrapOptions(aspect) {
  return {
    'elk.layered.wrapping.strategy': 'MULTI_EDGE',
    'elk.aspectRatio': String(aspect),
    // 기본값(true)은 되돌아오는 선과 라벨이 함께 있으면 선이 엉뚱한 도형으로 가는 elkjs 오류를 낸다.
    'elk.layered.wrapping.multiEdge.improveWrappedEdges': 'false',
    // 줄 사이 되돌아오는 선의 추가 간격을 없애 그림이 덜 길어지게 한다.
    'elk.layered.wrapping.additionalEdgeSpacing': '0',
  };
}

function sizeOf({ w, h }) {
  return { width: w, height: h };
}

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 그룹 연결점 수
// basis: estimate
// 그룹 최소 너비. 위 면으로 선이 들어오는 그룹은 제목 줄 위로 선이 내려오므로, 제목이 선 한쪽에 들어가도록 제목 덩어리의 두 배 너비로 시작한다(선은 대개 가운데로 들어온다).
function minGroupWidth(c) {
  const head = groupTitleWidth(c);
  return c.ports.some((p) => p.side === 'NORTH') ? head * 2 : head;
}
