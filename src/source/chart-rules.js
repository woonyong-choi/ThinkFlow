// 차트 규칙. docs/design/charts.md의 "종류와 행 줄", "머리와 선언 줄", "시간 흐름" 절을 확인한다.
import { VALUES, valueNames } from './grammar.js';
import { unknownName } from './problems.js';

const CHART_TYPES = VALUES.chartType.items;
// 신뢰구간(`값.low`, `값.high`)을 받는 종류
export const INTERVAL_TYPES = Object.keys(CHART_TYPES).filter((type) => CHART_TYPES[type].isInterval);
const BOX_KEYS = CHART_TYPES.box.valueKeys;
// 값의 절댓값 상한. 이보다 크면 십진 반올림이 12자리 정밀도를 넘어 눈금과 글자를 정확히 쓸 수 없다.
export const MAX_VALUE = 1e15;
/** 값이 범위를 넘을 때의 오류 글. 행 값, 기준선, 무한대가 되는 글이 같은 글을 쓴다. */
export const RANGE_MESSAGE = `values must be under ${MAX_VALUE.toExponential(0).replace('+', '')} in absolute value`;
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
    problems.error(chart.series[high]?.line ?? figure.line, `a ${chartType} chart takes ${low === high ? low : `${low} to ${high}`} series. Found ${chart.series.length}`);
  }
  if (checkSeriesRoles(figure, problems)) orderSeriesByRole(figure);
  if (chart.missing !== undefined && chartType !== 'bar') problems.error(figure.line, 'missing is only for bar charts');
  if (chartType === 'bar' && chart.scale === 'log') problems.error(figure.line, 'a bar chart starts at 0, so scale log is not allowed');
  if (chartType === 'difference' && chart.scale === 'log') problems.error(chart.scaleLine ?? figure.line, 'a difference chart is centered on 0, so scale log is not allowed');
  if (chart.zero === 'off' && chartType !== 'line') problems.error(chart.zeroLine, 'zero off is only for line charts. Other charts keep their value axis at 0');
  if (chartType === 'heatmap' && (chart.scaleLine !== undefined || chart.rules.length)) problems.error(chart.scaleLine ?? chart.rules[0].line, 'a heatmap has no value axis. Remove scale and rule');
  for (const rule of chart.rules) if (Math.abs(rule.value) >= MAX_VALUE) problems.error(rule.line, RANGE_MESSAGE);
  for (const rule of chart.rules) if (chart.scale === 'log' && rule.value <= 0) problems.error(rule.line, 'log scale needs values above 0');
  for (const rule of chart.rules) if (chartType === 'bar' && rule.value < 0) problems.error(rule.line, 'a bar chart starts at 0, so a rule cannot be negative');
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
// 계열 역할: 하나면 main(role 생략 가능), 둘이면 적은 역할만 검사한다. 둘 다 적었으면 main 하나와 compare 하나여야 한다. 맞으면 true다.
function checkSeriesRoles(figure, problems) {
  const { series } = figure.chart;
  if (series.length === 1) {
    if (series[0].role !== 'compare') return true;
    problems.error(series[0].line, 'a chart with one series shows it as main. Use role=main or remove role');
    return false;
  }
  const given = series.filter((s) => s.role !== undefined);
  if (series.length !== 2 || given.length < 2 || given.filter((s) => s.role === 'main').length === 1) return true;
  problems.error(series[1].line, `two series need one role=main and one role=compare. Found ${series.map((s) => `${s.id} role=${s.role}`).join(', ')}`);
  return false;
}

// cost: time O(s log s), heap O(s), stack O(1)
// vars: s = 계열 수
// basis: estimate
// role을 생략한 계열에 역할을 주고 계열을 보이는 순서로 세운다. 보이는 순서는 차트 종류의 firstRole이 먼저다(grammar.js).
// 생략한 계열은 다른 계열이 쓰지 않은 역할을 선언 순서대로 받는다. 덤벨은 시작점(compare)이 먼저라 옛 파일의 "첫 계열이 시작점" 뜻이 그대로다.
function orderSeriesByRole(figure) {
  const { series } = figure.chart;
  const first = CHART_TYPES[figure.chartType].firstRole ?? valueNames('role')[0];
  const order = [first, ...valueNames('role').filter((role) => role !== first)];
  const open = order.filter((role) => !series.some((s) => s.role === role));
  for (const s of series) s.role ??= series.length === 1 ? valueNames('role')[0] : (open.shift() ?? valueNames('role')[0]);
  series.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
}

