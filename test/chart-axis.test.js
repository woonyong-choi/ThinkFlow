// 차트 값 범위와 축: 0이 아닌 비정규화 수 거부, 가까운 값의 구분되는 축 또는 거부, 비유한 좌표 방어선(docs/design/charts.md 값 출처, 그리기 절, 이슈 #104).
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { assertFinite } from '../src/chart/guard.js';
import { AxisError, formatChange, makeScale } from '../src/chart/scale.js';
import { toSvg } from '../src/svg.js';
import { formatProblem, runCli, withFolder } from './helpers.js';

const MIN_NORMAL = 2 ** -1022;
const EPSILON = 2 ** -52;
const TINY_ERROR = /nonzero values must be at least 2\.2250738585072014e-308 in absolute value/;
const CLOSE_ERROR = /values are too close to tell apart on an axis/;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
// 숫자를 원본 문법이 받는 십진 글(지수 표기 없음)로 쓴다.
function decimal(number) {
  const text = String(Math.abs(number));
  const sign = number < 0 ? '-' : '';
  const match = /^(\d)(?:\.(\d+))?e-(\d+)$/.exec(text);
  return match ? `${sign}0.${'0'.repeat(Number(match[3]) - 1)}${match[1]}${match[2] ?? ''}` : `${sign}${text}`;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
// 원본을 만들 때 나는 오류를 `줄: 메시지`로 돌려준다. 오류가 없으면 빈 목록이다.
async function problemsOf(source, options) {
  try {
    await buildFigure(source, options);
    return [];
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems.map(formatProblem);
  }
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 눈금 수
// basis: estimate
// 축이 쓸 만한지: 눈금이 모두 유한하고, 엄격히 늘고, 글자가 서로 다르고, 값 범위를 덮는다.
function assertUsableAxis({ ticks, labels }, { min, max }, name) {
  assert.ok(ticks.every(Number.isFinite), `${name}: 유한하지 않은 눈금 ${ticks}`);
  assert.ok(ticks.length >= 2 && ticks.every((t, i) => i === 0 || t > ticks[i - 1]), `${name}: 눈금이 늘어나지 않음 ${ticks}`);
  assert.equal(new Set(labels).size, labels.length, `${name}: 눈금 글자가 겹침 ${labels}`);
  assert.ok(ticks[0] <= min && max <= ticks.at(-1), `${name}: 값 범위를 덮지 못함 ${ticks}`);
}

const HEAD = 'chart line\nx "Time(s)"\ny "Value(s)"\nseries s "S"\n';
const ZERO_OFF = 'chart line\nzero off\nx "Time(s)"\ny "Value(s)"\nseries s "S"\n';
const TINY = `0.${'0'.repeat(322)}1`;
const TINY_TWO = `0.${'0'.repeat(322)}2`;

// 근거: 이슈 #104 재현: 약 1e-323 값의 선 차트가 경고 없이 통과해 NaN 좌표를 썼다. 정책: 0이 아닌 비정규화 수는 해당 줄의 오류다
test('buildFigure_nonzero_subnormal_numbers_are_line_errors_for_every_input_kind', async () => {
  const subnormal = decimal(MIN_NORMAL - 2 ** -1074);
  const cases = [
    { input: '이슈 원본 두 줄', source: `${HEAD}point x=0 s=${TINY}\npoint x=1 s=${TINY_TWO}`, lines: [5, 6] },
    { input: '가장 큰 비정규화 수', source: `${HEAD}point x=0 s=${subnormal}\npoint x=1 s=1`, lines: [5] },
    { input: '음수', source: `${HEAD}point x=0 s=-${TINY}\npoint x=1 s=1`, lines: [5] },
    { input: 'Number로 바꾸면 0이 되는 글', source: `${HEAD}point x=0 s=0.${'0'.repeat(400)}1\npoint x=1 s=1`, lines: [5] },
    { input: '선 차트 x', source: `${HEAD}point x=${TINY} s=1\npoint x=1 s=2`, lines: [5] },
    { input: 'rule 선언', source: `${HEAD}rule ${TINY} "Limit"\npoint x=0 s=1\npoint x=1 s=2`, lines: [5] },
    { input: '막대 행 값', source: `chart bar\nx "v(ms)"\nseries s "S"\nrow "A" s=${TINY}\nrow "B" s=1`, lines: [4] },
    { input: '막대 행 기준 rule=', source: `chart bar\nx "v(ms)"\nseries s "S"\nrow "A" s=1 rule=${TINY}`, lines: [4] },
    { input: '히트맵 cell', source: `chart heatmap\ncell "a" "b" ${TINY}`, lines: [2] },
    { input: '산점도 point', source: `chart scatter\nx "a(ms)"\ny "b(ms)"\npoint "p" x=1 y=${TINY}`, lines: [4] },
  ];
  for (const { input, source, lines } of cases) {
    const errors = await problemsOf(source, { strict: true });

    assert.deepEqual(errors.map((e) => Number.parseInt(e, 10)), lines, `${input}: ${errors.join(' | ')}`);
    assert.ok(errors.every((e) => TINY_ERROR.test(e)), input);
  }
});

// 근거: 이슈 #104 정책: data의 숫자도 같은 하한을 받는다. 원본 글이 아니라 JSON이라 data 줄이 줄 번호다
test('buildFigure_subnormal_number_in_data_is_an_error_on_the_data_line', async () => {
  await withFolder(async (folder) => {
    writeFileSync(join(folder, 'rows.json'), JSON.stringify([{ label: 'A', s: 1e-323 }, { label: 'B', s: 1 }]));

    const errors = await problemsOf('chart bar\nx "v(ms)"\nseries s "S"\ndata "rows.json"', { strict: true, baseDir: folder });

    assert.equal(errors.length, 1);
    assert.match(errors[0], /^4: /);
    assert.match(errors[0], TINY_ERROR);
  });
});

// 근거: 이슈 #104 정책: 0과 가장 작은 정규 수는 받는다. 비정규화 수와의 경계는 2^-1022다
test('buildFigure_zero_and_the_smallest_normal_number_are_accepted', async () => {
  for (const value of [0, MIN_NORMAL, -MIN_NORMAL]) {
    const source = `${HEAD}point x=0 s=0\npoint x=1 s=${decimal(value)}`;
    const svg = await toSvg(await buildFigure(source, { strict: true }), { isStatic: true });

    assert.doesNotMatch(svg.replace(/base64,[A-Za-z0-9+/=]+/g, ''), /NaN|Infinity/, String(value));
  }
});

// 근거: 이슈 #104 완료 조건: 처음 재현 원본이 해당 줄 진단으로 끝나고 결과 파일을 쓰지 않는다(CLI)
test('main_render_of_issue_104_source_writes_no_file_and_names_the_lines', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'tiny.dap'), `${HEAD}point x=0 s=${TINY}\npoint x=1 s=${TINY_TWO}\n`);

    const result = runCli(['render', 'tiny.dap', '--html', '--strict'], folder);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /tiny\.dap:5: nonzero values must be at least/);
    assert.match(result.stderr, /tiny\.dap:6: nonzero values must be at least/);
    assert.equal(existsSync(join(folder, 'tiny.svg')) || existsSync(join(folder, 'tiny.html')), false);
  });
});

