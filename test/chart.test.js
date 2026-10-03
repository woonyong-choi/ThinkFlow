// 차트: 값 읽기와 오류, 계열 역할, 숫자 글자, 그리기 위치와 맞춤, 계열 드러내기(docs/design/charts.md).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { curveOf, timeAt } from '../src/easing.js';
import { formatChange, formatNumber, makeScale } from '../src/chart/scale.js';
import { measure } from '../src/measure/fonts.js';
import { parseFigure } from '../src/source/parse.js';
import { tokens, values } from '../src/tokens.js';
import { formatProblem, withFolder } from './helpers.js';

const FIXTURES = new URL('./fixtures/', import.meta.url).pathname;
const ASSETS = new URL('../docs/assets/', import.meta.url);

// cost: time O(build), heap O(m), stack O(1)
// vars: build = 원본 하나를 만드는 비용, m = 메시지 수
// basis: estimate
// 원본을 만들 때 나는 오류를 `줄: [코드] 메시지`로 돌려준다. 오류가 없으면 빈 목록이다.
async function problemsOf(source, options) {
  try {
    await buildFigure(source, options);
    return [];
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems.map(formatProblem);
  }
}

const bodyOf = async (source, options) => (await buildFigure(source, options)).chart.body;
const textsOf = (svg, className) => [...svg.matchAll(new RegExp(`class="[^"]*${className}[^"]*"[^>]*>([^<]*)<`, 'g'))].map((m) => m[1]);
const legendOf = (body) => [...body.matchAll(/class="chart-legend">([^<]+)</g)].map((m) => m[1]);
const BAR = 'chart bar\nx "값(%)"\nseries a "A" role=main\nseries b "B" role=compare\nrow "r" a=5 b=3\n';
const SWAPPED_BAR = BAR.replace('series a "A" role=main\nseries b "B" role=compare', 'series b "B" role=compare\nseries a "A" role=main');

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


// 근거: 설계 charts.md 요구사항 "숫자와 비율 글자가 반올림 규칙을 따른다"
test('formatNumber_and_formatChange_round_half_away_and_use_k_and_M', () => {
  assert.deepEqual([120000, 1250, 999950, 0.012, 91.4].map(formatNumber), ['120k', '1.3k', '1M', '0.012', '91.4']);
  assert.deepEqual([formatChange(120000, 31000), formatChange(100, 114), formatChange(200, 59), formatChange(0, 5)], ['−74%', '+14%', '−71%', '']);
});

// 근거: 설계 charts.md 눈금 "log 눈금은 10의 거듭제곱", 버그 68ec356 "지수 표기 수의 눈금 NaN"
test('makeScale_log_ticks_are_powers_of_ten_and_tiny_ranges_give_finite_ticks', () => {
  assert.deepEqual(makeScale('log', { min: 28000, max: 120000, start: 0, length: 100 }).ticks, [10000, 100000, 1000000]);
  assert.ok(makeScale('linear', { min: 0.000001, max: 0.000002, start: 0, length: 100 }).ticks.every(Number.isFinite));
});

