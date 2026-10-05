// 큰 격자: 빈 칸 구간 표현, 생성 예산, 좌표 범위, --budget(docs/design/grid.md 크기, 빈 칸 표현, 예산).
import assert from 'node:assert/strict';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { BUDGETS, createMeter, parseBudgetList, parseBudgetPair, resolveBudget } from '../src/budget.js';
import { buildFigure } from '../src/build.js';
import { drawEmpties } from '../src/draw/grid.js';
import { gridCost } from '../src/measure/grid-cost.js';
import { emptyRegions, findOverlaps } from '../src/source/grid-space.js';
import { FigureError } from '../src/source/problems.js';
import { toSvg } from '../src/svg.js';
import { runCli as run, withFolder } from './helpers.js';

// 선언 수는 같고 논리 크기만 n×n인 격자. 칸은 셋(하나, 합친 칸 하나, 생략 칸 하나)이다.
const sparse = (n) => `flow right\ngrid g "큰 격자" rows=${n} cols=${n} {\n  item a "A"\n  item b "B" row=1 col=1 rows=2 cols=3\n  gap skip "…" count=5 row=${Math.floor(n / 2)} cols=2\n}\n`;
// 칸이 n×n 모두 있는 빽빽한 격자
const dense = (n, name = 'g') => `grid ${name} "빽빽" rows=${n} cols=${n} {\n${Array.from({ length: n * n }, (_, k) => `  item c${k} "${k % 10}" row=${Math.floor(k / n)} col=${k % n}`).join('\n')}\n}\n`;
const denseFigure = (n, grids = 1) => `flow right\n${Array.from({ length: grids }, (_, k) => dense(n, `g${k}`)).join('')}`;
// 빽빽한 10×10 격자 하나: 틀 2 + 칸 100×5
const TEN_BY_TEN = 502;

// cost: time O(build), heap O(out), stack O(1)
// vars: build = 그림 하나를 만드는 비용, out = 결과 글자 수
// basis: estimate
// 원본이 FigureError로 실패해야 하고, 그 진단 목록을 돌려준다.
const failureOf = async (source, options) => {
  try {
    await buildFigure(source, options);
  } catch (error) {
    assert.ok(error instanceof FigureError, error.stack);
    return error.problems;
  }
  return assert.fail('the build should fail');
};

// 근거: 이슈 #28 완료 조건 "같은 선언 수로 논리 격자만 키운 입력에서 출력이 행×열에 비례해 늘지 않는다"
test('buildFigure_grid_output_stays_the_same_size_when_only_the_logical_grid_grows', async () => {
  const sizes = {};
  for (const n of [100000, 100, 400]) {
    const result = await buildFigure(sparse(n));
    sizes[n] = (await toSvg(result, { isStatic: false, name: 'g' })).length;
    assert.ok(result.scene.items[0].empties.length <= 12, `${n}: ${result.scene.items[0].empties.length} empty regions`);
  }

  assert.ok(Math.abs(sizes[400] - sizes[100]) < 200, `${sizes[100]} vs ${sizes[400]}`);
  assert.ok(Math.abs(sizes[100000] - sizes[100]) < 200, `${sizes[100]} vs ${sizes[100000]}`);
});

// 근거: 이슈 #28 완료 조건 "예산 초과는 필요한 양, 설정값, 조정 방법을 알리고 큰 할당 전에 끝난다"
test('buildFigure_grid_over_budget_reports_the_needed_amount_and_how_to_raise_it', async () => {
  const problems = await failureOf(denseFigure(10), { budget: { 'grid-elements': 100 } });

  assert.deepEqual(problems.map((p) => [p.code, p.line]), [['budget-exceeded', 2]]);
  assert.match(problems[0].message, new RegExp(`needs ${TEN_BY_TEN} SVG elements drawn by grids`));
  assert.match(problems[0].message, /budget grid-elements=100/);
  assert.match(problems[0].message, new RegExp(`--budget grid-elements=${TEN_BY_TEN}\\b`));
});

// 근거: 이슈 #28 완료 조건 "예산을 명시적으로 늘리면 같은 입력을 처리한다"(한도와 같은 양은 통과, 하나 모자라면 실패)
test('buildFigure_grid_budget_accepts_exactly_the_needed_amount_and_rejects_one_less', async () => {
  const exact = await buildFigure(denseFigure(10), { budget: { 'grid-elements': TEN_BY_TEN } });
  const problems = await failureOf(denseFigure(10), { budget: { 'grid-elements': TEN_BY_TEN - 1 } });

  assert.equal(exact.scene.items[0].cells.length, 100);
  assert.equal(problems[0].code, 'budget-exceeded');
});

