// 칸 격자가 만들 양을 그리기 전에 센다. 예산 검사(budget.js)와 좌표 범위 검사가 쓴다(docs/design/grid.md 예산, 크기).
import { createMeter } from '../budget.js';
import { emptyRegions } from '../source/grid-space.js';
import { gridLines } from './sizes.js';

/** 칸 하나가 글 줄 말고 그리는 요소 수: item과 gap 모두 묶음 g와 사각형이다. 글은 줄마다 `<text>` 하나다. 행 통로가 있을 때 깔리는 판(`grid-tray`)은 격자마다 하나라 칸 수에 비례하지 않아 세지 않는다 */
const CELL_ELEMENTS = { item: 2, gap: 2 };
/** 틀 사각형 하나 */
const FRAME_ELEMENTS = 1;
/** 빈 자리가 있으면 무늬(pattern), 무늬 안 사각형, 경로 하나 */
const EMPTY_ELEMENTS = 3;
/** 빈 자리 구간 하나가 경로에서 쓰는 명령: `M`, `h`, `v`, `h`, `z` */
const REGION_COMMANDS = 5;
/** 좌표 한계(px). 소수 첫째 자리까지 정확한 좌표는 2^47 안이고, 여유를 두고 2^40이다 */
const EXTENT_MAX =2 ** 40;

// cost: time O(c·n² + c log c), heap O(c·l), stack O(1)
// vars: c = 칸 수, n = 칸 글자 수, l = 칸 글 줄 수
// basis: estimate
/**
 * 격자 하나가 그릴 양. 글 줄 수는 그릴 때와 같은 줄 나눔(칸 폭에 따른 자동 줄 나눔과 줄바꿈)의 실제 결과이고, 요소는 제목 줄과 칸 글 줄마다 하나씩 센다. 실제로 그리는 요소 수와 같다.
 * @param grid 그림 모형의 격자 { rows, cols, cells, label }
 * @returns { elements, pathCommands }
 */
function gridCost(grid, valueTexts, rowsByValue) {
  const regions = emptyRegions(grid).length;
  const { titleLines, lined, ruler } = gridLines(grid, valueTexts);
  const cells = lined.reduce((sum, cell) => {
    const textElements = cell.valueId ? cellValueElements(cell, rowsByValue?.get(cell.valueId)) : cell.lines.length;
    return sum + CELL_ELEMENTS[cell.kind] + textElements + cell.detailLines.length + (cell.keyLines?.length ?? 0) + (cell.isOpen ? 1 : 0);
  }, 0);
  return { elements: FRAME_ELEMENTS + titleLines.length + cells + (regions ? EMPTY_ELEMENTS : 0) + rulerElements(grid, ruler), pathCommands: regions * REGION_COMMANDS };
}

// cost: time O(g), heap O(1), stack O(1)
// vars: g = 구간 수
// basis: estimate
// 눈금자 격자가 더 그리는 요소: 눈금 숫자(step 열마다 하나), 단위 이름 하나, 바깥 틀 하나, 구간마다 괄호 하나와 이름 줄. 열 수는 RULER_COLS_MAX 이하라 눈금 수도 그 이하다.
function rulerElements(grid, ruler) {
  if (!ruler) return 0;
  return Math.ceil(grid.cols / ruler.step) + 1 + 1 + ruler.regionLines.reduce((sum, lines) => sum + 1 + lines.length, 0);
}

// cost: time O(v + p), heap O(v + p), stack O(1)
// vars: v = 칸의 값 상태 수, p = 장면별 값 기간 수의 합
// basis: estimate
// 장면별 값 묶음·갱신 면, 그 장면에서 쓰는 상태별 묶음·글 줄을 센다. 같은 글도 장면이 다르면 별도 요소다.
function cellValueElements(cell, rows) {
  if (!rows) return 2 + cell.variants.reduce((count, variant) => count + 1 + variant.lines.length, 0);
  const lineCounts = new Map(cell.variants.map(variant => [variant.text, variant.lines.length]));
  let count = rows.length * 2;
  for (const row of rows) {
    for (const text of new Set(row.periods.map(([, , text]) => text))) count += 1 + lineCounts.get(text);
  }
  return count;
}

// cost: time O(g), heap O(1), stack O(1)
// vars: g = 도형 수
// basis: estimate
/**
 * 격자 크기가 좌표 한계를 넘는 격자마다 오류를 낸다. 한계를 넘으면 소수 자리를 정확히 적을 수 없다.
 * @param sizes 도형 이름 → sizeNode 결과
 */
export function checkGridExtent(figure, sizes, problems) {
  for (const node of figure.nodes.filter((n) => n.shape === 'grid')) {
    const { w, h } = sizes.get(node.id);
    if (Number.isFinite(w) && Number.isFinite(h) && w <= EXTENT_MAX && h <= EXTENT_MAX) continue;
    problems.error(node.line, `grid "${node.id}" (rows=${node.rows}, cols=${node.cols}) would be about ${Math.round(w)} by ${Math.round(h)} px, beyond the ${EXTENT_MAX} px (2^40) coordinates this tool can write exactly. Lower rows= or cols=`);
  }
}

// cost: time O(c log c), heap O(c), stack O(1)
// vars: c = 모든 격자의 칸 수 합
// basis: estimate
// 격자가 그릴 양(요소 수, 경로 명령 수)을 크기를 정하기 전에 세어, 그림 전체 합계가 예산을 넘으면 FigureError를 던진다. limits는 resolveBudget이 돌려준 한도 표다. 칸 모형은 이미 읽은 선언이라 이 검사가 새로 큰 할당을 하지 않는다.
export function checkGridBudget(figure, limits, valueTexts, timeline) {
  const meter = createMeter(limits);
  const rowsByValue = timeline ? new Map() : undefined;
  for (const row of timeline?.values ?? []) {
    if (!rowsByValue.has(row.id)) rowsByValue.set(row.id, []);
    rowsByValue.get(row.id).push(row);
  }
  for (const node of figure.nodes.filter((n) => n.shape === 'grid')) {
    const cost = gridCost(node, valueTexts, rowsByValue);
    const where = { line: node.line, what: `grid "${node.id}"` };
    meter.add('grid-elements', cost.elements, where);
    meter.add('grid-path-commands', cost.pathCommands, where);
  }
  meter.verify();
}
