// 이동 글 상자 자리: 도형 이름, 열, 그룹 제목, 알약을 가리지 않고 그림 안에서 한 프레임에 튀지 않는다(docs/design/playback.md 이동 글).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { curveOf, progressAt } from '../src/easing.js';
import { flattenRoute } from '../src/route.js';
import { values } from '../src/tokens.js';
import { CHIP_CLEAR, CHIP_GAP, CHIP_MARGIN, placeChip, sizeChip } from '../src/chip.js';
import { CHIP_FRAME_MS, CHIP_STEP_MAX, CHIP_VISIBLE_MIN, chipStateAt, planChip } from '../src/chip-plan.js';
import { visibleShare } from '../src/chip-motion.js';
import { chipObstacles } from '../src/draw/boxes.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';

const EXAMPLES = new URL('../examples/', import.meta.url);
// 예제와 CS:APP, async 데모 사본. 글 상자가 튀거나 겹친다고 지적받은 그림이 모두 들어 있다.
const FIGURE_DIRS = [EXAMPLES, new URL('./fixtures/csapp/', import.meta.url), new URL('./fixtures/layout/', import.meta.url), new URL('./fixtures/chip-reach/', import.meta.url)];
// 그림 옆 경계에 가까운 선에서 출발하는 이동 글: 글 상자가 판 밖으로 나가려는 원본
const EDGE_SOURCES = [
  'flow right\nbox a "A"\nbox b "B"\nbox c "C"\nbox d "D"\na -> b\nb -> c\nc -> d\nstep "보내기"\n  a -> b "왼쪽 끝에서 출발"',
  'flow down\nbox a "A"\nbox b "B"\nbox c "C"\nbox d "D"\nbox e "E"\na -> b\na -> c\na -> d\na -> e\nstep "보내기"\n  a -> b "왼쪽 아래 도형으로 가는 두 줄짜리 이동 글은 옆으로 밀린다"',
];
const SCENE = { width: 600, height: 300 };
const CHIP = { w: 100, h: 23 };

// 겹친 넓이가 0.5px² 이하인 가장자리 닿음(잰 글 폭의 반올림 차이)은 겹침으로 보지 않는다.
function overlaps(a, b) {
  return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) > 0.5;
}

const NAME = { x: 280, y: 80, w: 40, h: 80, name: '이름' };
const PILL = { x: 280, y: 130, w: 40, h: 18, name: '알약' };
const NEAR_LINE = { x: 200, y: 120, w: 400, h: 4, soft: true, edge: 9 };
const SHAPE = { x: 100, y: 100, w: 90, h: 100, name: '도형' };

