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
  const titles = scene.groups.filter((g) => g.label).map((g) => ({ ...titleBox(g), group: g }));
  const family = createFamily(scene);
  checkLabels({ pills, titles, boxes }, family, problems);
  checkThrough(edges, boxes, scene.groups, family, problems);
  checkEnds(edges, scene, figure, problems);
  checkCrowding(edges, family.hint, problems);
  checkNodes(boxes, scene.groups, family, problems);
  checkChips(scene, timeline, problems);
  if (['flow', 'state', 'data'].includes(figure.kind)) checkAspect(figure, scene, problems);
  checkReadable(figure, scene, problems);
}

// cost: time O(r·n), heap O(r), stack O(1)
// vars: r = 항목 수, n = 이름 글자 수
// basis: estimate
/** 차트 검사. 차트에는 선과 도형이 없어 1번(항목 이름, 열 이름, 점 이름이 자기 칸에 들어간다)만 해당한다. */
export function checkChartFigure(chart, problems) {
  const reported = new Set();
  for (const fit of chart.fits) {
    if (reported.has(fit.text) || fit.width <= fit.room + FIT_SLACK) continue;
    reported.add(fit.text);
    problems.error(fit.line, `[check 1] ${fit.what} "${fit.text}" is wider than its space (${Math.floor(fit.room)}px). Shorten the name`);
  }
}

// 사람과 원통은 배치 사각형 위아래 여백까지 그린다.
function drawnBox(it) {
  const side = it.marginSide ?? 0;
  return { x: it.x - side, y: it.y - (it.marginTop ?? 0), w: it.w + side * 2, h: it.h + (it.marginTop ?? 0) + (it.marginBottom ?? 0) };
}

// 그룹 제목 글이 차지하는 사각형. 그리는 자리는 draw/figure.js drawGroup이다.
function titleBox(g) {
  return { x: g.x + INNER_X, y: g.y, w: measure(g.label, STYLE.group.size, STYLE.group.face), h: values.size['group-title'] };
}

// cost: time O(s + g), heap O(s + g), stack O(1)
// vars: s = 도형 수, g = 그룹 수
// basis: estimate
// 도형과 그룹의 부모 관계. contains(a, b)는 그룹 a가 b(도형이나 그룹)를 품는지다.
function createFamily(scene) {
  const parents = new Map([...scene.items, ...scene.groups].map((it) => [it.id, it.parent]));
  // cost: time O(d), heap O(1), stack O(1)
  // vars: d = 그룹 깊이
  // basis: estimate
  const contains = (a, b) => {
    for (let p = parents.get(b); p !== undefined && p !== 'root'; p = parents.get(p)) if (p === a) return true;
    return false;
  };
  // 배치를 바꾸라는 안내. 그룹이 없으면 그룹 방향을 바꿀 수 없어 선언 순서를 권한다.
  const hint = scene.groups.length ? 'change a group direction' : 'change the declaration order';
  return { contains, isRelated: (a, b) => a === b || contains(a, b) || contains(b, a), hint };
}

function pillBox(e) {
  const { w, h } = sizePill(e.label);
  return { x: e.labelAt.x - w / 2, y: e.labelAt.y - h / 2, w, h };
}

