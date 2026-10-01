import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { build } from '../src/cli.js';
import { closeD2 } from '../src/d2.js';
import { toHtml } from '../src/html.js';
import { straighten } from '../src/route.js';
import { DWELL, measurePill } from '../src/scene.js';
import { toAnimatedSvg } from '../src/svg.js';

after(closeD2);

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
const hasD2 = (() => {
  try {
    execFileSync('d2', ['--version']);
    return true;
  } catch {
    return false;
  }
})();

const findItem = (scene, id) => scene.items.find((it) => it.id === id);

test('build_reverse_hop_in_container_runs_edge_backward', async () => {
  const { scene, tl } = await build('s: { a; b; a -> b }\n#@ step x\n#@ b -> a');

  const hop = tl.segs[0].hops[0];

  assert.equal(scene.edges[hop.edge].id, 's.(a -> b)[0]');
  assert.equal(hop.isBack, true);
});

test('build_indexed_hop_picks_second_edge', async () => {
  const { scene, tl } = await build('s: { a }\nc\nc -> s.a\nc -> s.a\n#@ step x\n#@ c -> a[1]');

  assert.equal(scene.edges[tl.segs[0].hops[0].edge].id, '(c -> s.a)[1]');
});

test('build_container_becomes_frame', async () => {
  const { scene } = await build('s: { a }\n#@ step x\n#@ light a');

  assert.equal(findItem(scene, 's').kind, 'frame');
});

test('buildTimeline_same_step_keeps_lit_edges_and_card', async () => {
  const { scene, tl } = await build('a -> b -> c\n#@ step x: 처음\n#@ a -> b\n#@ show b [new] 하나 (✓)\n#@ b -> c : 다음\n#@ step y\n#@ wait 100');
  const b = scene.items.findIndex((it) => it.id === 'b');

  const [first, second, nextStep] = tl.segs;

  assert.deepEqual(scene.items[b].cards, [[{ tag: 'new', mark: '✓', text: '하나' }]]);
  assert.equal(first.caption, '처음');
  assert.equal(second.caption, '다음');
  assert.equal(second.edgesOn.length, 2);
  assert.equal(second.cards[b], 0);
  assert.deepEqual(nextStep.edgesOn, []);
  assert.equal(nextStep.cards[b], undefined);
});

test('buildTimeline_caption_change_dwells_by_length', async () => {
  const say = '가'.repeat(40);

  const { tl } = await build(`a -> b\n#@ speed 1000\n#@ step s\n#@ a -> b\n#@ b -> a : ${say}`);

  const [plain, said] = tl.segs;
  assert.equal(plain.t1 - plain.t0, 1000 + DWELL.base);
  assert.equal(said.t1 - said.t0, 1000 + 40 * DWELL.perChar + DWELL.stepEnd);
});

test('layoutScene_d2_features_map_to_kinds', async () => {
  const source = 't: {shape: sql_table; id: int {constraint: primary_key}}\nu: {shape: sql_table; tid: int}\nu.tid -> t.id\nm: |md\n  # 제목\n|\ng: {grid-rows: 1; x; y}\n#@ step s\n#@ u.tid -> t.id';

  const { scene } = await build(source);

  assert.equal(findItem(scene, 't').kind, 'table');
  assert.equal(findItem(scene, 'm').kind, 'markdown');
  assert.equal(findItem(scene, 'g').kind, 'frame');
});

test('layoutScene_sequence_diagram_keeps_lifelines', async () => {
  const { scene } = await build('shape: sequence_diagram\na; b\na -> b: 요청\n#@ step s\n#@ a -> b');

  assert.ok(scene.edges.some((e) => e.isLifeline));
});

test('buildSizeOverrides_explicit_width_is_kept', async () => {
  const inline = await build('a: {width: 300}\na -> b\n#@ step s\n#@ a -> b');
  const block = await build('s: {\n  a: {\n    width: 300\n  }\n  b\n  a -> b: x {style.font-size: 9}\n}\nc -> s.b: y\n#@ step t\n#@ c -> b');

  assert.equal(findItem(inline.scene, 'a').w, 300);
  assert.equal(findItem(block.scene, 's.a').w, 300);
  assert.notEqual(findItem(block.scene, 's.b').w, 300);
});

