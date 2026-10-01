import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { formatChange, formatNumber, makeScale } from '../src/chart/scale.js';
import { errorsOf } from './helpers.js';

const FIXTURES = new URL('./fixtures/', import.meta.url).pathname;

test('formatNumber_uses_k_M_and_shortest_decimal', () => {
  assert.deepEqual([120000, 1250, 999950, 0.012, 91.4].map(formatNumber), ['120k', '1.3k', '1M', '0.012', '91.4']);
});

test('formatChange_rounds_half_away_and_skips_zero_base', () => {
  assert.deepEqual([formatChange(120000, 31000), formatChange(100, 114), formatChange(200, 59), formatChange(0, 5)], ['−74%', '+14%', '−71%', '']);
});

test('makeScale_log_ticks_are_powers_of_ten', () => {
  assert.deepEqual(makeScale('log', 28000, 120000, 0, 100).ticks, [10000, 100000, 1000000]);
});

test('parseChart_rules_reject_values_that_cannot_be_drawn', () => {
  const cases = [
    ['chart bar\nscale log\nseries a "A"\nrow "r" a=1', /scale log is not allowed/],
    ['chart bar\nseries a "A"\nrow "r" a=-1', /negative/],
    ['chart bar\nseries a "A"\nrow "r" a=0', /all values are 0/],
    ['chart dumbbell\nseries a "A"\nrow "r" a=1', /takes 2 series/],
    ['chart box\nrow "r" min=- q1=1 median=2 q3=3 max=4', /only for bar series/],
    ['chart dumbbell\nseries a "A"\nseries b "B"\nrow "r" a=1 b=2\nstep "s"\n  reveal b\n  reveal a', /reveal "a" before "b"/],
  ];
  for (const [source, pattern] of cases) assert.match(errorsOf(source).join('\n'), pattern, source);
});

test('buildFigure_bar_rows_from_data_match_inline_rows', async () => {
  const inline = await buildFigure('chart bar\nseries ours "O" key="new_judge"\nrow "A" ours=3.1 ours.low=2.2 ours.high=4.3');
  const fromData = await buildFigure('chart bar\ndata "summary.json" at "/rows"\nseries ours "O" key="new_judge"', { baseDir: FIXTURES });

  assert.equal(fromData.chart.body, inline.chart.body);
});

test('buildFigure_require_data_and_ci_reject_hand_rows', async () => {
  const source = 'chart bar\nseries a "A"\nrow "r" a=1';

  await assert.rejects(buildFigure(source, { requireData: true }), /require-data/);
  await assert.rejects(buildFigure(source, { requireCi: true }), /require-ci/);
});

// cost: time O(build), heap O(m), stack O(1)
// vars: build = 원본 하나를 만드는 비용, m = 메시지 수
// basis: estimate
async function buildErrors(source) {
  try {
    await buildFigure(source);
    return [];
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems.map((p) => `${p.line}: ${p.message}`);
  }
}

test('checkChartFigure_name_wider_than_label_column_is_check_1_error', async () => {
  const source = 'chart bar\nseries a "A"\nrow "아주 긴 항목 이름이 이름 칸을 넘어서 막대와 겹치는 경우를 만든다" a=3\nrow "b" a=1';

  const errors = await buildErrors(source);

  assert.ok(errors.some((e) => e.startsWith('3: [check 1] item name')), errors.join('\n'));
});

test('checkChart_heatmap_with_scale_line_is_error', () => {
  const errors = errorsOf('chart heatmap\nscale linear\ncell "a" "b" 1');

  assert.ok(errors.some((e) => e.startsWith('2: a heatmap has no value axis')), errors.join('\n'));
});

test('checkChartRows_line_log_scale_ignores_x_values', async () => {
  const errors = await buildErrors('chart line\nscale log\nseries a "A"\npoint x=0 a=1\npoint x=1 a=10');

  assert.deepEqual(errors, []);
});

test('drawChart_series_less_chart_grows_as_one_series', async () => {
  const { chart, timeline } = await buildFigure('chart box\nrow "a" min=1 q1=2 median=3 q3=4 max=5\nstep "보기"\n  say "분포"');

  assert.match(chart.body, /<g class="cs-0">/);
  assert.deepEqual(timeline.segs[0].growing, ['*']);
});

test('drawChart_rule_outside_values_stays_inside_plot', async () => {
  const { chart } = await buildFigure('chart dumbbell\nseries a "전"\nseries b "후"\nrule 100 "기준"\nrow "x" a=10 b=20');
  const ruleX = Number(/<line x1="([\d.]+)"[^>]*class="chart-rule"/.exec(chart.body)[1]);

  assert.ok(ruleX < chart.width, `${ruleX} >= ${chart.width}`);
});

test('loadChartData_non_number_value_and_missing_name_are_errors', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const folder = mkdtempSync(join(tmpdir(), 'mutoscope-data-'));
  writeFileSync(join(folder, 'bad.json'), '﻿[{"label":"x","a":"12"},{"a":1}]');

  try {
    await buildFigure('chart bar\nseries a "A"\ndata "bad.json"', { baseDir: folder });
    assert.fail('expected an error');
  } catch (error) {
    const messages = error.problems.map((p) => p.message);
    assert.deepEqual(messages, ['data element 0 value "a" must be a number or null. Found "12"', 'data element 1 needs a text "label"']);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('roundHalfAway_handles_exponent_notation', async () => {
  const { roundHalfAway, makeScale } = await import('../src/chart/scale.js');

  assert.deepEqual([roundHalfAway(1e21), roundHalfAway(5e-7, 7)], [1e21, 5e-7]);
  assert.ok(makeScale('linear', 0.000001, 0.000002, 0, 100).ticks.every(Number.isFinite));
});

test('drawChart_scatter_name_near_right_edge_moves_left', async () => {
  const { chart } = await buildFigure('chart scatter\npoint "왼쪽" x=0 y=1\npoint "오른쪽 끝의 긴 점 이름" x=100 y=2');

  assert.match(chart.body, /class="chart-name late end">오른쪽 끝의 긴 점 이름/);
});

test('checkChartRows_interval_and_quartile_order_are_errors', async () => {
  const box = await buildErrors('chart box\nrow "a" min=10 q1=5 median=3 q3=2 max=1');
  const bar = await buildErrors('chart bar\nseries a "A"\nrow "p" a=50 a.low=60 a.high=40\nrow "q" a=50 a.low=40');

  assert.deepEqual([box.length, bar.length], [1, 2], [...box, ...bar].join('\n'));
});

test('checkChartRows_all_zero_line_is_allowed_but_bar_is_error', async () => {
  const line = await buildErrors('chart line\nseries a "A"\npoint x=1 a=0\npoint x=2 a=0');
  const bar = await buildErrors('chart bar\nseries a "A"\nrow "p" a=0');

  assert.deepEqual([line.length, bar.length], [0, 1]);
});

test('checkChart_negative_rule_in_bar_is_error', async () => {
  const errors = await buildErrors('chart bar\nseries a "A"\nrule -10 "neg"\nrow "p" a=5');

  assert.ok(errors.some((e) => e.includes('a rule cannot be negative')), errors.join('\n'));
});

test('loadChartData_pointer_without_slash_is_error', async () => {
  const errors = await buildErrors('chart bar\nseries a "A"\ndata "../test/fixtures/summary.json" at "rows"');

  assert.ok(errors.some((e) => e.includes('starts with "/"')), errors.join('\n'));
});
