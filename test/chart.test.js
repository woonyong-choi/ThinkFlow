import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { parseFigure } from '../src/source/parse.js';
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
  const error = await buildFigure('chart bar\nseries a "A" key="new_judge"\ndata "summary.json" at "rows"', { baseDir: FIXTURES }).catch((e) => e);

  assert.ok(error.problems.some((p) => p.message.includes('starts with "/"')), JSON.stringify(error.problems));
});

test('drawChart_heatmap_column_fits_long_name', async () => {
  const errors = await buildErrors('chart heatmap\ncell "정답" "통과" 10\ncell "정답" "판단 보류" 1\ncell "오답" "통과" 3\ncell "오답" "판단 보류" 4');

  assert.deepEqual(errors, []);
});

test('checkChart_value_axis_without_unit_in_parentheses_is_warning', () => {
  const warningsOf = (source) => parseFigure(source).warnings.map((w) => `${w.line}: ${w.message}`);
  const missing = /the value axis title needs a unit in parentheses, such as (x|y) "latency\(ms\)"/;

  assert.match(warningsOf('chart bar\nseries a "A"\nrow "r" a=1')[0], missing);
  assert.match(warningsOf('chart bar\nx "지연"\nseries a "A"\nrow "r" a=1')[0], /^2: /);
  assert.deepEqual(warningsOf('chart bar\nx "지연(ms)"\nseries a "A"\nrow "r" a=1'), []);
  assert.equal(warningsOf('chart scatter\nx "비용(달러)"\npoint "p" x=1 y=2').length, 1);
  assert.equal(warningsOf('chart line\nx "주차"\nseries a "A"\npoint x=1 a=2').length, 1);
  assert.deepEqual(warningsOf('chart heatmap\ncell "r" "c" 1'), []);
});

// cost: time O(build), heap O(m), stack O(1)
// vars: build = 원본 하나를 만드는 비용, m = 결과 글자 수
// basis: estimate
async function bodyOf(source, options) {
  return (await buildFigure(source, options)).chart.body;
}

test('drawChart_interval_is_drawn_for_bar_dumbbell_and_line', async () => {
  const dumbbell = await bodyOf('chart dumbbell\nseries a "A"\nseries b "B"\nrow "r" a=100 a.low=80 a.high=120 b=40 b.low=30 b.high=50');
  const bar = await bodyOf('chart bar\nseries a "A"\nrow "r" a=5 a.low=4 a.high=6');
  const line = await bodyOf('chart line\nseries a "A"\npoint x=1 a=2 a.low=1 a.high=3\npoint x=2 a=3 a.low=2 a.high=4');

  assert.equal(dumbbell.match(/class="chart-range pop"/g).length, 2);
  assert.match(bar, /<line [^>]*class="chart-ci late"\/>/);
  assert.doesNotMatch(bar, /<path [^>]*chart-ci/);
  assert.match(line, /class="chart-band wipe"/);
});

test('checkChartRows_interval_order_and_pairing_are_errors_in_bar_dumbbell_and_line', async () => {
  const sources = [
    'chart bar\nseries a "A"\nrow "r" a=5 a.low=6 a.high=7',
    'chart dumbbell\nseries a "A"\nseries b "B"\nrow "r" a=5 a.low=6 a.high=7 b=3',
    'chart line\nseries a "A"\npoint x=1 a=2 a.low=1',
  ];
  const results = await Promise.all(sources.map(buildErrors));

  assert.deepEqual(results.map((errors) => errors.length), [1, 1, 1], results.flat().join('\n'));
});

test('buildFigure_require_ci_covers_dumbbell_and_line_but_not_scatter', async () => {
  const sources = ['chart dumbbell\nseries a "A"\nseries b "B"\nrow "r" a=5 b=3', 'chart line\nseries a "A"\npoint x=1 a=2'];

  for (const source of sources) await assert.rejects(buildFigure(source, { requireCi: true }), /require-ci/, source);
  await buildFigure('chart scatter\npoint "p" x=1 y=2', { requireCi: true });
});

