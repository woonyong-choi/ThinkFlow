// 그림 검사. 배치가 끝난 장면에서 화면 오류를 찾아 원본 줄 번호와 함께 알린다(docs/design/figure-check.md).
import { sizePill } from './measure/sizes.js';
import { values } from './tokens.js';

const CROWD = values.space['2-5'];
const ASPECT_MAX = 3;
const MIN_READABLE = 9;

// cost: time O(e²·p² + e·s·p + s²), heap O(e + s), stack O(1)
// vars: e = 선 수, p = 경로 점 수, s = 도형 수
// basis: estimate
/** 장면을 검사해 오류와 경고를 problems에 넣는다. 오류 메시지 앞에 검사 번호를 붙인다. */
export function checkFigure(figure, scene, timeline, problems) {
  const boxes = scene.items.map((it) => ({ ...drawnBox(it), id: it.id, line: it.line, it }));
  const edges = scene.edges.filter((e) => !e.isMark && e.points.length > 1);
  const pills = edges.filter((e) => e.label && e.labelAt).map((e) => ({ ...pillBox(e), edge: e }));
  checkLabels(pills, boxes, problems);
  checkThrough(edges, boxes, figure, problems);
  checkEnds(edges, scene, figure, problems);
  checkCrowding(edges, problems);
  checkNodes(boxes, problems);
  if (['flow', 'state', 'data'].includes(figure.kind)) checkAspect(figure, scene, problems);
  checkReadable(figure, scene, problems);
}

// 사람과 원통은 배치 사각형 위아래 여백까지 그린다.
function drawnBox(it) {
  const side = it.marginSide ?? 0;
  return { x: it.x - side, y: it.y - (it.marginTop ?? 0), w: it.w + side * 2, h: it.h + (it.marginTop ?? 0) + (it.marginBottom ?? 0) };
}

