// 칸 격자(`grid id "글" rows=N cols=N {` ... `}`)를 읽는다. 칸은 `item`과 `gap` 줄이고, 칸 자리는 격자 안의 논리 인덱스다(docs/design/figure-kinds.md 칸 격자).
import { checkId, parentFor, rejectName } from './names.js';
import { readOptions } from './options.js';
import { findOverlaps } from './grid-space.js';
import { ID_PATTERN } from './words.js';
import { statementsIn } from './grammar.js';
import { didYouMean } from './problems.js';

/** 눈금자(`unit=`)를 단 격자의 열 수 상한. 한 행에 64비트(8바이트)까지 눈금 숫자를 칸마다 읽을 수 있다. */
export const RULER_COLS_MAX = 64;

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** `grid id "글" [rows=N] [cols=N] {` 한 줄. 이어지는 줄은 격자가 닫힐 때까지 readGridLine이 읽는다. */
export function readGrid({ tokens, line }, ctx) {
  const [, id, label, ...rest] = tokens;
  const isOpen = tokens.at(-1).type === 'open';
  if (!checkId(id, { line, ctx }, ID_PATTERN)) {
    rejectName(id, ctx);
    // 안쪽 줄을 이 격자의 줄로 읽어 넘기도록 버린 격자 자리를 연다.
    if (isOpen) ctx.block = { kind: 'grid', card: { isRejected: true, cells: [], line }, names: new Map(), line };
    return;
  }
  if (label?.type !== 'text') ctx.problems.error(line, `write grid as: grid ${id.value} "name" rows=N cols=N {`);
  if (!isOpen) ctx.problems.error(line, 'end the grid line with "{" and put the cells on the next lines');
  const numbers = readOptions(rest.filter((t) => t.type !== 'open'), { scopes: ['grid'], what: 'a grid', line, ctx });
  const grid = { id: id.value, shape: 'grid', label: label?.value ?? '', rows: numbers.rows ?? 1, cols: numbers.cols ?? 1, ...(numbers.unit === undefined ? {} : { rulerUnit: numbers.unit, regions: [] }), cells: [], parent: parentFor(id, ctx), line };
  if (grid.rulerUnit !== undefined && grid.cols > RULER_COLS_MAX) ctx.problems.error(line, `a grid with unit= numbers each column on a ruler and holds at most ${RULER_COLS_MAX} columns. Found cols=${grid.cols}`);
  ctx.figure.nodes.push(grid);
  // 칸 이름 찾기용 표(names)는 문서 모형에 넣지 않는다.
  if (isOpen) ctx.block = { kind: 'grid', card: grid, names: new Map(), line };
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 격자 안 줄 하나. `}`면 격자를 닫고 칸 자리를 확인하고, 아니면 `item`이나 `gap` 줄이다. */
export function readGridLine(statement, ctx) {
  const { tokens, line } = statement;
  const [head] = tokens;
  if (head.type === 'close') {
    closeGrid(statement, ctx);
    return;
  }
  if (statement.hasLexError) return;
  const word = head.type === 'word' ? head.value : undefined;
  if (word === 'item' || word === 'gap') readCell(word, statement, ctx);
  else if (word === 'region') readRegion(statement, ctx);
  else ctx.problems.error(line, `a grid holds only item, gap and region lines, then "}". Found "${head.value}".${word ? didYouMean(word, statementsIn('grid')) : ''}`, { column: head.column });
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `item id "글" ["보조 글"] [row=] [col=] [rows=] [cols=] [key=] [open]`, `gap id "글" count=N [row=] [col=] [rows=] [cols=]`
// 자리(row, col)를 둘 다 적지 않은 칸은 앞 칸 바로 뒤에 놓인다(flowAfter). 하나만 적으면 다른 하나는 0이다.
function readCell(word, { tokens, line }, ctx) {
  const [, id, label, ...rest] = tokens;
  const { problems } = ctx;
  const grid = ctx.block.card;
  const form = word === 'item' ? 'item id "text" ["detail"] [row=0] [col=0] [rows=1] [cols=1]' : 'gap id "text" count=N [row=0] [col=0] [rows=1] [cols=1]';
  if (!checkId(id, { line, ctx }, ID_PATTERN)) return;
  if (label?.type !== 'text') {
    problems.error(line, `write ${word} as: ${form}`);
    return;
  }
  const detail = word === 'item' && rest[0]?.type === 'text' ? rest.shift().value : undefined;
  const isOpen = word === 'item' && rest.some((t) => t.type === 'word' && t.value === 'open');
  const numbers = readOptions(rest.filter((t) => !(isOpen && t.type === 'word' && t.value === 'open')), { scopes: optionsScopes(word), what: `an ${word}`, line, ctx });
  if (word === 'gap' && numbers.count === undefined) problems.error(line, `a gap needs count=, the number of omitted entries: ${form}`);
  const known = ctx.block.names.get(id.value);
  if (known) {
    problems.error(line, `the name "${id.value}" is already used in grid "${grid.id}" (line ${known.line})`);
    return;
  }
  const size = { rows: numbers.rows ?? 1, cols: numbers.cols ?? 1 };
  const place = numbers.row === undefined && numbers.col === undefined ? flowAfter(grid.cells.at(-1), size, grid) : { row: numbers.row ?? 0, col: numbers.col ?? 0 };
  if (numbers.key !== undefined && (word !== 'item' || place.col !== 0)) problems.error(line, 'key= labels a row from the left, so it goes on an item at col=0');
  const cell = { id: id.value, kind: word, label: label.value, ...(detail === undefined ? {} : { detail }), ...place, ...size, count: numbers.count, key: numbers.key, ...(isOpen ? { isOpen } : {}), line };
  ctx.block.names.set(cell.id, cell);
  grid.cells.push(cell);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 자리를 적지 않은 칸의 자리. 앞 칸의 오른쪽 바로 뒤이고, 그 행에 칸 폭만큼 남지 않으면 앞 칸이 끝나는 다음 행의 맨 앞이다. 첫 칸은 (0, 0)이다.
 * 바이트 배치처럼 칸을 차례로 적을 때 자리를 계산해 적지 않아도 되게 한다. 자리를 넘는 칸은 닫을 때 격자 범위 오류가 된다.
 */
function flowAfter(previous, { cols }, grid) {
  if (!previous) return { row: 0, col: 0 };
  const col = previous.col + previous.cols;
  return col + cols <= grid.cols ? { row: previous.row, col } : { row: previous.row + previous.rows, col: 0 };
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `region "글" [row=N] [rows=N]`. 눈금자 격자(`unit=`)의 오른쪽에 행 구간을 묶는 괄호와 이름을 둔다. row를 적지 않으면 앞 구간이 끝난 행부터다.
function readRegion({ tokens, line }, ctx) {
  const [, label, ...rest] = tokens;
  const grid = ctx.block.card;
  if (label?.type !== 'text') {
    ctx.problems.error(line, 'write region as: region "name" [row=0] [rows=1]');
    return;
  }
  const numbers = readOptions(rest, { scopes: ['region'], what: 'a region', line, ctx });
  if (grid.isRejected) return;
  if (grid.rulerUnit === undefined) {
    ctx.problems.error(line, `region brackets rows of a byte layout. Add unit=bit or unit=byte to grid "${grid.id}"`);
    return;
  }
  const previous = grid.regions.at(-1);
  grid.regions.push({ label: label.value, row: numbers.row ?? (previous ? previous.row + previous.rows : 0), rows: numbers.rows ?? 1, line });
}

// gap은 item과 같은 자리 선택 사항을 쓴다(문법 표의 scopes).
function optionsScopes(word) {
  return word === 'gap' ? ['gap', 'item'] : ['item'];
}

// cost: time O(c log c), heap O(c), stack O(1)
// vars: c = 칸 수
// basis: estimate
// `}`. 격자가 비었거나, 칸이 격자 밖으로 나가거나, 칸끼리 겹치면 오류다. 격자 안에 든 칸만 쓸기로 겹침을 보므로 행×열이 아니라 선언한 칸 수에 비례한다.
function closeGrid({ tokens, line }, ctx) {
  const { problems } = ctx;
  const grid = ctx.block.card;
  ctx.block = undefined;
  if (tokens.length > 1) problems.error(line, 'put "}" on its own line');
  if (grid.isRejected) return;
  if (!grid.cells.length) problems.error(grid.line, `grid "${grid.id}" has no cells. Add item or gap lines, or remove the grid`);
  const inside = grid.cells.filter((cell) => checkRange(cell, grid, problems));
  for (const { cell, other } of findOverlaps(inside)) problems.error(cell.line, `${cell.kind} "${cell.id}" overlaps ${other.kind} "${other.id}" (line ${other.line}). Move one of them or change row, col, rows, cols`);
  for (const cell of grid.cells.filter((c) => c.isOpen && c.row + c.rows < grid.rows)) problems.error(cell.line, `open marks a field whose length varies, so it ends the layout. item "${cell.id}" ends at row ${cell.row + cell.rows} but grid "${grid.id}" has rows=${grid.rows}`);
  checkRegions(grid, problems);
}

// cost: time O(r log r), heap O(r), stack O(1)
// vars: r = 구간 수
// basis: estimate
// 구간은 격자 행 안에 들고 서로 겹치지 않는다. 괄호가 겹치면 어느 행이 어느 이름에 속하는지 읽히지 않는다.
function checkRegions(grid, problems) {
  const regions = grid.regions ?? [];
  for (const region of regions.filter((r) => r.row + r.rows > grid.rows)) problems.error(region.line, `region "${region.label}" ends at row ${region.row + region.rows} but grid "${grid.id}" has rows=${grid.rows}`);
  const sorted = [...regions].sort((a, b) => a.row - b.row);
  sorted.forEach((region, k) => {
    const next = sorted[k + 1];
    if (next && next.row < region.row + region.rows) problems.error(Math.max(region.line, next.line), `region "${next.label}" overlaps region "${region.label}". Brackets on the right side cannot share rows`);
  });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 칸이 격자 안에 드는지 본다. 밖이면 오류를 내고 false다. 인덱스와 크기의 합이 안전한 정수가 아니면 격자 크기와 정확히 견줄 수 없으므로 그 오류를 낸다.
function checkRange(cell, grid, problems) {
  const out = [['row', 'rows'], ['col', 'cols']].find(([start, size]) => !Number.isSafeInteger(cell[start] + cell[size]) || cell[start] + cell[size] > grid[size]);
  if (!out) return true;
  const [start, size] = out;
  const end = cell[start] + cell[size];
  const where = size === 'rows' ? 'row' : 'column';
  if (!Number.isSafeInteger(end)) problems.error(cell.line, `${cell.kind} "${cell.id}": ${start}=${cell[start]} plus ${size}=${cell[size]} is beyond ${Number.MAX_SAFE_INTEGER}, so the ${where} it ends at cannot be computed exactly. Use smaller values`);
  else problems.error(cell.line, `${cell.kind} "${cell.id}" ends at ${where} ${end} but grid "${grid.id}" has ${size}=${grid[size]}. Raise ${size}= on the grid or move the ${cell.kind}`);
  return false;
}
