// 칸 격자의 자리 계산: 칸 겹침과 빈 자리 구간. 둘 다 칸을 행 순서로 훑는 쓸기(sweep)라서 선언한 칸 수에만 비례하고, 격자의 행×열을 펼치지 않는다(docs/design/grid.md 빈 칸 표현).

// cost: time O(c log c), heap O(c), stack O(1)
// vars: c = 칸 수
// basis: estimate
// 쓸기 사건 목록. 칸마다 끝(row + rows)과 시작(row)이고, 같은 행에서는 끝이 시작보다 먼저다(끝 행은 칸 밖이다).
function sweepEvents(cells) {
  const events = cells.flatMap((cell, index) => [{ row: cell.row + cell.rows, isStart: false, cell, index }, { row: cell.row, isStart: true, cell, index }]);
  return events.sort((a, b) => a.row - b.row || Number(a.isStart) - Number(b.isStart) || a.index - b.index);
}

// cost: time O(log n), heap O(1), stack O(1)
// vars: n = 목록 길이
// basis: estimate
// col0으로 정렬된 구간 목록에서 시작이 col 이하인 마지막 구간의 자리. 없으면 -1이다.
function lastStartingAtOrBefore(list, col) {
  let [low, high] = [0, list.length - 1];
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (list[mid].col0 <= col) {
      found = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  return found;
}

// cost: time O(c log c), heap O(c), stack O(1)
// vars: c = 칸 수
// basis: estimate
/**
 * 서로 겹치는 칸 쌍을 찾는다. 쌍마다 선언 순서가 늦은 칸이 `cell`, 이른 칸이 `other`이고, 늦은 칸마다 한 쌍만 낸다. 겹친 칸은 쓸기에 넣지 않아 그 뒤 칸은 겹치지 않은 칸하고만 견준다.
 * 칸이 모두 격자 안이고 인덱스 합이 안전한 정수라고 본다.
 * @param cells { row, col, rows, cols }[]
 * @returns { cell, other }[]
 */
export function findOverlaps(cells) {
  const active = [];
  const skipped = new Set();
  const found = new Map();
  for (const { isStart, cell, index } of sweepEvents(cells)) {
    const at = lastStartingAtOrBefore(active, cell.col);
    if (!isStart) {
      if (!skipped.has(index)) active.splice(at, 1);
      continue;
    }
    const clash = [active[at], active[at + 1]].find((n) => n && n.cell.col < cell.col + cell.cols && cell.col < n.cell.col + n.cell.cols);
    if (!clash) {
      active.splice(at + 1, 0, { col0: cell.col, cell, index });
      continue;
    }
    skipped.add(index);
    const [late, early] = index > clash.index ? [index, clash.index] : [clash.index, index];
    if (!found.has(late)) found.set(late, { cell: cells[late], other: cells[early] });
  }
  return [...found.values()];
}

// 같은 칸 목록과 크기로 구한 빈 자리 구간을 다시 쓰도록 담아 둔다. 크기를 정하는 쪽과 예산을 세는 쪽이 같은 구간을 본다.
const memo = new WeakMap();

// cost: time O(c log c), heap O(c), stack O(1)
// vars: c = 칸 수
// basis: estimate
/**
 * 어느 칸에도 속하지 않은 단위 자리를 직사각형 구간으로 묶는다. 구간 수는 칸 수에 비례하고 격자의 행×열과 무관하다.
 * 행 순서로 훑으며 빈 열 구간을 이어 가고, 칸이 시작하거나 끝나 구간이 바뀔 때만 위 구간을 닫는다.
 * @param grid { rows, cols, cells }. 칸은 격자 안에서 겹치지 않는다고 본다
 * @returns { row0, row1, col0, col1 }[]. row1, col1은 끝 바깥 인덱스이고 row0, col0 순으로 정렬한다
 */
export function emptyRegions(grid) {
  if (memo.has(grid.cells)) return memo.get(grid.cells);
  const free = [{ col0: 0, col1: grid.cols, start: 0 }];
  const regions = [];
  const close = (interval, row) => {
    if (row > interval.start) regions.push({ row0: interval.start, row1: row, col0: interval.col0, col1: interval.col1 });
  };
  for (const event of sweepEvents(grid.cells)) {
    if (event.isStart) occupy(free, event, close);
    else release(free, event, close);
  }
  for (const interval of free) close(interval, grid.rows);
  regions.sort((a, b) => a.row0 - b.row0 || a.col0 - b.col0);
  memo.set(grid.cells, regions);
  return regions;
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 빈 열 구간 수(splice가 옮기는 칸 수)
// basis: estimate
// 칸이 시작하면 그 칸을 품은 빈 열 구간을 닫고 칸 양옆의 남은 부분을 새 구간으로 연다.
function occupy(free, { row, cell }, close) {
  const at = lastStartingAtOrBefore(free, cell.col);
  const inside = free[at];
  if (!inside || inside.col1 < cell.col + cell.cols) return;
  close(inside, row);
  const rest = [{ col0: inside.col0, col1: cell.col, start: row }, { col0: cell.col + cell.cols, col1: inside.col1, start: row }].filter((i) => i.col1 > i.col0);
  free.splice(at, 1, ...rest);
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 빈 열 구간 수(splice가 옮기는 칸 수)
// basis: estimate
// 칸이 끝나면 그 열 자리를 빈 구간으로 돌려주고 이웃한 빈 구간과 이어 새 구간 하나로 연다.
function release(free, { row, cell }, close) {
  const end = cell.col + cell.cols;
  const at = lastStartingAtOrBefore(free, cell.col);
  const hasLeft = at >= 0 && free[at].col1 === cell.col;
  const rightAt = at + 1;
  const hasRight = free[rightAt]?.col0 === end;
  const merged = { col0: hasLeft ? free[at].col0 : cell.col, col1: hasRight ? free[rightAt].col1 : end, start: row };
  if (hasLeft) close(free[at], row);
  if (hasRight) close(free[rightAt], row);
  free.splice(hasLeft ? at : rightAt, Number(hasLeft) + Number(hasRight), merged);
}
