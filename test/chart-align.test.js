// 차트 내용이 판 가운데에 놓이는지: 내용의 왼쪽 여백과 오른쪽 여백이 같다(docs/design/charts.md 그리기).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { measure } from '../src/measure/fonts.js';

const EXAMPLES = new URL('../examples/', import.meta.url);
const PAD = 28;
const TOLERANCE = 1;

// 글 종류(class)마다 글자 크기, 글꼴, 정렬. src/chart/*.js와 styles/chart.css가 정한 값이다.
const TEXT_STYLES = [
  ['chart-title', 15, 'semibold'],
  ['chart-sub', 12, 'regular'],
  ['chart-legend', 12, 'regular'],
  ['chart-label', 13, 'regular'],
  ['chart-ratio', 12, 'numSemibold'],
  ['chart-value', 11, 'num'],
  ['chart-tick', 11, 'num'],
  ['chart-cell', 11, 'num'],
  ['chart-unit', 11, 'regular'],
  ['chart-missing', 11, 'regular'],
  ['chart-name', 11, 'regular'],
  ['chart-rule-label', 11, 'regular'],
];

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글 글자 수
// basis: estimate
// 글자 요소 하나가 차지하는 가로 구간 [왼쪽, 오른쪽]
function textSpan(x, className, text) {
  const [, size, face] = TEXT_STYLES.find(([name]) => className.split(' ').includes(name));
  const isBold = className.includes('ours') || className.includes('second');
  const width = measure(text.replace(/<[^>]+>/g, '').replaceAll('&amp;', '&'), size, isBold && face === 'num' ? 'numSemibold' : face);
  const tokens = className.split(' ');
  const isEnd = tokens.includes('end') || tokens.includes('chart-unit') && !tokens.includes('start') || tokens.includes('chart-ratio');
  const isMiddle = !isEnd && (tokens.includes('chart-tick') || tokens.includes('chart-cell'));
  if (isEnd) return [x - width, x];
  if (isMiddle) return [x - width / 2, x + width / 2];
  return [x, x + width];
}

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 요소 수
// basis: estimate
/** 차트 SVG 조각의 글자와 도형이 닿는 가로 구간 */
function extentOf(body) {
  const spans = [];
  for (const m of body.matchAll(/<text x="([\d.-]+)"[^>]*class="([^"]+)">(.*?)<\/text>/g)) spans.push(textSpan(Number(m[1]), m[2], m[3]));
  for (const m of body.matchAll(/<rect x="([\d.-]+)" y="[\d.-]+" width="([\d.]+)"/g)) spans.push([Number(m[1]), Number(m[1]) + Number(m[2])]);
  for (const m of body.matchAll(/<circle cx="([\d.-]+)" cy="[\d.-]+" r="([\d.]+)"/g)) spans.push([Number(m[1]) - Number(m[2]), Number(m[1]) + Number(m[2])]);
  for (const m of body.matchAll(/<line x1="([\d.-]+)" x2="([\d.-]+)"/g)) spans.push([Number(m[1]), Number(m[2])].sort((a, b) => a - b));
  return { left: Math.min(...spans.map(([a]) => a)), right: Math.max(...spans.map(([, b]) => b)) };
}

const charts = readdirSync(EXAMPLES)
  .filter((file) => file.endsWith('.muto') && readFileSync(new URL(file, EXAMPLES), 'utf8').startsWith('chart '))
  .map((file) => [file, readFileSync(new URL(file, EXAMPLES), 'utf8')]);

test('examples_have_all_six_chart_kinds', () => {
  assert.equal(charts.length, 6);
});

for (const [file, source] of charts) {
  test(`drawChart_${file.replace('.muto', '')}_content_has_equal_left_and_right_margins`, async () => {
    const { chart } = await buildFigure(source, { baseDir: new URL('.', EXAMPLES).pathname });
    const { left, right } = extentOf(chart.body);

    assert.ok(Math.abs(left - PAD) <= TOLERANCE, `left margin ${left}`);
    assert.ok(Math.abs(left - (chart.width - right)) <= TOLERANCE, `left ${left}, right margin ${chart.width - right}`);
  });
}

test('drawChart_heatmap_cells_fill_the_width_up_to_the_right_margin', async () => {
  const { chart } = await buildFigure('chart heatmap\ncell "a" "x" 1\ncell "a" "y" 2\ncell "b" "x" 3\ncell "b" "y" 4\n');
  const cells = [...chart.body.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"[^>]*class="chart-heat"/g)].map((m) => Number(m[1]) + Number(m[2]));

  assert.ok(Math.abs(Math.max(...cells) - (chart.width - PAD)) <= TOLERANCE);
});

test('drawChart_scatter_without_titles_keeps_equal_margins_around_the_axis_labels', async () => {
  const { chart } = await buildFigure('chart scatter\npoint "p" x=1 y=2\npoint "q" x=3 y=5\n');
  const { left, right } = extentOf(chart.body);

  assert.ok(Math.abs(left - (chart.width - right)) <= TOLERANCE, `${left} ${chart.width - right}`);
});

test('drawChart_scatter_arrowhead_stays_clear_of_every_point_name', async () => {
  const { chart } = await buildFigure(readFileSync(new URL('scatter.muto', EXAMPLES), 'utf8'));
  const links = [...chart.body.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"[^>]*class="chart-link draw"/g)].map((m) => m.slice(1).map(Number));
  const names = [...chart.body.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" class="chart-name late( end)?">(.*?)<\/text>/g)].map((m) => {
    const width = measure(m[4], 11);
    const x = Number(m[1]);
    return { x0: (m[3] ? x - width : x) - 4, x1: (m[3] ? x : x + width) + 4, y0: Number(m[2]) - 11 * 0.36 - 5.5 - 4, y1: Number(m[2]) - 11 * 0.36 + 5.5 + 4 };
  });
  const headLength = 5 * 2.5;

  assert.equal(links.length, 2);
  for (const [x1, y1, x2, y2] of links) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const [ux, uy] = [(x2 - x1) / length, (y2 - y1) / length];
    for (const along of [0, 0.5, 1]) {
      const [px, py] = [x2 - ux * headLength * along, y2 - uy * headLength * along];
      for (const box of names) assert.ok(!(px >= box.x0 && px <= box.x1 && py >= box.y0 && py <= box.y1), `arrowhead point ${px.toFixed(1)},${py.toFixed(1)} is inside a name box`);
    }
  }
});

// 마지막 글자 줄 기준선에서 그림 아래 끝까지는 PAD에 기준선 아래 먹 몫(space.1-5)을 더한 값이다. 위쪽 PAD와 대칭이다.
for (const [file, source] of charts.filter(([name]) => !name.startsWith('heatmap'))) {
  test(`drawChart_${file.replace('.muto', '')}_bottom_margin_is_the_pad_below_the_last_text_line`, async () => {
    const { values } = await import('../src/tokens.js');
    const { chart } = await buildFigure(source, { baseDir: new URL('.', EXAMPLES).pathname });
    const baselines = [...chart.body.matchAll(/<text x="[\d.-]+" y="([\d.-]+)" class="chart-unit">/g)].map((m) => Number(m[1]));

    assert.equal(chart.height - Math.max(...baselines), PAD + values.space['1-5']);
  });
}