function pillBox(e) {
  const { w, h } = sizePill(e.label);
  return { x: e.labelAt.x - w / 2, y: e.labelAt.y - h / 2, w, h };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// cost: time O(l² + l·s), heap O(1), stack O(1)
// vars: l = 라벨 수, s = 도형 수
// basis: estimate
// 2번: 선 라벨끼리, 선 라벨과 도형이 겹치지 않는다.
function checkLabels(pills, boxes, problems) {
  pills.forEach((a, i) => {
    for (const b of pills.slice(i + 1)) {
      if (overlaps(a, b)) problems.error(a.edge.line, `[check 2] edge label "${a.edge.label}" overlaps edge label "${b.edge.label}" (line ${b.edge.line}). Shorten a label or change a group direction`);
    }
    for (const box of boxes) {
      if (overlaps(a, box)) problems.error(a.edge.line, `[check 2] edge label "${a.edge.label}" overlaps node "${box.id}" (line ${box.line}). Shorten the label`);
    }
  });
}

// cost: time O(e·s·p), heap O(1), stack O(1)
// vars: e = 선 수, s = 도형 수, p = 경로 점 수
// basis: estimate
// 3번: 선이 끝 도형이 아닌 도형 안을 지나지 않는다.
function checkThrough(edges, boxes, figure, problems) {
  for (const e of edges) {
    const ends = new Set([e.from.split('.')[0], e.to.split('.')[0]]);
    for (const box of boxes) {
      if (ends.has(box.id)) continue;
      const inner = { x: box.x + 1, y: box.y + 1, w: box.w - 2, h: box.h - 2 };
      if (e.points.slice(1).some((q, i) => segmentHits(e.points[i], q, inner))) {
        problems.error(e.line, `[check 3] edge ${e.from} -> ${e.to} passes through node "${box.id}" (line ${box.line}). Change a group direction or the declaration order`);
      }
    }
  }
}

function segmentHits(p, q, r) {
  const [x1, x2] = [Math.min(p.x, q.x), Math.max(p.x, q.x)];
  const [y1, y2] = [Math.min(p.y, q.y), Math.max(p.y, q.y)];
  return x1 < r.x + r.w && r.x < x2 + 0.01 && y1 < r.y + r.h && r.y < y2 + 0.01;
}

// cost: time O(e), heap O(1), stack O(1)
// vars: e = 선 수
// basis: estimate
// 4번: 선 끝이 끝 도형 경계 위에 있다. 순서 그림은 생명선 위다. 실패는 이 도구의 버그다.
function checkEnds(edges, scene, figure, problems) {
  if (figure.kind === 'sequence') return;
  // 원통은 뚜껑 윤곽까지가 선이 닿는 면이라 그린 사각형으로 본다.
  const rects = new Map([...scene.items.map((it) => (it.shape === 'store' ? { ...it, ...drawnBox(it) } : it)), ...scene.groups].map((it) => [it.id, it]));
  for (const e of edges) {
    for (const [id, point] of [[e.from, e.points[0]], [e.to, e.points.at(-1)]]) {
      const r = rects.get(id.split('.')[0]);
      if (r && !onBorder(point, r)) problems.error(e.line, `[check 4] internal: edge ${e.from} -> ${e.to} does not touch "${r.id}". Please report this`);
    }
  }
}

function onBorder(p, r) {
  const inX = r.x - 0.5 <= p.x && p.x <= r.x + r.w + 0.5;
  const inY = r.y - 0.5 <= p.y && p.y <= r.y + r.h + 0.5;
  const onX = Math.abs(p.x - r.x) <= 0.5 || Math.abs(p.x - (r.x + r.w)) <= 0.5;
  const onY = Math.abs(p.y - r.y) <= 0.5 || Math.abs(p.y - (r.y + r.h)) <= 0.5;
  return (onX && inY) || (onY && inX);
}

// cost: time O(e²·p²), heap O(1), stack O(1)
// vars: e = 선 수, p = 경로 점 수
// basis: estimate
// 5번: 다른 두 선의 나란한 구간이 CROWD보다 가깝게 겹치지 않는다.
function checkCrowding(edges, problems) {
  edges.forEach((a, i) => {
    for (const b of edges.slice(i + 1)) {
      const isClose = segments(a).some(([p, q]) => segments(b).some(([s, t]) => crowded(p, q, s, t)));
      if (isClose) problems.error(a.line, `[check 5] edges ${a.from} -> ${a.to} and ${b.from} -> ${b.to} (line ${b.line}) run too close. Change a group direction`);
    }
  });
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
function segments(e) {
  return e.points.slice(1).map((q, i) => [e.points[i], q]);
}

function crowded(a, b, c, d) {
  const along = Math.abs(a.y - b.y) < 0.5 ? 'x' : Math.abs(a.x - b.x) < 0.5 ? 'y' : undefined;
  const other = Math.abs(c.y - d.y) < 0.5 ? 'x' : Math.abs(c.x - d.x) < 0.5 ? 'y' : undefined;
  if (!along || along !== other) return false;
  const across = along === 'x' ? 'y' : 'x';
  const overlap = Math.min(Math.max(a[along], b[along]), Math.max(c[along], d[along])) - Math.max(Math.min(a[along], b[along]), Math.min(c[along], d[along]));
  const gap = Math.abs(a[across] - c[across]);
  return overlap > CROWD && gap > 0.5 && gap < CROWD;
}

// cost: time O(s²), heap O(1), stack O(1)
// vars: s = 도형 수
// basis: estimate
// 6번: 도형끼리 겹치지 않는다. 실패는 이 도구의 버그다.
function checkNodes(boxes, problems) {
  boxes.forEach((a, i) => {
    for (const b of boxes.slice(i + 1)) if (overlaps(a, b)) problems.error(a.line, `[check 6] internal: node "${a.id}" overlaps node "${b.id}". Please report this`);
  });
}

// cost: time O(g log g), heap O(g), stack O(1)
// vars: g = 그룹 수
// basis: estimate
// 9번: 가로세로 비율. 그룹 그림은 그룹 방향을, 아니면 aspect를 권한다.
function checkAspect(figure, scene, problems) {
  const ratio = scene.width / scene.height;
  if (ratio <= ASPECT_MAX && ratio >= 1 / ASPECT_MAX) return;
  const widest = [...scene.groups].sort((a, b) => b.w - a.w)[0];
  const fix = widest ? `Set direction=down on group "${widest.id}"` : figure.aspect !== undefined ? `Use a smaller aspect than ${figure.aspect}` : 'Add "aspect 1.6"';
  problems.warn(figure.line, `[check 9] figure aspect ${ratio.toFixed(1)} is outside 1/3 to 3. ${fix}`);
}

// 10번: 문서 본문 폭으로 줄였을 때 가장 작은 글(태그 글자)이 MIN_READABLE px 이상이다.
function checkReadable(figure, scene, problems) {
  const scale = Math.min(1, values.size['figure-max'] / scene.width);
  const smallest = values.size.text['9'] * scale;
  if (smallest < MIN_READABLE - 0.01) problems.warn(figure.line, `[check 10] at document width the smallest text is ${smallest.toFixed(1)}px. Make the figure narrower with group directions or aspect`);
}