const PLACEMENTS = [
  { name: '막는 것이 없으면 점 위에 둔다', dot: { x: 300, y: 150 }, avoid: [], expect: (placed) => assert.deepEqual([placed.dx, placed.dy, placed.hits], [0, 0, []]) },
  {
    name: '점 위가 도형 이름에 막히면 점 아래로 간다',
    dot: { x: 300, y: 150 },
    avoid: [NAME],
    expect: (placed) => {
      assert.equal(placed.dy, CHIP.h + CHIP_GAP * 2);
      assert.deepEqual(placed.hits, []);
      assert.ok(!overlaps(placed.box, NAME));
    },
  },
  {
    name: '작은 알약은 뒤집지 않고 최소 간격만큼만 들어 올려 비킨다',
    dot: { x: 300, y: 150 },
    avoid: [PILL],
    expect: (placed) => {
      assert.ok(placed.dy < 0 && placed.dy >= -CHIP_GAP * 4);
      assert.deepEqual(placed.hits, []);
      assert.ok(PILL.y - (placed.box.y + placed.box.h) >= CHIP_CLEAR - 0.01, `간격 ${PILL.y - (placed.box.y + placed.box.h)}`);
    },
  },
  {
    name: '점 위아래가 모두 막히면 옆으로 비킨다',
    dot: { x: 300, y: 150 },
    avoid: [{ x: 250, y: 60, w: 30, h: 80, name: '위' }, { x: 250, y: 168, w: 30, h: 80, name: '아래' }],
    expect: (placed) => {
      assert.notEqual(placed.dx, 0);
      assert.deepEqual(placed.hits, []);
    },
  },
  { name: '피할 수 없는 이름은 hits로 알린다', dot: { x: 300, y: 150 }, avoid: [{ x: 0, y: 0, w: 600, h: 300, name: '벽' }], expect: (placed) => assert.deepEqual(placed.hits, ['벽']) },
  {
    name: '판 위쪽 끝에 붙으면 여백을 두려고 점 아래로 내린다',
    dot: { x: 300, y: 7 + CHIP.h + CHIP_GAP },
    avoid: [],
    expect: (placed) => {
      assert.ok(placed.dy > 0);
      assert.ok(placed.box.y >= CHIP_MARGIN);
    },
  },
  { name: '들어갈 자리가 없으면 판 밖이라고 알린다', dot: { x: 300, y: 30 }, chip: { w: 100, h: 300 }, avoid: [], expect: (placed) => assert.equal(placed.isOutside, true) },
  {
    name: '가까운 다른 선에서 떨어진 자리를 고르고 그 선을 hit로 세지 않는다',
    dot: { x: 300, y: 150 },
    avoid: [NEAR_LINE],
    expect: (placed) => {
      const padded = { x: placed.box.x - CHIP_CLEAR, y: placed.box.y - CHIP_CLEAR, w: placed.box.w + CHIP_CLEAR * 2, h: placed.box.h + CHIP_CLEAR * 2 };
      assert.ok(!overlaps(padded, NEAR_LINE), '선에서 떨어진 자리');
      assert.deepEqual(placed.hits, []);
    },
  },
  {
    name: '넓은 자리가 점 옆 도형을 가리면 더 좁은 가장자리 여백을 쓴다',
    dot: { x: 290, y: 160 },
    scene: { width: 300, height: 400 },
    avoid: [SHAPE],
    expect: (placed, scene) => {
      assert.deepEqual(placed.hits, []);
      assert.ok(!overlaps(placed.box, SHAPE));
      assert.ok(placed.box.x + placed.box.w <= scene.width - CHIP_CLEAR + 0.5);
    },
  },
];

// 근거: 설계 playback.md 요구사항 "이동 글 상자가 ... 도형 이름, 열, 그룹 제목, 알약을 가리지 않고 그림 안에 있다"(자리 고르기)
test('placeChip_places_the_chip_clear_of_obstacles_or_reports_what_it_cannot_avoid', () => {
  for (const { name, dot, chip = CHIP, scene = SCENE, avoid, expect } of PLACEMENTS) {
    const placed = placeChip(dot, chip, { scene, avoid });

    try {
      expect(placed, scene);
    } catch (error) {
      error.message = `${name}: ${error.message}`;
      throw error;
    }
  }
});

// cost: time O(f), heap O(f), stack O(1), io f
// vars: f = 그림 수
// basis: estimate
// 글 상자가 있는 이동을 가진 그림마다 { file, scene, hops }
async function chipFigures() {
  const sources = FIGURE_DIRS.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.muto')).map((file) => ({ file, source: readFileSync(new URL(file, dir), 'utf8') })));
  const figures = [];
  for (const { file, source } of [...sources, ...EDGE_SOURCES.map((source, i) => ({ file: `edge-${i}`, source }))]) {
    const result = await buildFigure(source, { baseDir: 'examples' });
    const hops = result.chart ? [] : result.timeline.segs.flatMap((seg) => seg.hops).filter((h) => h.data);
    if (hops.length) figures.push({ file, scene: result.scene, hops, tracks: result.timeline.tracks ?? [] });
  }
  return figures;
}

// cost: time O(g), heap O(1), stack O(1)
// vars: g = 도형 안을 지나는 구간 수
// basis: estimate
// 흐름의 점이 도형 안을 지나는(보이지 않는) 중인지. t는 이동 시작 뒤 ms다.
function isInside(hop, t) {
  const progress = progressAt(curveOf('move'), Math.min(1, t / hop.ms));
  return hop.gaps.some(([from, to]) => progress > from && progress < to);
}

