// 구조, 상태, 데이터 관계 그림을 elkjs로 배치한다. 그룹마다 따로 배치하고, 그룹 경계를 넘는 선은 경계마다 연결점을 거친다(docs/design/layout.md).
import ELK from 'elkjs/lib/elk.bundled.js';
import { groupTitleWidth, sizePill } from '../measure/sizes.js';
import { values } from '../tokens.js';

const SPACE = values.space;
const SIZE = values.size;
const SIDE_OUT = { right: 'EAST', down: 'SOUTH' };
const SIDE_IN = { right: 'WEST', down: 'NORTH' };
const ELK_DIRECTION = { right: 'RIGHT', down: 'DOWN' };
// 선 끝 쪽에서 이보다 작게 흔들리는 계단만 편다. 선 사이 간격(space.5)보다 작아 다른 선과 겹치지 않는다.
const SETTLE = SPACE['4'];

let engine;

// cost: time O(elk(s + e) + e·d), heap O(s + e·d), stack O(d)
// vars: s = 도형 수, e = 선 수, d = 그룹 깊이, elk = elkjs 층 배치 시간
// basis: estimate
/**
 * 그림을 배치한다.
 * @param sizes Map<도형 id, sizeNode 결과>
 * @returns { items, groups, edges, width, height }. items는 도형 사각형(배치 사각형과 바깥 여백), edges는 경로 점과 라벨 자리
 */
export async function layoutGraph(figure, sizes) {
  engine ??= new ELK();
  const model = buildModel(figure, sizes);
  const graph = toElk(model, figure);
  const laid = await engine.layout(graph);
  return readElk(laid, model, figure);
}

// cost: time O(s + e·d), heap O(s + e·d), stack O(1)
// vars: s = 도형 수, e = 선 수, d = 그룹 깊이
// basis: estimate
// 그룹 나무와 선 조각을 만든다. 선 하나는 넘는 경계마다 조각 하나가 더해진다.
function buildModel(figure, sizes) {
  const containers = new Map([['root', { id: 'root', direction: figure.direction, parent: undefined, children: [], edges: [], ports: [] }]]);
  for (const g of figure.groups) containers.set(g.id, { id: g.id, label: g.label, line: g.line, direction: undefined, own: g.direction, parent: g.parent ?? 'root', children: [], edges: [], ports: [] });
  for (const g of figure.groups) containers.get(g.parent ?? 'root').children.push(g.id);
  for (const c of containers.values()) c.direction = c.own ?? directionOf(c.parent, containers, figure);
  for (const c of containers.values()) c.parentDirection = c.parent ? containers.get(c.parent).direction : undefined;
  const nodes = new Map();
  for (const n of figure.nodes) {
    const parent = n.parent ?? 'root';
    nodes.set(n.id, { ...n, size: sizes.get(n.id), ports: [], parent, direction: containers.get(parent).direction });
    containers.get(n.parent ?? 'root').children.push(n.id);
  }
  addStateMarks(figure, nodes, containers);
  // 처음 점과 그 선은 모델 순서의 맨 앞에 둔다. 선언 순서를 따르는 배치에서 처음 점이 맨 앞(왼쪽, 위)에 오게 하기 위해서다.
  const marks = figure.markEdges ?? [];
  const edges = [...marks.filter((e) => e.isStart), ...figure.edges.map((e, i) => ({ ...e, index: i })), ...marks.filter((e) => !e.isStart)];
  const pieces = new Map();
  for (const edge of edges) pieces.set(edge.index, splitEdge(edge, nodes, containers));
  return { containers, nodes, edges, pieces };
}

// cost: time O(d), heap O(1), stack O(1)
// vars: d = 그룹 깊이
// basis: estimate
function directionOf(parent, containers, figure) {
  if (!parent) return figure.direction;
  const c = containers.get(parent);
  return c.own ?? directionOf(c.parent, containers, figure);
}

// cost: time O(f), heap O(f), stack O(1)
// vars: f = 끝 상태 수
// basis: estimate
// 상태 그림의 처음 점과 끝 겹원을 도형과 선으로 더한다. 이 선은 이동 대상이 아니다.
function addStateMarks(figure, nodes, containers) {
  if (figure.kind !== 'state' || !figure.start) return;
  figure.markEdges = [];
  const marks = [{ id: '__start', shape: 'start', from: '__start', to: figure.start.id }, ...figure.finals.map((f, i) => ({ id: `__final${i}`, shape: 'final', from: f.id, to: `__final${i}` }))];
  marks.forEach((m, i) => {
    const size = { w: SIZE['state-dot'], h: SIZE['state-dot'], marginTop: 0, marginBottom: 0, labelLines: [], subLines: [] };
    nodes.set(m.id, { id: m.id, shape: m.shape, label: '', size, ports: [], parent: 'root', direction: figure.direction });
    if (m.shape === 'start') containers.get('root').children.unshift(m.id);
    else containers.get('root').children.push(m.id);
    figure.markEdges.push({ from: m.from, to: m.to, label: undefined, quiet: false, dashed: false, index: `mark${i}`, isMark: true, isStart: m.shape === 'start' });
  });
}

