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

test('layoutGraph_two_people_and_grouped_stores_do_not_overlap', async () => {
  const sources = [
    'flow right\nperson a "사용자"\nperson b "관리자"\nbox c "시스템"\na -> c "요청"\nb -> c "설정"',
    'flow right\nbox eng "엔진"\ngroup g "저장" {\n  store a "기록"\n  store b "캐시"\n}\neng -> a\neng -> b',
  ];

  for (const source of sources) assert.ok(await buildFigure(source, { strict: true }), source);
});

test('layoutGraph_person_declared_first_stays_before_group', async () => {
  const { scene } = await buildFigure('flow right\nperson a "사용자"\ngroup g "G" {\n  box c "서버"\n}\na -> c "요청"');
  const [a, c] = ['a', 'c'].map((id) => scene.items.find((it) => it.id === id));

  assert.ok(a.x < c.x, `${a.x} >= ${c.x}`);
});

test('layoutGraph_data_chain_with_aspect_lays_out', async () => {
  const tables = [1, 2, 3, 4].map((i) => `table t${i} "t${i}" {\n  id bigint pk\n${i > 1 ? `  t${i - 1}_id bigint fk=t${i - 1}.id\n` : ''}}`).join('\n');

  const result = await buildFigure(`data right\naspect 1.6\n${tables}`);

  assert.ok(result.scene.items.length === 4);
});

test('toSvg_title_falls_back_to_file_name', async () => {
  const svg = await toSvg(await buildFigure('flow right\nbox a "A"'), { isStatic: true, name: 'context' });

  assert.match(svg, /<title>context<\/title>/);
});

test('buildFigure_state_without_start_draws_no_start_dot_or_line', async () => {
  const withStart = await buildFigure('state right\nstate a "A"\nstate b "B"\nstart a\nfinal b\na -> b "go"');
  const without = await buildFigure('state right\nstate a "A"\nstate b "B"\nfinal b\na -> b "go"');

  assert.equal(withStart.scene.edges.length, 3);
  assert.equal(without.scene.edges.length, 2);
  assert.equal(without.scene.edges.filter((e) => e.isMark).length, 1);
});

const WRAP_CHAIN = `flow right\naspect 1.6\n${Array.from({ length: 16 }, (_, i) => `box n${i} "단계 ${i}"`).join('\n')}\ngroup g "묶음" {\n  box a "가"\n  box b "나"\n  a -> b\n}\n${Array.from({ length: 15 }, (_, i) => `n${i} -> n${i + 1}`).join('\n')}\nn15 -> a`;

test('layoutGraph_group_chain_with_aspect_wraps_and_passes_strict', async () => {
  const { scene } = await buildFigure(WRAP_CHAIN, { strict: true });
  const ratio = scene.width / scene.height;

  assert.ok(ratio < 3 && ratio > 1 / 3, String(ratio));
  assert.equal(scene.groups.length, 1);
  assert.ok(new Set(scene.items.map((it) => Math.round(it.y))).size > 2, 'chain did not wrap into rows');
});

test('layoutGraph_group_chain_wrap_keeps_same_column_boxes_aligned_with_equal_gaps', async () => {
  const { scene } = await buildFigure(WRAP_CHAIN);
  const chain = scene.items.filter((it) => /^n\d+$/.test(it.id));
  const rows = new Map();
  for (const it of chain) rows.set(Math.round(it.y), [...(rows.get(Math.round(it.y)) ?? []), it.x].sort((a, b) => a - b));
  const gaps = [...rows.values()].map((xs) => xs.slice(1).map((x, i) => x - xs[i]).join());

  assert.equal(new Set([...rows.values()].map((xs) => xs[0])).size, 1, JSON.stringify([...rows.values()]));
  assert.equal(new Set(gaps).size, 1, JSON.stringify(gaps));
});

test('toSvg_group_with_aspect_same_source_gives_same_bytes', async () => {
  const first = await toSvg(await buildFigure(WRAP_CHAIN), { isStatic: true, name: 'w' });
  const second = await toSvg(await buildFigure(WRAP_CHAIN), { isStatic: true, name: 'w' });

  assert.equal(first, second);
});

test('layoutGraph_wrap_with_group_back_edges_and_labels_keeps_edge_ends', async () => {
  const source = `flow right\naspect 1.6\nbox u "사용자"\nbox a "접수"\nbox b "검증"\nbox d "통과"\nbox c "저장"\nbox e "알림"\nbox f "재시도"\nbox h "보고"\nbox s "기록"\ngroup g "처리" {\n  box g1 "가"\n  box g2 "나"\n}\nu -> a\na -> b\nb -> d\nd -> c "예"\nd -> f "아니오"\nf -> b\nc -> e\nc -> s\ne -> h\nh -> g1\ng2 -> u`;

  const result = await buildFigure(source);

  assert.equal(result.scene.edges.length, 11);});