// 근거: 이슈 #28 구현 기준 "여러 격자의 합계도 검사한다"
test('buildFigure_grid_budget_counts_all_grids_of_the_figure_and_names_the_grid_that_passes_it', async () => {
  const source = denseFigure(10, 3);
  const ok = await buildFigure(source, { budget: { 'grid-elements': TEN_BY_TEN * 3 } });
  const problems = await failureOf(source, { budget: { 'grid-elements': TEN_BY_TEN * 2 + 1 } });

  assert.equal(ok.scene.items.length, 3);
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, new RegExp(`needs ${TEN_BY_TEN * 3} `));
  assert.match(problems[0].message, /grid "g2" is where the total passes it/);
  assert.equal(problems[0].line, source.split('\n').findIndex((l) => l.startsWith('grid g2')) + 1);
});

// 근거: 이슈 #28 구현 기준 "합친 경로도 비용에서 빠지지 않는다": 빈 칸 구간 경로의 명령 수가 예산이다
test('buildFigure_grid_budget_counts_the_path_commands_of_the_merged_empty_area_path', async () => {
  const regions = emptyRegions({ rows: 400, cols: 400, cells: [{ row: 0, col: 0, rows: 1, cols: 1 }, { row: 1, col: 1, rows: 2, cols: 3 }, { row: 200, col: 0, rows: 1, cols: 2 }] }).length;
  const problems = await failureOf(sparse(400), { budget: { 'grid-path-commands': regions * 5 - 1 } });

  assert.equal(problems[0].code, 'budget-exceeded');
  assert.match(problems[0].message, new RegExp(`needs ${regions * 5} path commands`));
  assert.ok((await buildFigure(sparse(400), { budget: { 'grid-path-commands': regions * 5 } })).scene.items[0].empties.length === regions);
});

// 근거: 이슈 #28 완료 조건 "작은 예산을 준 시험에서 대량 할당 전에 실패한다": 크기를 정하는 단계가 실패하는 입력도 예산 오류가 먼저다
test('buildFigure_grid_budget_is_checked_before_the_grid_is_sized', async () => {
  const huge = 'flow right\ngrid g "크다" rows=9007199254740991 cols=9007199254740991 {\n  item a "A"\n}\n';

  assert.deepEqual((await failureOf(huge, { budget: { 'grid-elements': 1 } })).map((p) => p.code), ['budget-exceeded']);
  assert.deepEqual((await failureOf(huge)).map((p) => p.code), ['syntax']);
});

// 근거: 이슈 #28 구현 기준 "좌표와 크기 계산의 유한성을 검사하고 처리할 수 없는 정밀도는 해당 줄의 진단으로 알린다"
test('buildFigure_grid_beyond_the_exact_coordinate_range_is_a_line_error_not_a_crash', async () => {
  const source = 'flow right\n\ngrid g "크다" rows=1000000000000 cols=3 {\n  item a "A"\n}\n';
  const problems = await failureOf(source);

  assert.deepEqual(problems.map((p) => p.line), [3]);
  assert.match(problems[0].message, /grid "g" \(rows=1000000000000, cols=3\) would be about .* px, beyond the 1099511627776 px/);
  assert.equal((await buildFigure('flow right\ngrid g "큼" rows=100000000 cols=100000000 {\n  item a "A"\n}\n')).scene.items.length, 1);
});

// 근거: 이슈 #28 구현 기준 "인덱스 합산이 안전한 정수를 넘으면 해당 줄의 진단"
test('buildFigure_grid_cell_index_sums_beyond_the_safe_integer_range_are_line_errors', async () => {
  const source = 'flow right\ngrid g "격자" rows=9007199254740991 cols=2 {\n  item a "A" row=9007199254740990 rows=3\n  item b "B" row=0\n}\n';
  const problems = await failureOf(source);

  assert.deepEqual(problems.map((p) => p.line), [3]);
  assert.match(problems[0].message, /is beyond 9007199254740991, so the row it ends at cannot be computed exactly/);
});

// 근거: 이슈 #28 완료 조건 "빽빽한 격자도 예산 검사에 포함된다"(기본 한도 안의 빽빽한 격자는 통과)
test('buildFigure_grid_default_budget_accepts_a_dense_grid_of_ordinary_size', async () => {
  const { scene } = await buildFigure(denseFigure(30));

  assert.equal(scene.items[0].cells.length, 900);
  assert.equal(scene.items[0].empties.length, 0);
});