// 근거: 이슈 #104 완료 조건: makeScale에 1과 1.0000000000000002를 넣었을 때 눈금이 겹치지 않는다(구분되는 축). 수정 전에는 [1, 1, 1, 1.0000000000000002, 1.0000000000000002]였다
test('makeScale_neighbouring_floats_get_a_distinguishing_axis_or_an_axis_error', () => {
  const range = { min: 1, max: 1 + EPSILON };
  for (const fromZero of [false, true]) {
    try {
      assertUsableAxis(makeScale('linear', { ...range, start: 0, length: 100, fromZero }), range, `fromZero ${fromZero}`);
    } catch (error) {
      if (!(error instanceof AxisError)) throw error;
    }
  }
  assertUsableAxis(makeScale('linear', { ...range, start: 0, length: 100, fromZero: false }), range, '구분되는 축을 찾는다');
  const { at } = makeScale('linear', { ...range, start: 0, length: 100, fromZero: false });

  assert.ok(at(range.max) > at(range.min), '가까운 두 값이 같은 자리에 놓임');
});

// 근거: 이슈 #104 정책: 구분되는 축을 끝내 만들 수 없으면 값을 합치지 않고 거부한다. 일곱 번 키운 간격으로도 눈금 글자가 겹치는 이웃 값과 유한하지 않은 범위
test('makeScale_ranges_that_no_step_can_separate_throw_an_axis_error', () => {
  assert.throws(() => makeScale('linear', { min: -3.1969750181970602e-257, max: -3.19697501819706e-257, start: 0, length: 100, fromZero: false }), AxisError);
  assert.throws(() => makeScale('linear', { min: 0, max: Number.POSITIVE_INFINITY, start: 0, length: 100 }), AxisError);
  assert.throws(() => makeScale('log', { min: 1, max: Number.NaN, start: 0, length: 100 }), AxisError);
});

