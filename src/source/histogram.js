// 히스토그램의 원시 관측값과 구간 선언, 집계 전 검증.
import { countHistogram, histogramEdges, histogramValue } from '../histogram.js';
import { MAX_VALUE, RANGE_MESSAGE, TINY_MESSAGE, isTiny } from './chart-limits.js';
import { valueNames } from './grammar.js';
import { isTinyNumber, parseNumber } from './values.js';

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
export function readBins({ tokens, line }, { figure, problems }) {
  const option = tokens.at(-1);
  const measure = option.type === 'option' ? option.value : 'count';
  if (option.type === 'option') {
    if (option.key !== 'measure' || option.valueType !== 'word' || !valueNames('histogramMeasure').includes(measure)) return problems.error(line, 'bins measure is count, probability, or density');
    tokens = tokens.slice(0, -1);
  }
  const numbers = tokens.slice(1).map((token) => token.type === 'word' && !isTinyNumber(token.value) ? parseNumber(token.value) : undefined);
  if (figure.chartType !== 'histogram') return problems.error(line, 'bins is only for histogram charts');
  if (figure.chart.binning) return problems.error(line, 'bins is already set');
  if (tokens.length === 2 && tokens[1].type === 'word' && tokens[1].value === 'auto') {
    figure.chart.binning = { method: 'sturges', measure, line };
    return;
  }
  if (numbers.length !== 3 || numbers.some((number) => number === undefined)) return problems.error(line, 'write bins as: bins minimum maximum count or bins auto');
  figure.chart.binning = { min: numbers[0], max: numbers[1], count: numbers[2], measure, line };
}

// `sample 숫자 [series=계열]`(ECDF), `sample 숫자`(히스토그램)와 빠진 표본 `sample -`(둘 다). 빠진 표본은 관측이 아니라 세지 않는다.
export function readSample({ tokens, line }, { figure, problems }) {
  const isEcdf = figure.chartType === 'ecdf';
  const [, token, ...rest] = tokens;
  const option = rest[0]?.type === 'option' && rest[0].key === 'series' && rest[0].valueType === 'word' ? rest[0] : undefined;
  const isMissing = token?.type === 'word' && token.value === '-';
  const value = isMissing ? null : token?.type === 'word' && !isTinyNumber(token.value) ? parseNumber(token.value) : undefined;
  if (value === undefined || rest.length > (option ? 1 : 0) || (option && !isEcdf)) {
    figure.chart.hasRejectedRow = true;
    return problems.error(line, isEcdf ? 'write a sample as: sample number [series=id], or sample - for a missing one' : 'write a sample as: sample number');
  }
  figure.chart.rows.push({ values: { value, ...(option ? { series: option.value } : {}) }, line });
}

// cost: time O(r log b + b²), heap O(b), stack O(1)
// vars: r = 관측값 수, b = 구간 수
// basis: estimate
// 관측은 빠지지 않은 표본이다. 빠진 표본(`-`)은 0건으로 세지도 분모에 넣지도 않는다. 관측이 하나도 없으면 구간도 막대도 만들지 않고(chart.bins가 빈 목록), 명시한 구간은 가로축만 정한다(chart.binEdges).
export function prepareHistogram(figure, problems) {
  const { chart } = figure;
  const observed = chart.rows.filter((row) => row.values.value !== null);
  chart.observed = observed.length;
  chart.missingCount = chart.rows.length - observed.length;
  if (chart.binning?.method === 'sturges' && observed.length) chart.binning = { ...automaticBins(observed, chart.binning.line), measure: chart.binning.measure };
  const spec = chart.binning;
  const line = spec?.line ?? figure.line;
  const negativeRule = chart.rules.find((rule) => rule.value < 0);
  if (negativeRule) problems.error(negativeRule.line, 'histogram rules cannot be negative');
  if (!observed.length && spec?.method === 'sturges') {
    chart.bins = [];
    chart.binEdges = undefined;
    return;
  }
  const edges = histogramEdges(spec);
  if (!edges) return problems.error(line, 'a histogram needs bins minimum maximum count, with minimum < maximum and 1 to 100 distinct bins');
  if (edges.some((value) => Math.abs(value) >= MAX_VALUE)) return problems.error(line, RANGE_MESSAGE);
  if (edges.some(isTiny)) return problems.error(line, TINY_MESSAGE);
  const invalid = observed.find((row) => !Number.isFinite(row.values.value) || row.values.value < spec.min || row.values.value > spec.max);
  if (invalid) return problems.error(invalid.line, `every sample must be a finite number within bins ${spec.min} to ${spec.max}`);
  chart.binEdges = [edges[0], edges.at(-1)];
  chart.bins = observed.length ? countHistogram(observed, edges) : [];
  const heights = chart.bins.map((bin) => histogramValue(bin, chart));
  if (heights.some((value) => !Number.isFinite(value) || value >= MAX_VALUE)) problems.error(line, `normalized histogram: ${RANGE_MESSAGE}`);
  if (heights.some(isTiny)) problems.error(line, `normalized histogram: ${TINY_MESSAGE}`);
}

// cost: time O(r + b²), heap O(b), stack O(1)
// vars: r = 관측값 수, b = 제안 구간 수(최대 100)
// basis: estimate
function automaticBins(rows, line) {
  let min = Infinity;
  let max = -Infinity;
  for (const { values: { value } } of rows) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const constantRange = min === max;
  if (constantRange) {
    if (min - 0.5 > -MAX_VALUE) min -= 0.5;
    if (max + 0.5 < MAX_VALUE) max += 0.5;
  }
  const requestedCount = constantRange ? 1 : Math.min(100, Math.ceil(Math.log2(rows.length)) + 1);
  const spec = { min, max, count: requestedCount, requestedCount, constantRange, method: 'sturges', line };
  while (spec.count > 1) {
    const edges = histogramEdges(spec);
    if (edges && !edges.some(isTiny)) break;
    spec.count--;
  }
  return spec;
}