const REJECTED = [
  // 설계 charts.md 요구사항 "그릴 수 없는 값과 계열 수를 줄 번호와 함께 막는다"
  { rule: '막대에 log', source: 'chart bar\nscale log\nseries a "A"\nrow "r" a=1', expect: /scale log is not allowed/ },
  { rule: '음수 값', source: 'chart bar\nseries a "A"\nrow "r" a=-1', expect: /negative/ },
  { rule: '모두 0인 막대', source: 'chart bar\nseries a "A"\nrow "p" a=0', expect: /all values are 0/ },
  { rule: '덤벨 계열 수', source: 'chart dumbbell\nseries a "A"\nrow "r" a=1', expect: /takes 2 series/ },
  { rule: '상자 차트의 값 없음 표기', source: 'chart box\nrow "r" min=- q1=1 median=2 q3=3 max=4', expect: /only for bar series/ },
  { rule: '음수 기준선', source: 'chart bar\nseries a "A"\nrule -10 "neg"\nrow "p" a=5', expect: /a rule cannot be negative/ },
  { rule: '히트맵의 값 축', source: 'chart heatmap\nscale linear\ncell "a" "b" 1', expect: /^2: a heatmap has no value axis/m },
  { rule: '소수 자릿수 범위(7)', source: 'chart heatmap\ndecimals 7\ncell "a" "x" 1\n', expect: /whole number from 0 to 6/ },
  { rule: '소수 자릿수 범위(-1)', source: 'chart heatmap\ndecimals -1\ncell "a" "x" 1\n', expect: /whole number from 0 to 6/ },
  { rule: '소수 자릿수 범위(1.5)', source: 'chart heatmap\ndecimals 1.5\ncell "a" "x" 1\n', expect: /whole number from 0 to 6/ },
  { rule: '소수 자릿수 범위("2")', source: 'chart heatmap\ndecimals "2"\ncell "a" "x" 1\n', expect: /whole number from 0 to 6/ },
  // 설계 charts.md 요구사항 "드러내지 않는 계열과 거꾸로 된 드러내기를 막는다"
  { rule: '덤벨은 compare를 먼저 드러냄', source: 'chart dumbbell\nx "값(%)"\nseries ours "O" role=main\nseries base "B" role=compare\nrow "r" ours=2 base=9\nstep "s"\n  reveal ours\n  reveal base\n', expect: /reveal "base" before "ours". The arrow starts from the compare series/ },
  // 설계 charts.md 요구사항 "계열 역할이 겹치거나 맞지 않으면 막고, 빠졌으면 선언 순서대로 받는다"
  { rule: 'main 둘', source: 'chart bar\nx "값(%)"\nseries a "A" role=main\nseries b "B" role=main\nrow "r" a=1 b=2\n', expect: /one role=main and one role=compare/ },
  { rule: 'compare 둘', source: 'chart bar\nx "값(%)"\nseries a "A" role=compare\nseries b "B" role=compare\nrow "r" a=1 b=2\n', expect: /one role=main and one role=compare/ },
  { rule: '모르는 역할', source: 'chart bar\nx "값(%)"\nseries a "A" role=other\nseries b "B" role=compare\nrow "r" a=1 b=2\n', expect: /role is one of main, compare. Found "other"/ },
  { rule: '계열 하나가 compare면 main이 없음', source: 'chart bar\nx "값(%)"\nseries a "A" role=compare\nrow "r" a=1\n', expect: /one series shows it as main/ },
  // 설계 charts.md 요구사항 "신뢰구간을 세 종류가 같은 규칙으로 받는다(순서 오류, 짝 오류)"와 상자 사분위 순서
  { rule: '막대 신뢰구간 순서', source: 'chart bar\nseries a "A"\nrow "r" a=5 a.low=6 a.high=7', expect: /./, count: 1 },
  { rule: '덤벨 신뢰구간 순서', source: 'chart dumbbell\nseries a "A" role=compare\nseries b "B" role=main\nrow "r" a=5 a.low=6 a.high=7 b=3', expect: /./, count: 1 },
  { rule: '선 신뢰구간 짝', source: 'chart line\nseries a "A"\npoint x=1 a=2 a.low=1', expect: /./, count: 1 },
  { rule: '상자 사분위 순서', source: 'chart box\nrow "a" min=10 q1=5 median=3 q3=2 max=1', expect: /./, count: 1 },
  { rule: '막대 구간 순서와 짝', source: 'chart bar\nseries a "A"\nrow "p" a=50 a.low=60 a.high=40\nrow "q" a=50 a.low=40', expect: /./, count: 2 },
  { rule: '산점도는 구간 키를 받지 않음', source: 'chart scatter\npoint "p" x=1 y=2 y.low=1 y.high=3', expect: /"y\.low" is not a value of a scatter chart/ },
  // 설계 charts.md 요구사항 "두 강제 선택 사항이 행 줄과 빠진 신뢰구간을 막는다"는 아래 require 테스트
];

// 근거: 설계 charts.md 요구사항 "그릴 수 없는 값과 계열 수를 줄 번호와 함께 막는다", 계열 역할, 신뢰구간 규칙(위 표의 rule 칸에 행별로 적음)
test('buildFigure_chart_rules_reject_values_that_cannot_be_drawn', async () => {
  for (const { rule, source, expect, count } of REJECTED) {
    const errors = await problemsOf(source);

    assert.match(errors.join('\n'), expect, rule);
    if (count) assert.equal(errors.length, count, `${rule}: ${errors.join(' | ')}`);
  }
});

