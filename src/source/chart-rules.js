// 차트 규칙. docs/design/charts.md의 "종류와 행 줄", "머리와 선언 줄", "시간 흐름" 절을 확인한다.
import { VALUES } from './grammar.js';
import { MAX_VALUE, RANGE_MESSAGE, TINY_MESSAGE, isTiny } from './chart-limits.js';
import { prepareParts } from './parts.js';
import { prepareWaterfall } from './waterfall.js';
import { prepareHistogram } from './histogram.js';
import { unknownName } from './problems.js';

const CHART_TYPES = VALUES.chartType.items;
const PREPARE_ROWS = { histogram: prepareHistogram, waterfall: prepareWaterfall, pie: prepareParts, donut: prepareParts };

/** 행 값에서 정해지는 차트 상태(원·도넛의 비율, 워터폴의 누계, 히스토그램 구간)를 다시 계산한다. 값에 묶인 차트가 프레임마다 행 값을 바꾼 뒤 부른다. */
export function prepareChartRows(figure, problems) {
  PREPARE_ROWS[figure.chartType]?.(figure, problems);
}
// 신뢰구간(`값.low`, `값.high`)을 받는 종류
export const INTERVAL_TYPES = Object.keys(CHART_TYPES).filter((type) => CHART_TYPES[type].isInterval);
// 값 자리에 `-`(빠진 값)를 받는 종류
const MISSING_TYPES = Object.keys(CHART_TYPES).filter((type) => CHART_TYPES[type].allowsMissing);
// 계열 수 범위 글(`2`, `1 to 3`, `1 or more`)
const seriesCount = (low, high) => (low === high ? `${low}` : high === Infinity ? `${low} or more` : `${low} to ${high}`);
// main과 compare는 계열이 하나나 둘일 때만 생략한 계열이 받는 역할이고, 차트 종류의 firstRole이 앞이다.
const AUTO_ROLES = ['main', 'compare'];
// 쌓거나 나눌 뜻이 없어 reference(기대값) 계열을 받지 않는 종류
const NO_REFERENCE = ['stacked', 'percent', 'dumbbell'];
const BOX_KEYS = CHART_TYPES.box.valueKeys;
// 값 자리가 `value` 하나이고 `-`를 받는 종류
const SINGLE_VALUE = ['ecdf', 'histogram', 'waterfall'];
// 종류마다 고정 원소 키. 계열 키와 겹치면 JSON에서 둘을 가를 수 없다.
const FIXED_KEYS = ['label', 'name', 'x', 'y', 'series', 'row', 'col', 'value'];

