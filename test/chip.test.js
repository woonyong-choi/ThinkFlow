// 이동 글 상자 자리: 도형 이름, 열, 그룹 제목을 가리지 않고 판 위아래 끝에서 떨어진다(docs/design/playback.md 이동 글).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { flattenRoute } from '../src/route.js';
import { CHIP_CLEAR, CHIP_GAP, CHIP_MARGIN, placeChip, sizeChip } from '../src/chip.js';
import { CHIP_FRAME_MS, CHIP_STEP_MAX, CHIP_VISIBLE_MIN, chipStateAt, issuesOfHop, planChip } from '../src/chip-plan.js';
import { chipLines, chipObstacles } from '../src/draw/boxes.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { playerSource } from './helpers.js';

const EXAMPLES = new URL('../examples/', import.meta.url);
// 예제와 CS:APP, async 데모 사본. 글 상자가 튀거나 겹친다고 지적받은 그림이 모두 들어 있다.
// 다른 선과의 거리를 재는 시간 간격(ms)
const CHIP_NEAR_STEP_MS = 100;
const FIGURE_DIRS = [EXAMPLES, new URL('./fixtures/csapp/', import.meta.url), new URL('./fixtures/layout/', import.meta.url)];
const SCENE = { width: 600, height: 300 };
const CHIP = { w: 100, h: 23 };

// 겹친 넓이가 0.5px² 이하인 가장자리 닿음(잰 글 폭의 반올림 차이)은 겹침으로 보지 않는다.
function overlaps(a, b) {
  return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) > 0.5;
}

test('placeChip_keeps_the_chip_above_the_dot_when_nothing_is_in_the_way', () => {
  const placed = placeChip({ x: 300, y: 150 }, CHIP, { scene: SCENE, avoid: [] });

  assert.deepEqual([placed.dx, placed.dy, placed.hits], [0, 0, []]);
});

test('placeChip_moves_below_the_dot_when_a_name_is_above_it', () => {
  const name = { x: 280, y: 80, w: 40, h: 80, name: '이름' };

  const placed = placeChip({ x: 300, y: 150 }, CHIP, { scene: SCENE, avoid: [name] });

  assert.equal(placed.dy, CHIP.h + CHIP_GAP * 2);
  assert.deepEqual(placed.hits, []);
  assert.ok(!overlaps(placed.box, name));
});

test('placeChip_lifts_the_chip_just_clear_of_a_small_obstacle_instead_of_flipping', () => {
  const pill = { x: 280, y: 130, w: 40, h: 18, name: '알약' };

  const placed = placeChip({ x: 300, y: 150 }, CHIP, { scene: SCENE, avoid: [pill] });

  assert.ok(placed.dy < 0 && placed.dy >= -CHIP_GAP * 4);
  assert.deepEqual(placed.hits, []);
});

test('placeChip_slides_aside_when_both_sides_of_the_dot_are_covered', () => {
  const above = { x: 250, y: 60, w: 30, h: 80, name: '위' };
  const below = { x: 250, y: 168, w: 30, h: 80, name: '아래' };

  const placed = placeChip({ x: 300, y: 150 }, CHIP, { scene: SCENE, avoid: [above, below] });

  assert.notEqual(placed.dx, 0);
  assert.deepEqual(placed.hits, []);
});

test('placeChip_reports_the_name_it_cannot_avoid', () => {
  const wall = [{ x: 0, y: 0, w: 600, h: 300, name: '벽' }];

  assert.deepEqual(placeChip({ x: 300, y: 150 }, CHIP, { scene: SCENE, avoid: wall }).hits, ['벽']);
});

test('placeChip_keeps_a_margin_from_the_top_edge_by_going_below', () => {
  // 점 위 상자의 윗면이 7이라 판 위쪽 끝에 붙는다. 여백(CHIP_MARGIN) 이상 띄우려고 점 아래로 내린다.
  const placed = placeChip({ x: 300, y: 7 + CHIP.h + CHIP_GAP }, CHIP, { scene: SCENE, avoid: [] });

  assert.ok(placed.dy > 0);
  assert.ok(placed.box.y >= CHIP_MARGIN);
});

test('placeChip_still_reports_outside_when_no_candidate_fits_the_figure', () => {
  const placed = placeChip({ x: 300, y: 30 }, { w: 100, h: 300 }, { scene: SCENE, avoid: [] });

  assert.equal(placed.isOutside, true);
});