const ACCEPTED = [
  // 설계 charts.md 요구사항 "그릴 수 없는 값": 선과 산점도는 0과 log 눈금의 x 0을 받는다(4750504)
  { form: '선 차트 log 눈금은 x 값을 보지 않음', source: 'chart line\nscale log\nseries a "A"\npoint x=0 a=1\npoint x=1 a=10' },
  { form: '모두 0인 선', source: 'chart line\nseries a "A"\npoint x=1 a=0\npoint x=2 a=0' },
  // 계약 figure-syntax.md 호환 규칙 "추가만": role을 생략한 옛 원본은 선언 순서대로 역할을 받고 드러내기가 오류 없이 읽힌다
  { form: '역할 없는 옛 덤벨은 첫 계열을 먼저 드러냄', source: 'chart dumbbell\nx "값(%)"\nseries base "전"\nseries ours "후"\nrow "r" base=9 ours=2\nstep "s"\n  reveal base\nstep "t"\n  reveal ours\n' },
  { form: '계열 하나만 role을 적음', source: 'chart bar\nx "값(%)"\nseries a "A" role=main\nseries b "B"\nrow "r" a=1 b=2\n' },
  { form: '계열 하나는 role 생략', source: 'chart bar\nx "값(%)"\nseries a "A"\nrow "r" a=1\n' },
  // 설계 charts.md: 막대와 선은 compare를 main보다 먼저 드러낼 수 있다
  { form: '막대는 compare를 먼저 드러냄', source: `${BAR}step "전"\n  reveal b\nstep "후"\n  reveal a\n` },
];

// 근거: 설계 charts.md 요구사항 "그릴 수 없는 값"의 반대 경계와 계열 역할(위 표의 form 칸에 행별로 적음), 계약 figure-syntax.md 호환 규칙 "추가만"
test('buildFigure_chart_valid_forms_read_without_errors', async () => {
  for (const { form, source } of ACCEPTED) assert.deepEqual(await problemsOf(source), [], form);
});

// 근거: 설계 charts.md 요구사항 "그릴 수 없는 값": data JSON 원소의 숫자 아닌 값, 빠진 이름, 잘못된 JSON Pointer(68ec356, 4750504)
test('loadChartData_non_number_value_missing_name_and_pointer_without_slash_are_errors', async () => {
  await withFolder(async (folder) => {
    writeFileSync(join(folder, 'bad.json'), '﻿[{"label":"x","a":"12"},{"a":1}]');

    const bad = await buildFigure('chart bar\nseries a "A"\ndata "bad.json"', { baseDir: folder }).catch((e) => e);
    const pointer = await buildFigure('chart bar\nseries a "A" key="new_judge"\ndata "summary.json" at "rows"', { baseDir: FIXTURES }).catch((e) => e);

    assert.deepEqual(bad.problems.map((p) => p.message), ['data element 0 value "a" must be a number or null. Found "12"', 'data element 1 needs a text "label"']);
    assert.ok(pointer.problems.some((p) => p.message.includes('starts with "/"')), JSON.stringify(pointer.problems));
  });
});

const BAR_DATA = ['chart bar\nseries ours "O" key="new_judge"\nrow "A" ours=3.1 ours.low=2.2 ours.high=4.3', 'chart bar\ndata "summary.json" at "/rows"\nseries ours "O" key="new_judge"'];
const LINE_DATA = ['chart line\nseries s "S" key="new_judge"\npoint x=1 s=12 s.low=10 s.high=14\npoint x=2 s=8 s.low=6 s.high=9', 'chart line\nseries s "S" key="new_judge"\ndata "summary.json" at "/weeks"'];
const DUMBBELL_DATA = [
  'chart dumbbell\nseries a "A" key="before" role=compare\nseries b "B" key="after" role=main\nrow "A" a=120000 a.low=100000 a.high=140000 b=30000 b.low=25000 b.high=36000',
  'chart dumbbell\nseries a "A" key="before" role=compare\nseries b "B" key="after" role=main\ndata "summary.json" at "/tokens"',
];

// 근거: 설계 charts.md 요구사항 "여섯 종류를 행 줄과 data JSON에서 같은 결과로 그린다"(이 시험은 막대, 선, 덤벨만), "신뢰구간을 세 종류가 같은 규칙으로 받고 행 줄과 data가 같은 결과를 낸다"
test('buildFigure_rows_from_data_match_inline_rows_for_bar_line_and_dumbbell', async () => {
  for (const [inline, fromData] of [BAR_DATA, LINE_DATA, DUMBBELL_DATA]) assert.equal(await bodyOf(fromData, { baseDir: FIXTURES }), await bodyOf(inline), inline.split('\n')[0]);
});