// cost: time O(r·k + b), heap O(r), stack O(1)
// vars: r = 행 수, k = 행의 값 수, b = 박자 수
// basis: estimate
/** 원본을 다 읽은 뒤의 차트 규칙. `data`로 읽는 행은 checkChartRows가 읽은 뒤 확인한다. */
export function checkChart(figure, problems) {
  const { chart, chartType } = figure;
  const [low, high] = CHART_TYPES[chartType].seriesRange;
  if (chart.series.length < low || chart.series.length > high) {
    problems.error(chart.series[high]?.line ?? figure.line, `a ${chartType} chart takes ${seriesCount(low, high)} series. Found ${chart.series.length}`);
  }
  if (checkSeriesRoles(figure, problems)) orderSeriesByRole(figure);
  if (chart.missing !== undefined && !CHART_TYPES[chartType].allowsMissing) problems.error(figure.line, `missing is only for charts whose values can be "-": ${MISSING_TYPES.join(', ')}`);
  if (['bar', 'stacked', 'percent', 'histogram', 'waterfall'].includes(chartType) && chart.scale === 'log') problems.error(chart.scaleLine ?? figure.line, `a ${chartType} chart starts at 0, so scale log is not allowed`);
  if (chartType === 'area' && chart.scale === 'log') problems.error(chart.scaleLine ?? figure.line, 'an area chart closes at 0, so scale log is not allowed');
  if (chartType === 'ecdf' && chart.scale === 'log') problems.error(chart.scaleLine ?? figure.line, 'an ecdf chart runs from 0 to 1 on its vertical axis, so scale log is not allowed');
  if (chartType === 'difference' && chart.scale === 'log') problems.error(chart.scaleLine ?? figure.line, 'a difference chart is centered on 0, so scale log is not allowed');
  if (chart.zero === 'off' && !['line', 'step'].includes(chartType)) problems.error(chart.zeroLine, 'zero off is only for line and step charts. Other charts keep their value axis at 0');
  if (chartType === 'heatmap' && (chart.scaleLine !== undefined || chart.rules.length)) problems.error(chart.scaleLine ?? chart.rules[0].line, 'a heatmap has no value axis. Remove scale and rule');
  for (const rule of chart.rules) if (Math.abs(rule.value) >= MAX_VALUE) problems.error(rule.line, RANGE_MESSAGE);
  for (const rule of chart.rules) if (isTiny(rule.value)) problems.error(rule.line, TINY_MESSAGE);
  for (const rule of chart.rules) if (chart.scale === 'log' && rule.value <= 0) problems.error(rule.line, 'log scale needs values above 0');
  for (const rule of chart.rules) if (chartType === 'bar' && rule.value < 0) problems.error(rule.line, 'a bar chart starts at 0, so a rule cannot be negative');
  for (const rule of chart.rules) if (chartType === 'percent' && (rule.value < 0 || rule.value > 100)) problems.error(rule.line, 'a percent chart axis runs from 0 to 100, so a rule is a percent from 0 to 100');
  for (const s of chart.series) if (FIXED_KEYS.includes(s.key)) problems.error(s.line, `series key "${s.key}" is a fixed data key. Set key="..." to another name`);
  if (chart.data && chart.rows.length) problems.error(chart.data.line, 'use either data or row lines, not both');
  if (!chart.data) {
    checkChartRows(figure, problems);
    checkChartLightTargets(figure, problems);
  }
  checkChartTimeline(figure, problems);
  checkAxisUnits(figure, problems);
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 계열 수
// basis: estimate
// 계열 역할 규칙: main은 하나 이하, compare도 하나 이하이고, 나머지 계열은 역할이 없거나 reference다.
// 하나뿐인 계열은 compare나 reference일 수 없고(main으로 보인다), reference는 쌓거나 나눌 뜻이 없는 종류에서는 오류다. 모두 reference면 기대값과 견줄 실제 값이 없어 오류다. 맞으면 true다.
function checkSeriesRoles(figure, problems) {
  const { series } = figure.chart;
  const { chartType } = figure;
  const withRole = (role) => series.filter((s) => s.role === role);
  const ok = [];
  for (const role of AUTO_ROLES) {
    const [, extra] = withRole(role);
    if (!extra) continue;
    const found = series.map((s) => `${s.id}${s.role ? ` role=${s.role}` : ''}`).join(', ');
    // 둘뿐인 차트의 옛 문장 그대로: 둘 다 적고 같은 역할이 겹친 경우
    const hint = series.length === 2 && series.every((s) => s.role !== undefined) ? 'two series need one role=main and one role=compare' : `a chart takes at most one series with role=${role}`;
    problems.error(extra.line, `${hint}. Found ${found}`);
    ok.push(false);
  }
  for (const s of withRole('reference')) {
    if (NO_REFERENCE.includes(chartType)) {
      problems.error(s.line, `a ${chartType} chart has no expected-value series, so role=reference is not allowed. It stacks, divides, or pairs its series`);
      ok.push(false);
    }
  }
  if (series.length === 1 && series[0].role !== undefined && series[0].role !== 'main') {
    problems.error(series[0].line, 'a chart with one series shows it as main. Use role=main or remove role');
    ok.push(false);
  } else if (series.length > 1 && series.every((s) => s.role === 'reference')) {
    problems.error(series[0].line, 'every series is role=reference, so there is no actual series to compare. Give one series role=main or remove role');
    ok.push(false);
  }
  return !ok.length;
}

// cost: time O(s log s), heap O(s), stack O(1)
// vars: s = 계열 수
// basis: estimate
// 계열을 보이는 순서로 세운다. 먼저 차트 종류의 firstRole(기본 main), 다음 다른 자동 역할, 그다음 나머지(역할이 없거나 reference)가 선언 순서대로다. 색 번호는 이 순서를 따른다.
// 계열이 하나나 둘이면 role을 생략한 계열이 다른 계열이 쓰지 않은 자동 역할을 선언 순서대로 받는다. 덤벨은 시작점(compare)이 먼저라 옛 파일의 "첫 계열이 시작점" 뜻이 그대로다.
// 셋 이상이면 생략한 계열은 역할이 없는 채로 둔다. 셋째부터 main을 붙이지 않는다.
function orderSeriesByRole(figure) {
  const { series } = figure.chart;
  const first = CHART_TYPES[figure.chartType].firstRole ?? AUTO_ROLES[0];
  const order = [first, ...AUTO_ROLES.filter((role) => role !== first)];
  if (series.length <= 2) {
    const open = order.filter((role) => !series.some((s) => s.role === role));
    for (const s of series) if (s.role === undefined && (series.length === 1 || open.length)) s.role = series.length === 1 ? AUTO_ROLES[0] : open.shift();
  }
  const rank = (role) => (order.includes(role) ? order.indexOf(role) : order.length);
  series.sort((a, b) => rank(a.role) - rank(b.role));
}

// 값 축 종류. 히트맵은 값 축이 없다.
const VALUE_AXES = { bar: ['x'], stacked: ['x'], dumbbell: ['x'], box: ['x'], difference: ['x'], line: ['y'], area: ['y'], scatter: ['x', 'y'], histogram: ['x', 'y'], waterfall: ['x'] };

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 계열 수
// basis: estimate
/** 막대 행이 `rule=값`으로 자기 기준을 적을 수 있는지. 계열 이름이나 키가 `rule`이면 옛 뜻(계열 값)이 우선이라 행 기준은 없다. */
export function hasRowRule(chart, chartType) {
  return chartType === 'bar' && !chart.series.some((s) => s.id === 'rule' || s.key === 'rule');
}

// cost: time O(a), heap O(1), stack O(1)
// vars: a = 값 축 수(최대 2)
// basis: estimate
// 값 축 제목에 괄호 단위가 있는지 본다. 단위 없는 숫자는 읽는 사람이 값을 해석할 수 없어 경고한다.
function checkAxisUnits(figure, problems) {
  const { chart, chartType } = figure;
  for (const axis of VALUE_AXES[chartType] ?? []) {
    if (/\([^)]+\)/.test(chart[axis] ?? '')) continue;
    problems.warn(chart[`${axis}Line`] ?? figure.line, `the value axis title needs a unit in parentheses, such as ${axis} "latency(ms)"`);
  }
}

