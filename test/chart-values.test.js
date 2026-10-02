// 차트 값 글자: 같은 계열과 표 안에서는 소수 자릿수가 같고, 상자 차트의 값은 무엇의 값인지 붙인다(docs/design/charts.md).
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFigure } from '../src/build.js';
import { decimalPlaces, valueFormat } from '../src/chart/scale.js';
import { errorsOf } from './helpers.js';

const textsOf = (svg, className) => [...svg.matchAll(new RegExp(`class="[^"]*${className}[^"]*"[^>]*>([^<]*)<`, 'g'))].map((m) => m[1]);
const svgOf = (result) => result.chart.body;

test('valueFormat_uses_the_longest_decimal_places_of_the_list_for_every_value', () => {
  const format = valueFormat([0.6, 0.25, 0.05, 1], undefined);
  assert.deepEqual([0.6, 0.25, 0.05, 1].map(format), ['0.60', '0.25', '0.05', '1.00']);
  assert.equal(decimalPlaces([82, 91]), 0);
  assert.equal(valueFormat([82, 91.5])(82), '82.0');
});

test('valueFormat_explicit_decimals_win_and_large_values_keep_the_k_and_m_suffix', () => {
  assert.equal(valueFormat([0.123456], 2)(0.123456), '0.12');
  assert.equal(valueFormat([1500, 3.25])(1500), '1.5k');
  assert.equal(valueFormat([0.5], 0)(0.5), '1');
});

test('drawChart_heatmap_cells_share_the_same_decimal_places', async () => {
  const source = ['chart heatmap', 'x "열(개)"', 'cell "a" "x" 0.6', 'cell "a" "y" 0.05', 'cell "b" "x" 1', 'cell "b" "y" 0.25', ''].join('\n');
  const texts = textsOf(svgOf(await buildFigure(source)), 'chart-cell');
  assert.deepEqual(texts, ['0.60', '0.05', '1.00', '0.25']);
});

test('drawChart_decimals_header_overrides_the_input_places_for_heatmap_and_bar', async () => {
  const heat = ['chart heatmap', 'decimals 1', 'cell "a" "x" 0.6', 'cell "a" "y" 0.05', ''].join('\n');
  assert.deepEqual(textsOf(svgOf(await buildFigure(heat)), 'chart-cell'), ['0.6', '0.1']);
  const bar = ['chart bar', 'x "정확도(%)"', 'decimals 0', 'series a "A"', 'row "r" a=91.4', 'row "s" a=79.7', ''].join('\n');
  assert.deepEqual(textsOf(svgOf(await buildFigure(bar)), 'chart-value'), ['91', '80']);
});

test('drawChart_bar_series_keep_their_own_decimal_places', async () => {
  const source = ['chart bar', 'x "값(점)"', 'series a "A"', 'series b "B"', 'row "r" a=91.4 b=60', 'row "s" a=79 b=44', ''].join('\n');
  const texts = textsOf(svgOf(await buildFigure(source)), 'chart-value');
  assert.deepEqual(texts, ['91.4', '60', '79.0', '44']);
});

test('drawChart_box_value_text_names_the_median_and_keeps_equal_places', async () => {
  const source = ['chart box', 'x "지연(ms)"', 'row "a" min=1 q1=2 median=3 q3=4 max=5', 'row "b" min=1 q1=2 median=3.5 q3=4 max=5', ''].join('\n');
  const texts = textsOf(svgOf(await buildFigure(source)), 'chart-value');
  assert.deepEqual(texts, ['중앙 3.0', '중앙 3.5']);
});

test('parseFigure_decimals_rejects_values_outside_zero_to_six', () => {
  for (const bad of ['decimals 7', 'decimals -1', 'decimals 1.5', 'decimals "2"']) {
    assert.match(errorsOf(`chart heatmap\n${bad}\ncell "a" "x" 1\n`).join('\n'), /whole number from 0 to 6/, bad);
  }
  assert.deepEqual(errorsOf('chart heatmap\ndecimals 2\ncell "a" "x" 1\n'), []);
});

test('chartText_box_includes_the_median_label_so_the_font_subset_has_its_glyphs', async () => {
  const { chartText } = await import('../src/chart/draw.js');
  const { readFigure } = await import('../src/source/parse.js');
  const { createProblems } = await import('../src/source/problems.js');
  const source = 'chart box\nx "지연(ms)"\nrow "a" min=1 q1=2 median=3 q3=4 max=5\n';
  assert.match(chartText(readFigure(source, createProblems(source))), /중앙/);
});