// 근거: 설계 charts.md 요구사항 "두 강제 선택 사항이 행 줄과 빠진 신뢰구간을 막는다(--require-ci는 막대, 덤벨, 선)"
test('buildFigure_require_data_and_require_ci_reject_hand_rows_and_missing_intervals', async () => {
  const bar = 'chart bar\nseries a "A"\nrow "r" a=1';
  const ciSources = [bar, 'chart dumbbell\nseries a "A" role=compare\nseries b "B" role=main\nrow "r" a=5 b=3', 'chart line\nseries a "A"\npoint x=1 a=2'];

  await assert.rejects(buildFigure(bar, { requireData: true }), /require-data/);
  for (const source of ciSources) await assert.rejects(buildFigure(source, { requireCi: true }), /require-ci/, source);
  await buildFigure('chart scatter\npoint "p" x=1 y=2', { requireCi: true });
});

// 근거: 버그 #6, #9 "값 축 제목에 괄호 단위가 없으면 경고한다"
test('parseFigure_value_axis_title_without_a_unit_in_parentheses_is_a_warning', () => {
  const warningsOf = (source) => parseFigure(source).warnings.map((w) => `${w.line}: ${w.message}`);

  assert.match(warningsOf('chart bar\nseries a "A"\nrow "r" a=1')[0], /the value axis title needs a unit in parentheses, such as (x|y) "latency\(ms\)"/);
  assert.match(warningsOf('chart bar\nx "지연"\nseries a "A"\nrow "r" a=1')[0], /^2: /);
  assert.deepEqual(warningsOf('chart bar\nx "지연(ms)"\nseries a "A"\nrow "r" a=1'), []);
  assert.equal(warningsOf('chart scatter\nx "비용(달러)"\npoint "p" x=1 y=2').length, 1);
  assert.equal(warningsOf('chart line\nx "주차"\nseries a "A"\npoint x=1 a=2').length, 1);
  assert.deepEqual(warningsOf('chart heatmap\ncell "r" "c" 1'), []);
});

const DECIMALS = [
  { rule: '히트맵 칸은 같은 소수 자릿수', source: 'chart heatmap\nx "열(개)"\ncell "a" "x" 0.6\ncell "a" "y" 0.05\ncell "b" "x" 1\ncell "b" "y" 0.25\n', cls: 'chart-cell', texts: ['0.60', '0.05', '1.00', '0.25'] },
  { rule: 'decimals 머리 줄이 히트맵 자릿수를 덮음', source: 'chart heatmap\ndecimals 1\ncell "a" "x" 0.6\ncell "a" "y" 0.05\n', cls: 'chart-cell', texts: ['0.6', '0.1'] },
  { rule: 'decimals 머리 줄이 막대 자릿수를 덮음', source: 'chart bar\nx "정확도(%)"\ndecimals 0\nseries a "A"\nrow "r" a=91.4\nrow "s" a=79.7\n', cls: 'chart-value', texts: ['91', '80'] },
  { rule: '막대 계열마다 자기 자릿수', source: 'chart bar\nx "값(점)"\nseries a "A"\nseries b "B"\nrow "r" a=91.4 b=60\nrow "s" a=79 b=44\n', cls: 'chart-value', texts: ['91.4', '60', '79.0', '44'] },
  { rule: '상자 차트 값은 중앙임을 붙이고 자릿수가 같다', source: 'chart box\nx "지연(ms)"\nrow "a" min=1 q1=2 median=3 q3=4 max=5\nrow "b" min=1 q1=2 median=3.5 q3=4 max=5\n', cls: 'chart-value', texts: ['중앙 3.0', '중앙 3.5'] },
];

// 근거: 설계 charts.md 요구사항 "숫자와 비율 글자가 반올림 규칙을 따른다"(소수 자릿수: 같은 계열과 표 안에서 같고, decimals 머리 줄이 우선)
test('buildFigure_chart_value_text_keeps_equal_decimal_places', async () => {
  for (const { rule, source, cls, texts } of DECIMALS) assert.deepEqual(textsOf(await bodyOf(source), cls), texts, rule);
});

const roleOf = (type, rows, a = '', b = '') => parseFigure(`chart ${type}\nx "값(%)"\nseries a "A"${a}\nseries b "B"${b}\n${rows}\n`).figure.chart.series.map((s) => [s.id, s.role]);

