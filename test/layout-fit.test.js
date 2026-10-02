// 되돌아가는 선과 캔버스 맞춤: 순환에서는 거스르는 선만 되돌아가고, 한 줄이 캔버스보다 넓으면 방향을 돌려 글자 크기를 지킨다(docs/design/layout.md).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildFigure } from '../src/build.js';
import { values } from '../src/tokens.js';

const CANVAS = values.size['figure-canvas'];
const build = (name) => buildFigure(readFileSync(new URL(`./fixtures/layout/${name}.muto`, import.meta.url), 'utf8'), { strict: true });
const item = (scene, id) => scene.items.find((it) => it.id === id);
const goesUp = (e) => e.points.at(-1).y < e.points[0].y - 1;

test('layoutGraph_cycle_through_groups_sends_back_only_the_edge_declared_last_in_the_cycle', async () => {
  const { scene } = await build('event-loop');
  assert.ok(item(scene, 'caller').y < item(scene, 'queue').y, '먼저 적은 호출 코드가 위에 있다');
  const upward = scene.edges.filter(goesUp).map((e) => `${e.from} -> ${e.to}`).sort();
  assert.deepEqual(upward, ['os -> queue', 'result -> caller']);
});

test('layoutGraph_flow_right_wider_than_the_canvas_turns_down_instead_of_shrinking_the_text', async () => {
  const { scene, warnings } = await build('event-loop-right');
  assert.ok(scene.width <= CANVAS, `폭 ${scene.width}`);
  assert.deepEqual(warnings, []);
  assert.ok(item(scene, 'caller').y < item(scene, 'result').y, '위에서 아래로 흐른다');
});

test('layoutGraph_state_cycle_that_does_not_fit_turns_down_and_keeps_the_return_edge_short', async () => {
  const { scene, warnings } = await build('task-lifecycle');
  assert.ok(scene.width <= CANVAS);
  assert.deepEqual(warnings, []);
  const back = scene.edges.find((e) => e.from === 'awaiting' && e.to === 'running');
  const span = Math.abs(item(scene, 'awaiting').y - item(scene, 'running').y);
  const length = back.points.slice(1).reduce((sum, p, i) => sum + Math.abs(p.x - back.points[i].x) + Math.abs(p.y - back.points[i].y), 0);
  assert.ok(length < span + CANVAS / 4, `되돌아가는 선 길이 ${length}`);
});

test('layoutGraph_explicit_aspect_keeps_the_declared_direction_even_when_wider_than_the_canvas', async () => {
  const source = readFileSync(new URL('./fixtures/layout/event-loop-right.muto', import.meta.url), 'utf8').replace('flow right', 'flow right\naspect 1.6');
  const { scene } = await buildFigure(source);
  assert.ok(scene.width > CANVAS, `폭 ${scene.width}`);
});

test('layoutGraph_figure_that_fits_keeps_the_declared_direction', async () => {
  const { scene } = await buildFigure(readFileSync(new URL('../examples/memory.muto', import.meta.url), 'utf8'), { strict: true });
  assert.ok(item(scene, 'user').x < item(scene, 'answer').x, 'flow right 그대로');
});

test('layoutGraph_auto_fit_picks_a_ratio_inside_the_fit_range_for_every_fixture_that_needed_fitting', async () => {
  const min = 1 / values.scale['aspect-max'];
  const max = values.scale['aspect-fit-max'];
  for (const name of ['event-loop', 'event-loop-right', 'task-lifecycle']) {
    const { scene } = await build(name);
    const ratio = scene.width / scene.height;
    assert.ok(ratio >= min && ratio <= max, `${name} 비율 ${ratio.toFixed(2)}`);
  }
});

test('layoutGraph_fit_range_wide_limit_is_the_desktop_screen_ratio', () => {
  assert.equal(values.scale['aspect-fit-max'], values.scale['fold-aspect']);
  assert.ok(values.scale['aspect-fit-max'] >= 1400 / 900 && values.scale['aspect-fit-max'] < values.scale['aspect-max']);
});
