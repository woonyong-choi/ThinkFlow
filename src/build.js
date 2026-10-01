// 원본 하나를 장면과 시간표로 만든다. 읽기, 차트 값 읽기, 크기, 배치, 시간표, 그림 검사를 차례로 부른다(docs/architecture.md 그림 만들기).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkChartFigure, checkFigure } from './check.js';
import { drawChart } from './chart/draw.js';
import { layoutGraph } from './layout/graph.js';
import { layoutSequence } from './layout/sequence.js';
import { findMissingGlyph, wrap } from './measure/fonts.js';
import { STYLE, sizeNode } from './measure/sizes.js';
import { checkChartLightTargets, checkChartRows } from './source/chart-rules.js';
import { readFigure } from './source/parse.js';
import { createProblems, FigureError } from './source/problems.js';
import { collectCards, buildTimeline } from './timeline.js';
import { values } from './tokens.js';

// 원소 키. 종류마다 행 이름이 들어 있는 키다.
const LABEL_KEY = { bar: 'label', dumbbell: 'label', box: 'label', scatter: 'name' };

// cost: time O(n + elk + b·(e + s)), heap O(n + s + e), stack O(d), io 1
// vars: n = 원본 글자 수, elk = 배치 시간, b = 박자 수, e = 선 수, s = 도형 수, d = 그룹 깊이
// basis: estimate
/**
 * 원본을 장면과 시간표로 만든다.
 * @param baseDir `data` 경로의 기준 폴더
 * @returns { figure, scene, timeline, warnings }. 차트면 scene 대신 chart가 있다
 * @throws FigureError 원본 오류나 그림 검사 오류가 있을 때. 모든 문제를 담는다
 */
export async function buildFigure(source, { baseDir = '.', strict = false, requireData = false, requireCi = false } = {}) {
  const problems = createProblems();
  const figure = readFigure(source, problems);
  if (figure.kind === 'chart' && figure.chart.data) loadChartData(figure, baseDir, problems);
  checkGlyphs(figure, problems);
  if (figure.kind === 'chart') checkSkillRules(figure, { requireData, requireCi }, problems);
  problems.throwIfAny();
  const cards = collectCards(figure);
  const timeline = buildTimeline(figure, cards, wrapChip);
  if (figure.kind === 'chart') {
    const chart = drawChart(figure);
    checkChartFigure(chart, problems);
    return finish({ figure, chart, timeline }, problems, strict);
  }
  const sizes = new Map(figure.nodes.map((n) => [n.id, sizeNode(n, cards.contents.get(n.id))]));
  const scene = figure.kind === 'sequence' ? layoutSequence(figure, sizes) : await layoutGraph(figure, sizes);
  // 태그 색은 원본에 처음 나온 순서로 정한다(docs/design/figure-syntax.md 카드 줄).
  scene.tagOrder = figure.steps.flatMap((s) => s.beats.flatMap((b) => b.ops.filter((o) => o.row?.tag && !o.row.tone).map((o) => o.row.tag)));
  checkFigure(figure, scene, timeline, problems);
  return finish({ figure, scene, timeline }, problems, strict);
}

// cost: time O(w), heap O(w), stack O(1)
// vars: w = 경고 수
// basis: estimate
function finish(result, problems, strict) {
  if (strict) for (const w of problems.warnings) problems.error(w.line, w.message);
  problems.throwIfAny();
  return { ...result, warnings: problems.warnings };
}

/** 글 상자 글을 토큰 `size.chip-max` 너비의 줄로 나눈다. HTML과 SVG가 같은 줄을 쓴다. */
export function wrapChip(text) {
  return wrap(text, values.size['chip-max'], STYLE.chip.size);
}

// cost: time O(j + r·k), heap O(j), stack O(1), io 1
// vars: j = JSON 글자 수, r = 원소 수, k = 원소의 키 수
// basis: estimate
// `data "경로" at "/포인터"`의 배열을 행으로 바꾼다. 키 대응은 docs/design/charts.md 값 출처 절이다.
function loadChartData(figure, baseDir, problems) {
  const { chart, chartType } = figure;
  const { line } = chart.data;
  let records;
  try {
    records = pointer(JSON.parse(readFileSync(resolve(baseDir, chart.data.path), 'utf8').replace(/^\uFEFF/, '')), chart.data.pointer);
  } catch (error) {
    problems.error(line, `cannot read data "${chart.data.path}" at "${chart.data.pointer}": ${error.message}`);
    return;
  }
  if (!Array.isArray(records)) {
    problems.error(line, `data at "${chart.data.pointer}" is not an array`);
    return;
  }
  const byKey = new Map(chart.series.map((s) => [s.key, s.id]));
  chart.rows = records.map((record, index) => toRow(record, { chartType, byKey, line, index }, problems)).filter(Boolean);
  // 원소를 하나라도 버렸으면 그 오류가 원인이라, 행 수와 행 값 규칙은 보지 않는다. 덧붙는 오류를 막기 위해서다.
  if (chart.rows.length < records.length) return;
  checkChartRows(figure, problems);
  checkChartLightTargets(figure, problems);
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 원소의 키 수
// basis: estimate
// 원소 하나를 행으로. 계열 키는 계열 이름으로 바꾸고, 빠진 키와 null은 빠진 값이다.
function toRow(record, { chartType, byKey, line, index }, problems) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    problems.error(line, `data element ${index} must be an object`);
    return undefined;
  }
  const names = chartType === 'heatmap' ? ['row', 'col'] : LABEL_KEY[chartType] ? [LABEL_KEY[chartType]] : [];
  const badName = names.find((key) => typeof record[key] !== 'string');
  if (badName) {
    problems.error(line, `data element ${index} needs a text "${badName}"`);
    return undefined;
  }
  const values = {};
  let label;
  for (const [key, value] of Object.entries(record)) {
    const [base, part] = key.split(/\.(?=low$|high$)/);
    const series = byKey.get(base);
    if (key === LABEL_KEY[chartType]) label = value;
    else if (chartType === 'heatmap' && (key === 'row' || key === 'col')) values[key] = value;
    else if (chartType === 'scatter' && key === 'series') values.series = byKey.get(String(value)) ?? String(value);
    else if (series) values[part ? `${series}.${part}` : series] = value;
    else if (['x', 'y', 'min', 'q1', 'median', 'q3', 'max', 'value'].includes(key)) values[key] = value;
    else problems.warn(line, `data key "${key}" is not used by a ${chartType} chart`);
  }
  for (const [key, value] of Object.entries(values)) {
    const isNumber = typeof value === 'number' && Number.isFinite(value);
    if (key !== 'series' && key !== 'row' && key !== 'col' && value !== null && !isNumber) problems.error(line, `data element ${index} value "${key}" must be a number or null. Found ${JSON.stringify(value)}`);
  }
  for (const s of byKey.values()) if (chartType === 'bar' && !(s in values)) values[s] = null;
  if (chartType === 'heatmap') return { label: `${values.row}\u0000${values.col}`, row: values.row, col: values.col, values: { value: values.value }, line };
  return { label, values, line };
}