// cost: time O(d), heap O(d), stack O(1)
// vars: d = 그룹 깊이
// basis: estimate
// 선을 두 끝의 가장 가까운 공통 그룹 안 조각과, 경계마다 연결점을 잇는 조각으로 나눈다.
function splitEdge(edge, nodes, containers) {
  const parentOf = (id) => nodes.get(id)?.parent ?? containers.get(id)?.parent;
  // cost: time O(d), heap O(d), stack O(1)
  // vars: d = 그룹 깊이
  // basis: estimate
  const chain = (id) => {
    const list = [];
    for (let p = parentOf(id); p; p = containers.get(p)?.parent) list.push(p);
    return list;
  };
  const up = chain(edge.from);
  const down = chain(edge.to);
  const common = up.find((c) => down.includes(c)) ?? 'root';
  const pieces = [];
  let from = endpoint(edge.from, 'out', edge, nodes);
  for (const g of up.slice(0, up.indexOf(common))) {
    const port = addPort(containers.get(g), 'out', edge);
    pieces.push({ container: g, from, to: port });
    from = port;
  }
  const inner = [];
  let to = endpoint(edge.to, 'in', edge, nodes);
  for (const g of down.slice(0, down.indexOf(common))) {
    const port = addPort(containers.get(g), 'in', edge);
    inner.unshift({ container: g, from: port, to });
    to = port;
  }
  pieces.push({ container: common, from, to, hasLabel: true });
  return [...pieces, ...inner];
}