// cost: time O(f), heap O(f), stack O(1), io f
// vars: f = 그림 수
// basis: estimate
// 글 상자가 있는 이동을 가진 그림마다 { file, scene, hops }
async function chipFigures() {
  const figures = [];
  for (const dir of FIGURE_DIRS) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.muto'))) {
      const result = await buildFigure(readFileSync(new URL(file, dir), 'utf8'), { baseDir: 'examples' });
      const hops = result.chart ? [] : result.timeline.segs.flatMap((seg) => seg.hops).filter((h) => h.data);
      if (hops.length) figures.push({ file, scene: result.scene, hops });
    }
  }
  return figures;
}

// 60fps 프레임 하나도 빠짐없이: 보이는 글 상자가 이름, 도형, 알약을 가리지 않고, 글 상자 중심이 한 프레임에 점의 움직임보다 CHIP_STEP_MAX 넘게 더 움직이지 않는다.
test('buildFigure_every_example_and_demo_chip_never_overlaps_and_never_jumps_in_any_60fps_frame', async () => {
  let frames = 0;
  for (const { file, scene, hops } of await chipFigures()) {
    const names = chipObstacles(scene);
    for (const hop of hops) {
      const move = { route: flattenRoute(scene.edges[hop.edge].points), hop, chip: sizeChip(hop.data) };
      let before;
      for (let t = 0; t <= hop.ms; t += CHIP_FRAME_MS) {
        const { box, point, opacity } = chipStateAt(move, hop.chipPath, t);
        const hit = names.find((name) => overlaps(box, name));
        assert.ok(opacity < CHIP_VISIBLE_MIN || !hit, `${file}: ${Math.round(t)}ms에 이동 글 상자가 ${hit?.name}을 가린다`);
        const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
        if (before) {
          const extra = Math.hypot(center.x - before.center.x, center.y - before.center.y) - Math.hypot(point.x - before.point.x, point.y - before.point.y);
          assert.ok(extra <= CHIP_STEP_MAX, `${file}: ${Math.round(t)}ms에 글 상자가 한 프레임에 ${extra.toFixed(1)}px 튄다`);
        }
        before = { center, point };
        frames += 1;
      }
    }
  }
  assert.ok(frames > 1000, `잰 프레임 ${frames}개`);
});

test('buildFigure_every_example_and_demo_chip_stays_inside_the_figure_in_every_frame', async () => {
  for (const { file, scene, hops } of await chipFigures()) {
    for (const hop of hops) {
      const move = { route: flattenRoute(scene.edges[hop.edge].points), hop, chip: sizeChip(hop.data) };
      for (let t = 0; t <= hop.ms; t += CHIP_FRAME_MS) {
        const { box, opacity } = chipStateAt(move, hop.chipPath, t);
        assert.ok(opacity < CHIP_VISIBLE_MIN || (box.x >= -0.5 && box.y >= -0.5 && box.x + box.w <= scene.width + 0.5 && box.y + box.h <= scene.height + 0.5), `${file}: ${Math.round(t)}ms에 판 밖`);
      }
    }
  }
});

// 한 이동의 가짜 장면: 가로선 하나(y 150)와 가리는 사각형
const LINE_SCENE = { width: 600, height: 300, edges: [{ points: [{ x: 20, y: 150 }, { x: 580, y: 150 }] }] };
const LINE_HOP = { edge: 0, ms: 2400, isBack: false, data: ['메시지'] };

// cost: time O(f), heap O(1), stack O(1)
// vars: f = 프레임 수
// basis: estimate
// 계획을 60fps로 훑어 { 가장 큰 옮김 속도, 가장 작은 불투명도, 보이는 채로 겹친 프레임 수 }
function walkPlan(plan, blockers) {
  const move = { route: flattenRoute(LINE_SCENE.edges[0].points), hop: LINE_HOP, chip: sizeChip(LINE_HOP.data) };
  const walk = { step: 0, opacity: 1, overlaps: 0 };
  let before;
  for (let t = 0; t <= LINE_HOP.ms; t += CHIP_FRAME_MS) {
    const { box, point, opacity } = chipStateAt(move, plan.path, t);
    walk.opacity = Math.min(walk.opacity, opacity);
    if (opacity >= CHIP_VISIBLE_MIN && blockers.some((b) => overlaps(box, b))) walk.overlaps += 1;
    if (before) walk.step = Math.max(walk.step, Math.hypot(box.x - before.box.x, box.y - before.box.y) - Math.hypot(point.x - before.point.x, point.y - before.point.y));
    before = { box, point };
  }
  return walk;
}