test('layoutScene_resized_node_edge_touches_border', async () => {
  const { scene } = await build('direction: down\na: "첫 줄\\n둘째 줄\\n셋째 줄"\nb\na -> b\n#@ step s\n#@ a -> b');
  const a = findItem(scene, 'a');
  const b = findItem(scene, 'b');

  const nums = scene.edges[0].d.match(/-?\d+(\.\d+)?/g).map(Number);

  const [sx, sy, ex, ey] = [nums[0], nums[1], nums.at(-2), nums.at(-1)];
  assert.ok(sx >= a.x && sx <= a.x + a.w);
  assert.equal(sy, a.y + a.h);
  assert.ok(ex >= b.x && ex <= b.x + b.w);
  assert.equal(ey, b.y);
});

test('layoutScene_many_edges_from_one_side_end_on_node', async () => {
  const source = readFileSync(new URL('../examples/bigtech/google-search.d2', import.meta.url), 'utf8');
  const { scene } = await build(source);
  const rects = Object.fromEntries(scene.items.map((it) => [it.id, it]));
  const isOn = (r, x, y) => r.x <= x && x <= r.x + r.w && r.y <= y && y <= r.y + r.h;

  const ends = scene.edges.flatMap((e) => {
    const nums = e.d.match(/-?\d+(\.\d+)?/g).map(Number);
    return [
      [e.src, nums[0], nums[1]],
      [e.dst, nums.at(-2), nums.at(-1)],
    ];
  });

  for (const [id, x, y] of ends) assert.ok(isOn(rects[id], x, y), `${id} end (${x}, ${y}) is off the node`);
});

test('layoutScene_curve_mode_joins_route_ends_with_one_curve', async () => {
  const { scene } = await build('direction: right\na\nb\nc\na -> b\na -> c\n#@ edges curve');
  const a = findItem(scene, 'a');

  const curves = scene.edges.map((e) => e.d);

  for (const d of curves) {
    assert.match(d, /^M [-\d.]+ [-\d.]+ C [^MLQC]+$/);
    const [x, y] = d.match(/-?\d+(\.\d+)?/g).map(Number);
    assert.equal(x, a.x + a.w);
    assert.ok(a.y <= y && y <= a.y + a.h);
  }
});

test('layoutScene_short_step_is_flattened_by_moving_end', async () => {
  const source = readFileSync(new URL('../examples/bigtech/google-search.d2', import.meta.url), 'utf8');
  const { scene } = await build(source);

  const edge = scene.edges.find((e) => e.id === '(crawl.indexer -> index.leaf2)[0]');

  assert.match(edge.d, /^M [-\d.]+ [-\d.]+ L [-\d.]+ [-\d.]+$/);
});

test('layoutScene_close_edge_labels_do_not_overlap', async () => {
  const source = readFileSync(new URL('../examples/saturn.d2', import.meta.url), 'utf8');
  const { scene } = await build(source);
  const boxes = scene.edges.filter((e) => e.label).map((e) => ({ ...e.mid, ...measurePill(e.label) }));

  const overlapping = boxes.filter((a, i) => boxes.some((b, k) => k !== i && Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h));

  assert.deepEqual(overlapping, []);
});

test('straighten_jog_that_crowds_other_edge_is_kept', () => {
  const route = [{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 60 }, { x: 100, y: 60 }];
  const other = [{ x: 0, y: 62 }, { x: 100, y: 62 }];
  const isFree = (pts) => !pts.some((p, i) => i > 0 && p.y === pts[i - 1].y && Math.abs(p.y - other[0].y) < 5);

  const pts = straighten(route, isFree);

  assert.equal(pts.length, 5);
});

test('build_quiet_edge_is_marked_and_rendered_hidden_class', async () => {
  const { scene } = await build('a -> b\na -> c\n#@ quiet a -> c\n#@ step s\n#@ a -> b');

  const quiet = scene.edges.filter((e) => e.isQuiet).map((e) => e.id);

  assert.deepEqual(quiet, ['(a -> c)[0]']);
  assert.match(toHtml({ title: 't', scene, tl: { segs: [], total: 0, steps: [] } }), /class="fl-edge quiet"/);
});