// 근거: 설계 playback.md 요구사항 "60fps 프레임마다 보이는 동안 이름, 열, 그룹 제목, 알약을 가리지 않고 그림 안에 있다. 한 프레임에 CHIP_STEP_MAX 넘게 더 움직이지 않는다". 버그 #20, #4 증상 3
test('buildFigure_every_example_and_demo_chip_stays_inside_clear_and_never_jumps_in_any_60fps_frame', async () => {
  let frames = 0;
  const counts = new Map();
  for (const { file, scene, hops, tracks } of await chipFigures()) {
    const names = chipObstacles(scene);
    for (const hop of hops) {
      const move = { route: hop.track === undefined ? flattenRoute(scene.edges[hop.edge].points) : tracks[hop.track].route, hop, chip: sizeChip(hop.data) };
      let before;
      for (let t = 0; t <= hop.ms; t += CHIP_FRAME_MS) {
        const { box, point, opacity } = chipStateAt(move, hop.chipPath, t);
        const isVisible = opacity >= CHIP_VISIBLE_MIN;
        const hit = names.find((name) => overlaps(box, name));
        if (hop.track !== undefined && !isInside(hop, t)) {
          const gap = Math.hypot(Math.max(box.x - point.x, 0, point.x - box.x - box.w), Math.max(box.y - point.y, 0, point.y - box.y - box.h));
          assert.ok(gap <= values.size.packet['chip-reach'] + 0.5, `${file}: ${Math.round(t)}ms에 흐름 글 상자가 점에서 ${gap.toFixed(1)}px 떨어진다`);
        }
        if (hop.track === undefined) {
          // 박자 이동은 깨끗한 자리만으로 6할을 못 채울 때만 도형 이름을 가린다. 선 라벨 알약은 어떤 경우에도 가리지 않는다.
          const pill = names.find((name) => name.isPill && overlaps(box, name));
          assert.ok(!isVisible || !pill, `${file}: ${Math.round(t)}ms에 이동 글 상자가 알약 ${pill?.name}을 가린다`);
          const count = counts.get(hop) ?? { seen: 0, clean: 0, hit: 0 };
          counts.set(hop, { seen: count.seen + 1, clean: count.clean + Number(isVisible && !hit), hit: count.hit + Number(isVisible && Boolean(hit)) });
        } else assert.ok(!isVisible || !hit, `${file}: ${Math.round(t)}ms에 이동 글 상자가 ${hit?.name}을 가린다`);
        assert.ok(!isVisible || (box.x >= -0.5 && box.y >= -0.5 && box.x + box.w <= scene.width + 0.5 && box.y + box.h <= scene.height + 0.5), `${file}: ${Math.round(t)}ms에 판 밖`);
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
  for (const { seen, clean, hit } of counts.values()) assert.ok(hit === 0 || clean / seen < 0.6, '가리는 자리는 깨끗한 자리만으로 6할을 못 채울 때만 쓴다');
});

// 근거: 사용자 결정 "박자 이동의 글 상자는 점이 보이는 시간의 6할 이상 보인다"(글이 정보라서 이동 내내 숨기지 않는다). 흐름은 점 색이 흐름을 구분해 제외
test('buildFigure_every_beat_move_in_the_examples_and_demos_shows_its_chip_for_at_least_60_percent', async () => {
  let beats = 0;
  for (const { file, scene, hops } of await chipFigures()) {
    for (const hop of hops.filter((h) => h.track === undefined)) {
      const share = visibleShare({ route: flattenRoute(scene.edges[hop.edge].points), hop, chip: sizeChip(hop.data) }, hop.chipPath);

      assert.ok(share >= 0.6, `${file}: "${hop.data.join(' ')}"의 글 상자가 ${Math.round(share * 100)}%만 보인다`);
      beats += 1;
    }
  }
  assert.ok(beats > 50, `잰 이동 ${beats}개`);
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

// 근거: 설계 playback.md 요구사항 "미끄러질 수 있으면 흐리지 않는다". 버그 #20 "자리 바꿀 때 튐"
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

// 근거: 설계 playback.md 요구사항 "길이 없으면 바꾸지 않고 흐린다". 버그 #20
test('planChip_fades_instead_of_switching_when_every_slide_would_cover_something', () => {
  // 위, 아래, 양옆이 모두 선 라벨 알약에 막혀 어느 자리에서도 이 구간을 지날 수 없다.
  const blockers = [{ x: 30, y: 0, w: 570, h: 300, name: '벽', isPill: true }];

  const plan = planChip(LINE_SCENE, LINE_HOP, blockers);
  const walk = walkPlan(plan, blockers);

  assert.equal(walk.overlaps, 0);
  assert.ok(walk.opacity < CHIP_VISIBLE_MIN, '막힌 구간에서 보이지 않는다');
  assert.ok(walk.step <= CHIP_STEP_MAX, `속도 ${walk.step}`);
});

// 근거: 사용자 결정 "글 상자는 이동 구간의 대부분에서 보인다. 붙임 거리 안에서 못 찾으면 점 옆에 둔다"(선 라벨 알약은 가리지 않는다). 반대 사례: 알약이 막으면 숨는다(위 시험)
test('planChip_shows_the_chip_over_a_shape_name_when_no_clean_place_is_within_reach_but_never_over_a_pill', () => {
  const wall = [{ x: 30, y: 0, w: 570, h: 300, name: '벽' }];
  const move = { route: flattenRoute(LINE_SCENE.edges[0].points), hop: LINE_HOP, chip: sizeChip(LINE_HOP.data) };

  const plan = planChip(LINE_SCENE, LINE_HOP, wall);

  assert.ok(visibleShare(move, plan.path) >= 0.6, `보이는 비율 ${visibleShare(move, plan.path)}`);
  assert.ok(visibleShare(move, planChip(LINE_SCENE, LINE_HOP, [{ ...wall[0], isPill: true }]).path) < 0.6);
});

// 근거: 설계 playback.md 요구사항 "이동 글 상자가 ... 바꾸지 않고": 막는 것이 없으면 한 자리에 머문다
test('planChip_keeps_one_position_for_the_whole_hop_when_nothing_is_in_the_way', () => {
  const plan = planChip(LINE_SCENE, LINE_HOP, []);

  // 그림 가장자리 가까이에서만 안쪽으로 밀린다.
  assert.ok(plan.path.every(([, , dy, opacity]) => dy === 0 && opacity === 1));
  assert.ok(plan.path.filter(([at]) => at > 0.1 && at < 0.9).every(([, dx]) => dx === 0));
  assert.deepEqual([plan.path[0][0], plan.path.at(-1)[0]], [0, 1]);
});

// 근거: 설계 playback.md 요구사항 "SVG와 재생기가 같은 계획을 쓴다"
test('toHtml_and_toSvg_share_the_chip_plan_from_the_timeline', async () => {
  const result = await buildFigure(readFileSync(new URL('saturn.muto', EXAMPLES), 'utf8'), { baseDir: 'examples' });
  const hops = result.timeline.segs.flatMap((seg) => seg.hops).filter((hop) => hop.data);
  const html = await toHtml(result, 'saturn');
  const svg = await toSvg(result, { name: 'saturn' });

  assert.ok(hops.length > 0 && hops.every((hop) => hop.chipPath.length >= 2 && hop.chipPath.every((p) => p.length === 4)));
  for (const hop of hops) assert.ok(html.includes(`"chipPath":${JSON.stringify(hop.chipPath)}`));
  assert.match(svg, /<animateTransform attributeName="transform"/);
});

// 근거: 버그 #4 증상 3과 #20: 도형 옆을 지나는 이동 글이 check 7 경고 없이 그려진다
test('buildFigure_chip_beside_shape_fixture_has_no_check_7_warning', async () => {
  const source = readFileSync(new URL('./fixtures/layout/chip-beside-shape.muto', import.meta.url), 'utf8');

  const { warnings } = await buildFigure(source, { strict: true });

  assert.deepEqual(warnings, []);
});