// 근거: 설계 charts.md 요구사항 "계열 역할이 겹치거나 맞지 않으면 막고, 빠졌으면 선언 순서대로 받는다"와 계약 figure-syntax.md 호환 규칙 "role 생략은 선언 순서, 하나만 적으면 남은 역할"
test('parseFigure_series_roles_follow_the_written_role_then_the_declaration_order', () => {
  const read = parseFigure('chart bar\nx "값(%)"\nseries a "A" key="k" role=compare\nseries b "B" role=main\nrow "r" a=1 b=2\n').figure.chart;

  assert.deepEqual(read.series.map((s) => [s.id, s.key, s.role]), [['b', 'b', 'main'], ['a', 'k', 'compare']]);
  assert.deepEqual(roleOf('bar', 'row "r" a=1 b=2'), [['a', 'main'], ['b', 'compare']]);
  assert.deepEqual(roleOf('line', 'point x=1 a=1 b=2'), [['a', 'main'], ['b', 'compare']]);
  assert.deepEqual(roleOf('dumbbell', 'row "r" a=1 b=2'), [['a', 'compare'], ['b', 'main']]);
  assert.deepEqual(roleOf('bar', 'row "r" a=1 b=2', ' role=compare', ''), [['b', 'main'], ['a', 'compare']]);
  assert.deepEqual(roleOf('bar', 'row "r" a=1 b=2', '', ' role=main'), [['b', 'main'], ['a', 'compare']]);
  assert.equal(parseFigure('chart bar\nx "값(%)"\nseries a "A"\nrow "r" a=1\n').figure.chart.series[0].role, 'main');
});

// 근거: 설계 docs-integration.md "data.main, data.compare는 선언 순서가 아니라 계열의 role이 정한다", charts.md 범례와 덤벨 방향
test('buildFigure_legend_lists_main_first_and_a_dumbbell_starts_at_compare', async () => {
  const dumbbell = 'chart dumbbell\nx "값(%)"\nseries ours "O" role=main\nseries base "B" role=compare\nrow "r" ours=2 base=9\nstep "s"\n  reveal base\n  reveal ours\n';

  const { chart, timeline } = await buildFigure(dumbbell);

  assert.deepEqual(legendOf(await bodyOf(SWAPPED_BAR)), ['A', 'B']);
  assert.deepEqual(legendOf(await bodyOf(`${BAR}step "전"\n  reveal b\nstep "후"\n  reveal a\n`)), ['A', 'B']);
  assert.deepEqual(legendOf(chart.body), ['O', 'B']);
  assert.match(chart.body, /<g class="cs-0">.*?class="chart-before pop"/s);
  assert.equal(timeline.segs.at(-1).series.length, 2);
});

// 근거: 설계 docs-integration.md "data.main, data.compare는 선언 순서가 아니라 계열의 role이 정한다"
test('buildFigure_series_color_follows_the_role_not_the_declaration_order', async () => {
  const fills = (body) => [...body.matchAll(/<rect [^>]*height="12"[^>]*fill="([^"]+)" class="grow"/g)].map((m) => m[1]);

  assert.deepEqual(fills(await bodyOf(BAR)), [tokens.color.data.main, tokens.color.data.compare]);
  assert.deepEqual(fills(await bodyOf(SWAPPED_BAR)), fills(await bodyOf(BAR)));
});

// 근거: 설계 docs-integration.md "같은 계열 이름은 모든 예제에서 같은 역할이다"
test('examples_same_series_label_and_id_have_the_same_role_in_every_source', () => {
  const dirs = [new URL('../examples/', import.meta.url), ASSETS];
  const sources = dirs.flatMap((dir) => readdirSync(dir).filter((name) => name.endsWith('.muto')).map((name) => ({ name, text: readFileSync(new URL(name, dir), 'utf8') })));
  const byLabel = new Map();
  const byId = new Map();
  for (const { name, text } of sources.filter(({ text: t }) => /^chart /.test(t))) {
    for (const s of parseFigure(text).figure.chart.series) {
      for (const [table, key] of [[byLabel, s.label], [byId, s.id]]) {
        const seen = table.get(key);
        assert.ok(seen === undefined || seen.role === s.role, `${name}: "${key}" is ${s.role} but ${seen?.name} has ${seen?.role}`);
        table.set(key, { name, role: s.role });
      }
    }
  }

  assert.ok(byLabel.size >= 4);
});