// 값 축 종류. 히트맵은 값 축이 없다.
const VALUE_AXES = { bar: ['x'], dumbbell: ['x'], box: ['x'], difference: ['x'], line: ['y'], scatter: ['x', 'y'] };

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
  const labels = new Map();
  for (const row of chart.rows) {
    checkRowKeys(row, figure, problems);
    const key = chartType === 'line' ? `x=${row.values.x}` : row.label;
    if (labels.has(key)) problems.error(row.line, `"${key.replace('\u0000', '" "')}" appears twice (line ${labels.get(key)}). Names in a chart are unique`);
    labels.set(key, row.line);
  }
  // 선 차트의 x는 값 축이 아니라 늘 linear다. 로그와 "모두 0" 검사에서 뺀다.
  const hasRule = hasRowRule(chart, chartType);
  const isRowRule = (k) => hasRule && k === 'rule';
  const isValue = (k) => k !== 'series' && !isRowRule(k) && !(chartType === 'line' && k === 'x');
  const numbers = chart.rows.flatMap((r) => Object.entries(r.values).filter(([k, v]) => isValue(k) && v !== null).map(([, v]) => v));
  // 선, 산점도, 차이 차트는 위치로 값을 보이고 0이 가운데라 음수를 받는다.
  const valueAxis = ['scatter', 'line', 'difference'].includes(chartType) ? [] : numbers;
  const huge = chart.rows.find((r) => Object.values(r.values).some((v) => typeof v === 'number' && Math.abs(v) >= MAX_VALUE));
  if (huge) problems.error(huge.line, RANGE_MESSAGE);
  if (valueAxis.some((v) => v < 0)) problems.error(chart.rows.find((r) => Object.entries(r.values).some(([k, v]) => isValue(k) && v < 0)).line, 'values cannot be negative');
  const negativeRule = chart.rows.find((r) => hasRule && r.values.rule < 0);
  if (negativeRule) problems.error(negativeRule.line, 'a bar chart starts at 0, so a row rule cannot be negative');
  if (chart.scale === 'log' && numbers.some((v) => v <= 0)) problems.error(chart.rows.find((r) => Object.entries(r.values).some(([k, v]) => isValue(k) && v !== null && v <= 0)).line, 'log scale needs values above 0');
  // 막대, 덤벨, 상자는 길이로 값을 보여서 숫자가 없거나 모두 0이면 그릴 것이 없다. 선과 산점도는 위치로 보여서 0도 그린다.
  const hasLength = ['bar', 'dumbbell', 'box'].includes(chartType);
  if (hasLength && !numbers.length) problems.error(chart.rows[0].line, 'every value is missing, so a chart needs at least one number to draw');
  else if (hasLength && numbers.every((v) => v === 0)) problems.error(chart.rows[0].line, 'all values are 0, so lengths cannot be set');
  for (const link of chart.links) {
    for (const name of [link.from, link.to]) if (!labels.has(name)) problems.error(link.line, unknownName('point', name, [...labels.keys()]));
  }
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
    dumbbell: ids.flatMap(withInterval),
    difference: ids.flatMap(withInterval),
    box: BOX_KEYS,
    scatter: ['x', 'y', 'series'],
    line: ['x', ...ids.flatMap(withInterval)],
    heatmap: ['value'],
  }[chartType];
  const required = { bar: ids, dumbbell: ids, difference: ids, box: BOX_KEYS, scatter: ['x', 'y', ...(ids.length ? ['series'] : [])], line: ['x', ...ids], heatmap: ['value'] }[chartType];
  for (const key of keys) if (!allowed.includes(key)) problems.error(row.line, `"${key}" is not a value of a ${chartType} chart. Use ${allowed.join(', ')}`);
  for (const key of required) if (!keys.includes(key)) problems.error(row.line, `the row needs ${key}=value`);
  for (const [key, value] of Object.entries(row.values)) {
    const isBarSeries = chartType === 'bar' && ids.includes(key);
    if (value === null && !isBarSeries) problems.error(row.line, `"-" (missing) is only for bar series values. Found ${key}=-`);
  }
  if (row.values.series !== undefined && !ids.includes(row.values.series)) problems.error(row.line, unknownName('series', row.values.series, ids));
  if (INTERVAL_TYPES.includes(chartType)) for (const id of ids) checkInterval(row, id, problems);
  if (chartType === 'box' && BOX_KEYS.every((k) => typeof row.values[k] === 'number')) checkQuartiles(row, problems);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 값 키 하나와 그 신뢰구간 키 둘