test('loadChartData_interval_keys_match_inline_rows_for_line_and_dumbbell', async () => {
  const [inlineLine, dataLine] = [
    await bodyOf('chart line\nseries s "S" key="new_judge"\npoint x=1 s=12 s.low=10 s.high=14\npoint x=2 s=8 s.low=6 s.high=9'),
    await bodyOf('chart line\nseries s "S" key="new_judge"\ndata "summary.json" at "/weeks"', { baseDir: FIXTURES }),
  ];
  const [inlineDumbbell, dataDumbbell] = [
    await bodyOf('chart dumbbell\nseries a "A" key="before"\nseries b "B" key="after"\nrow "A" a=120000 a.low=100000 a.high=140000 b=30000 b.low=25000 b.high=36000'),
    await bodyOf('chart dumbbell\nseries a "A" key="before"\nseries b "B" key="after"\ndata "summary.json" at "/tokens"', { baseDir: FIXTURES }),
  ];

  assert.deepEqual([dataLine, dataDumbbell], [inlineLine, inlineDumbbell]);
});

test('drawDumbbells_close_values_drop_arrow_and_keep_value_text_apart', async () => {
  const close = await bodyOf('chart dumbbell\nscale log\nseries a "A"\nseries b "B"\nrow "r" a=8000 b=9200\nrow "s" a=100000 b=1000');
  const [near, far] = close.split('class="chart-label cr-1"');
  const textX = (svg, cls) => Number(new RegExp(`<text x="([\\d.]+)"[^>]*class="chart-value ${cls} late`).exec(svg)[1]);

  assert.equal(near.includes('chart-arrow'), false);
  assert.match(near, /class="chart-after pop"/);
  assert.match(far, /chart-arrow draw/);
  assert.ok(textX(near, 'second') > textX(near, 'first'));
});

test('drawBars_value_text_stays_next_to_bar_end_and_draws_after_rule', async () => {
  const { values } = await import('../src/tokens.js');
  const body = await bodyOf('chart bar\nseries a "A"\nrule 80 "기준"\nrow "r" a=70.3 a.low=66 a.high=74.2\nrow "s" a=50');
  const gap = values.space['3'];
  const ciEnd = Number(/<line x1="[\d.]+" x2="([\d.]+)"[^>]*class="chart-ci late"/.exec(body)[1]);
  const [, barX, barW] = /<g class="cr-1"><g class="cs-0"><rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/.exec(body).map(Number);
  const textX = (value) => Number(new RegExp(`<text x="([\\d.]+)"[^>]*class="chart-value ours late">${value}`).exec(body)[1]);

  assert.ok(Math.abs(textX('70.3') - (ciEnd + gap)) < 0.11);
  assert.ok(Math.abs(textX('50') - (barX + barW + gap)) < 0.11);
  assert.ok(body.indexOf('class="chart-value') > body.indexOf('class="chart-rule"'));
});

test('chartCss_value_halo_uses_the_background_color_token_that_dark_mode_overrides', async () => {
  const { STYLES } = await import('../src/styles.js');

  assert.match(STYLES.chart, /\.fl \.chart-value \{[^}]*paint-order: stroke;[^}]*stroke: var\(--color-bg\);[^}]*stroke-width: var\(--border-halo\)/);
  assert.match(STYLES.tokens, /prefers-color-scheme: dark\) \{[\s\S]*?--color-bg:/);
});

test('drawLine_dot_appears_when_the_line_reaches_it_along_the_reveal_curve', async () => {
  const { curveOf, timeAt } = await import('../src/easing.js');
  const { chart } = await buildFigure('chart line\nx "주차"\ny "점수(%)"\nseries a "A"\npoint x=1 a=1\npoint x=2 a=1\npoint x=3 a=1\npoint x=4 a=1\npoint x=5 a=1');
  const ats = [...chart.body.matchAll(/<circle [^>]*class="dot" data-at="([\d.]+)"/g)].map((m) => Number(m[1]));
  const reach = [0, 0.25, 0.5, 0.75, 1].map((length) => Math.round(timeAt(curveOf('reveal'), length) * 1000) / 1000);

  assert.deepEqual(ats, reach);
  assert.ok(ats[2] < 0.5, 'the reveal curve is ahead of linear time at half the length');
  assert.deepEqual(chart.dotAts, reach);
});