// 그룹 경계 연결점. 나가는 선은 바깥 방향의 앞쪽 면, 들어오는 선은 뒤쪽 면이다.
function addPort(container, way, edge) {
  const outer = container.parentDirection ?? container.direction;
  const id = `${container.id}::${way}::${edge.index}`;
  container.ports.push({ id, side: way === 'out' ? SIDE_OUT[outer] : SIDE_IN[outer] });
  return id;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선 끝. 사람, 갈림길, 원통(세로 배치), 테이블 열은 연결점 제약을 둔 포트를 만든다.
function endpoint(id, way, edge, nodes) {
  const node = nodes.get(id);
  if (!node) return id;
  const direction = node.direction;
  const column = way === 'out' ? edge.fromColumn : edge.toColumn;
  if (node.shape === 'table' && column) {
    const row = node.columns.findIndex((c) => c.name === column);
    const y = node.size.rowH * (row + 1.5);
    return addNodePort(node, way, edge, way === 'out' ? 'EAST' : 'WEST', { x: way === 'out' ? node.size.w : 0, y });
  }
  // 가로 그림은 elkjs가 원래 옆면에 선을 붙인다. 세로 그림에서만 위아래 면을 막으려고 옆면 연결점을 둔다.
  if (node.shape === 'person' && direction === 'down') return addNodePort(node, way, edge, way === 'out' ? 'EAST' : 'WEST');
  if (node.shape === 'decision') return addNodePort(node, way, edge, way === 'out' ? 'EAST' : 'WEST', way === 'out' ? { x: node.size.w, y: node.size.h / 2 } : { x: 0, y: node.size.h / 2 });
  if (node.shape === 'store' && direction === 'down') return addNodePort(node, way, edge, way === 'out' ? 'SOUTH' : 'NORTH');
  return id;
}

function addNodePort(node, way, edge, side, position) {
  const id = `${node.id}::${way}::${edge.index}`;
  node.ports.push({ id, side, position });
  return id;
}

// cost: time O(s + e·d), heap O(s + e·d), stack O(d)
// vars: s = 도형 수, e = 선 수, d = 그룹 깊이
// basis: estimate
// 모형을 elkjs 그래프로 바꾼다. 간격은 토큰이다.
function toElk(model, figure) {
  const { containers, nodes, pieces } = model;
  const byContainer = new Map([...containers.keys()].map((k) => [k, []]));
  for (const [index, list] of pieces) {
    const edge = model.edges.find((e) => e.index === index);
    list.forEach((p, k) => {
      // 라벨을 선 위 가운데에 얹는다. 라벨마다 주는 elkjs 선택 사항이다.
      const labelOptions = { 'elk.edgeLabels.inline': 'true', 'elk.edgeLabels.placement': 'CENTER' };
      const labels = p.hasLabel && edge.label ? [{ id: `label::${index}`, text: edge.label, ...sizeOf(sizePill(edge.label)), layoutOptions: labelOptions }] : [];
      byContainer.get(p.container).push({ id: `${index}::${k}`, sources: [p.from], targets: [p.to], labels });
    });
  }
  const hasAspect = figure.aspect !== undefined && !figure.groups.length;
  // cost: time O(p), heap O(p), stack O(1)
  // vars: p = 도형의 연결점 수
  // basis: estimate
  const toNode = (id) => {
    if (containers.has(id)) return toContainer(containers.get(id));
    const n = nodes.get(id);
    const vertical = n.shape === 'store' && n.direction === 'down';
    const ports = n.ports.map((p) => ({ id: p.id, width: 0, height: 0, ...(p.position ?? {}), layoutOptions: { 'elk.port.side': p.side } }));
    if (vertical) spreadVerticalPorts(ports, n.size);
    const isFixed = n.shape === 'table' || n.shape === 'decision' || vertical;
    return {
      id,
      width: n.size.w,
      height: n.size.h,
      ports,
      layoutOptions: {
        'elk.portConstraints': ports.length ? (isFixed ? 'FIXED_POS' : 'FIXED_SIDE') : 'FREE',
        'elk.margins': `[top=${n.size.marginTop},left=${n.size.marginSide ?? 0},bottom=${n.size.marginBottom},right=${n.size.marginSide ?? 0}]`,
      },
    };
  };
  const toContainer = (c) => ({
    id: c.id,
    children: c.children.map(toNode),
    edges: byContainer.get(c.id),
    ports: c.ports.map((p) => ({ id: p.id, width: 0, height: 0, layoutOptions: { 'elk.port.side': p.side } })),
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': ELK_DIRECTION[c.direction],
      'elk.hierarchyHandling': 'SEPARATE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.randomSeed': '1',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      // 되도는 선이 있으면 선언 순서를 거스르는 선을 거꾸로 놓는다. 먼저 적은 도형이 앞(왼쪽, 위)에 오게 하기 위해서다.
      'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
      'elk.spacing.nodeNode': String(SPACE['16']),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(SPACE['30']),
      'elk.spacing.edgeEdge': String(SPACE['5']),
      'elk.spacing.edgeNode': String(SPACE['8']),
      'elk.spacing.edgeLabel': String(SPACE['2']),
      'elk.layered.spacing.edgeNodeBetweenLayers': String(SPACE['8']),
      'elk.edgeLabels.placement': 'CENTER',
      'elk.edgeLabels.inline': 'true',
      'elk.portConstraints': c.ports.length ? 'FIXED_SIDE' : 'FREE',
      ...(c.id === 'root'
        ? { 'elk.padding': `[top=${SPACE['14']},left=${SPACE['14']},bottom=${SPACE['14']},right=${SPACE['14']}]` }
        : {
            'elk.padding': `[top=${SIZE['group-title'] + SPACE['6']},left=${SPACE['12']},bottom=${SPACE['12']},right=${SPACE['12']}]`,
            'elk.nodeSize.constraints': 'MINIMUM_SIZE',
            'elk.nodeSize.minimum': `(${groupTitleWidth(c.label)}, ${SIZE['group-title']})`,
          }),
      ...(c.id === 'root' && hasAspect ? { 'elk.layered.wrapping.strategy': 'MULTI_EDGE', 'elk.aspectRatio': String(figure.aspect) } : {}),
    },
  });
  return toContainer(containers.get('root'));
}

function sizeOf({ w, h }) {
  return { width: w, height: h };
}

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 연결점 수
// basis: estimate
// 원통 위아래 면 연결점은 가운데 1/3 안에 고르게 두고, 뚜껑 윤곽(몸통 사각형 바깥 cap 거리)에 놓는다.
// 몸통 사각형 위 변은 뚜껑 가운데 줄이라, 거기서 끝나면 화살표가 윗면을 파고들기 때문이다.
function spreadVerticalPorts(ports, size) {
  for (const side of ['NORTH', 'SOUTH']) {
    const list = ports.filter((p) => p.layoutOptions['elk.port.side'] === side);
    list.forEach((p, i) => {
      p.x = size.w / 3 + ((i + 1) * (size.w / 3)) / (list.length + 1);
      p.y = side === 'NORTH' ? 0 : size.h;
      p.layoutOptions['elk.port.borderOffset'] = String(side === 'NORTH' ? size.marginTop : size.marginBottom);
    });
  }
}

