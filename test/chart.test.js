// 차트: 값 읽기와 오류, 계열 역할, 숫자 글자, 그리기 위치와 맞춤, 계열 드러내기(docs/design/charts.md).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { curveOf, timeAt } from '../src/easing.js';
import { formatChange, formatNumber, makeScale, valueFormat } from '../src/chart/scale.js';
import { measure } from '../src/measure/fonts.js';
import { parseFigure } from '../src/source/parse.js';
import { parseTime } from '../src/source/values.js';
import { toSvg } from '../src/svg.js';
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
  .filter((file) => file.endsWith('.dap') && readFileSync(new URL(file, EXAMPLES), 'utf8').startsWith('chart '))
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
  { rule: '막대 행 기준 음수', source: 'chart bar\nseries a "A"\nrow "r" a=5 rule=-1', expect: /a row rule cannot be negative/ },
  { rule: '막대가 아닌 종류의 행 기준', source: 'chart dumbbell\nseries a "A" role=compare\nseries b "B" role=main\nrow "r" a=5 b=3 rule=4', expect: /"rule" is not a value of a dumbbell chart/ },
  { rule: '차이 차트에 log', source: 'chart difference\nscale log\nseries a "A"\nrow "r" a=1', expect: /scale log is not allowed/ },
  { rule: '차이 차트 계열 수', source: 'chart difference\nseries a "A"\nseries b "B"\nrow "r" a=1 b=2', expect: /takes 1 series. Found 2/ },
  { rule: '0 시작 해제는 선 차트만(막대)', source: 'chart bar\nzero off\nseries a "A"\nrow "r" a=1', expect: /zero off is only for line charts/ },
  { rule: '0 시작 해제는 선 차트만(산점도)', source: 'chart scatter\nzero off\npoint "p" x=1 y=2', expect: /zero off is only for line charts/ },
  { rule: '0 시작 값 모양', source: 'chart line\nzero maybe\nseries a "A"\npoint x=1 a=2', expect: /zero is "on" or "off"/ },
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
  const sources = dirs.flatMap((dir) => readdirSync(dir).filter((name) => name.endsWith('.dap')).map((name) => ({ name, text: readFileSync(new URL(name, dir), 'utf8') })));
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

// 근거: 버그 #44(선 차트 기준선 라벨이 끝 점들과 겹침), 설계 charts.md 그리기 "그 자리를 데이터가 가리면 왼쪽 끝으로 옮긴다"
test('drawLine_rule_label_moves_to_the_free_side_when_dots_touch_the_rule_at_the_right_end', async () => {
  const rows = Array.from({ length: 10 }, (_, k) => `point x=${k + 1} a=${k < 5 ? 0.76 : 0.8142 + (k % 2) * 0.003}`).join('\n');
  const { chart } = await buildFigure(`chart line\ny "비율(%)"\nseries a "A"\nrule 0.8142 "목표"\n${rows}`);
  const label = /<text x="([\d.]+)" y="([\d.]+)" class="chart-rule-label( end)?">목표<\/text>/.exec(chart.body);
  const [x, baseline, width] = [Number(label[1]), Number(label[2]), measure('목표', 11)];
  const box = { x0: label[3] ? x - width : x, x1: label[3] ? x : x + width, y0: baseline - 11 - 2, y1: baseline };
  const dots = [...chart.body.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="(\d+)"[^>]*class="dot"/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), r: Number(m[3]) }));
  const covered = dots.filter((d) => d.x + d.r > box.x0 && d.x - d.r < box.x1 && d.y + d.r > box.y0 && d.y - d.r < box.y1);

  assert.equal(dots.length, 10);
  assert.deepEqual(covered, []);
  assert.equal(label[3], undefined, 'the free side is the left end');
});