function capitalize(text) {
  return text[0].toUpperCase() + text.slice(1);
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

// cost: time O((l + t)² + (l + t)·s), heap O(1), stack O(1)
// vars: l = 선 라벨 수, t = 그룹 제목 수, s = 도형 수
// basis: estimate
// 2번: 선 라벨, 그룹 제목, 도형(이름과 카드를 품은 사각형)끼리 겹치지 않는다. 그룹 제목과 그 그룹 안 도형은 서로 비켜 배치되므로 함께 본다.
// 박자 상태는 멈춘 SVG 상태(모든 선, 가장 큰 카드 칸)의 부분이라 이 상태 하나만 본다.
function checkLabels({ pills, titles, boxes }, family, problems) {
  pills.forEach((a, i) => {
    for (const b of pills.slice(i + 1)) {
      if (overlaps(a, b)) problems.error(a.edge.line, `[check 2] edge label "${a.edge.label}" overlaps edge label "${b.edge.label}" (line ${b.edge.line}). Shorten a label or ${family.hint}`);
    }
    for (const box of boxes) {
      if (overlaps(a, box)) problems.error(a.edge.line, `[check 2] edge label "${a.edge.label}" overlaps node "${box.id}" (line ${box.line}). Shorten the label`);
    }
    for (const t of titles) {
      if (overlaps(a, t)) problems.error(a.edge.line, `[check 2] edge label "${a.edge.label}" overlaps the title of group "${t.group.id}" (line ${t.group.line}). Shorten the label or change the direction of group "${t.group.id}"`);
    }
  });
  titles.forEach((a, i) => {
    for (const b of titles.slice(i + 1)) {
      if (overlaps(a, b)) problems.error(a.group.line, `[check 2] internal: the titles of groups "${a.group.id}" and "${b.group.id}" overlap. Please report this`);
    }
    for (const box of boxes) {
      if (overlaps(a, box)) problems.error(a.group.line, `[check 2] internal: the title of group "${a.group.id}" overlaps node "${box.id}". Please report this`);
    }
  });
}

// cost: time O(e·(s + g)·p·d), heap O(1), stack O(1)
// vars: e = 선 수, s = 도형 수, g = 그룹 수, p = 경로 점 수, d = 그룹 깊이
// basis: estimate
// 3번: 선이 끝 도형이 아닌 도형 안을 지나지 않는다. 그룹은 선 끝을 품은 그룹(선이 드나드는 그룹)만 빼고 본다.
function checkThrough(edges, boxes, groups, family, problems) {
  for (const e of edges) {
    const ends = [e.from.split('.')[0], e.to.split('.')[0]];
    const hits = (r) => e.points.slice(1).some((q, i) => segmentHits(e.points[i], q, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }));
    for (const box of boxes) {
      if (!ends.includes(box.id) && hits(box)) problems.error(e.line, `[check 3] edge ${e.from} -> ${e.to} passes through node "${box.id}" (line ${box.line}). ${capitalize(family.hint)}`);
    }
    for (const g of groups) {
      const isCrossed = ends.some((end) => end === g.id || family.contains(g.id, end));
      if (!isCrossed && hits(g)) problems.error(e.line, `[check 3] edge ${e.from} -> ${e.to} passes through group "${g.id}" (line ${g.line}). ${capitalize(family.hint)}`);
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
// 4번: 선 끝이 도형별 연결점 규칙 자리에 있다(docs/design/layout.md 연결점). 순서 그림은 메시지가 생명선에서 시작하고 끝나므로 보지 않는다. 실패는 이 도구의 버그다.
function checkEnds(edges, scene, figure, problems) {
  if (figure.kind === 'sequence') return;
  const rects = new Map([...scene.items, ...scene.groups].map((it) => [it.id, it]));
  for (const e of edges) {
    for (const [end, point, way] of [[e.from, e.points[0], 'out'], [e.to, e.points.at(-1), 'in']]) {
      const [id, column] = end.split('.');
      const it = rects.get(id);
      if (it && !isPortPlace(point, it, way, column)) problems.error(e.line, `[check 4] internal: edge ${e.from} -> ${e.to} does not touch "${id}" at its connection point. Please report this`);
    }
  }
}

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 테이블 열 수
// basis: estimate
// 도형별 연결점. 나가는 선은 오른쪽(세로 원통은 아래), 들어오는 선은 왼쪽(세로 원통은 위)이다. 그 밖의 도형과 그룹은 경계 어디나다.
function isPortPlace(p, it, way, column) {
  const near = (a, b) => Math.abs(a - b) <= 0.5;
  const side = way === 'out' ? it.x + it.w : it.x;
  if (it.shape === 'table' && column) return near(p.x, side) && near(p.y, it.y + it.rowH * (it.columns.findIndex((c) => c.name === column) + 1.5));
  if (it.shape === 'decision') return near(p.x, side) && near(p.y, it.y + it.h / 2);
  if (it.shape === 'person' && it.direction === 'down') return near(p.x, side) && onBorder(p, it);
  // 원통은 뚜껑 윤곽까지가 선이 닿는 면이라 그린 사각형으로 본다.
  if (it.shape === 'store') {
    const drawn = drawnBox(it);
    if (it.direction !== 'down') return onBorder(p, drawn);
    return near(p.y, way === 'out' ? drawn.y + drawn.h : drawn.y) && onBorder(p, drawn);
  }
  return onBorder(p, it);
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
// 5번: 다른 두 선의 나란한 구간이 CROWD보다 가깝게 겹치지 않는다. 같은 도형에서 함께 나가거나 함께 들어오는 두 선은 그 도형 쪽 끝 선분(경계에서 첫 꺾임까지)을 보지 않는다.
function checkCrowding(edges, hint, problems) {
  edges.forEach((a, i) => {
    for (const b of edges.slice(i + 1)) {
      const skip = sharedEndSegments(a, b);
      const isClose = segments(a).some(([p, q], ia) => segments(b).some(([s, t], ib) => !skip(ia, ib, a, b) && crowded(p, q, s, t)));
      if (isClose) problems.error(a.line, `[check 5] edges ${a.from} -> ${a.to} and ${b.from} -> ${b.to} (line ${b.line}) run too close. ${capitalize(hint)}`);
    }
  });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 두 선이 같은 시작 도형이면 첫 선분끼리, 같은 끝 도형이면 마지막 선분끼리 짝을 건너뛰는 판정 함수를 돌려준다. 서로 다른 도형 사이 선과 안쪽 선분은 그대로 본다.
function sharedEndSegments(a, b) {
  const base = (end) => end.split('.')[0];
  const sameFrom = base(a.from) === base(b.from);
  const sameTo = base(a.to) === base(b.to);
  return (ia, ib) => (sameFrom && ia === 0 && ib === 0) || (sameTo && ia === a.points.length - 2 && ib === b.points.length - 2);
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

// cost: time O((s + g)²·d), heap O(1), stack O(1)
// vars: s = 도형 수, g = 그룹 수, d = 그룹 깊이
// basis: estimate
// 6번: 도형과 그룹이 겹치지 않는다. 그룹과 그 안의 도형, 그룹과 그 안의 그룹은 뺀다. 실패는 이 도구의 버그다.
function checkNodes(boxes, groups, family, problems) {
  const all = [...boxes.map((b) => ({ ...b, kind: 'node' })), ...groups.map((g) => ({ ...g, kind: 'group' }))];
  all.forEach((a, i) => {
    for (const b of all.slice(i + 1)) {
      if (family.isRelated(a.id, b.id) || !overlaps(a, b)) continue;
      problems.error(a.line, `[check 6] internal: ${a.kind} "${a.id}" overlaps ${b.kind} "${b.id}". Please report this`);
    }
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
// 9번: 가로세로 비율. 문서 폭 안에 드는 그림은 보지 않는다. 그룹 그림은 비율을 줄이는 쪽의 그룹 방향을, 아니면 aspect를 권한다.
function checkAspect(figure, scene, problems) {
  const ratio = scene.width / scene.height;
  if (ratio <= ASPECT_MAX && ratio >= 1 / ASPECT_MAX) return;
  // 가로세로가 모두 문서 본문 폭 이하인 그림은 줄어들지 않고 그대로 보여 비율이 읽힘을 해치지 않는다.
  const fitsDocument = scene.width <= values.size['figure-max'] && scene.height <= values.size['figure-max'];
  if (fitsDocument) return;
  const isWide = ratio > ASPECT_MAX;
  const turn = isWide ? 'down' : 'right';
  const size = (g) => (isWide ? g.w : g.h);
  const own = new Map(figure.groups.map((g) => [g.id, g.direction]));
  // 방향을 바꿔 비율이 달라지는 그룹은 안에 둘 이상(도형이나 하위 그룹)이 있는 그룹뿐이다.
  const members = (id) => [...scene.items, ...scene.groups].filter((it) => (it.parent ?? 'root') === id).length;
  const group = [...scene.groups].filter((g) => own.get(g.id) !== turn && members(g.id) > 1).sort((a, b) => size(b) - size(a))[0];
  let fix;
  if (group) fix = `Set direction=${turn} on group "${group.id}"`;
  else if (scene.groups.length && figure.direction !== turn) fix = `Change the figure direction to ${turn}`;
  else if (scene.groups.length) fix = 'Split the figure into smaller figures';
  else if (figure.aspect !== undefined) fix = `Use a ${isWide ? 'smaller' : 'larger'} aspect than ${figure.aspect}`;
  else fix = 'Add "aspect 1.6"';
  problems.warn(figure.line, `[check 9] figure aspect ${ratio.toFixed(1)} is outside 1/3 to 3. ${fix}`);
}

// 10번: 문서 본문 폭으로 줄였을 때 가장 작은 글(태그 글자)이 MIN_READABLE px 이상이다.
function checkReadable(figure, scene, problems) {
  const scale = Math.min(1, values.size['figure-max'] / scene.width);
  const smallest = values.size.text['9'] * scale;
  if (smallest >= MIN_READABLE - 0.01) return;
  const fix = figure.kind === 'sequence' ? 'Use fewer participants or shorter messages' : scene.groups.length ? 'Make the figure narrower with group directions' : 'Make the figure narrower with aspect';
  problems.warn(figure.line, `[check 10] at document width the smallest text is ${smallest.toFixed(1)}px. ${fix}`);
}
