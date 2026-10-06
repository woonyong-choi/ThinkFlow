// 글 상자 계획의 공간 색인: 격자 면적과 무관한 크기, 색인 예산, 기존 위치와 겹침 결과(docs/design/grid.md 예산, 글 상자 계획의 공간 색인).
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { BUDGETS, parseBudgetPair, resolveBudget } from '../src/budget.js';
import { buildFigure } from '../src/build.js';
import { chipCandidates, sizeChip } from '../src/chip.js';
import { gridOf, indexEntries } from '../src/chip-grid.js';
import { chipLines, chipObstacles } from '../src/draw/boxes.js';
import { FigureError } from '../src/source/problems.js';
import { runCli as run, withFolder } from './helpers.js';

// 칸 하나만 선언하고 rows와 cols만 키운 희소 격자에 이동 글을 붙인 그림(이슈 #134의 재현)
const sparseMove = (n) => `flow right\ngrid g "G" rows=${n} cols=${n} {\n item one "X"\n}\nbox b "B"\ng -> b\nstep "S"\n g -> b "move" time=1ms\n`;
// 이동 글, 큰 합친 칸, 빈 영역, 격자 여러 개를 함께 쓴 그림. 둘째 격자의 합친 칸 하나가 1200×1200 칸이다.
const MIXED = `flow right
grid g "G" rows=12 cols=12 {
 item a "A"
 item b "B" row=2 col=2 rows=4 cols=6
 gap skip "…" count=5 row=9 cols=2
}
grid h "H" rows=3000 cols=3000 {
 item x "X" row=10 col=10
 item y "Y" row=1500 col=1500 rows=1200 cols=1200
}
box k "K"
box c "C"
g.a -> k
h.x -> c
k -> c
step "S"
 g.a -> k "move" time=1s
 h.x -> c "move2" time=2s
 k -> c "third" time=1s
`;
// 칸 항목 상한 시험의 생성량 상한. 한 번에 이만큼을 넘게 넣으면 중단한다
const INSERT_GUARD = 1000;

// cost: time O(r), heap O(1), stack O(1)
// vars: r = run 안의 Map 삽입 수(INSERT_GUARD에서 중단)
// basis: estimate
// run이 돌 동안 chip-grid.js 안에서 일어난 Map의 새 키 삽입 수. guard를 넘으면 그 자리에서 던져 큰 할당 전에 끝낸다.
async function insertsDuring(run, guard = INSERT_GUARD) {
  const set = Map.prototype.set;
  let inserts = 0;
  Map.prototype.set = function (key, value) {
    if (!this.has(key) && /chip-grid\.js/.test(new Error().stack)) {
      inserts += 1;
      if (inserts > guard) throw new RangeError(`공간 색인 삽입이 ${guard}회를 넘었다`);
    }
    return set.call(this, key, value);
  };
  try {
    await run();
  } finally {
    Map.prototype.set = set;
  }
  return inserts;
}

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

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 사각형 수
// basis: estimate
// 씨앗으로 정해지는 무작위 사각형. 작은 것부터 격자 칸 수만 배까지, 음수 좌표도 섞는다.
function randomRects(n, seed) {
  let state = seed;
  const next = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
  const sizes = [5, 40, 300, 5000, 400000];
  return Array.from({ length: n }, () => ({ x: Math.floor(next() * 20000 - 5000), y: Math.floor(next() * 20000 - 5000), w: Math.floor(next() * sizes[Math.floor(next() * sizes.length)]), h: Math.floor(next() * sizes[Math.floor(next() * sizes.length)]) }));
}

// cost: time O(a), heap O(a), stack O(1)
// vars: a = 사각형 수
// basis: estimate
// box와 닿는(가장자리만 닿는 것 포함) 사각형 번호를 모두 훑어 찾은 답
const touching = (rects, box) => rects.flatMap((r, i) => (r.x <= box.x + box.w && box.x <= r.x + r.w && r.y <= box.y + box.h && box.y <= r.y + r.h ? [i] : []));

