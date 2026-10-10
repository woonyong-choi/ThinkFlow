// 히스토그램의 구간 경계와 관측값 집계. 마지막 구간만 오른쪽 끝을 포함한다.
import { roundHalfAway, valueFormat } from './chart/scale.js';
import { DECIMALS_MAX } from './source/grammar.js';

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 구간 수(최대 100)
// basis: estimate
export function histogramEdges(spec) {
  if (!spec || !Number.isInteger(spec.count) || spec.count < 1 || spec.count > 100 || !Number.isFinite(spec.min) || !Number.isFinite(spec.max) || spec.min >= spec.max) return undefined;
  const edges = Array.from({ length: spec.count + 1 }, (_, i) => i === 0 ? spec.min : i === spec.count ? spec.max : roundedEdge(spec.min + (spec.max - spec.min) * (i / spec.count), (spec.max - spec.min) / spec.count));
  return edges.every((value, i) => Number.isFinite(value) && (i === 0 || value > edges[i - 1])) ? edges : undefined;
}

// 작은 십진 연산 오차만 정리하고, 큰 기준값 위의 좁은 구간 폭은 반올림으로 바꾸지 않는다.
function roundedEdge(value, width) {
  const rounded = Number(value.toPrecision(15));
  const tolerance = Math.abs(width) * Number.EPSILON * 16;
  return Math.abs(rounded - value) <= tolerance ? rounded : value;
}

// cost: time O(log b), heap O(1), stack O(1)
// vars: b = 구간 수
// basis: estimate
function indexOf(value, edges) {
  let low = 0;
  let high = edges.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (value < edges[middle]) high = middle;
    else low = middle;
  }
  return low;
}

// cost: time O(r log b + b), heap O(b), stack O(1)
// vars: r = 관측값 수, b = 구간 수
// basis: estimate
export function countHistogram(rows, edges) {
  const bins = edges.slice(0, -1).map((lower, i) => ({ lower, upper: edges[i + 1], count: 0, closed: i === edges.length - 2 }));
  for (const row of rows) bins[indexOf(row.values.value, edges)].count++;
  return bins;
}

/** 원시 건수를 보존하고 표시 높이만 정규화한다. 밀도는 면적의 합이 1이다. 분모는 빠지지 않은 관측 수(chart.observed)다. */
export function histogramValue(bin, chart) {
  const observed = chart.observed ?? chart.rows.length;
  if (chart.binning.measure === 'probability') return bin.count / observed;
  if (chart.binning.measure === 'density') return (bin.count / observed) / (bin.upper - bin.lower);
  return bin.count;
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 구간 수
// basis: estimate
/**
 * SVG 접근성 이름과 제목의 구간 이름과 높이 글자. 표시용 사본이라 계산에는 쓰지 않는다.
 * 높이는 건수 모드면 정수 그대로, 정규화 모드면 표와 같은 값 글자(valueFormat)다. 구간 끝은 edgeNames가 쓴다.
 * @returns { range(bin), height(bin) }
 */
export function histogramLabels(chart) {
  const edges = chart.bins.length ? [...chart.bins.map((bin) => bin.lower), chart.bins.at(-1).upper] : [];
  const names = new Map(edgeNames(edges, chart.decimals).map((name, i) => [edges[i], name]));
  const heights = valueFormat(chart.bins.map((bin) => histogramValue(bin, chart)), chart.decimals);
  const isCount = (chart.binning.measure ?? 'count') === 'count';
  return {
    range: (bin) => `[${names.get(bin.lower)}, ${names.get(bin.upper)}${bin.closed ? ']' : ')'}`,
    height: (bin) => (isCount ? String(bin.count) : heights(histogramValue(bin, chart))),
  };
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 구간 수
// basis: estimate
// 구간 끝 글자(끝과 같은 순서). 구간 끝은 어느 구간에 드는지를 정하는 경계라 k, M으로 줄이지 않는다.
// 소수 자릿수는 머리 줄 decimals가 있으면 그 자릿수로 맞춰 쓰고(`0.50`), 없으면 가장 긴 소수 자릿수(최대 DECIMALS_MAX)까지 반올림한 가장 짧은 표기다(`0.5`, `1`).
// 자릿수가 모자라 서로 다른 끝이 같은 글자가 되거나 0이 아닌 끝이 0으로 지워지면 구간이 합쳐지거나 틀리게 읽히므로, 그때는 끝마다 15자리 유효숫자의 십진 표기로 쓴다(tickLabels와 같은 규칙).
function edgeNames(edges, decimals) {
  const places = decimals ?? Math.min(DECIMALS_MAX, Math.max(0, ...edges.map((edge) => (String(Number(edge.toPrecision(12))).split('e')[0].split('.')[1] ?? '').length)));
  const names = edges.map((edge) => (decimals === undefined ? String(roundHalfAway(edge, places)) : roundHalfAway(edge, places).toFixed(places)));
  const isLossy = new Set(names).size < names.length || edges.some((edge, i) => edge !== 0 && Number(names[i]) === 0);
  return isLossy ? edges.map((edge) => String(Number(edge.toPrecision(15)))) : names;
}

export function histogramMeasure(chart) {
  return { count: '관측 건수', probability: '비율(0~1)', density: '확률밀도' }[chart.binning.measure ?? 'count'];
}
