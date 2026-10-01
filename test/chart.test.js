import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseChart, toChartSvg } from '../src/chart.js';
import { FlowError } from '../src/flow.js';
import { layoutMiniGraph, parseMiniGraph } from '../src/minigraph.js';

test('parseChart_without_chart_line_returns_undefined', () => {
  assert.equal(parseChart('a -> b\n#@ step s'), undefined);
});

test('parseChart_bars_reads_rows_and_missing_values', () => {
  const chart = parseChart('#@ chart bars\n#@ series 우리, 비교\n#@ bar 단일 세션: 91.4 -');

  assert.deepEqual(chart.series, ['우리', '비교']);
  assert.deepEqual(chart.rows.map(({ label, values }) => ({ label, values })), [{ label: '단일 세션', values: [91.4, undefined] }]);
});

test('parseChart_unknown_kind_throws_with_line', () => {
  assert.throws(() => parseChart('\n#@ chart pie'), (e) => e instanceof FlowError && e.line === 2);
});

test('parseChart_arrow_needs_two_values', () => {
  assert.throws(() => parseChart('#@ chart arrows\n#@ arrow a: 10'), FlowError);
});

test('toChartSvg_bars_missing_value_shows_no_comparison', () => {
  const svg = toChartSvg(parseChart('#@ chart bars\n#@ bar a: 10 -'));

  assert.match(svg, /공개 비교 없음/);
});

test('toChartSvg_arrows_shows_change_ratio_and_log_ticks', () => {
  const svg = toChartSvg(parseChart('#@ chart arrows\n#@ scale log\n#@ arrow a: 1000 -> 250'));

  assert.match(svg, /−75%/);
  assert.match(svg, />100</);
  assert.match(svg, />1k</);
});

test('layoutMiniGraph_places_columns_by_depth', () => {
  const laid = layoutMiniGraph({ nodes: ['a', 'b', 'c'], edges: [[0, 1], [1, 2]], lit: ['b'] }, 300);

  const xs = laid.nodes.map((n) => n.x + n.w / 2);

  assert.ok(xs[0] < xs[1] && xs[1] < xs[2]);
  assert.deepEqual(laid.nodes.map((n) => n.isLit), [false, true, false]);
});

test('toChartSvg_arrows_increase_shows_plus_percent', () => {
  const svg = toChartSvg(parseChart('#@ chart arrows\n#@ arrow a: 100 -> 114'));

  assert.match(svg, />\+14%</);
});

test('parseChart_missing_line_sets_missing_text', () => {
  const svg = toChartSvg(parseChart('#@ chart bars\n#@ missing 측정 안 함\n#@ bar a: 10 -'));

  assert.match(svg, /측정 안 함/);
});

test('layoutMiniGraph_skip_edge_reserves_arc_space', () => {
  const laid = layoutMiniGraph({ nodes: ['a', 'b', 'c'], edges: [[0, 1], [1, 2], [0, 2]], lit: [] }, 300);

  assert.deepEqual(laid.edges.map((e) => e.isSkip), [false, false, true]);
  assert.ok(laid.nodes.every((n) => n.y > 0));
});

test('parseChart_values_that_cannot_be_drawn_throw_with_line', () => {
  const cases = ['#@ chart arrows\n#@ scale log\n#@ arrow a: 0 -> 5', '#@ chart bars\n#@ bar a: -1 2', '#@ chart bars\n#@ bar a: 0 0', '#@ chart arrows\n#@ arrow a: - -> 5'];

  for (const source of cases) assert.throws(() => parseChart(source), FlowError, source);
});

test('toChartSvg_arrow_from_zero_has_no_ratio', () => {
  const svg = toChartSvg(parseChart('#@ chart arrows\n#@ arrow a: 0 -> 5'));

  assert.doesNotMatch(svg, /NaN|Infinity/);
});

test('parseMiniGraph_empty_or_cycle_throws', () => {
  assert.throws(() => parseMiniGraph(' ; x'), /이름이 없다/);
  assert.throws(() => parseMiniGraph('a -> a'), /제자리/);
});