test('layoutScene_sequence_messages_stay_below_participants', async () => {
  const { scene } = await build('shape: sequence_diagram\na\nb\na -> b: 하나\nb -> a: 둘\na -> b: 셋');
  const a = findItem(scene, 'a');

  const ys = scene.edges.filter((e) => !e.isLifeline).map((e) => Number(e.d.match(/-?\d+(\.\d+)?/g)[1]));

  for (const y of ys) assert.ok(y > a.y + a.h, `message y ${y} is not below the participant`);
  assert.equal(new Set(ys).size, ys.length);
});

test('layoutScene_person_line_leaves_body_and_enters_box_center', async () => {
  const { scene } = await build('direction: right\nu: 사용자 {shape: person}\nf: { g: "GFE\\n가까운 곳"; w: 웹; g -> w }\nu -> f.g');
  const [u, g, w] = ['u', 'f.g', 'f.w'].map((id) => findItem(scene, id));
  const ends = (id) => scene.edges.find((e) => e.id.includes(id)).d.match(/-?\d+(\.\d+)?/g).map(Number);

  const [, startY, , , ...rest] = ends('u -> f.g');
  const endY = rest.at(-1);
  const inner = ends('g -> w');

  assert.ok(startY >= u.y + u.h * 0.7, `start ${startY} is above the body`);
  assert.equal(endY, g.y + g.h / 2);
  assert.equal(inner[1], Math.max(g.y, w.y) / 2 + Math.min(g.y + g.h, w.y + w.h) / 2);
});

test('buildTimeline_card_changes_when_dot_arrives', async () => {
  const { tl } = await build('a -> b\n#@ step s\n#@ a -> b +2s\n#@ show b 도착');

  const seg = tl.segs[0];

  assert.equal(seg.cardsAt, 2000);
  assert.deepEqual(seg.cardsBefore, {});
  assert.equal(Object.keys(seg.cards).length, 1);
});

test('buildTimeline_source_card_changes_at_beat_start', async () => {
  const { scene, tl } = await build('a -> b\n#@ step s\n#@ a -> b\n#@ show a 출발\n#@ show b 도착');
  const [a, b] = ['a', 'b'].map((id) => scene.items.findIndex((it) => it.id === id));

  const seg = tl.segs[0];

  assert.equal(seg.cardsBefore[a], 0);
  assert.equal(seg.cardsBefore[b], undefined);
});

test('straighten_short_jog_is_removed', () => {
  const pts = straighten([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 6 }, { x: 100, y: 6 }, { x: 100, y: 50 }, { x: 150, y: 50 }]);

  assert.deepEqual(pts, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 150, y: 50 }]);
});

test('straighten_jog_before_end_keeps_end_point', () => {
  const pts = straighten([{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 56 }, { x: 100, y: 56 }]);

  assert.deepEqual(pts, [{ x: 0, y: 0 }, { x: 0, y: 56 }, { x: 100, y: 56 }]);
});

test('toHtml_and_toAnimatedSvg_include_player_and_motion', async () => {
  const { scene, tl } = await build('a -> b: 요청\n#@ step "보내기"\n#@ a -> b "글"');

  const html = toHtml({ title: 't', scene, tl });
  const svg = toAnimatedSvg(scene, tl);

  assert.match(html, /d2flowPlay/);
  assert.match(svg, /<animateMotion[^>]*keyPoints="0;0;1;1"/);
  assert.match(svg, /<mpath href="#p-0"/);
});

test('build_missing_edge_throws_with_line', async () => {
  await assert.rejects(build('a\nb\n#@ step x\n#@ a -> b'), /4번째 줄: `a`와 `b` 사이에 선이 없다/);
});

test('build_ambiguous_name_throws', async () => {
  await assert.rejects(build('x: { n }\ny: { n }\nx.n -> y.n\n#@ step s\n#@ n -> y.n'), /여럿이다/);
});

test('d2_cli_source_with_directives_compiles', { skip: !hasD2 && 'd2 명령 없음' }, () => {
  const folder = mkdtempSync(join(tmpdir(), 'd2-flow-test-'));
  try {
    const input = join(folder, 'a.d2');
    writeFileSync(input, 'a -> b: 요청\n#@ step "보내기": 설명\n#@ a -> b "글" & b <- a\n#@ show b [tag/green] 줄 · 덧붙임 (✓)\n');

    execFileSync('d2', [input, join(folder, 'a.svg')], { stdio: 'ignore' });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
