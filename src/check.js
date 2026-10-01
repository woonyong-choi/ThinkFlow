// 그림 검사. 배치가 끝난 장면에서 화면 오류를 찾아 원본 줄 번호와 함께 알린다(docs/design/figure-check.md).
import { CHIP_GAP, placeChip, sampleRoute, sizeChip } from './chip.js';
import { measure } from './measure/fonts.js';
import { CARD, STYLE, groupTitleWidth, sizePill } from './measure/sizes.js';
import { values } from './tokens.js';

const SPACE = values.space;
const INNER_X = SPACE['9'];
// 잰 글 폭의 반올림 차이를 넘기 위한 여유
const FIT_SLACK = 0.5;
const CROWD = values.space['2-5'];
const ASPECT_MAX = 3;
const MIN_READABLE = 9;

// cost: time O(e²·p² + e·s·p + s² + s·k·r·n + h·p), heap O(e + s), stack O(1)
// vars: e = 선 수, p = 경로 점 수, s = 도형 수, k = 도형당 카드 내용 수, r = 카드 줄 수, n = 줄 글자 수, h = 글 상자 있는 이동 수
// basis: estimate
/** 장면을 검사해 오류와 경고를 problems에 넣는다. 오류 메시지 앞에 검사 번호를 붙인다. */
export function checkFigure(figure, scene, timeline, problems) {
  checkFits(scene, timeline, problems);
  const boxes = scene.items.map((it) => ({ ...drawnBox(it), id: it.id, line: it.line, it }));
  const edges = scene.edges.filter((e) => !e.isMark && e.points.length > 1);
  const pills = edges.filter((e) => e.label && e.labelAt).map((e) => ({ ...pillBox(e), edge: e }));
  checkLabels(pills, boxes, problems);
  checkThrough(edges, boxes, figure, problems);
  checkEnds(edges, scene, figure, problems);
  checkCrowding(edges, problems);
  checkNodes(boxes, problems);
  checkChips(scene, timeline, problems);
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

// cost: time O(s·k·r·n + g + h·l), heap O(1), stack O(1)
// vars: s = 도형 수, k = 도형당 카드 내용 수, r = 카드 줄 수, n = 줄 글자 수, g = 그룹 수, h = 이동 수, l = 글 상자 줄 수
// basis: estimate
// 1번: 글이 자기 칸 안쪽에 들어간다. 크기는 잰 글로 정하므로 실패는 이 도구의 버그다.
function checkFits(scene, timeline, problems) {
  const fail = (line, what, where) => problems.error(line, `[check 1] internal: ${what} does not fit in ${where}. Please report this`);
  for (const it of scene.items) {
    const room = labelRoom(it);
    for (const l of it.labelLines ?? []) if (!fits(measure(l, STYLE.label.size, STYLE.label.face), room)) fail(it.line, `label "${l}"`, `node "${it.id}"`);
    for (const l of it.subLines ?? []) if (!fits(measure(l, STYLE.sub.size, STYLE.sub.face), room)) fail(it.line, `subtitle "${l}"`, `node "${it.id}"`);
    if (it.shape === 'table') for (const c of it.columns) if (!fits(columnWidth(c), it.w - INNER_X * 2)) fail(it.line, `column "${c.name}"`, `table "${it.id}"`);
    if (it.card) checkCardFits(it, fail);
  }
  for (const g of scene.groups) if (!fits(groupTitleWidth(g.label), g.w)) fail(g.line ?? 1, `group title "${g.label}"`, `group "${g.id}"`);
  for (const seg of timeline.segs) {
    for (const hop of seg.hops) {
      for (const l of hop.data ?? []) if (!fits(measure(l, STYLE.chip.size, STYLE.chip.face), values.size['chip-max'])) fail(hop.line ?? 1, `moving text "${l}"`, 'the text box');
    }
  }
}

// 이름과 부제가 쓸 수 있는 폭. 사람은 몸통 아래 바깥 여백까지, 마름모는 내접 사각형 비율로 넓힌 만큼이다.
function labelRoom(it) {
  if (it.shape === 'person') return it.w + (it.marginSide ?? 0) * 2;
  if (it.shape === 'decision') return it.w / 2 - INNER_X;
  return it.w - INNER_X * 2;
}

function columnWidth(c) {
  const tagW = c.pk || c.fk || c.unique ? measure('UNQ', STYLE.tag.size, STYLE.tag.face) + SPACE['3'] : 0;
  return measure(c.name, STYLE.cell.size, STYLE.cell.face) + tagW + measure(c.type, STYLE.type.size, STYLE.type.face) + SPACE['8'];
}

// cost: time O(k·r·n), heap O(1), stack O(1)
// vars: k = 카드 내용 수, r = 카드 줄 수, n = 줄 글자 수
// basis: estimate
// 카드 줄: 태그와 표시를 뺀 폭에 글 줄이, 카드 높이에 내용 전체가 들어간다.
function checkCardFits(it, fail) {
  const { card } = it;
  const inner = card.w - CARD.side * 2;
  for (const layout of card.layouts) {
    if (!fits(layout.height, card.h)) fail(it.line, 'card content', `the card of "${it.id}"`);
    for (const { row, isHeading, tagW, lines, graph } of layout.rows) {
      if (graph) {
        if (graph.nodes.some((n) => !fits(n.x + n.w, inner))) fail(row.line ?? it.line, 'mini graph', `the card of "${it.id}"`);
        continue;
      }
      const tag = row.tag?.toUpperCase();
      const markW = row.mark ? measure(row.mark, STYLE.mark.size, STYLE.mark.face) + SPACE['3'] : 0;
      if (isHeading && !fits(measure(tag, STYLE.tag.size, STYLE.tag.face) + SPACE['4'] + markW, inner)) fail(row.line ?? it.line, `tag "${row.tag}"`, `the card of "${it.id}"`);
      const style = row.isMono ? STYLE.mono : STYLE.row;
      lines.forEach((l, li) => {
        const indent = li === 0 && !isHeading ? tagW + markW : 0;
        if (!fits(measure(l, style.size, style.face) + indent, inner)) fail(row.line ?? it.line, `card text "${l}"`, `the card of "${it.id}"`);
      });
    }
  }
}

function fits(size, room) {
  return size <= room + FIT_SLACK;
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

// cost: time O(h·p), heap O(1), stack O(1)
// vars: h = 글 상자 있는 이동 수, p = 경로 점 수
// basis: estimate
// 7번: 이동 경로의 10% 지점마다 밀어 넣은 글 상자가 그림 안에 있다. 글 상자가 그림보다 넓거나 위아래 어디에도 들어가지 않으면 실패한다.
function checkChips(scene, timeline, problems) {
  const reported = new Set();
  for (const seg of timeline.segs) {
    for (const hop of seg.hops) {
      if (!hop.data || reported.has(hop)) continue;
      const chip = sizeChip(hop.data);
      const outside = sampleRoute(scene.edges[hop.edge].points).find(({ point }) => !inside(placeChip(point, chip, scene.width).box, scene));
      if (!outside) continue;
      reported.add(hop);
      const fix = chip.w + CHIP_GAP * 2 > scene.width ? 'Shorten the moving text' : 'Shorten the moving text or move the edge away from the figure edge';
      problems.error(hop.line ?? 1, `[check 7] moving text "${hop.data.join(' ')}" leaves the figure at ${Math.round(outside.fraction * 100)}% of edge ${scene.edges[hop.edge].from} -> ${scene.edges[hop.edge].to}. ${fix}`);
    }
  }
}

function inside(box, scene) {
  return box.x >= -FIT_SLACK && box.y >= -FIT_SLACK && box.x + box.w <= scene.width + FIT_SLACK && box.y + box.h <= scene.height + FIT_SLACK;
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
