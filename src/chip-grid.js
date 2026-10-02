// 사각형 목록의 격자 색인. 글 상자 하나와 겹칠 수 있는 사각형만 골라, 후보와 프레임마다 모든 사각형을 재지 않게 한다.

// 격자 칸 한 변(px). 글 상자(폭 100~300, 높이 20~60)가 칸 몇 개에 걸치고, 칸마다 사각형이 몇 개 안 되는 크기
const CELL = 64;
// 칸 번호 쌍을 숫자 하나로 합치는 곱. 칸 번호가 이보다 작은 그림에서 겹치지 않는다
const ROW_STRIDE = 100003;
// 칸 범위를 숫자 하나로 합칠 때 칸 번호에 더하는 값과 곱. 칸 번호가 이 범위(그림 한 변 32000px) 안이면 겹치지 않는다.
// 가로 범위와 세로 범위를 따로 합쳐 둘 다 작은 정수(Smi)로 두면 찾을 때마다 실수 키를 만들지 않는다.
const SPAN_BASE = 512;
const SPAN_STRIDE = 1024;

// cost: time O(a·c), heap O(a·c), stack O(1)
// vars: a = 사각형 수, c = 사각형 하나가 걸치는 칸 수
// basis: estimate
/**
 * rects를 격자에 넣은 색인.
 * near(box)는 box와 닿을 수 있는 사각형의 번호를 오름차순으로 돌려준다(닿지 않는 것이 섞일 수 있다).
 * some(box, test)는 그런 사각형 가운데 test가 참인 것이 있는지다(번호 순서는 보장하지 않는다).
 */
export function gridOf(rects) {
  const cells = new Map();
  rects.forEach((rect, i) => {
    const span = spanOf(rect);
    for (let cx = span.x0; cx <= span.x1; cx++) {
      for (let cy = span.y0; cy <= span.y1; cy++) {
        const key = cx * ROW_STRIDE + cy;
        if (cells.has(key)) cells.get(key).push(i);
        else cells.set(key, [i]);
      }
    }
  });
  const near = createLookup(cells, rects.length);
  return {
    near,
    // cost: time O(m), heap O(1), stack O(1)
    // vars: m = box 둘레 칸에 걸린 사각형 수
    // basis: estimate
    some: (box, test) => near(box).some(test),
  };
}

// cost: time O(c + m log m) 처음, O(1) 같은 칸 범위를 다시 물었을 때, heap O(m), stack O(1)
// vars: c = box가 걸치는 칸 수, m = 그 칸들의 사각형 수
// basis: estimate
// box와 닿을 수 있는 사각형 번호를 찾는 함수. 같은 칸 범위는 답이 같으므로 범위마다 한 번만 모은다. 후보 상자는 몇 안 되는 칸 범위에 몰린다. 돌려준 목록은 고치지 않는다.
function createLookup(cells, count) {
  const stamps = new Int32Array(count);
  const spans = new Map();
  let round = 0;
  return (box) => {
    const [x0, x1] = [Math.floor(box.x / CELL), Math.floor((box.x + box.w) / CELL)];
    const [y0, y1] = [Math.floor(box.y / CELL), Math.floor((box.y + box.h) / CELL)];
    const xKey = (x0 + SPAN_BASE) * SPAN_STRIDE + x1 + SPAN_BASE;
    const yKey = (y0 + SPAN_BASE) * SPAN_STRIDE + y1 + SPAN_BASE;
    let row = spans.get(xKey);
    if (row === undefined) spans.set(xKey, (row = new Map()));
    let found = row.get(yKey);
    if (found === undefined) {
      round += 1;
      found = collect(cells, { x0, x1, y0, y1 }, { stamps, round });
      row.set(yKey, found);
    }
    return found;
  };
}

// cost: time O(c + m log m), heap O(m), stack O(1)
// vars: c = span이 가리키는 칸 수, m = 그 칸들의 사각형 수
// basis: estimate
// span의 칸들에 걸린 사각형 번호를 겹치지 않게 오름차순으로 모은다. stamps는 이미 모은 번호를 표시하는 판이다.
function collect(cells, span, { stamps, round }) {
  const found = [];
  for (let cx = span.x0; cx <= span.x1; cx++) {
    for (let cy = span.y0; cy <= span.y1; cy++) {
      for (const i of cells.get(cx * ROW_STRIDE + cy) ?? []) {
        if (stamps[i] === round) continue;
        stamps[i] = round;
        found.push(i);
      }
    }
  }
  return found.length > 1 ? found.sort((a, b) => a - b) : found;
}

// 사각형이 걸치는 칸 번호 범위
function spanOf(rect) {
  return { x0: Math.floor(rect.x / CELL), x1: Math.floor((rect.x + rect.w) / CELL), y0: Math.floor(rect.y / CELL), y1: Math.floor((rect.y + rect.h) / CELL) };
}
