// 사각형 목록의 격자 색인. 글 상자 하나와 겹칠 수 있는 사각형만 골라, 후보와 프레임마다 모든 사각형을 재지 않게 한다.

// 가장 작은 층의 칸 한 변(px). 글 상자(폭 100~300, 높이 20~60)가 칸 몇 개에 걸치고, 칸마다 사각형이 몇 개 안 되는 크기
const CELL = 64;
// 층이 하나 올라갈 때 칸 한 변이 늘어나는 배수. 층 l의 칸은 CELL * LEVEL_SCALE ** l이다
const LEVEL_SCALE = 4;
// 층 수의 상한. 칸이 CELL * 4 ** 40 px이면 어떤 좌표도 칸 둘 안에 들어 층이 더 필요 없다
const LEVEL_MAX = 40;
// 칸 번호 쌍을 숫자 하나로 합치는 곱. 칸 번호가 이보다 작은 그림에서 겹치지 않는다(겹쳐도 엉뚱한 사각형이 더 섞일 뿐 빠지지 않는다)
const ROW_STRIDE = 100003;
// 칸 범위를 숫자 하나로 합칠 때 칸 번호에 더하는 값과 곱. 칸 번호가 이 범위(그림 한 변 32000px) 안이면 겹치지 않는다.
// 가로 범위와 세로 범위를 따로 합쳐 둘 다 작은 정수(Smi)로 두면 찾을 때마다 실수 키를 만들지 않는다. 범위를 벗어난 칸 범위는 답을 저장하지 않고 매번 모은다.
const SPAN_BASE = 512;
const SPAN_STRIDE = 1024;

// cost: time O(a), heap O(1), stack O(1)
// vars: a = 사각형 수
// basis: estimate
/**
 * rects로 gridOf가 만들 색인의 칸 항목 수. 만들기 전에 세어 예산을 검사하는 데 쓴다(할당 없음).
 * 사각형은 자기 크기에 맞는 층에 들어가 칸 네 개 이하에만 걸치므로 항목 수는 사각형 수의 네 배 이하이고, 사각형이 덮는 논리 면적과 무관하다.
 */
export function indexEntries(rects) {
  let total = 0;
  for (const rect of rects) {
    const span = spanOf(rect, levelOf(rect));
    total += span === undefined ? 0 : (span.x1 - span.x0 + 1) * (span.y1 - span.y0 + 1);
  }
  return total;
}

// cost: time O(a), heap O(a), stack O(1)
// vars: a = 사각형 수
// basis: estimate
/**
 * rects를 층별 격자에 넣은 색인. 사각형은 자기 한 변이 칸 한 변 이하인 가장 작은 층에 들어가 칸 네 개 이하에 걸리므로, 큰 사각형(격자 틀, 큰 합친 칸, 빈 영역)도 칸을 펼치지 않는다.
 * 크기를 알 수 없는 사각형(유한하지 않은 값)은 모든 질문에 후보로 낸다.
 * near(box)는 box와 닿을 수 있는 사각형의 번호를 오름차순으로 돌려준다(닿지 않는 것이 섞일 수 있다).
 * entries는 칸에 넣은 항목 수(indexEntries와 같다). some(box, test)는 그런 사각형 가운데 test가 참인 것이 있는지다(번호 순서는 보장하지 않는다).
 */
export function gridOf(rects) {
  const levels = [];
  const always = [];
  let entries = 0;
  rects.forEach((rect, i) => {
    const level = levelOf(rect);
    const span = spanOf(rect, level);
    if (span === undefined) {
      always.push(i);
      return;
    }
    levels[level] ??= new Map();
    const cells = levels[level];
    for (let cx = span.x0; cx <= span.x1; cx++) {
      for (let cy = span.y0; cy <= span.y1; cy++) {
        const key = cx * ROW_STRIDE + cy;
        if (cells.has(key)) cells.get(key).push(i);
        else cells.set(key, [i]);
        entries += 1;
      }
    }
  });
  const near = createLookup({ levels: levels.map((cells, level) => ({ cells, level })).filter((l) => l.cells), always }, rects.length);
  return {
    near,
    entries,
    // cost: time O(m), heap O(1), stack O(1)
    // vars: m = box 둘레 칸에 걸린 사각형 수
    // basis: estimate
    some: (box, test) => near(box).some(test),
  };
}

