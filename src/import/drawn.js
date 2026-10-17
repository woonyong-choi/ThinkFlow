// 손으로 그린 그림(draw.io, Excalidraw)을 옮길 때 함께 쓰는 판단. 두 형식 모두 좌표가 있는 도형과 그 도형에 묶인 화살표라서
// 흐름 방향과 그림 제목을 같은 기준으로 정한다. 좌표 자체는 옮기지 않는다(Torso가 다시 배치한다).

// cost: time O(e), heap O(1), stack O(1)
// vars: e = 선 수
// basis: estimate
/**
 * 선의 두 끝 도형 가운데 사이 가로·세로 거리 합을 비교해 흐름 방향을 고른다. 가로가 길거나 같으면 right, 아니면 down이다. 좌표를 아는 선이 없으면 down이다.
 * @param pairs [{ from: { x, y, w, h }, to: { x, y, w, h } }]
 */
export function flowDirection(pairs) {
  let across = 0;
  let along = 0;
  for (const { from, to } of pairs) {
    across += Math.abs(to.x + to.w / 2 - (from.x + from.w / 2));
    along += Math.abs(to.y + to.h / 2 - (from.y + from.h / 2));
  }
  return across + along > 0 && across >= along ? 'right' : 'down';
}

// cost: time O(t + s), heap O(1), stack O(1)
// vars: t = 자유 글 수, s = 도형 수
// basis: estimate
/**
 * 자유 글(도형이나 선에 묶이지 않은 글) 가운데 그림 제목으로 볼 것. 모든 도형보다 위에 있는 글 중 가장 위의 것이다. 없으면 undefined다.
 * @param texts [{ text, box: { x, y, w, h } }]
 * @param boxes 도형 사각형 목록
 */
export function titleText(texts, boxes) {
  const top = Math.min(...boxes.map((b) => b.y));
  return texts.filter((t) => t.text && t.box.y + t.box.h <= top).sort((a, b) => a.box.y - b.box.y)[0];
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 도형 글. 글 없는 도형은 셀 id 같은 뜻 없는 이름 대신 내용 없는 표시(MISSING_TEXT)로 쓰고 알린다. */
export function shapeLabel(label, line, model) {
  if (label) return label;
  change(model, line, `a shape without text is written as "${MISSING_TEXT}". Write its name`);
  return MISSING_TEXT;
}
