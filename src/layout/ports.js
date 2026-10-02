// 도형과 그룹의 연결점. 선 끝이 어디에 닿는지, 몸통 도형의 연결점을 어디에 놓는지를 정한다(docs/design/layout.md 도형 크기와 연결점, 연결점 순서).
import { values } from '../tokens.js';
import { cellPort, circlePort } from './cell-ports.js';

const SIZE = values.size;
const SIDE_OUT = { right: 'EAST', down: 'SOUTH' };
const SIDE_IN = { right: 'WEST', down: 'NORTH' };

/** 사람과 원통. 바깥 여백까지 배치 사각형에 넣고, 연결점을 몸통 범위에 고정하는 도형이다. */
export function isBodyShape(n) {
  return n.shape === 'person' || n.shape === 'store';
}

// 그룹 경계 연결점. 나가는 선은 바깥 방향의 앞쪽 면, 들어오는 선은 뒤쪽 면이다.
export function addPort(container, way, edge) {
  const outer = container.parentDirection ?? container.direction;
  const id = `${container.id}::${way}::${edge.index}`;
  container.ports.push({ id, side: way === 'out' ? SIDE_OUT[outer] : SIDE_IN[outer] });
  return id;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 선 끝. 사람, 갈림길, 원통, 테이블 열은 연결점 제약을 둔 포트를 만들고, 그 아이디를 돌려준다. 나머지는 도형 아이디다.
 * @param end { way: 'out' | 'in', edge }
 */
export function endpoint(id, end, nodes) {
  const node = nodes.get(id);
  if (!node) return id;
  const spec = portSpec(node, end);
  return spec ? addNodePort(node, end, spec) : id;
}

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 테이블 열 수
// basis: estimate
// 도형이 선 끝에 요구하는 연결점 { side, position? }. 요구가 없으면 undefined다.
function portSpec(node, end) {
  const { way, edge } = end;
  const column = way === 'out' ? edge.fromColumn : edge.toColumn;
  if (node.shape === 'table' && column) return columnPort(node, way, column);
  if (node.shape === 'grid' && (way === 'out' ? edge.fromCell : edge.toCell)) return cellPort(node, end);
  if (node.shape === 'circle') return circlePort(node, way);
  // 사람과 원통은 바깥 여백(머리, 이름표, 뚜껑)까지 배치 사각형에 넣으므로, 선이 몸통에만 닿도록 모든 선에 연결점을 둔다.
  if (node.shape === 'person') return { side: way === 'out' ? 'EAST' : 'WEST' };
  if (node.shape === 'decision') return { side: way === 'out' ? 'EAST' : 'WEST', position: { x: way === 'out' ? node.size.w : 0, y: node.size.h / 2 } };
  if (node.shape === 'store') return { side: storeSide(node.direction, way) };
  return undefined;
}

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 테이블 열 수
// basis: estimate
// 테이블 열 줄 가운데 높이의 연결점. 묶음 배치(`isBracket`)는 들어오는 선도 오른쪽 면이다. 왼쪽 면이면 아래 도형이 오른쪽으로 계단처럼 밀려 캔버스에 들지 않고 줄 바꿈 선이 그림을 가로지른다(docs/design/layout.md 연결점).
function columnPort(node, way, column) {
  const row = node.columns.findIndex((c) => c.name === column);
  const isEast = way === 'out' || node.isBracket;
  return { side: isEast ? 'EAST' : 'WEST', position: { x: isEast ? node.size.w : 0, y: node.size.rowH * (row + 1.5) } };
}

function storeSide(direction, way) {
  if (direction === 'down') return way === 'out' ? 'SOUTH' : 'NORTH';
  return way === 'out' ? 'EAST' : 'WEST';
}

function addNodePort(node, end, { side, position, lead }) {
  const id = `${node.id}::${end.way}::${end.edge.index}`;
  node.ports.push({ id, way: end.way, side, position, lead });
  return id;
}

// 배치 사각형. 바깥 여백까지 넣어야 elkjs가 다른 도형과 선을 그 자리에서 비켜 놓는다.
export function outerBox(size) {
  const side = size.marginSide ?? 0;
  return { w: size.w + side * 2, h: size.h + size.marginTop + size.marginBottom };
}

// cost: time O(s·q log q), heap O(q), stack O(d)
// vars: s = 도형 수, q = 도형의 연결점 수, d = 그룹 깊이
// basis: estimate
// 첫 배치에서 elkjs가 고른 연결점 순서(면마다 위에서 아래, 왼쪽에서 오른쪽)를 도형에 적는다.
export function recordPortOrder(laid, model) {
  // cost: time O(c·q log q), heap O(q), stack O(d)
  // vars: c = 자식 수, q = 연결점 수, d = 그룹 깊이
  // basis: estimate
  const visit = (node) => {
    for (const child of node.children ?? []) {
      const n = model.nodes.get(child.id);
      if (n && isBodyShape(n)) {
        const at = new Map((child.ports ?? []).map((p) => [p.id, p.y * 10000 + p.x]));
        n.portOrder = new Map([...at.entries()].sort((a, b) => a[1] - b[1]).map(([id], i) => [id, i]));
      }
      visit(child);
    }
  };
  visit(laid);
}

// cost: time O(q log q), heap O(q), stack O(1)
// vars: q = 도형의 연결점 수
// basis: estimate
// 연결점을 몸통 범위에 첫 배치의 순서대로 고르게 놓는다. 위아래 면은 가운데 1/3(뚜껑 윤곽 위), 옆면은 몸통 높이이고, 사람의 옆면은 넓은 이름표 여백만큼 안쪽 몸통 변이다(음수 borderOffset).
// 몸통 사각형 위 변은 뚜껑 가운데 줄이라, 거기서 끝나면 화살표가 윗면을 파고들기 때문이다.
export function spreadBodyPorts(ports, size, order) {
  const side = size.marginSide ?? 0;
  const outer = outerBox(size);
  for (const face of ['NORTH', 'SOUTH', 'EAST', 'WEST']) {
    const list = ports.filter((p) => p.layoutOptions['elk.port.side'] === face).sort((a, b) => order.get(a.id) - order.get(b.id));
    list.forEach((p, i) => {
      const t = (i + 1) / (list.length + 1);
      if (face === 'NORTH' || face === 'SOUTH') Object.assign(p, { x: side + size.w / 3 + (t * size.w) / 3, y: face === 'NORTH' ? 0 : outer.h });
      else Object.assign(p, { x: face === 'WEST' ? 0 : outer.w, y: size.marginTop + t * size.h, layoutOptions: { ...p.layoutOptions, 'elk.port.borderOffset': String(-side) } });
    });
  }
}
