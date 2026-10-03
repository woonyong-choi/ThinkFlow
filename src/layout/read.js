// elkjs 결과를 그림 좌표로 바꾼다. 그룹 경계 연결점에서 끊긴 선 조각은 이어 붙인다(docs/design/layout.md 선 그리기).
import { hasPill, isOnLinePill, sizePill } from '../measure/sizes.js';
import { values } from '../tokens.js';
import { LayoutError } from './error.js';
import { withLeads } from './cell-ports.js';
import { placeTitles } from './titles.js';
import { ROOT, decorOf } from './model.js';

const SETTLE = values.space['4'];
// 번호 알약을 얹을 구간 안 자리(구간 길이 비율). 가운데를 먼저 보고 양옆으로 간다.
const RUN_FRACTIONS = [0.5, 0.35, 0.65, 0.2, 0.8];
// 두 좌표가 같다고 보는 거리
const TOUCH = 0.5;
// 같은 면의 선 끝이 이보다 가까워지면 붙어 보인다(그림 검사 5번과 같은 값)
const CROWD = values.space['2-5'];
// 선 옆에 두는 라벨 알약과 선 사이 간격
const BESIDE_GAP = values.space['3'];

// cost: time O(s + e·(d + p)), heap O(s + e·p), stack O(d)
// vars: s = 도형 수, e = 선 수, d = 그룹 깊이, p = 경로 점 수
// basis: estimate
/** @returns { items, groups, edges, width, height }. items는 몸통 사각형, edges는 이어 붙인 경로 점과 라벨 자리 */
export function readElk(laid, model) {
  laid.x = 0;
  laid.y = 0;
  const { items, groups, offsets } = readNodes(laid, model);
  const { sections, labels } = readEdges(laid, model, offsets);
  const rects = new Map(items.map((it) => [it.id, it]));
  // 선 번호는 원본에 적은 선의 번호다. 시간표와 그리기가 같은 번호로 선을 찾으므로, 처음 점과 끝 겹원의 선(모델 순서에서는 앞뒤에 놓인다)은 맨 뒤에 둔다.
  const declared = [...model.edges.filter((edge) => !edge.isMark), ...model.edges.filter((edge) => edge.isMark)];
  const joined = declared.map((edge) => withLeads(model.pieces.get(edge.index).map((_, k) => routeOf(sections, edge, k)).flatMap((p, k) => (k === 0 ? p : p.slice(1))), edge, { model, rects }));
  const crowd = endsByNode(declared, joined);
  const edges = declared.map((edge, i) => {
    const near = (end) => (other) => other.at !== `${edge.index}:${end}`;
    const start = settleEnd(joined[i], freeRect(edge.from, rects), crowd.get(edge.from)?.filter(near('start')));
    const points = dropCollinear(settleEnd(start.reverse(), freeRect(edge.to, rects), crowd.get(edge.to)?.filter(near('end'))).reverse());
    return { ...edge, points, labelAt: labels.get(`label::${edge.index}`) ?? (model.isSafe ? undefined : numberOnlyLabel(edge, points, items)) ?? (edge.quiet && hasPill(edge) ? besideLabel(points, sizePill(edge.label, edge.no), laid.width) : undefined) };
  });
  placeTitles(groups, edges);
  return { items, groups, edges, width: laid.width, height: laid.height };
}

// cost: time O(p·f·s), heap O(p), stack O(1)
// vars: p = 경로 구간 수, f = 후보 자리 수, s = 도형 수
// basis: estimate
// 번호만 있는 알약(라벨 없음)은 배치에 자리를 요구하지 않고 완성한 선의 구간 위에 얹는다. 긴 구간부터 가운데, 양옆 순으로 도형과 겹치지 않는 첫 자리를 쓴다. 없으면 가장 긴 구간 가운데를 쓰고 그림 검사 2번이 알려, 안전 배치(알약이 자리를 받는다)로 다시 그린다.
// 선 사이 간격을 늘리지 않아 가로로 퍼진 구성도가 캔버스에 든다.
function numberOnlyLabel(edge, points, items) {
  if (!isOnLinePill(edge)) return undefined;
  const { w, h } = sizePill(undefined, edge.no);
  const runs = points.slice(1).map((p, i) => [points[i], p]).sort((r, s) => Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y) - Math.hypot(r[1].x - r[0].x, r[1].y - r[0].y));
  const spots = runs.flatMap(([a, b]) => RUN_FRACTIONS.map((f) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f })));
  return spots.find((c) => !items.some((it) => c.x + w / 2 > it.x && it.x + it.w > c.x - w / 2 && c.y + h / 2 > it.y && it.y + it.h > c.y - h / 2)) ?? spots[0];
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
// 선 옆에 두는 라벨 자리(알약 가운데). 가장 긴 곧은 구간이 세로면 그 가운데 옆, 가로면 그 위 가운데다.
// 세로선 옆은 그림 가장자리가 가까운 쪽에 둔다. 넓은 이동 글 상자가 알약을 비켜 반대쪽(넓은 쪽)에 들어갈 자리를 남기기 위해서다.
function besideLabel(points, { w, h }, width) {
  const runs = points.slice(1).map((p, i) => [points[i], p]);
  const [a, b] = runs.reduce((best, run) => (Math.hypot(run[1].x - run[0].x, run[1].y - run[0].y) > Math.hypot(best[1].x - best[0].x, best[1].y - best[0].y) ? run : best));
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const side = mid.x < width - mid.x ? -1 : 1;
  return Math.abs(a.x - b.x) < TOUCH ? { x: mid.x + side * (BESIDE_GAP + w / 2), y: mid.y } : { x: mid.x, y: mid.y - BESIDE_GAP - h / 2 };
}

