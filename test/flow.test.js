import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FlowError, parseFlow, parseRow } from '../src/flow.js';

test('parseFlow_d2_lines_reads_only_directives', () => {
  const source = 'a -> b: 요청\n#@ speed 2s\n#@ step "보내기": 요청을 보낸다\n#@   a -> b "hi" & b <- c\n';

  const flow = parseFlow(source);

  assert.equal(flow.speed, 2000);
  assert.equal(flow.steps[0].label, '보내기');
  assert.equal(flow.steps[0].caption, '요청을 보낸다');
  assert.deepEqual(flow.steps[0].beats[0].hops, [
    { from: 'a', to: 'b', index: undefined, data: 'hi' },
    { from: 'c', to: 'b', index: undefined, data: undefined },
  ]);
});

test('parseFlow_pause_lines_read_say_wait_light', () => {
  const source = '#@ step s\n#@ say 잠깐\n#@ wait 300ms : 쉰다\n#@ light a b : 둘을 본다';

  const [say, wait, light] = parseFlow(source).steps[0].beats;

  assert.equal(say.say, '잠깐');
  assert.equal(wait.ms, 300);
  assert.equal(wait.say, '쉰다');
  assert.deepEqual(light.light, ['a', 'b']);
  assert.equal(light.say, '둘을 본다');
});

test('parseFlow_indexed_hop_reads_edge_index_and_quoted_colon', () => {
  const [beat] = parseFlow('#@ step s\n#@ a -> b[1] : "따옴표: 안의 콜론"').steps[0].beats;

  assert.equal(beat.hops[0].index, 1);
  assert.equal(beat.say, '따옴표: 안의 콜론');
});

test('parseFlow_plus_time_sets_beat_ms', () => {
  const [beat] = parseFlow('#@ step s\n#@ a -> b +2s').steps[0].beats;

  assert.equal(beat.ms, 2000);
});

test('parseFlow_edges_directive_sets_edge_mode', () => {
  const flow = parseFlow('#@ edges curve');

  assert.equal(flow.edges, 'curve');
});

test('parseFlow_show_before_any_beat_creates_pause_beat', () => {
  const [beat] = parseFlow('#@ step s\n#@ show a 첫 줄\n#@ show a 둘째 줄').steps[0].beats;

  assert.deepEqual(beat.hops, []);
  assert.deepEqual(
    beat.show.a.rows.map((r) => r.text),
    ['첫 줄', '둘째 줄'],
  );
});

test('parseRow_full_row_reads_tag_tone_meta_mark', () => {
  const row = parseRow('[world/purple] Alice joined · Mar 2026 (new)');

  assert.deepEqual(row, { tag: 'world', tone: 'purple', text: 'Alice joined', meta: 'Mar 2026', mark: 'new' });
});

test('parseRow_backquoted_text_with_dot_is_one_mono_text', () => {
  const row = parseRow('`alice · google`');

  assert.deepEqual(row, { text: 'alice · google', isMono: true });
});

test('parseRow_long_parenthesis_stays_in_text', () => {
  const row = parseRow('설명 (아홉 글자가 넘는 괄호)');

  assert.equal(row.mark, undefined);
  assert.equal(row.text, '설명 (아홉 글자가 넘는 괄호)');
});

test('parseFlow_beat_before_step_throws_with_line', () => {
  assert.throws(() => parseFlow('x\n#@ a -> b'), (e) => e instanceof FlowError && e.line === 2);
});

test('parseFlow_hop_without_arrow_throws_with_line', () => {
  assert.throws(() => parseFlow('#@ step s\n#@ a b'), /2번째 줄/);
});

test('parseFlow_unquoted_data_throws', () => {
  assert.throws(() => parseFlow('#@ step s\n#@ a -> b data'), /따옴표/);
});

test('parseFlow_unclosed_quote_throws', () => {
  assert.throws(() => parseFlow('#@ step s\n#@ a -> b "열림'), /따옴표가 닫히지/);
});

test('parseFlow_quiet_reads_all_or_listed_hops', () => {
  const listed = parseFlow('#@ quiet a -> b & c -> d[1]');
  const all = parseFlow('#@ quiet');

  assert.deepEqual(
    listed.quiet.hops.map((h) => [h.from, h.to, h.index]),
    [
      ['a', 'b', undefined],
      ['c', 'd', 1],
    ],
  );
  assert.equal(all.quiet.isAll, true);
});

test('parseRow_graph_reads_nodes_edges_and_lit', () => {
  const row = parseRow('graph Alice -> Google, Alice -> ML 연구 ; Alice');

  assert.deepEqual(row.graph, { nodes: ['Alice', 'Google', 'ML 연구'], edges: [[0, 1], [0, 2]], lit: ['Alice'] });
});

test('parseFlow_graph_missing_name_throws_with_line', () => {
  assert.throws(() => parseFlow('#@ step s\n#@ show a graph Alice -> '), (e) => e instanceof FlowError && e.line === 2);
});

test('parseFlow_zero_move_time_throws', () => {
  assert.throws(() => parseFlow('#@ speed 0'), FlowError);
  assert.throws(() => parseFlow('#@ step s\n#@ a -> b +0'), FlowError);
});

test('parseRow_two_backquoted_parts_keep_meta', () => {
  const row = parseRow('`a` · `b`');

  assert.equal(row.meta, '`b`');
});