// 근거: 설계 charts.md 요구사항 "막대 값 글자가 기준선에 걸려도 막대 끝 옆 같은 간격에 있고 점선이 글자 둘레에서 끊긴다"
test('drawBars_value_text_stays_next_to_the_bar_end_and_draws_after_the_rule', async () => {
  const body = await bodyOf('chart bar\nseries a "A"\nrule 80 "기준"\nrow "r" a=70.3 a.low=66 a.high=74.2\nrow "s" a=50');
  const gap = values.space['3'];
  const ciEnd = Number(/<line x1="[\d.]+" x2="([\d.]+)"[^>]*class="chart-ci late"/.exec(body)[1]);
  const [, barX, barW] = /<g class="cr-1"><g class="cs-0"><rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/.exec(body).map(Number);
  const textX = (value) => Number(new RegExp(`<text x="([\\d.]+)"[^>]*class="chart-value ours late">${value}`).exec(body)[1]);

  assert.ok(Math.abs(textX('70.3') - (ciEnd + gap)) < 0.11);
  assert.ok(Math.abs(textX('50') - (barX + barW + gap)) < 0.11);
  assert.ok(body.indexOf('class="chart-value') > body.indexOf('class="chart-rule"'));
});

// 근거: 설계 charts.md 요구사항 "가까운 덤벨 두 값이 화살표 없이 겹치지 않고 끝점 모양이 모든 행에서 같다"
test('drawDumbbells_every_row_ends_in_the_same_main_dot_and_close_rows_only_lose_the_arrow', async () => {
  const close = await bodyOf('chart dumbbell\nscale log\nseries a "A" role=compare\nseries b "B" role=main\nrow "r" a=8000 b=9200\nrow "s" a=100000 b=1000');
  const [near, far] = close.split('<g class="cr-1 ink"><text');
  const textX = (svg, cls) => Number(new RegExp(`<text x="([\\d.]+)"[^>]*class="chart-value ${cls} late`).exec(svg)[1]);
  const dots = (svg) => [...svg.matchAll(/<circle [^>]*r="(\d+)" fill="([^"]+)" class="chart-after pop"/g)].map((m) => m.slice(1).join(' '));

  assert.equal(near.includes('chart-arrow'), false);
  assert.match(far, /chart-arrow draw/);
  assert.equal(dots(near).length, 1);
  assert.deepEqual(dots(far), dots(near));
  assert.ok(textX(near, 'second') > textX(near, 'first'));
});

// 근거: 설계 charts.md 요구사항 "선 차트 점이 선이 닿는 시각에 나타난다"
test('drawLine_dot_appears_when_the_line_reaches_it_along_the_reveal_curve', async () => {
  const { chart } = await buildFigure('chart line\nx "주차"\ny "점수(%)"\nseries a "A"\npoint x=1 a=1\npoint x=2 a=1\npoint x=3 a=1\npoint x=4 a=1\npoint x=5 a=1');
  const ats = [...chart.body.matchAll(/<circle [^>]*class="dot" data-at="([\d.]+)"/g)].map((m) => Number(m[1]));
  const reach = [0, 0.25, 0.5, 0.75, 1].map((length) => Math.round(timeAt(curveOf('reveal'), length) * 1000) / 1000);

  assert.deepEqual(ats, reach);
  assert.ok(ats[2] < 0.5, 'the reveal curve is ahead of linear time at half the length');
  assert.deepEqual(chart.dotAts, reach);
});

const STEPPED_BAR = 'chart bar\nx "정확도(%)"\nseries a "A" role=main\nseries b "B" role=compare\nrow "r" a=5 b=3\nstep "하나" "첫째"\n  reveal a\nstep "둘" "둘째"\n  reveal b';
const MISSING_BAR = 'chart bar\nx "정확도(%)"\nseries a "A" role=main\nseries b "B" role=compare\nrow "r" a=5 b=3\nrow "m" a=- b=4\nstep "하나" "첫째"\n  reveal a\nstep "둘" "둘째"\n  reveal b';