const BOUNDARY = [
  { name: '이웃한 수 1', min: 1, max: 1 + EPSILON },
  { name: '이웃한 수 1 아래', min: 1 - EPSILON / 2, max: 1 },
  { name: '1e14의 작은 차이', min: 1e14, max: 1e14 + 0.015625 },
  { name: '1e15 아래 이웃', min: 999999999999999, max: 999999999999999.125 },
  { name: '모두 같은 값 1', min: 1, max: 1 },
  { name: '모두 같은 작은 값', min: MIN_NORMAL, max: MIN_NORMAL },
  { name: '모두 같은 음수', min: -7, max: -7 },
  { name: '모두 0', min: 0, max: 0 },
  { name: '0과 가장 작은 정규 수', min: 0, max: MIN_NORMAL },
  { name: '0과 작은 정상값', min: 0, max: 1e-300 },
  { name: '음수 작은 값과 0', min: -1e-300, max: 0 },
  { name: '가장 작은 정규 수 음수', min: -MIN_NORMAL, max: -MIN_NORMAL },
  { name: '0을 걸친 작은 범위', min: -1e-300, max: 1e-300 },
  { name: '0을 걸친 가장 작은 정규 수', min: -MIN_NORMAL, max: MIN_NORMAL },
  { name: '0을 걸친 이웃', min: -5e-324 * 2 ** 53, max: 5e-324 * 2 ** 53 },
  { name: '0을 걸친 큰 범위', min: -999999999999999, max: 999999999999999 },
  { name: '양수만, 큰 값', min: 5e14, max: 5e14 + 1 },
  { name: '음수만, 큰 값', min: -5e14 - 1, max: -5e14 },
];

// 근거: 이슈 #104 완료 조건: 가까운 값, 모두 같은 값, 0 주변, 0을 걸친 범위, 로그 축에서 성공한 축은 눈금이 유한하고 엄격히 늘며 눈금 글자가 서로 다르다
test('makeScale_boundary_ranges_give_finite_strictly_increasing_ticks_with_distinct_labels', () => {
  for (const { name, min, max } of BOUNDARY) {
    for (const fromZero of [true, false]) assertUsableAxis(makeScale('linear', { min, max, start: 0, length: 100, fromZero }), { min, max }, `${name} fromZero=${fromZero}`);
    if (min > 0) assertUsableAxis(makeScale('log', { min, max, start: 0, length: 100 }), { min, max }, `${name} log`);
  }
  assertUsableAxis(makeScale('log', { min: MIN_NORMAL, max: 1e14, start: 0, length: 100 }), { min: MIN_NORMAL, max: 1e14 }, '로그 아래 끝');
});

