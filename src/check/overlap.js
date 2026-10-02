// 2번과 6번: 글과 도형이 겹치지 않는다.
import { overlaps } from './geometry.js';

// cost: time O((l + t)² + (l + t)·s), heap O(1), stack O(1)
// vars: l = 선 라벨 수, t = 그룹 제목 수, s = 도형 수
// basis: estimate
// 2번: 선 라벨, 그룹 제목, 도형(이름과 카드를 품은 사각형)끼리 겹치지 않는다. 그룹 제목과 그 그룹 안 도형은 서로 비켜 배치되므로 함께 본다.
// 박자 상태는 멈춘 SVG 상태(모든 선, 가장 큰 카드 칸)의 부분이라 이 상태 하나만 본다.
export function checkLabels({ pills, titles, boxes, family }, problems) {
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
