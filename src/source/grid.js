// 칸 격자(`grid id "글" rows=N cols=N {` ... `}`)를 읽는다. 칸은 `item`과 `gap` 줄이고, 칸 자리는 격자 안의 논리 인덱스다(docs/design/figure-kinds.md 칸 격자).
import { checkId, currentGroup } from './names.js';
import { normalizeStatement } from './normalize.js';
import { readOptions } from './options.js';
import { ID_PATTERN } from './words.js';

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** `grid id "글" [rows=N] [cols=N] {` 한 줄. 이어지는 줄은 격자가 닫힐 때까지 readGridLine이 읽는다. */
export function readGrid({ tokens, line }, ctx) {
  const [, id, label, ...rest] = tokens;
  const isOpen = tokens.at(-1).type === 'open';
  if (!checkId(id, { line, ctx }, ID_PATTERN)) {
    // 안쪽 줄을 이 격자의 줄로 읽어 넘기도록 버린 격자 자리를 연다.
    if (isOpen) ctx.grid = { isRejected: true, cells: [] };
    return;
  }
  if (label?.type !== 'text') ctx.problems.error(line, `write grid as: grid ${id.value} "name" rows=N cols=N {`);
  if (!isOpen) ctx.problems.error(line, 'end the grid line with "{" and put the cells on the next lines');
  const numbers = readOptions(rest.filter((t) => t.type !== 'open'), { scopes: ['grid'], what: 'a grid', line, ctx });
  const grid = { id: id.value, shape: 'grid', label: label?.value ?? '', rows: numbers.rows ?? 1, cols: numbers.cols ?? 1, cells: [], parent: currentGroup(ctx), line };
  ctx.figure.nodes.push(grid);
  if (isOpen) ctx.grid = grid;
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
  const word = head.type === 'word' ? normalizeStatement(statement, { word: head.value, isHeadWord: true }, ctx) : undefined;
  if (word === 'item' || word === 'gap') readCell(word, statement, ctx);
  else ctx.problems.error(line, `a grid holds only item and gap lines, then "}". Found "${head.value}"`);
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `item id "글" [row=] [col=] [rows=] [cols=]`, `gap id "글" count=N [row=] [col=] [rows=] [cols=]`
function readCell(word, { tokens, line }, ctx) {
  const [, id, label, ...rest] = tokens;
  const { grid, problems } = ctx;
  const form = word === 'item' ? 'item id "text" [row=0] [col=0] [rows=1] [cols=1]' : 'gap id "text" count=N [row=0] [col=0] [rows=1] [cols=1]';
  if (!checkId(id, { line, ctx }, ID_PATTERN)) return;
  if (label?.type !== 'text') {
    problems.error(line, `write ${word} as: ${form}`);
    return;
  }
  const numbers = readOptions(rest, { scopes: optionsScopes(word), what: `an ${word}`, line, ctx });
  if (word === 'gap' && numbers.count === undefined) problems.error(line, `a gap needs count=, the number of omitted entries: ${form}`);
  const known = grid.cells.find((c) => c.id === id.value);
  if (known) problems.error(line, `the name "${id.value}" is already used in grid "${grid.id}" (line ${known.line})`);
  else grid.cells.push({ id: id.value, kind: word, label: label.value, row: numbers.row ?? 0, col: numbers.col ?? 0, rows: numbers.rows ?? 1, cols: numbers.cols ?? 1, count: numbers.count, line });
}

// gap은 item과 같은 자리 선택 사항을 쓴다(문법 표의 scopes).
function optionsScopes(word) {
  return word === 'gap' ? ['gap', 'item'] : ['item'];
}

// cost: time O(c²), heap O(1), stack O(1)
// vars: c = 칸 수
// basis: estimate
// `}`. 격자가 비었거나, 칸이 격자 밖으로 나가거나, 칸끼리 겹치면 오류다. 칸 수가 아니라 칸 수의 제곱에 비례해 겹침을 보므로 큰 희소 격자도 선언한 칸만 본다.
function closeGrid({ tokens, line }, ctx) {
  const { grid, problems } = ctx;
  ctx.grid = undefined;
  if (tokens.length > 1) problems.error(line, 'put "}" on its own line');
  if (grid.isRejected) return;
  if (!grid.cells.length) problems.error(grid.line, `grid "${grid.id}" has no cells. Add item or gap lines, or remove the grid`);
  grid.cells.forEach((cell, i) => {
    const isInside = checkRange(cell, grid, problems);
    const other = isInside ? grid.cells.slice(0, i).find((o) => isOverlapping(cell, o)) : undefined;
    if (other) problems.error(cell.line, `${cell.kind} "${cell.id}" overlaps ${other.kind} "${other.id}" (line ${other.line}). Move one of them or change row, col, rows, cols`);
  });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 칸이 격자 안에 드는지 본다. 밖이면 오류를 내고 false다.
function checkRange(cell, grid, problems) {
  const out = [['row', 'rows'], ['col', 'cols']].find(([start, size]) => cell[start] + cell[size] > grid[size]);
  if (!out) return true;
  const [start, size] = out;
  problems.error(cell.line, `${cell.kind} "${cell.id}" ends at ${size === 'rows' ? 'row' : 'column'} ${cell[start] + cell[size]} but grid "${grid.id}" has ${size}=${grid[size]}. Raise ${size}= on the grid or move the ${cell.kind}`);
  return false;
}

function isOverlapping(a, b) {
  return a.row < b.row + b.rows && b.row < a.row + a.rows && a.col < b.col + b.cols && b.col < a.col + a.cols;
}