// 종류마다 값 둘로 원본을 만든다. allows는 그 종류가 받는 값(log 눈금은 0 이하를, 막대, 덤벨, 상자는 음수를 받지 않는다)이다.
const KINDS = {
  line: { allows: () => true, source: (a, b) => `${HEAD}point x=0 s=${decimal(a)}\npoint x=1 s=${decimal(b)}`, axes: [/class="chart-tick end">([^<]*)</g, /class="chart-tick">([^<]*)</g] },
  'line zero off': { allows: () => true, source: (a, b) => `chart line\nzero off\nx "Time(s)"\ny "Value(s)"\nseries s "S"\npoint x=0 s=${decimal(a)}\npoint x=1 s=${decimal(b)}`, axes: [/class="chart-tick end">([^<]*)</g] },
  'line log': { allows: (a, b) => a > 0 && b > 0, source: (a, b) => `chart line\nscale log\nx "Time(s)"\ny "Value(s)"\nseries s "S"\npoint x=0 s=${decimal(a)}\npoint x=1 s=${decimal(b)}`, axes: [/class="chart-tick end">([^<]*)</g] },
  scatter: { allows: () => true, source: (a, b) => `chart scatter\nx "a(s)"\ny "b(s)"\npoint "p" x=${decimal(a)} y=${decimal(b)}\npoint "q" x=${decimal(b)} y=${decimal(a)}`, axes: [/class="chart-tick end">([^<]*)</g, /class="chart-tick">([^<]*)</g] },
  bar: { allows: (a, b) => a >= 0 && b >= 0, source: (a, b) => `chart bar\nx "v(s)"\nseries s "S"\nrow "A" s=${decimal(a)}\nrow "B" s=${decimal(b)}`, axes: [/class="chart-tick">([^<]*)</g] },
  difference: { allows: () => true, source: (a, b) => `chart difference\nx "v(s)"\nseries s "S"\nrow "A" s=${decimal(a)}\nrow "B" s=${decimal(b)}`, axes: [/class="chart-tick">([^<]*)</g] },
  dumbbell: { allows: (a, b) => a >= 0 && b >= 0, source: (a, b) => `chart dumbbell\nx "v(s)"\nseries a "A" role=compare\nseries b "B" role=main\nrow "R" a=${decimal(a)} b=${decimal(b)}`, axes: [/class="chart-tick">([^<]*)</g] },
  'dumbbell log': { allows: (a, b) => a > 0 && b > 0, source: (a, b) => `chart dumbbell\nscale log\nx "v(s)"\nseries a "A" role=compare\nseries b "B" role=main\nrow "R" a=${decimal(a)} b=${decimal(b)}`, axes: [/class="chart-tick">([^<]*)</g] },
  box: { allows: (a, b) => a >= 0 && b >= 0, source: (a, b) => `chart box\nx "v(s)"\nrow "R" min=${decimal(Math.min(a, b))} q1=${decimal(Math.min(a, b))} median=${decimal(Math.min(a, b))} q3=${decimal(Math.max(a, b))} max=${decimal(Math.max(a, b))}`, axes: [/class="chart-tick">([^<]*)</g] },
  heatmap: { allows: (a, b) => a >= 0 && b >= 0, source: (a, b) => `chart heatmap\ncell "a" "x" ${decimal(a)}\ncell "a" "y" ${decimal(b)}`, axes: [] },
};
const PAIRS = [
  [1, 1 + EPSILON],
  [1, 1],
  [0, MIN_NORMAL],
  [0, 1e-300],
  [-1e-300, 0],
  [-1e-300, 1e-300],
  [-1, 1],
  [MIN_NORMAL, MIN_NORMAL],
  [1e14, 1e14 + 0.015625],
  [0.1, 0.3],
];

// 근거: 이슈 #104 완료 조건: 모든 차트 종류에서 가까운 값, 같은 값, 0 주변, 0을 걸친 범위가 성공하면 눈금 글자가 서로 다르고 출력에 NaN, Infinity가 없다. 실패하면 줄 번호가 있는 진단이다
test('buildFigure_every_chart_kind_with_close_values_draws_a_distinct_axis_without_NaN', async () => {
  for (const [kind, { allows, source, axes }] of Object.entries(KINDS)) {
    const pairs = PAIRS.filter(([x, y]) => allows(x, y));
    for (const [a, b] of pairs) {
      const isFirst = a === pairs[0][0] && b === pairs[0][1];
      const name = `${kind} ${a} ${b}`;
      let result;
      try {
        result = await buildFigure(source(a, b), { strict: true });
      } catch (error) {
        if (!error.problems) throw error;
        assert.ok(error.problems.every((p) => p.line > 0 && CLOSE_ERROR.test(p.message)), `${name}: ${error.problems.map(formatProblem)}`);
        continue;
      }
      const svg = isFirst ? await toSvg(result, { isStatic: true }) : result.chart.body;

      assert.doesNotMatch(svg.replace(/base64,[A-Za-z0-9+/=]+/g, ''), /NaN|Infinity/, name);
      for (const pattern of axes) {
        const labels = [...result.chart.body.matchAll(pattern)].map((m) => m[1]);

        assert.ok(labels.length >= 2, `${name}: 눈금 글자 ${labels}`);
        assert.equal(new Set(labels).size, labels.length, `${name}: 눈금 글자가 겹침 ${labels}`);
      }
    }
  }
});

