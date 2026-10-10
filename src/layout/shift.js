// 장면을 통째로 옮긴다. 판을 쌓거나 이동 글 상자가 들어갈 만큼 그림을 넓힐 때 모든 좌표가 같이 움직여야 한다.

// cost: time O(s + e·p), heap O(e·p), stack O(1)
// vars: s = 도형·그룹·메모 수, e = 선 수, p = 경로 점 수
// basis: estimate
/** 장면의 모든 좌표를 (dx, dy)만큼 옮긴다(제자리에서 바꾼다). 도형, 그룹, 메모, 활성, 소멸, 구획, 생명선, 선의 경로와 라벨이 대상이다. */
export function shiftScene(scene, dx, dy) {
  for (const box of [...scene.items, ...scene.groups, ...(scene.notes ?? []), ...(scene.activations ?? []), ...(scene.destructions ?? []), ...(scene.fragments ?? [])]) {
    box.x += dx;
    box.y += dy;
  }
  // 구획의 제목과 대안 경계는 자기 y를 가진다(가로 자리는 틀의 x를 쓴다).
  for (const frame of scene.fragments ?? []) {
    for (const row of [frame.header, ...frame.branches]) row.y += dy;
  }
  for (const line of scene.lifelines ?? []) {
    line.x += dx;
    line.y1 += dy;
    line.y2 += dy;
  }
  for (const e of scene.edges) {
    e.points = e.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    if (e.labelAt) e.labelAt = { x: e.labelAt.x + dx, y: e.labelAt.y + dy };
    for (const label of e.endpointLabels ?? []) {
      label.x += dx;
      label.y += dy;
    }
  }
}
