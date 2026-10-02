// 이동 글 상자 자리: 도형 이름, 열, 그룹 제목을 가리지 않고 판 위아래 끝에서 떨어진다(docs/design/playback.md 이동 글).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { flattenRoute } from '../src/route.js';
import { CHIP_CLEAR, CHIP_GAP, CHIP_MARGIN, chipBoxBetween, placeChip, planChip, sizeChip } from '../src/chip.js';
import { chipLines, chipObstacles } from '../src/draw/boxes.js';
import { curveOf, progressAt, timeAt } from '../src/easing.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { playerSource } from './helpers.js';

const EXAMPLES = new URL('../examples/', import.meta.url);
const MOVE = curveOf('move');
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

test('buildFigure_example_moving_text_never_covers_a_name_between_plan_points_either', async () => {
  let checked = 0;
  for (const file of readdirSync(EXAMPLES).filter((f) => f.endsWith('.muto'))) {
    const result = await buildFigure(readFileSync(new URL(file, EXAMPLES), 'utf8'), { baseDir: 'examples', strict: true });
    if (result.chart) continue;
    const { scene, timeline } = result;
    const names = chipObstacles(scene);
    for (const hop of timeline.segs.flatMap((seg) => seg.hops).filter((h) => h.data)) {
      const chip = sizeChip(hop.data);
      const path = hop.chipPath.map(([at, dx, dy]) => ({ at, dx, dy }));
      // 움직이는 SVG와 재생기는 지점 사이를 시간에 선형으로 잇는다. 사이의 여덟 지점까지 본다.
      // 20ms보다 짧은 구간은 점 위에서 아래로 바뀌는 순간이라 건너뛴다.
      for (let k = 0; k < path.length - 1; k++) {
        if ((timeAt(MOVE, path[k + 1].at) - timeAt(MOVE, path[k].at)) * hop.ms < 20) continue;
        for (let q = 0; q <= 8; q++) {
          const { box } = chipBoxBetween({ route: flattenRoute(scene.edges[hop.edge].points), hop, chip }, [path[k], path[k + 1]], q / 8);
          const hit = names.find((name) => overlaps(box, name));
          assert.ok(!hit, `${file}: 이동 글 상자가 ${hit?.name}을 가린다 (지점 ${k} 다음 ${q}/8)`);
          assert.ok(box.x >= -0.5 && box.y >= -0.5 && box.x + box.w <= scene.width + 0.5 && box.y + box.h <= scene.height + 0.5, `${file}: 판 밖`);
        }
      }
      assert.ok(path.every((p, k) => k === 0 || p.at >= path[k - 1].at), `${file}: 진행 비율이 줄지 않는 순서`);
      checked += 1;
    }
  }
  assert.ok(checked >= 5, `글 상자가 있는 이동 ${checked}개`);
});

// 60fps 프레임 하나도 빠짐없이: 이동 시간을 프레임 간격으로 훑어 지점 사이 선형 보간 자리를 잰다. 바뀜 순간 구간도 건너뛰지 않는다.
test('buildFigure_example_moving_text_never_touches_a_name_in_any_60fps_frame', async () => {
  const FRAME_MS = 1000 / 60;
  let frames = 0;
  for (const file of readdirSync(EXAMPLES).filter((f) => f.endsWith('.muto'))) {
    const result = await buildFigure(readFileSync(new URL(file, EXAMPLES), 'utf8'), { baseDir: 'examples', strict: true });
    if (result.chart) continue;
    const { scene, timeline } = result;
    const names = chipObstacles(scene);
    for (const hop of timeline.segs.flatMap((seg) => seg.hops).filter((h) => h.data)) {
      const chip = sizeChip(hop.data);
      const route = flattenRoute(scene.edges[hop.edge].points);
      const path = hop.chipPath.map(([at, dx, dy]) => ({ at, dx, dy }));
      for (let t = 0; t <= hop.ms; t += FRAME_MS) {
        const progress = progressAt(MOVE, t / hop.ms);
        const k = Math.max(0, path.findLastIndex((p) => p.at <= progress));
        const [a, b] = [path[Math.min(k, path.length - 2)], path[Math.min(k, path.length - 2) + 1]];
        const span = timeAt(MOVE, b.at) - timeAt(MOVE, a.at);
        const ratio = span ? Math.min(1, Math.max(0, (timeAt(MOVE, progress) - timeAt(MOVE, a.at)) / span)) : 0;
        const { box } = chipBoxBetween({ route, hop, chip }, [a, b], ratio);
        const hit = names.find((name) => overlaps(box, name));
        assert.ok(!hit, `${file}: ${Math.round(t)}ms에 이동 글 상자가 ${hit?.name}을 가린다`);
        frames += 1;
      }
    }
  }
  assert.ok(frames > 100, `잰 프레임 ${frames}개`);
});

test('toHtml_and_toSvg_share_the_chip_plan_from_the_timeline', async () => {
  const result = await buildFigure(readFileSync(new URL('saturn.muto', EXAMPLES), 'utf8'), { baseDir: 'examples' });
  const hops = result.timeline.segs.flatMap((seg) => seg.hops).filter((hop) => hop.data);
  const html = await toHtml(result, 'saturn');
  const svg = await toSvg(result, { name: 'saturn' });
  const player = playerSource();

  assert.ok(hops.length > 0 && hops.every((hop) => Array.isArray(hop.chipPath) && hop.chipPath.length >= 21));
  for (const hop of hops) assert.ok(html.includes(`"chipPath":${JSON.stringify(hop.chipPath)}`));
  assert.doesNotMatch(player, /function placeChip/);
  assert.match(svg, /<animateTransform attributeName="transform"/);
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
      const path = hop.chipPath.map(([at, dx, dy]) => ({ at, dx, dy }));
      for (let k = 0; k < path.length - 1; k++) {
        const { box } = chipBoxBetween({ route, hop, chip }, [path[k], path[k + 1]], 0.5);
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
