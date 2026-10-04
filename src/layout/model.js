// 그림 원본을 배치 모형으로 바꾼다. 그룹 나무, 도형, 선 조각을 만든다. 선 하나는 넘는 경계마다 조각 하나가 더해진다(docs/design/layout.md).
import { walkUp } from '../source/ancestry.js';
import { values } from '../tokens.js';
import { orderByFlow } from './order.js';
import { isInnerEdge } from './cell-ports.js';
import { addPort, endpoint } from './ports.js';

const SIZE = values.size;
/** 가장 바깥 그룹의 내부 이름. 원본 이름은 소문자, 숫자, `-`뿐이라 `_`가 든 이 이름과 부딪히지 않는다. */
export const ROOT = '__root';
/** 두 좌표가 같다고 보는 거리. 배치 읽기와 그림 검사가 같은 값을 쓴다. */
export const TOUCH = 0.5;
/** 같은 면의 선 끝이 이보다 가까워지면 붙어 보인다(그림 검사 5번). 배치도 이 값으로 선 끝을 비킨다. */
export const CROWD = values.space['2-5'];

// cost: time O(s + e·d), heap O(s + e·d), stack O(1)
// vars: s = 도형 수, e = 선 수, d = 그룹 깊이
// basis: estimate
/** 그룹 나무와 선 조각을 만든다. @returns { containers, nodes, edges, pieces } */
export function buildModel(figure, sizes) {
  const containers = buildContainers(figure);
  const nodes = new Map();
  for (const n of figure.nodes) {
    const parent = n.parent ?? ROOT;
    nodes.set(n.id, { ...n, size: sizes.get(n.id), ports: [], parent, direction: containers.get(parent).direction, isBracket: figure.isBracket === true });
    containers.get(parent).children.push(n.id);
  }
  addStateMarks(figure, nodes, containers);
  // 처음 점과 그 선은 모델 순서의 맨 앞에 둔다. 선언 순서를 따르는 배치에서 처음 점이 맨 앞(왼쪽, 위)에 오게 하기 위해서다.
  const marks = figure.markEdges ?? [];
  const edges = [...marks.filter((e) => e.isStart), ...figure.edges.map((e, i) => ({ ...e, index: i })), ...marks.filter((e) => !e.isStart)];
  const pieces = new Map();
  for (const edge of edges) pieces.set(edge.index, splitEdge(edge, nodes, containers));
  const model = { containers, nodes, edges, pieces, isSafe: figure.safeLayout === true };
  orderByFlow(model);
  return model;
}

// cost: time O(g·d), heap O(g), stack O(d)
// vars: g = 그룹 수, d = 그룹 깊이
// basis: estimate
function buildContainers(figure) {
  const containers = new Map([[ROOT, { id: ROOT, direction: figure.direction, parent: undefined, children: [], edges: [], ports: [] }]]);
  for (const g of figure.groups) containers.set(g.id, { ...decorOf(g), id: g.id, label: g.label, line: g.line, direction: undefined, own: g.direction, parent: g.parent ?? ROOT, children: [], edges: [], ports: [] });
  for (const g of figure.groups) containers.get(g.parent ?? ROOT).children.push(g.id);
  for (const c of containers.values()) c.direction = c.own ?? directionOf(c.parent, containers, figure);
  for (const c of containers.values()) c.parentDirection = c.parent ? containers.get(c.parent).direction : undefined;
  return containers;
}

// 그룹의 테두리 모양, 배지, 아이콘, 면과 테두리 색 선택 사항. 배치와 그리기가 그룹 이름으로 찾는 값이다.
export function decorOf({ border, badge, icon, iconData, fill, stroke }) {
  return { border, badge, icon, iconData, fill, stroke };
}

// cost: time O(d), heap O(d), stack O(1)
// vars: d = 그룹 깊이
// basis: estimate
function directionOf(parent, containers, figure) {
  const chain = walkUp(parent, (id) => containers.get(id).parent, containers.size);
  const owner = chain.find((id) => containers.get(id).own);
  return owner ? containers.get(owner).own : figure.direction;
}

// cost: time O(f), heap O(f), stack O(1)
// vars: f = 끝 상태 수
// basis: estimate
// 상태 그림의 처음 점과 끝 겹원을 도형과 선으로 더한다. 이 선은 이동 대상이 아니다.
function addStateMarks(figure, nodes, containers) {
  if (figure.kind !== 'state') return;
  figure.markEdges = [];
  // start가 없으면 처음 점과 그 선을 그리지 않는다.
  const marks = [...(figure.start ? [{ id: '__start', shape: 'start', from: '__start', to: figure.start.id }] : []), ...figure.finals.map((f, i) => ({ id: `__final${i}`, shape: 'final', from: f.id, to: `__final${i}` }))];
  marks.forEach((m, i) => {
    const size = { w: SIZE.node['state-dot'], h: SIZE.node['state-dot'], marginTop: 0, marginBottom: 0, labelLines: [], subLines: [] };
    nodes.set(m.id, { id: m.id, shape: m.shape, label: '', size, ports: [], parent: ROOT, direction: figure.direction });
    if (m.shape === 'start') containers.get(ROOT).children.unshift(m.id);
    else containers.get(ROOT).children.push(m.id);
    figure.markEdges.push({ from: m.from, to: m.to, label: undefined, quiet: false, dashed: false, index: `mark${i}`, isMark: true, isStart: m.shape === 'start' });
  });
}

// cost: time O(d), heap O(d), stack O(1)
// vars: d = 그룹 깊이
// basis: estimate
// 선을 두 끝의 가장 가까운 공통 그룹 안 조각과, 경계마다 연결점을 잇는 조각으로 나눈다.
function splitEdge(edge, nodes, containers) {
  // 같은 격자의 두 칸을 잇는 선은 격자 안 경로뿐이라 elkjs에 넘기지 않는다.
  if (isInnerEdge(edge)) return [];
  const up = chain(edge.from, nodes, containers);
  const down = chain(edge.to, nodes, containers);
  const common = up.find((c) => down.includes(c)) ?? ROOT;
  const pieces = [];
  const flowOf = (id) => ({ direction: containers.get(common).direction, isCrossing: nodes.get(id)?.parent !== common });
  let from = endpoint(edge.from, { way: 'out', edge, flow: flowOf(edge.from) }, nodes);
  for (const g of up.slice(0, up.indexOf(common))) {
    const port = addPort(containers.get(g), 'out', edge);
    pieces.push({ container: g, from, to: port });
    from = port;
  }
  const inner = [];
  let to = endpoint(edge.to, { way: 'in', edge, flow: flowOf(edge.to) }, nodes);
  for (const g of down.slice(0, down.indexOf(common))) {
    const port = addPort(containers.get(g), 'in', edge);
    inner.unshift({ container: g, from: port, to });
    to = port;
  }
  pieces.push({ container: common, from, to, hasLabel: true });
  return [...pieces, ...inner];
}

// cost: time O(d), heap O(d), stack O(1)
// vars: d = 그룹 깊이
// basis: estimate
// 도형이나 그룹의 바깥 그룹 목록. 가장 안쪽부터다.
function chain(id, nodes, containers) {
  const list = [];
  const first = nodes.get(id)?.parent ?? containers.get(id)?.parent;
  for (let p = first; p; p = containers.get(p)?.parent) list.push(p);
  return list;
}
