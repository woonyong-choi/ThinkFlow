// 도형과 그룹의 연결점. 선 끝이 어디에 닿는지, 몸통 도형의 연결점을 어디에 놓는지를 정한다(docs/design/layout.md 도형 크기와 연결점, 연결점 순서).
import { cellPort, circlePort } from './cell-ports.js';
import { values } from '@woonyong-choi/design-tokens/tokens.js';
import { columnAnchorY } from '../table.js';

/** 같은 열 줄의 같은 면에 연결점이 여럿이면 벌리는 간격의 상한 */
const FAN_GAP = values.spacing['2'];

const SIDE_OUT = { right: 'EAST', down: 'SOUTH' };
const SIDE_IN = { right: 'WEST', down: 'NORTH' };

/** 원통. 바깥 여백까지 배치 사각형에 넣고, 연결점을 몸통 범위에 고정하는 도형이다. */
export function isBodyShape(n) {
  return n.shape === 'store';
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
 * 그룹 경계를 넘는 선은 그 선이 놓이는 가장 가까운 공통 그룹의 흐름 방향(`flow`)으로 닿는다. 도형이 든 그룹의 방향이 달라도 선이 그룹을 돌아 들어가지 않고 그룹의 가까운 면으로 들어간다.
 * @param end { way: 'out' | 'in', edge, flow }. flow는 { direction, isCrossing }로, direction은 선이 놓이는 공통 그룹의 방향, isCrossing은 이 끝이 그 그룹 안쪽 그룹에 든 도형인지다
 */
export function endpoint(id, end, nodes) {
  const node = nodes.get(id);
  if (!node) return id;
  const spec = portSpec(node, { ...end, isTrailingField: trailingFieldEdge(end.edge, nodes) });
  return spec ? addNodePort(node, end, spec) : id;
}

// 한 줄 필드 띠의 같은 오른쪽 구간을 연결할 때 아래로 돌아 중간 조회 영역을 비운다.
function trailingFieldEdge(edge, nodes) {
  const from = nodes.get(edge.from), to = nodes.get(edge.to);
  if (from?.shape !== 'grid' || to?.shape !== 'grid' || from.rows !== 1 || to.rows !== 1 || from.direction !== 'right' || to.direction !== 'right' || from.id === to.id) return false;
  const a = from.cells.find(cell => cell.id === edge.fromCell);
  const b = to.cells.find(cell => cell.id === edge.toCell);
  return Boolean(a && b && a.col > 0 && b.col > 0 && a.col + a.cols === from.cols && b.col + b.cols === to.cols && a.col * to.cols === b.col * from.cols);
}

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 테이블 열 수
// basis: estimate
// 도형이 선 끝에 요구하는 연결점 { side, position? }. 요구가 없으면 undefined다. 위치가 없으면 면만 고정한다.
function portSpec(node, end) {
  const { way, edge, flow } = end;
  const columns = way === 'out' ? edge.fromColumns : edge.toColumns;
  if ((node.shape === 'table' || node.shape === 'api') && columns) return columnPort(node, way, columns, edge.from === edge.to);
  if (node.shape === 'grid' && (way === 'out' ? edge.fromCell : edge.toCell)) return cellPort(node, end);
  if (node.shape === 'circle') return circlePort(node, way);
  if (node.shape === 'decision') return decisionPort(node, way, edge.branch ?? 0);
  if (node.shape === 'store') return { side: storeSide(way === 'in' ? flow.direction : node.direction, way) };
  // 그룹 경계를 넘는 선은 도형 자신의 그룹 방향이 선이 놓이는 방향과 다를 때만 선이 놓이는 방향의 면에 닿는다(같으면 elkjs가 같은 면을 고른다).
  if (flow.isCrossing && node.direction !== flow.direction) return { side: way === 'out' ? SIDE_OUT[flow.direction] : SIDE_IN[flow.direction] };
  return undefined;
}

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 테이블 열 수
// basis: estimate
// 테이블 열 줄 가운데 높이의 연결점. 묶음 배치(`isBracket`)는 들어오는 선도 오른쪽 면이다. 왼쪽 면이면 아래 도형이 오른쪽으로 계단처럼 밀려 캔버스에 들지 않고 줄 바꿈 선이 그림을 가로지른다(docs/design/layout.md 연결점).
// 같은 테이블 안의 외래 키(자기 참조)도 들어오는 선이 오른쪽 면이다. 왼쪽 면이면 선이 카드 아래를 돌아 반대쪽으로 들어가 다른 테이블에서 오는 화살촉과 겹친다. 같은 면이면 오른쪽에 작은 고리로 그려진다.
function columnPort(node, way, columns, isSelf) {
  const isEast = way === 'out' || node.isBracket || isSelf;
  return { side: isEast ? 'EAST' : 'WEST', position: { x: isEast ? node.size.w : 0, y: columnAnchorY(node.size.tableRows, columns) } };
}

// cost: time O(q log q), heap O(q), stack O(1)
// vars: q = 도형의 연결점 수
// basis: estimate
/**
 * 테이블·API의 같은 열 줄, 같은 면에 연결점이 둘 이상이면(묶음 배치에서 들어오는 선과 나가는 선, 한 열에서 나가는 여러 선) 그 줄 높이 안에서 위아래로 고르게 벌린다.
 * 한 점에 모이면 들어오는 화살촉과 나가는 선이 겹쳐 어느 선이 어디로 가는지 읽히지 않는다. 간격은 줄 높이를 연결점 수 + 1로 나눈 값과 FAN_GAP 가운데 작은 쪽이다.
 */
export function fanColumnPorts(nodes) {
  for (const node of nodes.values()) {
    if (node.shape !== 'table' && node.shape !== 'api') continue;
    const rowH = node.size.tableRows?.[0]?.h ?? 0;
    const groups = new Map();
    for (const port of node.ports.filter((p) => p.position)) {
      const key = `${port.side}:${port.position.y}`;
      groups.set(key, [...(groups.get(key) ?? []), port]);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const gap = Math.min(FAN_GAP, rowH / (list.length + 1));
      list.forEach((port, k) => {
        port.position = { ...port.position, y: port.position.y + (k - (list.length - 1) / 2) * gap };
      });
    }
  }
}

// 마름모 꼭짓점 넷. 면 이름과 도형 왼쪽 위가 원점인 자리다.
const VERTEX = {
  NORTH: (size) => ({ x: size.w / 2, y: 0 }),
  SOUTH: (size) => ({ x: size.w / 2, y: size.h }),
  EAST: (size) => ({ x: size.w, y: size.h / 2 }),
  WEST: (size) => ({ x: 0, y: size.h / 2 }),
};
// 흐름 방향마다 갈래가 나가는 꼭짓점 순서. 첫 갈래는 흐름의 앞쪽 꼭짓점으로 곧게 이어지고, 둘째와 셋째 갈래는 옆 꼭짓점으로 갈라진다. 넷째부터는 첫 꼭짓점을 함께 쓴다.
const BRANCH_SIDES = { down: ['SOUTH', 'EAST', 'WEST'], right: ['EAST', 'SOUTH', 'NORTH'] };

// 갈림길 연결점. 들어오는 선은 흐름 뒤쪽 꼭짓점, 나가는 선은 갈래 번호가 고른 꼭짓점이다. 순서도처럼 갈래마다 다른 꼭짓점에서 나가 갈래 라벨이 겹치지 않고 갈래가 한눈에 갈린다.
function decisionPort(node, way, branch) {
  const sides = BRANCH_SIDES[node.direction];
  const side = way === 'in' ? SIDE_IN[node.direction] : sides[branch] ?? sides[0];
  return { side, position: VERTEX[side](node.size) };
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