// 근거: 이슈 #104 정책: 구분되는 축을 만들 수 없는 값은 합치지 않고 그 축 범위의 가장 큰 값이 있는 줄의 오류로 거부한다
test('buildFigure_values_that_no_axis_can_separate_are_an_error_on_the_line_of_the_larger_value', async () => {
  const [low, high] = [-3.1969750181970602e-257, -3.19697501819706e-257];

  const errors = await problemsOf(`${ZERO_OFF}point x=0 s=${decimal(low)}\npoint x=1 s=${decimal(high)}`, { strict: true });
  const swapped = await problemsOf(`${ZERO_OFF}point x=0 s=${decimal(high)}\npoint x=1 s=${decimal(low)}`, { strict: true });

  assert.equal(errors.length, 1, errors.join(' | '));
  assert.match(errors[0], /^7: values are too close to tell apart on an axis \(-3\.1969750181970602e-257 to -3\.19697501819706e-257\)\. Move them further apart$/);
  assert.match(swapped.join('\n'), /^6: values are too close/);
});

// 근거: 이슈 #104 정책: 축과 장면 좌표를 다 그린 뒤 비유한 값이 있으면 결과를 내지 않는다. 사용자 글의 "NaN"은 좌표가 아니라 걸리지 않는다
test('assertFinite_rejects_non_finite_coordinates_but_not_NaN_in_user_text', async () => {
  const drawn = { body: '<circle cx="1" cy="2" r="3"/>', width: 960, height: 100, dotAts: [0.5], fits: [{ width: 1, room: 2 }] };

  assert.doesNotThrow(() => assertFinite(drawn));
  assert.doesNotThrow(() => assertFinite({ ...drawn, body: '<text x="1" class="chart-title">NaN Infinity rate</text>' }));
  assert.throws(() => assertFinite({ ...drawn, body: '<path d="M 76 NaN L 927 NaN"/>' }), /not a finite number/);
  assert.throws(() => assertFinite({ ...drawn, body: '<circle cy="-Infinity"/>' }), /not a finite number/);
  assert.throws(() => assertFinite({ ...drawn, dotAts: [Number.NaN] }), /not a finite number/);
  assert.throws(() => assertFinite({ ...drawn, fits: [{ width: Number.POSITIVE_INFINITY, room: 1 }] }), /not a finite number/);
  assert.throws(() => assertFinite({ ...drawn, body: '<text x="1" class="chart-ratio late">+Infinity%</text>' }), /not a finite number/);
  assert.throws(() => assertFinite({ ...drawn, height: Number.NaN }), /not a finite number/);
  const real = await buildFigure(`chart line\ntitle "NaN rate"\nx "Time(s)"\ny "Value(s)"\nseries s "S"\npoint x=0 s=1\npoint x=1 s=2`, { strict: true });

  assert.doesNotThrow(() => assertFinite(real.chart));
});

// 근거: 이슈 #104 완료 조건 "성공한 출력에 NaN, Infinity가 없다": 가장 작은 정규 수에서 1로 가는 덤벨의 바뀐 비율은 숫자 범위를 넘어 Infinity%가 되던 값이다
test('formatChange_leaves_the_text_empty_when_the_ratio_leaves_the_number_range', async () => {
  assert.equal(formatChange(MIN_NORMAL, 1), '');
  assert.equal(formatChange(0, 1), '');
  assert.equal(formatChange(100, 114), '+14%');
  const source = `chart dumbbell\nx "v(s)"\nseries a "A" role=compare\nseries b "B" role=main\nrow "R" a=${decimal(MIN_NORMAL)} b=1`;
  const { chart } = await buildFigure(source, { strict: true });

  assert.doesNotMatch(chart.body, /NaN|Infinity/);
});
