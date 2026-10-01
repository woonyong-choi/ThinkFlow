import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildFigure } from '../src/build.js';
import { sizeNode } from '../src/measure/sizes.js';
import { toSvg } from '../src/svg.js';
import { docExamples } from './helpers.js';

test('buildFigure_doc_examples_pass_figure_check', async () => {
  for (const { file, source } of docExamples().filter(({ source }) => !source.includes('data "'))) {
    const result = await buildFigure(source, { strict: true });
    assert.ok(result, file);
  }
});

test('buildFigure_doc_data_examples_read_fixture_summary', async () => {
  // 문서 예시의 경로 "../summary.json"이 test/fixtures/summary.json을 가리키게 하는 기준 폴더다.
  const baseDir = fileURLToPath(new URL('./fixtures/charts/', import.meta.url));
  const examples = docExamples().filter(({ source }) => source.includes('data "'));

  for (const { file, source } of examples) assert.ok(await buildFigure(source, { baseDir, strict: true }), file);
  assert.ok(examples.length > 0);
});

test('layoutGraph_box_sizes_equal_measured_sizes', async () => {
  const source = 'flow right\nbox a "첫 상자" "부제"\nstore b "저장소"\na -> b "쓰기"';
  const { scene, figure } = await buildFigure(source);

  for (const it of scene.items) {
    const size = sizeNode(figure.nodes.find((n) => n.id === it.id));
    assert.deepEqual([it.w, it.h], [size.w, size.h], it.id);
  }
});

test('layoutGraph_group_direction_down_stacks_children', async () => {
  const { scene } = await buildFigure('flow right\nbox src "S"\ngroup g "G" direction=down {\n  box a "A"\n  box b "B"\n  a -> b\n}\nsrc -> a');
  const [a, b] = ['a', 'b'].map((id) => scene.items.find((it) => it.id === id));

  assert.equal(a.x + a.w / 2, b.x + b.w / 2);
  assert.ok(b.y > a.y + a.h);
});

test('layoutGraph_store_vertical_edges_end_on_cap_outline', async () => {
  const { scene } = await buildFigure('flow down\nbox a "A"\nstore s "S"\na -> s');
  const s = scene.items.find((it) => it.id === 's');

  assert.equal(scene.edges[0].points.at(-1).y, s.y - s.marginTop);
});

test('layoutGraph_person_box_is_body_width', async () => {
  const { scene } = await buildFigure('flow right\nperson u "아주 긴 사용자 이름"\nbox a "A"\nu -> a');
  const u = scene.items.find((it) => it.id === 'u');

  assert.equal(u.w, sizeNode({ shape: 'person', label: 'x' }).w);
  assert.ok(u.marginSide > 0);
});

test('layoutSequence_messages_go_down_in_order', async () => {
  const { scene } = await buildFigure('sequence\nbox a "A"\nbox b "B"\nstep "s"\n  a -> b "1"\n  b -> a "2"\n  a -> b "3"');
  const ys = scene.edges.map((e) => e.points[0].y);

  assert.deepEqual([...ys].sort((x, y) => x - y), ys);
  assert.equal(new Set(ys).size, 3);
});

test('toSvg_same_source_gives_same_bytes', async () => {
  const source = docExamples()[0].source;

  const [first, second] = [await toSvg(await buildFigure(source)), await toSvg(await buildFigure(source))];

  assert.equal(first, second);
});

test('toSvg_static_has_no_motion_and_shows_quiet_edges', async () => {
  const svg = await toSvg(await buildFigure('flow right\nbox a "A"\nbox b "B"\na -> b quiet\nstep "s"\n  a -> b'), { isStatic: true });

  assert.doesNotMatch(svg, /@keyframes|animateMotion/);
  assert.match(svg, /class="fl-edge quiet/);
});

test('readme_example_equals_rendered_asset_source', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const block = /```text\n(flow right[\s\S]*?)```/.exec(read('../README.md'))[1];

  assert.equal(block, read('../docs/assets/how-it-works.muto'));
});