// 선 조각 하나의 경로. elkjs가 경로를 주지 않은 조각이 있으면 선을 그릴 수 없으므로 실패다.
function routeOf(sections, edge, k) {
  const route = sections.get(`${edge.index}::${k}`);
  if (!route) throw new LayoutError(`the layout has no route for edge ${edge.from} -> ${edge.to}`, edge.line);
  return route;
}

// cost: time O(s), heap O(s + d), stack O(d)
// vars: s = 도형과 그룹 수, d = 그룹 깊이
// basis: estimate
// 도형 사각형과 그룹 사각형을 절대 좌표로 모은다. offsets는 그룹마다 안쪽 좌표의 원점이다.
function readNodes(laid, model) {
  const items = [];
  const groups = [];
  const offsets = new Map([[ROOT, { x: 0, y: 0 }]]);
  // cost: time O(s), heap O(d), stack O(d)
  // vars: s = 도형과 그룹 수, d = 그룹 깊이
  // basis: estimate
  const walk = (node, ox, oy) => {
    for (const child of node.children ?? []) {
      const x = ox + node.x + child.x;
      const y = oy + node.y + child.y;
      if (model.containers.has(child.id)) {
        const c = model.containers.get(child.id);
        groups.push({ ...decorOf(c), id: child.id, label: c.label, line: c.line, parent: c.parent, x, y, w: child.width, h: child.height });
        offsets.set(child.id, { x, y });
      } else {
        const n = model.nodes.get(child.id);
        // 배치 사각형에서 바깥 여백을 빼서 몸통 사각형으로 되돌린다.
        items.push({ ...n, ...n.size, x: x + (n.size.marginSide ?? 0), y: y + n.size.marginTop, w: n.size.w, h: n.size.h });
      }
      walk(child, ox + node.x, oy + node.y);
    }
  };
  walk(laid, 0, 0);
  return { items, groups, offsets };
}

// cost: time O(e + l), heap O(e·p + l), stack O(d)
// vars: e = 선 조각 수, l = 라벨 수, p = 경로 점 수, d = 그룹 깊이
// basis: estimate
// 선 조각 경로와 라벨 자리를 절대 좌표로 모은다. 라벨은 가운데 점이다.
function readEdges(laid, model, offsets) {
  const sections = new Map();
  const labels = new Map();
  // cost: time O(e + l), heap O(d), stack O(d)
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
  return { sections, labels };
}

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 선 수
// basis: estimate
// 도형마다 그 도형에 닿는 선 끝(고르기 전 elkjs 자리). 선 끝을 펼 때 같은 도형의 다른 선 끝과 붙지 않게 하는 데 쓴다.
function endsByNode(declared, joined) {
  const ends = new Map();
  const add = (id, point, at) => ends.set(id, [...(ends.get(id) ?? []), { point, at }]);
  declared.forEach((edge, i) => {
    add(edge.from, joined[i][0], `${edge.index}:start`);
    add(edge.to, joined[i].at(-1), `${edge.index}:end`);
  });
  return ends;
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
 * 옮긴 선 끝이 도형 면 밖으로 나가거나 같은 면의 다른 선 끝(others)에 CROWD보다 가까워지면 펴지 않는다. 선 끝 쪽 한 구간만 다룬다.
 */
function settleEnd(points, rect, others = []) {
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
  if (others.some((o) => Math.abs(o.point[along] - start[along]) < TOUCH && Math.abs(o.point[across] - target) < CROWD)) return points;
  return [{ ...start, [across]: target }, ...points.slice(end)];
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
/**
 * 같은 방향으로 곧게 이어지는 가운데 점을 뺀다. elkjs가 선 끝을 펴고 남긴 점이 한 선분을 둘로 쪼개면
 * 그림 검사 5번이 쪼개진 쪽을 같은 도형에서 나가는 첫 선분으로 보지 못해, 바르게 그린 선을 붙었다고 알린다.
 */
function dropCollinear(points) {
  const isStraight = (a, b, c) => (Math.abs(a.y - b.y) < TOUCH && Math.abs(b.y - c.y) < TOUCH && (b.x - a.x) * (c.x - b.x) > 0) || (Math.abs(a.x - b.x) < TOUCH && Math.abs(b.x - c.x) < TOUCH && (b.y - a.y) * (c.y - b.y) > 0);
  return points.filter((p, i) => i === 0 || i === points.length - 1 || !isStraight(points[i - 1], p, points[i + 1]));
}