// 근거: 이슈 #41 완료 조건 "다른 행에는 그 기준선이 그려지지 않음", 설계 charts.md 요구사항 "행마다 다른 기준", 호환 규칙 "생략하면 옛 뜻"
test('drawBars_row_rule_is_drawn_only_beside_its_own_row_and_widens_the_axis', async () => {
  const rows = [['r', 70, 80], ['s', 40, 90]];
  const source = `chart bar\nx "비율(%)"\nseries a "A"\nrule 50 "공통"\n${rows.map(([name, v, rule]) => `row "${name}" a=${v} rule=${rule}`).join('\n')}`;
  const body = await bodyOf(source);
  const lines = [...body.matchAll(/<line x1="([\d.]+)" x2="[\d.]+" y1="([\d.]+)" y2="([\d.]+)" class="chart-rule"\/>/g)].map((m) => m.slice(1).map(Number));
  const bars = [...body.matchAll(/<rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="12"[^>]*class="grow"/g)].map((m) => Number(m[1]));
  const [first, second, shared] = lines;
  const rowOf = (line) => bars.findIndex((top) => top > line[1] && top < line[2]);

  assert.equal(lines.length, 3, 'one shared rule and one rule per row');
  assert.deepEqual([rowOf(first), rowOf(second)], [0, 1], 'each row rule spans only its own row');
  assert.ok(first[0] < second[0], 'rule=80 sits left of rule=90');
  assert.ok(shared[2] - shared[1] > second[2] - second[1], 'the shared rule still crosses every row');
  assert.deepEqual(textsOf(body, 'chart-rule-label'), ['80', '90', '공통']);
  assert.ok(Math.max(...textsOf(body, 'chart-tick').map(Number)) >= 90, 'the axis covers the row rules');

  await withFolder(async (folder) => {
    writeFileSync(join(folder, 'rows.json'), JSON.stringify(rows.map(([label, a, rule]) => ({ label, a, rule }))));
    const fromData = await bodyOf('chart bar\nx "비율(%)"\nseries a "A"\nrule 50 "공통"\ndata "rows.json"', { baseDir: folder });

    assert.equal(fromData, body, 'a data element key "rule" reads the same row rule');
  });
  // 계열 이름이 rule이면 옛 뜻(계열 값)이 우선이라 행 기준을 그리지 않는다.
  assert.equal((await bodyOf('chart bar\nx "값(%)"\nseries rule "R"\nrow "r" rule=5')).includes('chart-rule-casing'), false);
});

// 근거: 이슈 #42 완료 조건 "차이가 음수인 행과 0인 행이 읽힘", 설계 charts.md 요구사항 "차이 차트가 음수 값, 음수 기준선, 모두 0인 값을 그린다"
test('drawDifferences_negative_values_negative_rule_and_all_zero_are_drawn_around_a_zero_line', async () => {
  const dotsOf = (body) => [...body.matchAll(/<circle cx="([\d.]+)"[^>]*class="chart-after pop"/g)].map((m) => Number(m[1]));
  const zeroOf = (body) => Number(/<line x1="([\d.]+)" x2="[\d.]+" [^>]*class="chart-zero"/.exec(body)[1]);
  const mixed = await bodyOf('chart difference\nx "차이(%p)"\ndecimals 1\nseries d "차이"\nrule -10 "기준선"\nrow "음수" d=-6.4 d.low=-9.8 d.high=-3\nrow "양수" d=3.2 d.low=-0.4 d.high=6.8\nrow "영" d=0 d.low=0 d.high=0');
  const flat = await bodyOf('chart difference\nx "차이(%p)"\nseries d "차이"\nrow "a" d=0 d.low=0 d.high=0\nrow "b" d=0 d.low=0 d.high=0');
  const [negative, positive, zero] = dotsOf(mixed);

  assert.ok(negative < zeroOf(mixed) && zeroOf(mixed) < positive, 'negative left of the zero line, positive right of it');
  assert.equal(zero, zeroOf(mixed), 'a zero difference sits on the zero line');
  assert.deepEqual(textsOf(mixed, 'chart-value'), ['−6.4', '+3.2', '0.0']);
  assert.deepEqual(textsOf(mixed, 'chart-rule-label'), ['기준선']);
  assert.deepEqual(textsOf(mixed, 'chart-tick').map(Number).filter((t) => t === 0), [0]);
  assert.deepEqual(dotsOf(flat), [zeroOf(flat), zeroOf(flat)]);
  assert.deepEqual(textsOf(flat, 'chart-tick'), ['-1', '-0.5', '0', '0.5', '1']);
});