// 근거: 이슈 #28 구현 기준 "빈 칸은 구간으로 표현하고 행×열 크기의 요소를 만들지 않는다"
test('toSvg_grid_draws_all_empty_cells_as_one_pattern_filled_path', async () => {
  const result = await buildFigure(sparse(400));
  const svg = await toSvg(result, { isStatic: false, name: 'g' });

  assert.equal(svg.match(/<pattern /g).length, 1);
  assert.equal(svg.match(/class="grid-empty"/g).length, 1);
  assert.equal(svg.match(/class="grid-cell empty"/g).length, 1);
});

// 근거: 설계 grid.md 빈 칸 표현: 구간은 선언하지 않은 단위 칸을 정확히 한 번씩 덮는다
test('emptyRegions_cover_every_undeclared_unit_exactly_once', () => {
  let seed = 7;
  const next = (n) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  for (let round = 0; round < 300; round++) {
    const [rows, cols] = [1 + next(8), 1 + next(8)];
    const taken = new Set();
    const cells = [];
    for (let k = 0; k < 10; k++) {
      const [row, col] = [next(rows), next(cols)];
      const cell = { row, col, rows: 1 + next(rows - row), cols: 1 + next(cols - col) };
      const units = Array.from({ length: cell.rows * cell.cols }, (_, i) => (row + Math.floor(i / cell.cols)) * cols + col + (i % cell.cols));
      if (units.some((u) => taken.has(u))) continue;
      units.forEach((u) => taken.add(u));
      cells.push(cell);
    }
    const covered = new Map();
    for (const g of emptyRegions({ rows, cols, cells })) for (let r = g.row0; r < g.row1; r++) for (let c = g.col0; c < g.col1; c++) covered.set(r * cols + c, (covered.get(r * cols + c) ?? 0) + 1);

    for (let u = 0; u < rows * cols; u++) assert.equal(covered.get(u) ?? 0, taken.has(u) ? 0 : 1, JSON.stringify({ rows, cols, cells, u }));
  }
});

// 근거: 설계 grid.md 빈 칸 표현: 구간 수는 칸 수에 비례하고 격자 크기와 무관하다
test('emptyRegions_count_follows_the_declared_cells_not_the_grid_size', () => {
  const cells = [{ row: 0, col: 0, rows: 1, cols: 1 }, { row: 5, col: 5, rows: 2, cols: 2 }];

  assert.equal(emptyRegions({ rows: 10, cols: 10, cells }).length, emptyRegions({ rows: 1e12, cols: 1e12, cells }).length);
  assert.ok(emptyRegions({ rows: 1e12, cols: 1e12, cells }).length <= 3 * cells.length + 1);
  assert.deepEqual(emptyRegions({ rows: 3, cols: 3, cells: [] }), [{ row0: 0, row1: 3, col0: 0, col1: 3 }]);
});

// 근거: 설계 grid.md 칸 겹침: 겹친 칸마다 늦게 선언한 칸 하나를 이른 칸과 짝지어 알린다
test('findOverlaps_pairs_each_later_cell_with_an_earlier_cell_it_overlaps', () => {
  const cells = [{ row: 0, col: 0, rows: 2, cols: 2 }, { row: 5, col: 5, rows: 1, cols: 1 }, { row: 1, col: 1, rows: 3, cols: 3 }, { row: 5, col: 5, rows: 1, cols: 1 }];
  const found = findOverlaps(cells);

  assert.deepEqual(found.map(({ cell, other }) => [cells.indexOf(cell), cells.indexOf(other)]).sort(), [[2, 0], [3, 1]]);
  assert.deepEqual(findOverlaps([{ row: 0, col: 0, rows: 1, cols: 2 }, { row: 0, col: 2, rows: 1, cols: 1 }, { row: 1, col: 0, rows: 1, cols: 3 }]), []);
});

// 근거: 설계 grid.md 예산: 선언만으로 정해지는 양을 센다(칸 종류별 요소, 빈 칸 구간의 경로 명령)
test('gridCost_counts_elements_and_path_commands_from_the_declaration', () => {
  const cells = [{ kind: 'item', row: 0, col: 0, rows: 1, cols: 1 }, { kind: 'gap', row: 1, col: 0, rows: 1, cols: 1 }];

  assert.deepEqual(gridCost({ rows: 2, cols: 1, cells }), { elements: 2 + 5 + 3, pathCommands: 0 });
  assert.deepEqual(gridCost({ rows: 2, cols: 2, cells: [{ kind: 'item', row: 0, col: 0, rows: 2, cols: 1 }] }), { elements: 2 + 5 + 3, pathCommands: 5 });
});