test('planChip_slides_to_the_other_side_instead_of_jumping_when_one_side_is_blocked_midway', () => {
  // 점 위는 가운데 구간(그림 위끝까지 닿는 사각형)에서 막히고, 점 아래는 처음과 끝에서 막힌다. 한 자리로는 이동 전체를 지날 수 없다.
  const blockers = [{ x: 200, y: 0, w: 200, h: 145, name: '위' }, { x: 0, y: 160, w: 120, h: 140, name: '앞 아래' }, { x: 480, y: 160, w: 120, h: 140, name: '뒤 아래' }];

  const plan = planChip(LINE_SCENE, LINE_HOP, blockers);
  const walk = walkPlan(plan, blockers);

  assert.equal(walk.overlaps, 0);
  assert.ok(walk.step <= CHIP_STEP_MAX, `속도 ${walk.step}`);
  assert.ok(plan.path.every(([, , , opacity]) => opacity === 1), '피할 길이 있으면 흐리지 않는다');
  assert.ok(new Set(plan.path.map(([, , dy]) => Math.round(dy))).size >= 2, '위에서 아래로 자리를 바꾼다');
});

test('planChip_fades_instead_of_switching_when_every_slide_would_cover_something', () => {
  // 위, 아래, 양옆이 모두 막혀 어느 자리에서도 이 구간을 지날 수 없다.
  const blockers = [{ x: 30, y: 0, w: 570, h: 300, name: '벽' }];

  const plan = planChip(LINE_SCENE, LINE_HOP, blockers);
  const walk = walkPlan(plan, blockers);

  assert.equal(walk.overlaps, 0);
  assert.ok(walk.opacity < CHIP_VISIBLE_MIN, '막힌 구간에서 보이지 않는다');
  assert.ok(walk.step <= CHIP_STEP_MAX, `속도 ${walk.step}`);
});

test('planChip_keeps_one_position_for_the_whole_hop_when_nothing_is_in_the_way', () => {
  const plan = planChip(LINE_SCENE, LINE_HOP, []);

  // 그림 가장자리 가까이에서만 안쪽으로 밀린다.
  assert.ok(plan.path.every(([, , dy, opacity]) => dy === 0 && opacity === 1));
  assert.ok(plan.path.filter(([at]) => at > 0.1 && at < 0.9).every(([, dx]) => dx === 0));
  assert.deepEqual([plan.path[0][0], plan.path.at(-1)[0]], [0, 1]);
});

test('toHtml_and_toSvg_share_the_chip_plan_from_the_timeline', async () => {
  const result = await buildFigure(readFileSync(new URL('saturn.muto', EXAMPLES), 'utf8'), { baseDir: 'examples' });
  const hops = result.timeline.segs.flatMap((seg) => seg.hops).filter((hop) => hop.data);
  const html = await toHtml(result, 'saturn');
  const svg = await toSvg(result, { name: 'saturn' });
  const player = playerSource();

  assert.ok(hops.length > 0 && hops.every((hop) => hop.chipPath.length >= 2 && hop.chipPath.every((p) => p.length === 4)));
  for (const hop of hops) assert.ok(html.includes(`"chipPath":${JSON.stringify(hop.chipPath)}`));
  assert.doesNotMatch(player, /function placeChip/);
  assert.match(svg, /<animateTransform attributeName="transform"/);
});

test('planHops_plans_identical_hops_once_and_check_reuses_the_plan', async () => {
  const result = await buildFigure(readFileSync(new URL('./fixtures/csapp/dns-structure.muto', import.meta.url), 'utf8'), { baseDir: 'test/fixtures/csapp' });
  const hops = result.timeline.segs.flatMap((seg) => seg.hops).filter((hop) => hop.data);
  const avoid = [...chipObstacles(result.scene), ...chipLines(result.scene)];
  const sameKey = (a, b) => a.edge === b.edge && a.ms === b.ms && a.isBack === b.isBack && a.data.join('\n') === b.data.join('\n');
  const twins = hops.flatMap((a, i) => hops.slice(i + 1).filter((b) => sameKey(a, b)).map((b) => [a, b]));

  assert.ok(twins.length > 0, '같은 이동이 둘 이상인 예제여야 한다');
  for (const [a, b] of twins) assert.equal(a.chipPath, b.chipPath);
  for (const hop of hops) assert.deepEqual(issuesOfHop(result.scene, hop, avoid), planChip(result.scene, hop, avoid).issues);
});