function withInterval(id) {
  return [id, `${id}.low`, `${id}.high`];
}

// 신뢰구간: low와 high는 함께 적고, low ≤ 값 ≤ high다. 같은 값은 반올림한 실험 값에서 생기므로 허용한다.
function checkInterval(row, id, problems) {
  const [value, low, high] = [row.values[id], row.values[`${id}.low`], row.values[`${id}.high`]];
  if (low === undefined && high === undefined) return;
  if (low === undefined || high === undefined) problems.error(row.line, `write both ${id}.low and ${id}.high, or neither`);
  else if (value === null) problems.error(row.line, `a missing ${id} value cannot have an interval`);
  else if (!(low <= value && value <= high)) problems.error(row.line, `${id} needs ${id}.low ≤ ${id} ≤ ${id}.high. Found ${low}, ${value}, ${high}`);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 상자 그림 값은 min ≤ q1 ≤ median ≤ q3 ≤ max 순서다.
function checkQuartiles(row, problems) {
  const ordered = BOX_KEYS.map((k) => row.values[k]);
  if (ordered.some((v, i) => i > 0 && ordered[i - 1] > v)) problems.error(row.line, `box values need min ≤ q1 ≤ median ≤ q3 ≤ max. Found ${ordered.join(', ')}`);
}

// cost: time O(b·(s + l)), heap O(s), stack O(1)
// vars: b = 박자 수, s = 계열 수, l = 밝히기 대상 수
// basis: estimate
// reveal 계열이 있는지, 끝까지 드러내는지, 덤벨 순서가 맞는지, light 대상 꼴이 종류에 맞는지 본다.
function checkChartTimeline(figure, problems) {
  const { chart, chartType } = figure;
  const ids = chart.series.map((s) => s.id);
  const revealed = [];
  for (const step of figure.steps) {
    if (!step.beats.length && !step.hasError) problems.error(step.line, `step "${step.label}" has no lines. Add reveal, light, say, or wait`);
    for (const beat of step.beats) {
      for (const id of beat.reveal) {
        if (!ids.length) problems.error(beat.line, `a ${chartType} chart without series has nothing to reveal`);
        else if (!ids.includes(id)) problems.error(beat.line, unknownName('series', id, ids));
        else if (revealed.includes(id)) problems.error(beat.line, `series "${id}" is already revealed`);
        else revealed.push(id);
        if (chartType === 'dumbbell' && id === ids[1] && !revealed.includes(ids[0])) problems.error(beat.line, `reveal "${ids[0]}" before "${ids[1]}". The arrow starts from the compare series`);
      }
      for (const target of beat.chartLight) checkChartLightShape(target, chartType, problems);
    }
  }
  if (revealed.length) {
    for (const s of chart.series) if (!revealed.includes(s.id)) problems.error(s.line, `series "${s.id}" is never revealed. Add "reveal ${s.id}" or remove the series`);
  }
}

function checkChartLightShape(target, chartType, problems) {
  const expected = chartType === 'line' ? 'x' : chartType === 'heatmap' ? 2 : 1;
  const isOk = expected === 'x' ? target.x !== undefined : target.names?.length === expected;
  if (!isOk) problems.error(target.line, { x: 'in a line chart, write light x=value', 2: 'in a heatmap, write light "row" "column"', 1: 'write light "item name"' }[expected]);
}

// cost: time O(r + b·l), heap O(r), stack O(1)
// vars: r = 행 수, b = 박자 수, l = 밝히기 수
// basis: estimate
/** light 대상이 차트 안에 있는지. 행을 다 모은 뒤 부른다. */
export function checkChartLightTargets(figure, problems) {
  const { chart, chartType } = figure;
  const names = new Set(chart.rows.map((r) => (chartType === 'line' ? `x=${r.values.x}` : r.label)));
  for (const beat of figure.steps.flatMap((s) => s.beats)) {
    for (const t of beat.chartLight) {
      const key = t.x !== undefined ? `x=${t.x}` : t.names.join('\u0000');
      if (!names.has(key)) problems.error(t.line, `light target "${key.replace('\u0000', '" "')}" is not in the chart`);
    }
  }
}