// cost: time O(s + e·(d + p)), heap O(s + e·p), stack O(d)
// vars: s = 도형 수, e = 선 수, d = 그룹 깊이, p = 경로 점 수
// basis: estimate
// elkjs 결과를 그림 좌표로 바꾼다. 선 조각은 연결점에서 이어 붙인다.
function readElk(laid, model, figure) {
  const items = [];
  const groups = [];
  const offsets = new Map([['root', { x: 0, y: 0 }]]);
  const ports = new Map();
  // cost: time O(s + q), heap O(d), stack O(1)
  // vars: s = 도형과 그룹 수, q = 연결점 수, d = 그룹 깊이
  // basis: estimate
  const walk = (node, ox, oy) => {
    for (const p of node.ports ?? []) ports.set(p.id, { x: ox + node.x + p.x, y: oy + node.y + p.y });
    for (const child of node.children ?? []) {
      const x = ox + node.x + child.x;
      const y = oy + node.y + child.y;
      if (model.containers.has(child.id)) {
        const c = model.containers.get(child.id);
        groups.push({ id: child.id, label: c.label, line: c.line, parent: c.parent, x, y, w: child.width, h: child.height });
        offsets.set(child.id, { x, y });
      } else {
        const n = model.nodes.get(child.id);
        items.push({ ...n, ...n.size, x, y, w: child.width, h: child.height });
      }
      walk(child, ox + node.x, oy + node.y);
    }
  };
  laid.x = 0;
  laid.y = 0;
  walk(laid, 0, 0);
  const sections = new Map();
  const labels = new Map();
  // cost: time O(e + l), heap O(d), stack O(1)
  // vars: e = 선 조각 수, l = 라벨 수, d = 그룹 깊이
  // basis: estimate
  const collect = (node, ox, oy) => {
    for (const e of node.edges ?? []) {
      const base = offsets.get(e.container ?? node.id) ?? { x: ox, y: oy };
      const s = e.sections?.[0];
      if (s) sections.set(e.id, [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map((p) => ({ x: base.x + p.x, y: base.y + p.y })));
      for (const l of e.labels ?? []) labels.set(l.id, { x: base.x + l.x + l.width / 2, y: base.y + l.y + l.height / 2 });
    }
    for (const child of node.children ?? []) if (model.containers.has(child.id)) collect(child, ox + node.x + child.x, oy + node.y + child.y);
  };
  collect(laid, 0, 0);
  const rects = new Map(items.map((it) => [it.id, it]));
  const edges = model.edges.map((edge) => {
    const parts = model.pieces.get(edge.index).map((_, k) => sections.get(`${edge.index}::${k}`) ?? []);
    const joined = parts.flatMap((p, k) => (k === 0 ? p : p.slice(1)));
    const points = settleEnd(settleEnd(joined, freeRect(edge.from, rects)).reverse(), freeRect(edge.to, rects)).reverse();
    return { ...edge, points, labelAt: labels.get(`label::${edge.index}`) };
  });
  return { items, groups, edges, width: laid.width, height: laid.height };
}

// 연결점 제약이 없는 도형만 선 끝을 옮길 수 있다. 사람(세로), 갈림길, 원통(세로), 테이블 열은 연결점이 정해져 있다.
function freeRect(id, rects) {
  const it = rects.get(id);
  return it && !it.ports.length ? it : undefined;
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
/**
 * 선 끝에서 시작해 가로지르는 방향으로 SETTLE 미만만 흔들리는 구간을, 구간 끝의 높이로 편다.
 * 그룹 경계 연결점 높이는 안쪽 배치가, 선 끝은 바깥 배치가 정해 몇 px 어긋나는 계단이 남기 때문이다.
 * 옮긴 선 끝이 도형 면 밖으로 나가면 펴지 않는다. 선 끝 쪽 한 구간만 다룬다.
 */
function settleEnd(points, rect) {
  if (!rect || points.length < 3) return points;
  const [start, next] = points;
  const isHorizontal = Math.abs(start.y - next.y) < 0.5;
  const along = isHorizontal ? 'x' : 'y';
  const across = isHorizontal ? 'y' : 'x';
  let end = 1;
  while (end + 1 < points.length && Math.abs(points[end + 1][across] - start[across]) < SETTLE && Math.abs(points[end + 1][along] - points[end][along]) >= 0) {
    const isStep = Math.abs(points[end + 1][along] - points[end][along]) < 0.5;
    const isRun = Math.abs(points[end + 1][across] - points[end][across]) < 0.5;
    if (!isStep && !isRun) break;
    end++;
  }
  const target = points[end][across];
  const [low, high] = isHorizontal ? [rect.y, rect.y + rect.h] : [rect.x, rect.x + rect.w];
  if (end < 2 || target < low || target > high) return points;
  return [{ ...start, [across]: target }, ...points.slice(end)];
}