// 근거: 설계 grid.md 빈 칸 표현: 무늬 칸은 통로 높이를 포함하고, 구간 경로는 선 굵기 절반만큼 넓어진다
test('drawEmpties_makes_one_pattern_and_one_path_with_five_commands_per_region', () => {
  const it = { x: 10, y: 20, empties: [{ x: 8, y: 30, w: 40, h: 60 }, { x: 8, y: 100, w: 20, h: 30 }], unit: { w: 20, h: 30, gutter: 10, x: 8, y: 30 } };
  const svg = drawEmpties(it, 4);

  assert.equal(drawEmpties({ ...it, empties: [] }, 4), '');
  assert.match(svg, /<pattern id="ge-4" patternUnits="userSpaceOnUse" x="17.5" y="49.5" width="20" height="40">/);
  assert.match(svg, /fill="url\(#ge-4\)" class="grid-empty"/);
  assert.equal(/<path d="([^"]*)" fill/.exec(svg)[1].match(/[MhvzHVL]/g).length, 10);
});

// 근거: 이슈 #28 구현 기준 "조정값도 유효한 유한 정수인지 검사한다"
test('parseBudgetPair_accepts_only_known_names_with_positive_safe_integers', () => {
  const bad = ['grid-elements', 'grid-elements=', 'grid-elements=0', 'grid-elements=-5', 'grid-elements=1.5', 'grid-elements=1e3', 'grid-elements=007', 'grid-elements=9007199254740992', 'grid-elements=Infinity', 'grid-elements= 5', 'nope=3', '=3'];

  assert.deepEqual(parseBudgetPair('grid-elements=9007199254740991'), { name: 'grid-elements', value: 9007199254740991 });
  for (const text of bad) assert.ok(parseBudgetPair(text).error, text);
  assert.match(parseBudgetPair('nope=3').error, /Names: grid-elements, grid-path-commands/);
  assert.equal(parseBudgetList(['grid-elements=5', 'grid-elements=7']).budget['grid-elements'], 7);
  assert.ok(parseBudgetList(['grid-elements=5', 'x=1']).error);
});

// 근거: 이슈 #28 구현 기준 "기본 예산 위에 명시한 값을 올린다"
test('resolveBudget_overrides_defaults_and_rejects_bad_values', () => {
  const limits = resolveBudget({ 'grid-elements': 7 });

  assert.equal(limits['grid-elements'], 7);
  assert.equal(limits['grid-path-commands'], BUDGETS['grid-path-commands'].limit);
  assert.deepEqual(resolveBudget(), resolveBudget({}));
  assert.throws(() => resolveBudget({ 'grid-elements': 0 }), TypeError);
  assert.throws(() => resolveBudget({ nope: 3 }), TypeError);
});

// 근거: 설계 grid.md 예산: 합계가 한도와 같으면 통과하고 넘는 예산마다 진단 하나를 낸다
test('createMeter_verify_throws_one_diagnostic_per_budget_over_its_limit', () => {
  const meter = createMeter({ 'grid-elements': 10, 'grid-path-commands': 10 });
  meter.add('grid-elements', 6, { line: 2, what: 'grid "a"' });
  meter.add('grid-path-commands', 10, { line: 2, what: 'grid "a"' });
  meter.verify();
  meter.add('grid-elements', 5, { line: 9, what: 'grid "b"' });

  assert.throws(() => meter.verify(), (error) => error.problems.length === 1 && error.problems[0].line === 9 && error.problems[0].code === 'budget-exceeded' && /needs 11 /.test(error.problems[0].message));
});

// 근거: 이슈 #28 구현 기준 "CLI에서 같은 예산을 높일 수 있고, 초과는 파일을 쓰기 전에 끝난다", 잘못된 설정은 인자 오류
test('main_budget_option_raises_the_limit_and_an_over_budget_figure_writes_no_file', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'g.dap'), denseFigure(10));

    const over = run(['render', 'g.dap', '--html', '--budget', 'grid-elements=100'], folder);
    const raised = run(['render', 'g.dap', '--budget', `grid-elements=${TEN_BY_TEN}`, '--budget', 'grid-path-commands=5'], folder);

    assert.equal(over.status, 1);
    assert.match(over.stderr, /^g\.dap:2: this figure needs 502 SVG elements drawn by grids, over the budget grid-elements=100.*--budget grid-elements=502/m);
    assert.deepEqual(readdirSync(folder).filter((f) => f !== 'g.dap' && f !== 'g.svg'), []);
    assert.equal(raised.status, 0, raised.stderr);
    assert.ok(existsSync(join(folder, 'g.svg')));
  });
});