// 근거: 설계 playback.md 요구사항 "막대 차트 행 이름이 보이는 막대와 세로로 맞는다(labelShifts)"
test('buildTimeline_bar_label_shift_follows_the_visible_bars_and_is_zero_when_all_are_shown', async () => {
  const stepped = (await buildFigure(STEPPED_BAR)).timeline.segs.map((seg) => seg.labelShifts[0]);
  const single = await buildFigure('chart bar\nx "정확도(%)"\nseries a "A"\nrow "r" a=5\nstep "s" "c"\n  reveal a');
  const missing = (await buildFigure(MISSING_BAR)).timeline.segs.map((seg) => seg.labelShifts);

  assert.ok(stepped[0] < 0, `only the first (main) bar is visible: ${stepped}`);
  assert.equal(stepped.at(-1), 0);
  assert.deepEqual(single.timeline.segs.map((seg) => seg.labelShifts), [[]]);
  // r 행은 모든 계열이 값이 있어 첫째(main) 막대 가운데로 갔다가 0으로 돌아온다. m 행은 이름이 둘째 막대 가운데에 있고 안내 글만 보이는 단계에서만 올라간다.
  assert.ok(missing[0][0] < 0 && missing[0][1] < 0);
  assert.deepEqual([missing.at(-1)[0], missing.at(-1)[1]], [0, 0]);
});

// 근거: 설계 playback.md 요구사항 "값이 없는 슬롯이 있는 행은 막대가 보이는 동안 이름이 그 막대에 맞는다"
test('drawChart_bar_label_of_a_row_with_a_missing_series_is_centered_on_its_only_bar', async () => {
  const body = await bodyOf(MISSING_BAR);
  const bars = [...body.matchAll(/<rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="12"[^>]*class="grow"/g)].map((m) => Number(m[1]) + 6);
  const labels = [...body.matchAll(/<text x="28" y="([\d.]+)" class="chart-label shift">/g)].map((m) => Number(m[1]) - 13 * 0.36);

  assert.equal(bars.length, 3);
  // r 행은 두 막대 가운데(첫 막대 가운데 + 8), m 행은 하나뿐인 막대(둘째 슬롯) 가운데
  assert.ok(Math.abs(labels[0] - (bars[0] + 8)) < 0.2, `${labels[0]} ${bars[0]}`);
  assert.ok(Math.abs(labels[1] - bars[2]) < 0.2, `${labels[1]} ${bars[2]}`);
});


// 근거: 설계 charts.md 그리기 "오른쪽에는 왼쪽 여백(28px)과 같은 여백, 아래는 마지막 글자 줄 아래 같은 여백", 결정 docs-integration.md "차트도 꽉 채움"
test('drawChart_content_has_equal_left_and_right_margins_and_the_pad_below_the_last_text_line', async () => {
  const sources = [
    ...charts.map(([file, source]) => ({ file, source, baseDir: new URL('.', EXAMPLES).pathname })),
    { file: 'scatter without titles', source: 'chart scatter\npoint "p" x=1 y=2\npoint "q" x=3 y=5\n' },
  ];
  assert.equal(charts.length, 6, '예제는 여섯 차트 종류를 모두 갖는다');

  for (const { file, source, baseDir } of sources) {
    const { chart } = await buildFigure(source, { baseDir });
    const { left, right } = extentOf(chart.body);

    if (baseDir) assert.ok(Math.abs(left - PAD) <= TOLERANCE, `${file}: left margin ${left}`);
    assert.ok(Math.abs(left - (chart.width - right)) <= TOLERANCE, `${file}: left ${left}, right margin ${chart.width - right}`);
    const baselines = [...chart.body.matchAll(/<text x="[\d.-]+" y="([\d.-]+)" class="chart-unit">/g)].map((m) => Number(m[1]));
    if (baselines.length) assert.equal(chart.height - Math.max(...baselines), PAD + values.space['1-5'], `${file}: bottom`);
  }
});

// 근거: 결정 docs-integration.md "차트도 꽉 채움": 히트맵 칸이 오른쪽 여백까지 폭을 채운다
test('drawChart_heatmap_cells_fill_the_width_up_to_the_right_margin', async () => {
  const { chart } = await buildFigure('chart heatmap\ncell "a" "x" 1\ncell "a" "y" 2\ncell "b" "x" 3\ncell "b" "y" 4\n');
  const cells = [...chart.body.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"[^>]*class="chart-heat"/g)].map((m) => Number(m[1]) + Number(m[2]));

  assert.ok(Math.abs(Math.max(...cells) - (chart.width - PAD)) <= TOLERANCE);
});

// 근거: 버그 #11(산점도 선) 화살촉이 점 이름을 가리지 않는다
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