test('placeChip_keeps_the_minimum_clearance_from_the_obstacle_it_lifts_over', () => {
  const pill = { x: 280, y: 130, w: 40, h: 18, name: '알약' };

  const { box } = placeChip({ x: 300, y: 150 }, CHIP, { scene: SCENE, avoid: [pill] });

  assert.ok(pill.y - (box.y + box.h) >= CHIP_CLEAR - 0.01, `간격 ${pill.y - (box.y + box.h)}`);
});

test('placeChip_prefers_a_spot_clear_of_a_nearby_line_and_never_reports_it_as_a_hit', () => {
  // 점 바로 위를 가로지르는 다른 선. 점 위 기본 자리는 선에 CHIP_CLEAR 안으로 들어온다.
  const line = { x: 200, y: 120, w: 400, h: 4, soft: true, edge: 9 };

  const placed = placeChip({ x: 300, y: 150 }, CHIP, { scene: SCENE, avoid: [line] });

  const padded = { x: placed.box.x - CHIP_CLEAR, y: placed.box.y - CHIP_CLEAR, w: placed.box.w + CHIP_CLEAR * 2, h: placed.box.h + CHIP_CLEAR * 2 };
  assert.ok(!overlaps(padded, line), '선에서 떨어진 자리');
  assert.deepEqual(placed.hits, []);
});

test('planChip_ignores_the_moving_edges_own_line_but_avoids_other_lines', async () => {
  const source = readFileSync(new URL('memory.muto', EXAMPLES), 'utf8');
  const { scene, timeline } = await buildFigure(source, { strict: true });
  const hop = timeline.segs.flatMap((seg) => seg.hops).find((h) => h.data);
  const own = chipLines(scene).filter((l) => l.edge === hop.edge);
  const withOwn = planChip(scene, hop, [...chipObstacles(scene), ...chipLines(scene)]);
  const withoutOwn = planChip(scene, hop, [...chipObstacles(scene), ...chipLines(scene).filter((l) => l.edge !== hop.edge)]);

  assert.ok(own.length > 0);
  assert.deepEqual(withOwn.path, withoutOwn.path);
});

test('buildFigure_examples_keep_moving_text_clear_of_other_lines_at_most_30_percent_of_the_samples', async () => {
  let near = 0;
  let samples = 0;
  for (const file of readdirSync(EXAMPLES).filter((f) => f.endsWith('.muto'))) {
    const result = await buildFigure(readFileSync(new URL(file, EXAMPLES), 'utf8'), { baseDir: 'examples', strict: true });
    if (result.chart) continue;
    const { scene, timeline } = result;
    const lines = chipLines(scene);
    for (const hop of timeline.segs.flatMap((seg) => seg.hops).filter((h) => h.data)) {
      const chip = sizeChip(hop.data);
      const route = flattenRoute(scene.edges[hop.edge].points);
      for (let t = 0; t <= hop.ms; t += CHIP_NEAR_STEP_MS) {
        const { box } = chipStateAt({ route, hop, chip }, hop.chipPath, t);
        const padded = { x: box.x - CHIP_CLEAR, y: box.y - CHIP_CLEAR, w: box.w + CHIP_CLEAR * 2, h: box.h + CHIP_CLEAR * 2 };
        samples += 1;
        if (lines.some((l) => l.edge !== hop.edge && overlaps(padded, l))) near += 1;
      }
    }
  }
  assert.ok(samples > 100);
  assert.ok(near / samples < 0.3, `선 가까이 ${near}/${samples}`);
});

test('placeChip_uses_the_narrower_edge_inset_when_the_roomy_spot_covers_a_shape_beside_the_dot', () => {
  const shape = { x: 100, y: 100, w: 90, h: 100, name: '도형' };
  const scene = { width: 300, height: 400 };

  const placed = placeChip({ x: 290, y: 160 }, CHIP, { scene, avoid: [shape] });

  assert.deepEqual(placed.hits, []);
  assert.ok(!overlaps(placed.box, shape));
  assert.ok(placed.box.x + placed.box.w <= scene.width - CHIP_CLEAR + 0.5);
});

test('buildFigure_chip_beside_shape_fixture_has_no_check_7_warning', async () => {
  const source = readFileSync(new URL('./fixtures/layout/chip-beside-shape.muto', import.meta.url), 'utf8');

  const { warnings } = await buildFigure(source, { strict: true });

  assert.deepEqual(warnings, []);
});