// 근거: 이슈 #134 완료 조건 "수정 전 반례가 생성량 상한 시험에서 실패하고 수정 뒤 통과한다", "칸 선언·이동 수가 일정할 때 공간 색인이 논리 격자 면적에 비례해 늘지 않는다"
test('buildFigure_moving_text_in_a_sparse_grid_inserts_the_same_few_index_cells_whatever_the_grid_size', { timeout: 60_000 }, async () => {
  const inserts = {};
  for (const n of [20, 40, 80, 10000]) inserts[n] = await insertsDuring(() => buildFigure(sparseMove(n)));

  for (const [n, count] of Object.entries(inserts)) assert.ok(count <= 200, `${n}×${n}: ${count} inserts`);
  assert.ok(Math.max(...Object.values(inserts)) - Math.min(...Object.values(inserts)) <= 50, JSON.stringify(inserts));
});

// 근거: 이슈 #134 완료 조건 "큰 사각형은 별도 교차 검사나 범위 색인으로 처리한다. 고정 행·열 제한으로 우회하지 않는다"
test('gridOf_keeps_a_huge_rectangle_to_a_few_entries_and_still_finds_it', async () => {
  const rects = [{ x: 0, y: 0, w: 10, h: 10 }, { x: -1e7, y: -1e7, w: 2e7, h: 2e7 }];
  let index;

  const inserts = await insertsDuring(() => {
    index = gridOf(rects);
  });

  assert.ok(inserts <= 8, `${inserts} inserts`);
  assert.deepEqual(index.near({ x: 5e6, y: -3e6, w: 100, h: 40 }), [1]);
  assert.deepEqual(index.near({ x: 2, y: 2, w: 100, h: 40 }), [0, 1]);
});

// 근거: 이슈 #134 완료 조건 "큰 사각형은 별도 교차 검사나 범위 색인으로 처리한다"(크기를 알 수 없는 사각형도 칸으로 펼치지 않는다)
test('gridOf_offers_a_rectangle_of_unknown_size_for_every_box_without_spreading_it_over_cells', async () => {
  const rects = [{ x: 0, y: 0, w: Infinity, h: 10 }, { x: 5000, y: 5000, w: 10, h: 10 }, { x: Number.NaN, y: 0, w: 5, h: 5 }];
  let index;

  const inserts = await insertsDuring(() => {
    index = gridOf(rects);
  });

  assert.ok(inserts <= 4, `${inserts} inserts`);
  assert.deepEqual(index.near({ x: 5000, y: 5000, w: 20, h: 20 }), [0, 1, 2]);
  assert.deepEqual(index.near({ x: -300, y: 0, w: 20, h: 20 }), [0, 2]);
});

// 근거: 이슈 #134 완료 조건 "기존 글 상자 위치·겹침 결과를 유지한다"(색인이 닿는 사각형을 빠뜨리지 않고 오름차순으로 낸다)
test('gridOf_near_never_misses_a_touching_rectangle_and_lists_each_once_in_ascending_order', async () => {
  for (const seed of [1, 2, 3]) {
    const rects = randomRects(300, seed);
    let index;
    await insertsDuring(() => {
      index = gridOf(rects);
    }, rects.length * 4);

    for (const box of randomRects(200, seed + 100).map((r) => ({ ...r, w: r.w % 400, h: r.h % 80 }))) {
      const found = index.near(box);

      assert.deepEqual([...new Set(found)].sort((a, b) => a - b), found, `seed ${seed}`);
      assert.ok(touching(rects, box).every((i) => found.includes(i)), `seed ${seed}: ${JSON.stringify(box)}`);
    }
  }
});

// 근거: 이슈 #134 완료 조건 "색인의 실제 비용도 할당 전에 검사한다"(항목 수를 세는 새 함수, 수정 전 실행 불가)
test('indexEntries_equals_the_entries_gridOf_makes_and_stays_within_four_per_rectangle', () => {
  const rects = randomRects(500, 7);

  assert.equal(gridOf(rects).entries, indexEntries(rects));
  assert.ok(indexEntries(rects) <= rects.length * 4);
  assert.equal(indexEntries([]), 0);
});

// 근거: 이슈 #134 완료 조건 "색인의 실제 비용도 할당 전에 검사하고 작은 예산을 주입한 시험"(새 예산 이름, 수정 전 실행 불가)
test('buildFigure_moving_text_over_the_chip_index_budget_ends_with_budget_exceeded_before_any_index_is_built', async () => {
  let problems;

  const inserts = await insertsDuring(async () => {
    problems = await failureOf(sparseMove(30), { budget: { 'chip-index': 1 } });
  });

  assert.equal(inserts, 0);
  assert.deepEqual(problems.map((p) => [p.code, p.line]), [['budget-exceeded', 8]]);
  assert.match(problems[0].message, /needs \d+ entries in the spatial index of one moving-text plan, over the budget chip-index=1\./);
  const needed = Number(/needs (\d+) entries/.exec(problems[0].message)[1]);
  assert.match(problems[0].message, new RegExp(`--budget chip-index=${needed}\\b`));
  assert.ok((await buildFigure(sparseMove(30), { budget: { 'chip-index': needed } })).scene);
  assert.equal((await failureOf(sparseMove(30), { budget: { 'chip-index': needed - 1 } })).length, 1);
});