// 층 l의 칸 한 변(px)
const SIZES = Array.from({ length: LEVEL_MAX + 1 }, (_, level) => CELL * LEVEL_SCALE ** level);

// cost: time O(L + l·c + m log m) 처음, O(1) 같은 칸 범위를 다시 물었을 때, heap O(m), stack O(1)
// vars: L = 사각형이 있는 층 수, c = box가 한 층에서 걸치는 칸 수, m = 그 칸들의 사각형 수
// basis: estimate
// box와 닿을 수 있는 사각형 번호를 찾는 함수. 같은 칸 범위는 답이 같으므로 범위마다 한 번만 모은다(가장 작은 층의 칸 범위가 같으면 큰 층의 칸 범위도 같다). 후보 상자는 몇 안 되는 칸 범위에 몰린다. 돌려준 목록은 고치지 않는다.
function createLookup({ levels, always }, count) {
  const stamps = new Int32Array(count);
  const spans = new Map();
  let round = 0;
  // cost: time O(L·c + m log m), heap O(m), stack O(1)
  // vars: L = 사각형이 있는 층 수, c = box가 한 층에서 걸치는 칸 수, m = 그 칸들의 사각형 수
  // basis: estimate
  const gather = (box) => {
    round += 1;
    const found = [];
    for (const i of always) {
      stamps[i] = round;
      found.push(i);
    }
    for (const { cells, level } of levels) collect(cells, spanAt(box, level), { found, stamps, round });
    return found.length > 1 ? found.sort((a, b) => a - b) : found;
  };
  return (box) => {
    const span = spanAt(box, 0);
    const isKeyed = [span.x0, span.x1, span.y0, span.y1].every((n) => n > -SPAN_BASE && n < SPAN_STRIDE - SPAN_BASE);
    if (!isKeyed) return gather(box);
    const xKey = (span.x0 + SPAN_BASE) * SPAN_STRIDE + span.x1 + SPAN_BASE;
    const yKey = (span.y0 + SPAN_BASE) * SPAN_STRIDE + span.y1 + SPAN_BASE;
    let row = spans.get(xKey);
    if (row === undefined) spans.set(xKey, (row = new Map()));
    let found = row.get(yKey);
    if (found === undefined) {
      found = gather(box);
      row.set(yKey, found);
    }
    return found;
  };
}

// cost: time O(c + m), heap O(m), stack O(1)
// vars: c = span이 가리키는 칸 수, m = 그 칸들의 사각형 수
// basis: estimate
// span의 칸들에 걸린 사각형 번호 가운데 아직 모으지 않은 것을 found에 더한다. stamps는 이미 모은 번호를 표시하는 판이다.
function collect(cells, span, { found, stamps, round }) {
  for (let cx = span.x0; cx <= span.x1; cx++) {
    for (let cy = span.y0; cy <= span.y1; cy++) addUnstamped(found, cells.get(cx * ROW_STRIDE + cy) ?? [], { stamps, round });
  }
}

// cost: time O(m), heap O(m), stack O(1)
// vars: m = 칸에 걸린 사각형 수
// basis: estimate
// 칸에 걸린 사각형 번호 가운데 이번 회차(round)에 아직 표시하지 않은 것을 표시하고 found에 더한다.
function addUnstamped(found, indexes, { stamps, round }) {
  for (const i of indexes) {
    if (stamps[i] === round) continue;
    stamps[i] = round;
    found.push(i);
  }
}

// cost: time O(L), heap O(1), stack O(1)
// vars: L = 층 수의 상한(40)
// basis: estimate
// 사각형의 한 변(긴 쪽)이 칸 한 변 이하인 가장 작은 층. 크기가 유한하지 않으면 0이다.
function levelOf(rect) {
  const side = Math.max(rect.w, rect.h);
  let level = 0;
  while (level < LEVEL_MAX && SIZES[level] < side) level++;
  return level;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 사각형이 층 level에서 걸치는 칸 번호 범위. 위치나 크기가 유한하지 않으면 undefined
function spanOf(rect, level) {
  if (![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite)) return undefined;
  return spanAt(rect, level);
}

// 사각형이 층 level에서 걸치는 칸 번호 범위(유한한 값만)
function spanAt(rect, level) {
  const size = SIZES[level];
  return { x0: Math.floor(rect.x / size), x1: Math.floor((rect.x + rect.w) / size), y0: Math.floor(rect.y / size), y1: Math.floor((rect.y + rect.h) / size) };
}
