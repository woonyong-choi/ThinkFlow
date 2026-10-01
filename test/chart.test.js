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