// cost: time O(r·k), heap O(r), stack O(1)
// vars: r = 행 수, k = 행의 값 수
// basis: estimate
/** 행 값의 규칙. 원본 행 줄이면 원본을 읽은 뒤, `data`면 JSON을 읽은 뒤 부른다. */
export function checkChartRows(figure, problems) {
  const { chart, chartType } = figure;
  if (!chart.rows.length) {
    // 틀린 행 줄 때문에 행이 없으면 그 오류가 원인이라 덧붙이지 않는다.
    if (!chart.hasRejectedRow) problems.error(chart.data?.line ?? figure.line, 'a chart needs at least one row');
    return;
  }
  if (chartType === 'area' && chart.rows.length < 2) problems.error(chart.rows[0].line, 'an area chart needs at least two different x values');
  const labels = new Map();
  for (const row of chart.rows) {
    checkRowKeys(row, figure, problems);
    // 표본(히스토그램, ECDF)은 같은 값이 여러 번 나올 수 있다(동률). 이름이 없는 행도 마찬가지다.
    if (['histogram', 'ecdf'].includes(chartType)) continue;
    const key = CHART_TYPES[chartType].numericRows ? `x=${row.values.x}` : row.label;
    if (labels.has(key)) problems.error(row.line, `"${key.replace('\u0000', '" "')}" appears twice (line ${labels.get(key)}). Names in a chart are unique`);
    labels.set(key, row.line);
  }
  PREPARE_ROWS[chartType]?.(figure, problems);
  checkRowValues(figure, problems);
  // 값이 모두 0이거나 하나도 없어도 오류가 아니다. 0은 값이라 길이 0의 표식과 값 글자 0으로 그리고, 빠진 값은 표식 없이 축과 틀만 그린다(0으로 그리지 않는다).
  // 로그 축은 위에서 0 이하를 막았고, 비율(퍼센트, 원, 도넛)은 합이 0이면 비율을 정하지 않고 그 뜻을 글로 알린다.
  for (const link of chart.links) {
    for (const name of [link.from, link.to]) if (!labels.has(name)) problems.error(link.line, unknownName('point', name, [...labels.keys()]));
  }
}