// 근거: 이슈 #42 재현 원본(값이 모두 0이고 기준선이 -10), 설계 charts.md "차이 차트의 0은 값 축 안쪽에 선다"
test('drawDifferences_zero_stays_a_tick_step_inside_the_axis_and_texts_stay_in_the_frame', async () => {
  const sources = [
    'chart difference\nx "차이(%p)"\nseries d "차이"\nrule -10 "기준선"\nrow "a" d=0 d.low=0 d.high=0',
    'chart difference\nx "차이(%p)"\nseries d "차이"\nrow "a" d=3 d.low=1 d.high=6',
    'chart difference\nx "차이(%p)"\nseries d "차이"\nrow "a" d=-3 d.low=-6 d.high=-1',
  ];
  for (const source of sources) {
    const { chart } = await buildFigure(source);
    const ticks = [...chart.body.matchAll(/<text x="([\d.]+)"[^>]*class="chart-tick">([^<]*)</g)].map((m) => [Number(m[1]), m[2]]);
    const zero = ticks.find(([, label]) => label === '0')[0];
    const step = ticks[1][0] - ticks[0][0];
    const texts = [...chart.body.matchAll(/<text x="([\d.]+)"[^>]*class="chart-value[^"]*">([^<]*)</g)];

    assert.ok(zero - ticks[0][0] >= step - 1 && ticks.at(-1)[0] - zero >= step - 1, `${source}: ticks ${ticks.map((t) => t[1])}`);
    for (const [, x, text] of texts) assert.ok(Number(x) + measure(text, 11, 'numSemibold') <= chart.width - PAD + TOLERANCE, text);
  }
});

// 근거: 이슈 #43 완료 조건 "축이 값 범위에 맞춤", "생략하면 지금 뜻"(호환 규칙), 설계 charts.md "잘린 축은 잘림이 보인다"
test('drawLine_zero_off_fits_the_value_range_and_marks_a_cut_axis', async () => {
  const rows = [0.76, 0.758, 0.812, 0.815].map((v, k) => `point x=${k + 1} a=${v}`).join('\n');
  const head = (zero) => `chart line\ny "비율(%)"\n${zero}series a "A"`;
  const yTicks = (body) => textsOf(body, 'chart-tick end').map(Number);
  const kept = await bodyOf(`${head('')}\n${rows}`);
  const cut = await bodyOf(`${head('zero off\n')}\n${rows}`);
  const crossing = await bodyOf(`${head('zero off\n')}\npoint x=1 a=-2\npoint x=2 a=3`);

  assert.equal(yTicks(kept)[0], 0, 'omitting zero keeps the old axis from 0');
  assert.equal(kept.includes('chart-break'), false);
  assert.ok(yTicks(cut)[0] > 0.7 && yTicks(cut).at(-1) < 0.9, `fits the data: ${yTicks(cut)}`);
  assert.equal(cut.split('class="chart-break"').length - 1, 1, 'a cut axis shows one break mark');
  assert.equal(crossing.includes('chart-break'), false, 'an axis that still contains 0 is not cut');
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
  assert.equal(charts.length, 7, '예제는 일곱 차트 종류를 모두 갖는다');

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
  const { chart } = await buildFigure(readFileSync(new URL('scatter.dap', EXAMPLES), 'utf8'));
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

// 근거: 설계 charts.md "머리와 선언 줄": 종류를 모르면 종류에 기대는 검사를 하지 않고 헤더 오류 하나만 남긴다
test('parseFigure_chart_header_failure_stops_before_any_type_dependent_check', () => {
  for (const source of ['chart', 'chart bogus', 'chart bogus\nseries s "S"\nrow "A" s=1\nrule 5 "R"']) {
    const error = (() => {
      try {
        parseFigure(source);
      } catch (e) {
        return e;
      }
    })();

    assert.deepEqual(error.problems.map((p) => p.line), [1], source);
    assert.ok(error.problems.every((p) => p.code !== 'internal'), source);
  }
});

// 근거: 설계 charts.md "머리와 선언 줄": 이름 문법에 맞고 실제 중복이 없는 계열 이름은 상속 속성 이름이어도 받는다
test('buildFigure_series_named_like_an_inherited_property_reads_once_and_real_duplicates_still_fail', async () => {
  // 이름 문법(소문자, 숫자, -)에 맞는 Object.prototype 속성은 constructor 하나다. 대소문자를 가리는 valueOf 따위는 문법에서 이미 걸러진다.
  for (const name of ['constructor']) {
    const source = `chart bar\nx "Value(ms)"\nseries ${name} "S"\nrow "A" ${name}=1\n`;

    assert.deepEqual(await problemsOf(source), [], name);
    assert.ok((await bodyOf(source)).includes('class="grow"'), name);
  }
  const twice = await problemsOf('chart bar\nx "Value(ms)"\nseries constructor "S"\nrow "A" constructor=1 constructor=2\n');
  const optionTwice = await problemsOf('chart bar\nx "Value(ms)"\nseries a "S" key="k" key="j"\nrow "A" a=1\n');
  const unknownWord = await problemsOf('chart bar\nx "Value(ms)"\nseries a "S"\nconstructor 1\nrow "A" a=1\n');

  assert.match(twice.join('\n'), /"constructor" is written twice/);
  assert.equal(optionTwice.length > 0, true);
  assert.match(unknownWord.join('\n'), /unknown chart statement "constructor"/);
});

const NINES = '9'.repeat(310);
const HEAD = 'chart line\nx "Time(s)"\ny "Value(ms)"\nseries s "S"\n';
// 입력 종류마다 Number 변환이 Infinity가 되는 글(310자리)과 유한하지만 1e15 이상인 글
const NUMBER_INPUTS = [
  { input: 'rule 선언, 310자리', source: `${HEAD}rule ${NINES} "Limit"\npoint x=0 s=1\npoint x=1 s=2`, line: 5 },
  { input: 'rule 선언, 1e15', source: `${HEAD}rule 1${'0'.repeat(15)} "Limit"\npoint x=0 s=1\npoint x=1 s=2`, line: 5 },
  { input: 'rule 선언, 음수 310자리', source: `${HEAD}rule -${NINES} "Limit"\npoint x=0 s=1\npoint x=1 s=2`, line: 5 },
  { input: '선 차트 point 값', source: `${HEAD}point x=0 s=${NINES}\npoint x=1 s=2`, line: 5 },
  { input: '선 차트 point x', source: `${HEAD}point x=${NINES} s=1\npoint x=1 s=2`, line: 5 },
  { input: '막대 행 값', source: `chart bar\nx "v(ms)"\nseries s "S"\nrow "A" s=${NINES}`, line: 4 },
  { input: '막대 행 기준 rule=', source: `chart bar\nx "v(ms)"\nseries s "S"\nrow "A" s=1 rule=${NINES}`, line: 4 },
  { input: '히트맵 cell', source: `chart heatmap\ncell "a" "b" ${NINES}`, line: 2 },
  { input: '산점도 point', source: `chart scatter\nx "a(ms)"\ny "b(ms)"\npoint "p" x=1 y=${NINES}`, line: 4 },
];

// 근거: 설계 charts.md 값 범위 "값의 절댓값은 1e15 미만": rule과 행 숫자가 같은 유한성·범위 검사를 받고 성공한 SVG에는 비유한 좌표가 없다
test('buildFigure_chart_numbers_that_overflow_or_pass_1e15_are_line_errors_for_every_input_kind', async () => {
  for (const { input, source, line } of NUMBER_INPUTS) {
    const errors = await problemsOf(source, { strict: true });

    assert.equal(errors.length > 0, true, `${input}: 오류 없음`);
    assert.ok(errors.every((e) => e.startsWith(`${line}:`)), `${input}: ${errors.join(' | ')}`);
    assert.doesNotMatch(errors.join('\n'), /internal/, input);
  }
  const result = await buildFigure(`${HEAD}rule 999999999999999 "Limit"\npoint x=0 s=1\npoint x=1 s=2`, { strict: true });
  const svg = await toSvg(result, { isStatic: true });

  assert.doesNotMatch(svg, /NaN|Infinity/);
});

// 근거: 설계 playback.md·figure-syntax.md 시간 값과 aspect: 유한하지 않은 시간과 비율은 구문 오류다
test('parseFigure_time_and_ratio_that_overflow_to_infinity_are_syntax_errors', () => {
  assert.equal(parseTime(`${NINES}ms`), undefined);
  assert.equal(parseTime(`${NINES}s`, true), undefined);
  assert.equal(parseTime('900ms'), 900);
  assert.throws(() => parseFigure(`chart bar\nspeed ${NINES}s\nseries a "A"\nrow "r" a=1`), (e) => e.problems[0].line === 2);
  assert.throws(() => parseFigure(`flow right\naspect ${NINES}\nbox a "A"`), (e) => e.problems[0].line === 2);
});

// 근거: 설계 charts.md 값 축 "막대, 덤벨, 상자에서 값이 모두 0이면 오류": 숫자가 하나도 없는 막대도 길이로 보일 것이 없어 오류다. 일부 누락과 값 0은 그린다
test('buildFigure_bar_with_every_value_missing_is_an_error_and_partial_missing_or_zero_still_draw_finite_coordinates', async () => {
  const head = 'chart bar\nx "Value(ms)"\nseries s "S"\n';
  const allMissing = await problemsOf(`${head}row "A" s=-`, { strict: true });
  const withRule = await problemsOf(`${head}rule 5 "R"\nrow "A" s=-\nrow "B" s=-`, { strict: true });
  const fromData = await problemsOf('chart bar\nx "Value(ms)"\nseries s "S"\ndata "nulls.json"', { strict: true, baseDir: FIXTURES });

  assert.match(allMissing.join('\n'), /^4: .*at least one number/);
  assert.match(withRule.join('\n'), /^5: .*at least one number/);
  assert.match(fromData.join('\n'), /at least one number/);
  for (const rows of ['row "A" s=-\nrow "B" s=3', 'row "A" s=0\nrow "B" s=3', 'row "A" s=0\nrow "B" s=-\nrow "C" s=2']) {
    const result = await buildFigure(`${head}${rows}`, { strict: true });
    const svg = await toSvg(result, { isStatic: true });

    assert.deepEqual(result.warnings, [], rows);
    assert.doesNotMatch(svg, /NaN|Infinity/, rows);
  }
});

// 근거: 설계 charts.md 눈금 "정밀도는 축 간격에 맞춘다": 값 범위가 작아도 눈금은 서로 다른 값이고 순서대로 늘어난다
test('makeScale_linear_ticks_stay_distinct_and_exact_for_tiny_large_negative_and_zero_adjacent_ranges', () => {
  const cases = [
    { name: '1e-12 단위', range: { min: 1e-12, max: 2e-12 }, first: 0, last: 2e-12, count: 5 },
    { name: '0 주변 음양', range: { min: -1e-12, max: 1e-12 }, first: -1e-12, last: 1e-12 },
    { name: '이진 오차(0.1 + 0.2)', range: { min: 0.1, max: 0.3 }, first: 0, last: 0.3 },
    { name: '큰 값에서 0 시작', range: { min: 1e14, max: 3e14 }, first: 0, last: 3e14 },
    { name: '음수만', range: { min: -3e-9, max: -1e-9 }, first: -3e-9, last: -1e-9 },
    { name: '값이 0 하나', range: { min: 0, max: 0 }, first: 0, last: 1 },
    { name: '0 시작 해제, 큰 값의 작은 차이', range: { min: 1e14, max: 1e14 + 5, fromZero: false }, first: 1e14, last: 1e14 + 5 },
    { name: '0 시작 해제, 작은 값의 작은 차이', range: { min: 1.5e-12, max: 1.9e-12, fromZero: false }, first: 1.5e-12, last: 1.9e-12 },
  ];
  for (const { name, range, first, last, count } of cases) {
    const { ticks, labels, at } = makeScale('linear', { ...range, start: 0, length: 100 });

    assert.equal(ticks[0], first, `${name}: 첫 눈금 ${ticks}`);
    assert.equal(ticks.at(-1), last, `${name}: 끝 눈금 ${ticks}`);
    if (count) assert.equal(ticks.length, count, name);
    assert.ok(ticks.every((t, i) => i === 0 || t > ticks[i - 1]), `${name}: 눈금이 늘어나지 않음 ${ticks}`);
    assert.equal(new Set(labels).size, labels.length, `${name}: 눈금 글자가 겹침 ${labels}`);
    assert.ok(ticks.every((t) => Number.isFinite(at(t))) && at(ticks.at(-1)) > at(ticks[0]), name);
  }
});

// 근거: 이슈 #75 재현. 설계 charts.md 눈금: 작은 값의 선 차트에서 y축 눈금 글자가 모두 달라야 한다
test('buildFigure_line_chart_of_tiny_values_draws_distinct_y_ticks_and_distinct_grid_lines', async () => {
  const source = 'chart line\nx "Time(s)"\ny "Value(s)"\nseries s "S"\npoint x=0 s=0.000000000001\npoint x=1 s=0.000000000002';
  const body = await bodyOf(source, { strict: true });
  const labels = [...body.matchAll(/class="chart-tick end">([^<]*)</g)].map((m) => m[1]);
  const ys = [...body.matchAll(/y1="([^"]*)"[^>]*class="chart-grid"/g)].map((m) => m[1]);

  assert.ok(labels.length >= 3, labels.join());
  assert.equal(new Set(labels).size, labels.length, `y 눈금 글자 ${labels}`);
  assert.equal(new Set(ys).size, ys.length, `격자 y ${ys}`);
  assert.deepEqual(labels.slice(0, 3), ['0', '5e-13', '1e-12']);
});

// 근거: 설계 charts.md 값 글자 "1000 미만은 가장 짧은 십진 표기": 소수 자릿수가 모자라 0으로 지워지는 작은 값은 지수 표기로 쓴다
test('valueFormat_tiny_nonzero_values_use_exponent_notation_instead_of_rounding_to_zero', () => {
  const format = valueFormat([1e-12, 2e-12]);

  assert.deepEqual([format(1e-12), format(2e-12), format(0)], ['1e-12', '2e-12', '0']);
  assert.equal(valueFormat([0.5, 1.25])(0.5), '0.50');
  assert.equal(valueFormat([1e-12], 2)(1e-12), '0.00');
});