test('chartMotionCss_delays_each_dot_by_its_arrival_share_of_the_grow_time', async () => {
  const { chartMotionCss } = await import('../src/chart/motion.js');
  const css = chartMotionCss(1000, [0, 0.4]);

  assert.match(css, /\.fl \.play \.dot\[data-at="0\.4"\] \{ animation-delay: 400ms; \}/);
  assert.match(css, /\.fl\.chart-loop \.dot\[data-at="0\.4"\] \{ animation: chart-dot-loop-1 /);
  assert.match(css, /@keyframes chart-dot-loop-1 \{ 0%, 5\.71% \{ opacity: 0;/);
});

test('toSvg_animated_line_dot_keyframes_start_at_the_arrival_time_inside_the_grow', async () => {
  const { toSvg } = await import('../src/svg.js');
  const svg = await toSvg(await buildFigure('chart line\nx "주차"\ny "점수(%)"\nseries a "A"\npoint x=1 a=1\npoint x=2 a=2\npoint x=3 a=1\nstep "s"\n  reveal a'));
  const starts = [...svg.matchAll(/@keyframes p0-\d+ \{ 0%,([\d.]+)%/g)].map((m) => Number(m[1]));

  assert.equal(starts.length, 3);
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  assert.ok(starts[2] > starts[0]);
  assert.match(svg, /\.fl \.cs-0 \.dot\[data-at="1"\] \{ animation: p0-1000 /);
});

test('drawChart_scatter_rejects_interval_keys_and_draws_no_interval', async () => {
  const errors = await buildErrors('chart scatter\npoint "p" x=1 y=2 y.low=1 y.high=3');
  const body = await bodyOf('chart scatter\npoint "p" x=1 y=2\npoint "q" x=2 y=3\nlink "p" -> "q"');

  assert.match(errors.join('\n'), /"y\.low" is not a value of a scatter chart/);
  assert.doesNotMatch(body, /chart-ci|chart-interval/);
  assert.match(body, /class="chart-link draw"/);
});

test('drawChart_line_chart_draw_class_gets_dash_so_the_line_grows_with_the_band', async () => {
  const css = (await import('node:fs')).readFileSync(new URL('../src/styles/chart.css', import.meta.url), 'utf8');

  assert.match(css, /\.fl \.draw \{\s*stroke-dasharray: 1;/);
});

const STEPPED_BAR = 'chart bar\nx "정확도(%)"\nseries a "A"\nseries b "B"\nrow "r" a=5 b=3\nstep "하나" "첫째"\n  reveal b\nstep "둘" "둘째"\n  reveal a';

test('buildTimeline_bar_label_shift_follows_visible_bars_and_is_zero_when_all_shown', async () => {
  const shifts = (await buildFigure(STEPPED_BAR)).timeline.segs.map((seg) => seg.labelShift);

  assert.ok(shifts[0] > 0, `only the second bar is visible: ${shifts}`);
  assert.equal(shifts.at(-1), 0);
});

test('buildTimeline_label_shift_is_zero_for_single_series_and_other_kinds', async () => {
  const single = await buildFigure('chart bar\nx "정확도(%)"\nseries a "A"\nrow "r" a=5\nstep "s" "c"\n  reveal a');

  assert.deepEqual(single.timeline.segs.map((seg) => seg.labelShift), [0]);
});

test('toSvg_static_chart_shows_every_series_and_has_no_motion', async () => {
  const { toSvg } = await import('../src/svg.js');
  const svg = await toSvg(await buildFigure(STEPPED_BAR), { isStatic: true });

  assert.doesNotMatch(svg, /@keyframes ls|animation: a\d|cs-\d \{ animation/);
  assert.match(svg, /<g class="cs-0">/);
  assert.match(svg, /<g class="cs-1">/);
  assert.match(svg, /<svg [^>]*class="fl"/);
  assert.equal(svg.includes('opacity="0"'), false);
});

test('toSvg_animated_chart_moves_row_label_with_the_timeline_shift', async () => {
  const { toSvg } = await import('../src/svg.js');
  const svg = await toSvg(await buildFigure(STEPPED_BAR));

  assert.match(svg, /@keyframes ls \{[^}]*translateY\([\d.]+px\)/);
  assert.match(svg, /\.fl \.chart-label\.shift \{ animation: ls /);
});