// 근거: 이슈 #134 완료 조건 "큰 희소 격자도 기본 예산 안에서 처리한다"
test('buildFigure_default_chip_index_budget_accepts_a_huge_sparse_grid_with_moving_text', async () => {
  const { scene } = await buildFigure(sparseMove(1_000_000_000));

  assert.ok(scene.width > 0);
  assert.equal(BUDGETS['chip-index'].limit, resolveBudget()['chip-index']);
});

// 근거: 이슈 #134 완료 조건 "기존 공통 예산 방식(`--budget` 조정)으로 끝낸다"
test('main_render_with_a_small_chip_index_budget_exits_with_budget_exceeded_and_writes_no_file', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'g.dap'), sparseMove(30));

    const over = run(['render', 'g.dap', '--budget', 'chip-index=1', '--json'], folder);

    assert.equal(over.status, 1);
    assert.ok(over.stdout.trim().split('\n').some((line) => JSON.parse(line).code === 'budget-exceeded'));
    assert.equal(existsSync(join(folder, 'g.svg')), false);
    const raised = run(['render', 'g.dap', '--budget', 'chip-index=1000'], folder);
    assert.equal(raised.status, 0, raised.stderr);
    assert.ok(existsSync(join(folder, 'g.svg')));
  });
});

// 근거: 이슈 #134 완료 조건 "예산 이름 목록에 새 예산이 있고 --budget이 같은 해석으로 받는다"
test('parseBudgetPair_accepts_the_chip_index_budget', () => {
  assert.deepEqual(parseBudgetPair('chip-index=5'), { name: 'chip-index', value: 5 });
  assert.ok(parseBudgetPair('chip-index=0').error);
});

// 근거: 이슈 #134 완료 조건 "이동 글, 큰 합친 칸, 빈 영역, 여러 격자를 함께 처리하며 기존 글 상자 위치·겹침 결과를 유지한다"
test('chipCandidates_with_the_index_equal_the_linear_scan_beside_moving_text_big_merged_cells_empty_areas_and_several_grids', async () => {
  const { scene, timeline } = await buildFigure(MIXED);
  const avoid = [...chipObstacles(scene, timeline), ...chipLines(scene)];
  const index = gridOf(avoid);
  const chip = sizeChip(['move']);
  const points = scene.edges.flatMap((e) => e.points.map((p) => ({ x: p.x, y: p.y })));
  points.push(...scene.items.map((it) => ({ x: it.x + it.w / 2, y: it.y + it.h / 2 })), ...scene.groups.map((g) => ({ x: g.x + g.w / 2, y: g.y })));

  assert.ok(points.length >= 8);
  for (const point of points) {
    const linear = chipCandidates(point, chip, { scene, avoid, isWide: true });
    const indexed = chipCandidates(point, chip, { scene, avoid, isWide: true, index });

    assert.deepEqual(indexed, linear, JSON.stringify(point));
  }
});

// 근거: 이슈 #134 완료 조건 "기존 글 상자 위치·겹침 결과를 유지한다". 기대값은 기준 커밋 d050544의 색인으로 만든 계획이다(진행 비율, dx, dy, 투명도를 소수 셋째 자리까지).
test('buildFigure_moving_text_plans_beside_big_merged_cells_and_empty_areas_equal_the_plans_made_before_the_range_index', async () => {
  const { timeline } = await buildFigure(MIXED);

  const plans = timeline.segs.flatMap((seg) => seg.hops.map((hop) => hop.chipPath.map((point) => point.map((n) => Math.round(n * 1000) / 1000))));

  assert.deepEqual(plans, [
    [[0, 0, 47, 1], [0.147, 0, 0, 1], [1, 0, 0, 1]],
    [[0, 0, 47, 1], [0.038, 0, 0, 1], [1, 0, 0, 1]],
    [[0, 0, 47, 1], [0.147, 0, 0, 1], [1, 0, 0, 1]],
  ]);
});