// cost: time O(r·s), heap O(1), stack O(1)
// vars: r = 행 수, s = 계열 수
// basis: estimate
// 문서 스킬이 실험 차트에 거는 규칙. 값 손 기재 금지(예시 데이터 제외)와 막대 신뢰구간.
function checkSkillRules(figure, { requireData, requireCi }, problems) {
  const { chart } = figure;
  const isIllustrative = figure.subtitle?.startsWith('예시 데이터.') ?? false;
  if (requireData && !chart.data && !isIllustrative) problems.error(chart.rows[0]?.line ?? figure.line, 'values must come from data "results/summary.json" at "/..." (--require-data). Hand-written rows are only for subtitles starting with "예시 데이터."');
  if (!requireCi || figure.chartType !== 'bar') return;
  for (const row of chart.rows) {
    for (const s of chart.series) {
      const hasCi = row.values[`${s.id}.low`] !== undefined && row.values[`${s.id}.high`] !== undefined;
      if (row.values[s.id] !== null && !hasCi) problems.error(row.line, `bar "${row.label}" needs ${s.id}.low= and ${s.id}.high= (--require-ci)`);
    }
  }
}

// cost: time O(d), heap O(d), stack O(1)
// vars: d = 포인터 단계 수
// basis: estimate
// JSON Pointer(RFC 6901)로 값을 찾는다.
function pointer(document, path) {
  if (path === '' || path === '/') return document;
  return path
    .split('/')
    .slice(1)
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((node, key) => {
      if (node === undefined || node === null) throw new Error(`no value at "${path}"`);
      return node[key];
    }, document);
}

// cost: time O(n), heap O(t), stack O(d)
// vars: n = 그림 모형의 글 글자 수, t = 글 수, d = 모형 깊이
// basis: estimate
// 그림 글꼴에 없는 글자를 줄 번호와 함께 알린다. 대신 그릴 글꼴의 폭을 알 수 없기 때문이다.
// 모형의 모든 글을 본문 글꼴로, 고정폭으로 그리는 글은 고정폭 글꼴로도 본다. 글 종류를 빠뜨리지 않기 위해 모형 전체를 훑는다.
function checkGlyphs(figure, problems) {
  const texts = [];
  collectTexts(figure, figure.line ?? 1, texts);
  const mono = [...figure.edges.map((e) => [e.label, e.line]), ...figure.nodes.flatMap((n) => (n.columns ?? []).map((c) => [c.type, c.line ?? n.line]))];
  if (figure.kind === 'sequence') mono.push(...figure.steps.flatMap((s) => s.beats.flatMap((b) => b.hops.map((h) => [h.data, h.line]))));
  const reported = new Set();
  for (const [text, line, face] of [...texts.map(([t, l]) => [t, l, 'regular']), ...mono.map(([t, l]) => [t, l, 'mono'])]) {
    const missing = text ? findMissingGlyph(text, face) : undefined;
    if (missing === undefined || reported.has(`${line}\u0000${missing}`)) continue;
    reported.add(`${line}\u0000${missing}`);
    problems.error(line, `the font has no glyph for "${missing}". Remove the character`);
  }
}

// cost: time O(n), heap O(t), stack O(d)
// vars: n = 모형 원소 수, t = 글 수, d = 모형 깊이
// basis: estimate
function collectTexts(value, line, out) {
  // 차트 행 이름처럼 \u0000으로 이은 안쪽 키는 그리지 않는 글이라 이음 글자를 빼고 본다.
  if (typeof value === 'string') out.push([value.replaceAll('\u0000', ' '), line]);
  else if (Array.isArray(value)) for (const item of value) collectTexts(item, line, out);
  else if (value && typeof value === 'object') {
    const own = typeof value.line === 'number' ? value.line : line;
    for (const item of Object.values(value)) collectTexts(item, own, out);
  }
}

export { FigureError };
