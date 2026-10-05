// 2번과 6번: 글과 도형이 겹치지 않는다. 차트는 산점도 점 이름끼리 겹치지 않는 것만 본다.
import { textBoxes } from '../draw/boxes.js';
import { labelOf, overlaps, segmentHits, THROUGH_INSET } from './geometry.js';

// cost: time O((l + t)² + (l + t)·s), heap O(1), stack O(1)
// vars: l = 선 라벨 수, t = 그룹 제목 수, s = 도형 수
// basis: estimate
// 2번: 선 라벨, 그룹 제목, 도형(이름과 카드를 품은 사각형)끼리 겹치지 않는다. 그룹 제목과 그 그룹 안 도형은 서로 비켜 배치되므로 함께 본다.
// 박자 상태는 멈춘 SVG 상태(모든 선, 가장 큰 카드 칸)의 부분이라 이 상태 하나만 본다.
export function checkLabels({ pills, titles, boxes, family, statuses, figure, scene }, problems) {
  checkStatusPills({ statuses, pills, boxes, figure, scene }, problems);
  pills.forEach((a, i) => {
    for (const b of pills.slice(i + 1)) {
      if (overlaps(a, b)) problems.error(a.edge.line, `[check 2] edge label "${labelOf(a.edge)}" overlaps edge label "${labelOf(b.edge)}" (line ${b.edge.line}). Shorten a label or ${family.hint}`);
    }
    for (const box of boxes) {
      if (overlaps(a, box)) problems.error(a.edge.line, `[check 2] edge label "${labelOf(a.edge)}" overlaps node "${box.id}" (line ${box.line}). Shorten the label`);
    }
    for (const t of titles) {
      if (overlaps(a, t)) problems.error(a.edge.line, `[check 2] edge label "${labelOf(a.edge)}" overlaps the title of group "${t.group.id}" (line ${t.group.line}). Shorten the label or change the direction of group "${t.group.id}"`);
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

// cost: time O((s + g)²·d), heap O(1), stack O(1)
// vars: s = 도형 수, g = 그룹 수, d = 그룹 깊이
// basis: estimate
// 6번: 도형과 그룹이 겹치지 않는다. 그룹과 그 안의 도형, 그룹과 그 안의 그룹은 뺀다. 실패는 이 도구의 버그다.
export function checkNodes({ boxes, scene, family }, problems) {
  const all = [...boxes.map((b) => ({ ...b, kind: 'node' })), ...scene.groups.map((g) => ({ ...g, kind: 'group' }))];
  all.forEach((a, i) => {
    for (const b of all.slice(i + 1)) {
      if (family.isRelated(a.id, b.id) || !overlaps(a, b)) continue;
      problems.error(a.line, `[check 6] internal: ${a.kind} "${a.id}" overlaps ${b.kind} "${b.id}". Please report this`);
    }
  });
}

// cost: time O(e·p·t), heap O(1), stack O(1)
// vars: e = 선 수, p = 경로 점 수, t = 그룹 제목 수
// basis: estimate
// 13번: 선이 그룹 제목 줄(아이콘, 제목, 배지, 개수와 반복 알약)을 지나지 않는다. 그 그룹 경계에서 끝나는 선도 제목 줄 안으로 들어오지 못한다.
export function checkTitleLines({ edges, titles }, problems) {
  for (const e of edges) {
    const segments = e.points.slice(1).map((q, i) => [e.points[i], q]);
    for (const t of titles) {
      const box = { x: t.x + THROUGH_INSET, y: t.y + THROUGH_INSET, w: t.w - THROUGH_INSET * 2, h: t.h - THROUGH_INSET * 2 };
      if (segments.some(([p, q]) => segmentHits(p, q, box))) problems.error(e.line, `[check 13] edge ${e.from} -> ${e.to} passes through the title of group "${t.group.id}" (line ${t.group.line}). Change a group direction or widen the group with a longer title`);
    }
  }
}

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 겹친 이름 쌍 수
// basis: estimate
// 2번(차트): 산점도 점 이름이 위아래와 좌우로 비켜 놓아도 다른 이름과 겹치면 오류다. 메시지는 나중에 적은 점의 줄에 붙는다.
export function checkChartLabels(chart, problems) {
  for (const { a, b, line } of chart.clashes) problems.error(line, `[check 2] point name "${b}" overlaps point name "${a}". Change a coordinate or rename a point so the names can be placed apart`);
}

// cost: time O(p·(s + l + n)), heap O(s + l), stack O(1)
// vars: p = 상태 알약 수, s = 도형 수, l = 선 라벨 수, n = 글자 사각형 수
// basis: estimate
// 2번(상태 알약): 단계별 도형 상태 알약이 도형 이름과 글자, 다른 도형, 선 라벨, 그룹 제목을 가리지 않는다. 알약은 자기 도형의 오른쪽 위 모서리에 걸쳐 있어 자기 도형의 사각형은 보지 않는다. 줄은 상태를 적은 단계 줄이다.
function checkStatusPills({ statuses, pills, boxes, figure, scene }, problems) {
  if (!statuses.length) return;
  const texts = textBoxes(scene);
  for (const s of statuses) {
    const line = figure.steps.find((step) => step.status?.some((entry) => entry.node === s.node)).line;
    const who = `status pill "${s.name}" on node "${s.node}"`;
    for (const text of texts) if (overlaps(s, text)) problems.error(line, `[check 2] ${who} covers the text "${text.name}". Shorten the name, or move the status to a shape whose corner is free`);
    for (const box of boxes) if (box.id !== s.node && overlaps(s, box)) problems.error(line, `[check 2] ${who} overlaps node "${box.id}" (line ${box.line}). Remove the status or change the declaration order so the shapes sit farther apart`);
    for (const pill of pills) if (overlaps(s, pill)) problems.error(line, `[check 2] ${who} overlaps edge label "${labelOf(pill.edge)}" (line ${pill.edge.line}). Shorten the label or remove the status`);
  }
}
