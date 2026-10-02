// 배치 모형을 elkjs 그래프로 바꾼다. 선택 사항 값은 모두 토큰이다(docs/design/layout.md 간격과 결정성).
import { groupTitleWidth, sizePill } from '../measure/sizes.js';
import { values } from '../tokens.js';
import { ROOT } from './model.js';
import { isBodyShape, outerBox, spreadBodyPorts } from './ports.js';

const SPACE = values.space;
const SIZE = values.size;
const ELK_DIRECTION = { right: 'RIGHT', down: 'DOWN' };
// 라벨을 선 위 가운데에 얹는다. 라벨마다 주는 elkjs 선택 사항이다.
const LABEL_OPTIONS = { 'elk.edgeLabels.inline': 'true', 'elk.edgeLabels.placement': 'CENTER' };

// cost: time O(s + e·d), heap O(s + e·d), stack O(d)
// vars: s = 도형 수, e = 선 수, d = 그룹 깊이
// basis: estimate
/** 모형을 elkjs 그래프로 바꾼다. 그룹이 안쪽 그래프이고 선 조각은 그룹마다 모인다. */
export function toElk(model, figure) {
  const byContainer = edgesByContainer(model);
  const ctx = { model, figure, byContainer, alignRight: figure.aspect !== undefined && figure.groups.length > 0, isSafe: figure.safeLayout === true };
  return containerToElk(model.containers.get(ROOT), ctx);
}

// cost: time O(e·k), heap O(e·k), stack O(1)
// vars: e = 선 수, k = 선의 조각 수
// basis: estimate
function edgesByContainer({ containers, pieces, edges }) {
  const byContainer = new Map([...containers.keys()].map((k) => [k, []]));
  for (const [index, list] of pieces) {
    const edge = edges.find((e) => e.index === index);
    list.forEach((p, k) => {
      const labels = p.hasLabel && edge.label && !isBeside(edge, containers.get(p.container)) ? [{ id: `label::${index}`, text: edge.label, ...sizeOf(sizePill(edge.label)), layoutOptions: LABEL_OPTIONS }] : [];
      byContainer.get(p.container).push({ id: `${index}::${k}`, sources: [p.from], targets: [p.to], labels });
    });
  }
  return byContainer;
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
  return {
    id: c.id,
    children: c.children.map((id) => (ctx.model.containers.has(id) ? containerToElk(ctx.model.containers.get(id), ctx) : nodeToElk(ctx.model.nodes.get(id), ctx))),
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
    layoutOptions: { 'elk.portConstraints': ports.length ? (isFirstPass ? 'FIXED_SIDE' : 'FIXED_POS') : 'FREE', ...alignOf(n.parent, ctx) },
  };
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
    ...(c.id === ROOT ? rootOptions(ctx.figure) : groupOptions(c, ctx)),
  };
}

function cycleStrategy(c, ctx) {
  if (ctx.isSafe) return 'GREEDY';
  return c.hasBack ? 'MODEL_ORDER' : 'GREEDY_MODEL_ORDER';
}

function rootOptions(figure) {
  const pad = SPACE['14'];
  return { 'elk.padding': `[top=${pad},left=${pad},bottom=${pad},right=${pad}]`, ...(figure.aspect !== undefined ? wrapOptions(figure.aspect) : {}) };
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 그룹 이름 글자 수
// basis: estimate
function groupOptions(c, ctx) {
  return {
    'elk.padding': `[top=${SIZE.group.title + SPACE['6']},left=${SPACE['12']},bottom=${SPACE['12']},right=${SPACE['12']}]`,
    'elk.nodeSize.constraints': 'MINIMUM_SIZE',
    'elk.nodeSize.minimum': `(${groupTitleWidth(c.label)}, ${SIZE.group.title})`,
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