// cost: time O(r·k), heap O(r·k), stack O(1)
// vars: r = 행 수, k = 행의 값 수
// basis: estimate
/**
 * 행 값의 규칙: 쌓는 합계와 절댓값 상한, 아주 작은 값, 음수, 로그 축의 0 이하 값, 막대 행 기준의 음수, 신뢰구간 순서(low ≤ 값 ≤ high).
 * 원본 행과 `data` 행(checkChartRows)과 값에 묶인 차트가 받는 모든 프레임이 이 한 함수를 쓴다. 오류는 값이 있는 행의 줄에 쌓는다.
 * @param options { combinations }. 쌓는 합계와 구간 순서는 여러 값이 함께 정하는 규칙이라 실제로 함께 나오는 값(원본 행, 실제 프레임)에서만 본다. 값 하나씩 바꿔 끼워 보는 어림 후보(combinations 거짓)에서는 뺀다
 */
export function checkRowValues(figure, problems, { combinations = true } = {}) {
  const { chart, chartType } = figure;
  // 쌓는 합계는 양수끼리, 음수끼리 따로 쌓이므로 한 쪽 합의 크기를 본다(빠진 값은 더하지 않는다).
  if (combinations && ['stacked', 'percent'].includes(chartType)) for (const row of chart.rows) if (stackTotals(row, chart.series).some((total) => total >= MAX_VALUE)) problems.error(row.line, `stack total: ${RANGE_MESSAGE}`);
  if (combinations && INTERVAL_TYPES.includes(chartType)) for (const row of chart.rows) for (const { id } of chart.series) checkIntervalOrder(row, id, problems);
  // 선 차트의 x는 값 축이 아니라 늘 linear다. 로그와 "모두 0" 검사에서 뺀다.
  const hasRule = hasRowRule(chart, chartType);
  const isRowRule = (k) => hasRule && k === 'rule';
  const isValue = (k) => k !== 'series' && !isRowRule(k) && !(CHART_TYPES[chartType].numericRows && k === 'x');
  const numbers = chart.rows.flatMap((r) => Object.entries(r.values).filter(([k, v]) => isValue(k) && v !== null).map(([, v]) => v));
  // 선, 산점도, 차이 차트는 위치로 값을 보이고 0이 가운데라 음수를 받는다.
  // 쌓는 막대(stacked)는 음수를 위아래로 따로 쌓아 받고, 비율(percent)은 몫이라 음수가 뜻이 없다.
  const valueAxis = ['scatter', 'line', 'step', 'area', 'difference', 'histogram', 'waterfall', 'stacked', 'ecdf'].includes(chartType) ? [] : numbers;
  const huge = chart.rows.find((r) => Object.values(r.values).some((v) => typeof v === 'number' && Math.abs(v) >= MAX_VALUE));
  if (huge) problems.error(huge.line, RANGE_MESSAGE);
  for (const row of chart.rows) if (Object.values(row.values).some((v) => typeof v === 'number' && isTiny(v))) problems.error(row.line, TINY_MESSAGE);
  if (valueAxis.some((v) => v < 0)) problems.error(chart.rows.find((r) => Object.entries(r.values).some(([k, v]) => isValue(k) && v < 0)).line, chartType === 'percent' ? 'a percent chart shares a whole, so values cannot be negative' : 'values cannot be negative');
  const negativeRule = chart.rows.find((r) => hasRule && r.values.rule < 0);
  if (negativeRule) problems.error(negativeRule.line, 'a bar chart starts at 0, so a row rule cannot be negative');
  if (chart.scale === 'log' && numbers.some((v) => v <= 0)) problems.error(chart.rows.find((r) => Object.entries(r.values).some(([k, v]) => isValue(k) && v !== null && v <= 0)).line, 'log scale needs values above 0');
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 행의 값 수
// basis: estimate
// 종류마다 행 키가 맞는지, 선언한 계열마다 값이 있는지 본다.
function checkRowKeys(row, figure, problems) {
  const { chart, chartType } = figure;
  const ids = chart.series.map((s) => s.id);
  const keys = Object.keys(row.values);
  const allowed = {
    bar: [...ids.flatMap(withInterval), ...(hasRowRule(chart, chartType) ? ['rule'] : [])],
    stacked: ids,
    percent: ids,
    dumbbell: ids.flatMap(withInterval),
    difference: ids.flatMap(withInterval),
    box: BOX_KEYS,
    scatter: ['x', 'y', 'series'],
    line: ['x', ...ids.flatMap(withInterval)],
    step: ['x', ...ids],
    area: ['x', ...ids],
    ecdf: ['value', ...(ids.length ? ['series'] : [])],
    pie: ['value'],
    donut: ['value'],
    heatmap: ['value'],
    histogram: ['value'],
    waterfall: row.total ? [] : ['value'],
  }[chartType];
  const required = { bar: ids, stacked: ids, percent: ids, dumbbell: ids, difference: ids, box: BOX_KEYS, scatter: ['x', 'y', ...(ids.length ? ['series'] : [])], line: ['x', ...ids], step: ['x', ...ids], area: ['x', ...ids], ecdf: ['value', ...(ids.length ? ['series'] : [])], pie: ['value'], donut: ['value'], heatmap: ['value'], histogram: ['value'], waterfall: row.total ? [] : ['value'] }[chartType];
  for (const key of keys) if (!allowed.includes(key)) problems.error(row.line, `"${key}" is not a value of a ${chartType} chart. Use ${allowed.join(', ')}`);
  for (const key of required) if (!keys.includes(key)) problems.error(row.line, `the row needs ${key}=value`);
  for (const [key, value] of Object.entries(row.values)) {
    // 계열 값, 표본(누적분포, 히스토그램)과 증감(워터폴)의 value, 상자의 다섯 값이 `-`를 받는다.
    const isMissingSlot = CHART_TYPES[chartType].allowsMissing && (ids.includes(key) || (SINGLE_VALUE.includes(chartType) && key === 'value') || (chartType === 'box' && BOX_KEYS.includes(key)));
    if (value === null && !isMissingSlot) problems.error(row.line, `"-" (missing) is only for the values of ${MISSING_TYPES.join(', ')} charts. Found ${key}=-`);
  }
  if (row.values.series !== undefined && !ids.includes(row.values.series)) problems.error(row.line, unknownName('series', row.values.series, ids));
  if (INTERVAL_TYPES.includes(chartType)) for (const id of ids) checkIntervalKeys(row, id, problems);
  if (chartType === 'box') checkQuartiles(row, problems);
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 계열 수
// basis: estimate
// 한 행의 쌓는 길이: [양수 합, 음수 크기의 합]. 양수는 0 위로, 음수는 0 아래로 따로 쌓이고 빠진 값은 더하지 않는다. 비율 차트는 모두 0 이상이라 앞쪽이 행의 합이다.
function stackTotals(row, series) {
  let up = 0;
  let down = 0;
  for (const { id } of series) {
    const value = row.values[id];
    if (typeof value !== 'number') continue;
    if (value >= 0) up += value;
    else down -= value;
  }
  return [up, down];
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 값 키 하나와 그 신뢰구간 키 둘
function withInterval(id) {
  return [id, `${id}.low`, `${id}.high`];
}

// 신뢰구간의 꼴: low와 high는 함께 적고, 빠진 값에는 구간이 없다. 값이 묶여 바뀌어도 꼴은 변하지 않으므로 원본 행에서만 본다.
function checkIntervalKeys(row, id, problems) {
  const [value, low, high] = [row.values[id], row.values[`${id}.low`], row.values[`${id}.high`]];
  if (low === undefined && high === undefined) return;
  if (low === undefined || high === undefined) problems.error(row.line, `write both ${id}.low and ${id}.high, or neither`);
  else if (value === null) problems.error(row.line, `a missing ${id} value cannot have an interval`);
}

// 신뢰구간의 순서: low ≤ 값 ≤ high다. 같은 값은 반올림한 실험 값에서 생기므로 허용한다. 꼴이 틀린 구간은 checkIntervalKeys가 알리므로 숫자 셋이 모두 있을 때만 본다.
function checkIntervalOrder(row, id, problems) {
  const [value, low, high] = [row.values[id], row.values[`${id}.low`], row.values[`${id}.high`]];
  if ([value, low, high].some((v) => typeof v !== 'number')) return;
  if (!(low <= value && value <= high)) problems.error(row.line, `${id} needs ${id}.low ≤ ${id} ≤ ${id}.high. Found ${low}, ${value}, ${high}`);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 상자 그림 값은 min ≤ q1 ≤ median ≤ q3 ≤ max 순서다. 빠진 값은 건너뛰고 적힌 값끼리 순서를 본다.
function checkQuartiles(row, problems) {
  const ordered = BOX_KEYS.map((k) => row.values[k]).filter((v) => typeof v === 'number');
  if (ordered.some((v, i) => i > 0 && ordered[i - 1] > v)) problems.error(row.line, `box values need min ≤ q1 ≤ median ≤ q3 ≤ max. Found ${ordered.join(', ')}`);
}

// cost: time O(b·(s + l)), heap O(s), stack O(1)
// vars: b = 박자 수, s = 계열 수, l = 밝히기 대상 수
// basis: estimate
// reveal 계열이 있는지, 끝까지 드러내는지, 덤벨 순서가 맞는지, light 대상 꼴이 종류에 맞는지 본다. 이 차트에 건 reveal과 light는 figure.motion({ reveals, lights })에 장면 순서대로 있다.
function checkChartTimeline(figure, problems) {
  const { chart, chartType } = figure;
  const ids = chart.series.map((s) => s.id);
  const { reveals = [], lights = [] } = figure.motion ?? {};
  // 장면마다 따로 센다. 한 장면의 reveal에 나온 계열은 그 장면이 시작할 때 숨고 reveal 순서대로 드러나며, 나오지 않은 계열은 처음부터 보인다.
  const sceneSeries = new Map();
  for (const { series, si } of reveals) sceneSeries.set(si, [...(sceneSeries.get(si) ?? []), series]);
  const revealedBy = new Map();
  for (const { series, line, si } of reveals) {
    const revealed = revealedBy.get(si) ?? [];
    revealedBy.set(si, revealed);
    checkReveal({ id: series, line }, { ids, revealed, chartType, inScene: sceneSeries.get(si) }, problems);
  }
  for (const target of lights) checkChartLightShape(target, chartType, problems);
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 계열 수
// basis: estimate
// reveal 한 줄의 계열이 있고 아직 안 밝혔는지, 덤벨이면 비교 계열 뒤인지 본다. 맞으면 revealed에 더한다.
function checkReveal({ id, line }, { ids, revealed, chartType, inScene }, problems) {
  if (id === undefined) {
    if (ids.length) problems.error(line, 'name the series to reveal: reveal chart.series');
    return;
  }
  if (!ids.length) problems.error(line, `a ${chartType} chart without series has nothing to reveal`);
  else if (!ids.includes(id)) problems.error(line, unknownName('series', id, ids));
  else if (revealed.includes(id)) problems.error(line, `series "${id}" is already revealed`);
  else revealed.push(id);
  const pending = (previous) => inScene.includes(previous) && !revealed.includes(previous);
  if (chartType === 'stacked' && ids.slice(0, ids.indexOf(id)).some(pending)) problems.error(line, 'reveal stacked series in their displayed order so each segment follows its base');
  if (chartType === 'dumbbell' && id === ids[1] && pending(ids[0])) problems.error(line, `reveal "${ids[0]}" before "${ids[1]}". The arrow starts from the compare series`);
}

function checkChartLightShape(target, chartType, problems) {
  const expected = CHART_TYPES[chartType].numericRows || ['histogram', 'ecdf'].includes(chartType) ? 'x' : chartType === 'heatmap' ? 2 : 1;
  const isOk = expected === 'x' ? target.x !== undefined : target.names?.length === expected;
  if (!isOk) problems.error(target.line, { x: `in a ${chartType} chart, write light x=value`, 2: 'in a heatmap, write light "row" "column"', 1: 'write light "item name"' }[expected]);
}

// cost: time O(r + b·l), heap O(r), stack O(1)
// vars: r = 행 수, b = 박자 수, l = 밝히기 수
// basis: estimate
/** light 대상이 차트 안에 있는지. 행을 다 모은 뒤 부른다. 이 차트에 건 light는 figure.motion.lights에 있다. */
export function checkChartLightTargets(figure, problems) {
  const { chart, chartType } = figure;
  const names = chartType === 'histogram' ? new Set((chart.bins ?? []).map((bin) => `x=${bin.lower}`)) : chartType === 'ecdf' ? new Set(chart.rows.filter((r) => r.values.value !== null).map((r) => `x=${r.values.value}`)) : new Set(chart.rows.map((r) => (CHART_TYPES[chartType].numericRows ? `x=${r.values.x}` : r.label)));
  for (const t of figure.motion?.lights ?? []) {
    const key = t.x !== undefined ? `x=${t.x}` : t.names.join('\u0000');
    if (!names.has(key)) problems.error(t.line, `light target "${key.replace('\u0000', '" "')}" is not in the chart`);
  }
}