// 근거: 이슈 #28 구현 기준 "모든 그림 명령이 같은 의미로 --budget을 받는다"
test('main_every_figure_command_takes_budget_with_the_same_meaning', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'g.dap'), denseFigure(10));
    writeFileSync(join(folder, 'doc.md'), `# 문서\n\n\`\`\`dap\n${denseFigure(10)}\`\`\`\n`);
    const [small, big] = ['grid-elements=100', `grid-elements=${TEN_BY_TEN}`];
    const commands = [['check', 'g.dap'], ['gallery', '.', '--out', 'out'], ['md', 'doc.md', '--check']];

    for (const command of commands) {
      assert.equal(run([...command, '--budget', small], folder).status, 1, command.join(' '));
      assert.equal(run([...command, '--budget', big], folder).status, command[0] === 'md' ? 1 : 0, command.join(' '));
    }
    const md = run(['md', 'doc.md', '--budget', small], folder);
    assert.match(md.stderr, /^doc\.md:5: this figure needs 502/m);
    assert.equal(run(['md', 'doc.md', '--budget', big], folder).status, 0);
    assert.equal(run(['md', 'doc.md', '--check', '--budget', big], folder).status, 0);
  });
});

// 근거: 이슈 #28 구현 기준 "조정값 검증": 잘못된 값, 모르는 이름, 값 없음은 인자 오류(종료 2)이고 아무것도 만들지 않는다
test('main_budget_option_with_a_bad_name_or_value_is_a_usage_error', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'g.dap'), 'flow right\nbox a "A"\n');
    const cases = [['--budget', 'grid-elements=0'], ['--budget', 'grid-elements=1.5'], ['--budget', 'grid-elements=99999999999999999999'], ['--budget', 'nope=1'], ['--budget', 'grid-elements'], ['--budget'], ['--budget', '--strict']];

    for (const args of cases) {
      const result = run(['render', 'g.dap', ...args], folder);
      assert.equal(result.status, 2, args.join(' '));
      assert.match(result.stderr, /^(?:--budget needs a value|--budget takes name=value|unknown budget "nope"|budget grid-elements is a positive whole number)/);
    }
    assert.ok(!existsSync(join(folder, 'g.svg')));
    assert.equal(run(['migrate', 'g.dap', '--budget', 'grid-elements=5'], folder).status, 2);
  });
});

const LONG = '참조 비트는 CPU가 접근할 때 켜고 운영체제가 주기적으로 지워 최근에 쓰지 않은 페이지를 교체 후보로 고른다';
const WRAPPED = `flow right\ngrid g "여러 줄 제목이 들어가는 긴 격자 제목은 폭을 넘으면 줄을 나눈다 ${LONG}" rows=3 cols=3 {\n  item a "${LONG}" cols=2\n  gap s "${LONG}" count=3 row=1\n  item b "짧음" row=2 col=2\n}\n`;

// 근거: 이슈 #28 결정 "비용을 실제로 늘리는 단위가 예산에서 빠지면 안 된다": 줄 나눔으로 늘어난 글 요소도 센다
test('buildFigure_grid_budget_counts_the_wrapped_text_lines_so_it_never_undercounts_the_drawn_elements', async () => {
  const result = await buildFigure(WRAPPED);
  const [grid] = result.scene.items;
  const svg = await toSvg(result, { isStatic: true, name: 'g' });
  // 도형 묶음 g 하나와 모든 도형이 갖는 후광(g, rect)은 격자 비용이 아니라 뺀다.
  const drawn = svg.slice(svg.indexOf('<g id="n-0"'), svg.indexOf('</svg>')).match(/<(?:rect|text|path|pattern|g)\b/g).length - 3;
  const cost = gridCost(result.figure.nodes[0]).elements;

  assert.ok(grid.cells.every((c) => c.lines.length >= 1) && grid.cells.some((c) => c.lines.length > 1), 'the fixture needs a wrapped cell');
  assert.ok(drawn <= cost, `drawn ${drawn} > counted ${cost}`);
  assert.ok(cost > 1 + 1 + 4 + 1 + 2 + 1 + 4 + 1 + 3, 'wrapped lines are counted beyond one per cell');
  assert.equal(drawn, cost);
  const over = await failureOf(WRAPPED, { budget: { 'grid-elements': cost - 1 } });
  assert.equal(over[0].code, 'budget-exceeded');
  assert.match(over[0].message, new RegExp(`needs ${cost} SVG`));
  assert.ok(await buildFigure(WRAPPED, { budget: { 'grid-elements': cost } }));
});
