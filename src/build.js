// 원본 하나를 장면과 시간표로 만든다. 읽기, 차트 값 읽기, 크기, 배치, 시간표(선 길이를 쓰려고 배치 뒤), 그림 검사를 차례로 부른다(docs/architecture.md 그림 만들기).
import { waterfallDataRow } from './source/waterfall.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveBudget } from './budget.js';
import { buildScene } from './build-scene.js';
import { chartCards } from './chart-frames.js';
import { attachIcons } from './icons/index.js';
import { checkLayoutWidth } from './layout/graph.js';
import { findMissingGlyph } from './measure/fonts.js';
import { STYLE } from './measure/texts.js';
import { hasUnpairedBacktick, isLiteralFace } from './text.js';
import { checkChartLightTargets, checkChartRows, hasRowRule } from './source/chart-rules.js';
import { readFigure } from './source/parse.js';
import { createProblems, FigureError } from './source/problems.js';

// 원소 키. 종류마다 행 이름이 들어 있는 키다.
const LABEL_KEY = { bar: 'label', stacked: 'label', percent: 'label', dumbbell: 'label', difference: 'label', box: 'label', pie: 'label', donut: 'label', scatter: 'name' };

// cost: time O(n + elk + b·(e + s)), heap O(n + s + e), stack O(d), io 1
// vars: n = 원본 글자 수, elk = 배치 시간, b = 박자 수, e = 선 수, s = 도형 수, d = 그룹 깊이
// basis: estimate
/**
 * 원본을 장면과 시간표로 만든다.
 * @param baseDir 차트 카드 `data` 경로의 기준 폴더
 * @param strict 경고도 오류로 올린다
 * @param budget 올린 예산 { 이름: 값 }. 이름 없는 예산은 기본 한도다(src/budget.js)
 * @param layoutWidth 그래프 보기의 배치 목표 폭. 들어가지 못하면 경고하고 글자·도형 크기는 유지한다
 * @returns { figure, scene, timeline, warnings, valueTexts }. figure.source는 받은 원본 글 그대로(CRLF 포함)이고 reflowFigure도 같은 figure를 쓴다. scene은 보기마다의 판을 합친 장면(scene.panels, scene.plots, scene.times, scene.chartFrames)이고 timeline은 문서 하나의 시간표다
 * @throws FigureError 원본 오류나 그림 검사 오류가 있을 때. 모든 문제를 담는다
 */
export async function buildFigure(source, { baseDir = '.', strict = false, budget, layoutWidth, allowFileAccess = true } = {}) {
  const limits = resolveBudget(budget);
  const problems = createProblems(source);
  const figure = readFigure(source, problems);
  checkLayoutWidth(figure, layoutWidth, problems);
  if (!allowFileAccess) {
    for (const set of figure.iconSets) problems.error(set.line, 'file-based icon sets are not allowed in embedded documents');
    for (const card of chartCards(figure)) if (card.plot.chart.data) problems.error(card.line, 'file-based chart data is not allowed in embedded documents');
    problems.throwIfAny();
  }
  for (const card of chartCards(figure)) {
    if (card.plot.chart.data) loadChartData(card.plot, baseDir, problems);
  }
  checkGlyphs(figure, problems);
  attachIcons(figure, baseDir, problems);
  problems.throwIfAny();
  const built = await buildScene(figure, { source, limits, layoutWidth }, problems);
  return finish({ figure, ...built }, problems, { strict });
}

// cost: time O(elk + check + n), heap O(n + s + e), stack O(d)
// vars: elk = 배치 시간, check = 그림 검사 시간, n = 시간표 크기, s = 도형 수, e = 선 수, d = 그룹 깊이
// basis: estimate
/**
 * 이미 빌드한 문서를 새 폭에 배치한다. 사건·시각은 원본 시간표를 보존하고 그래프 보기의 경로와 글상자 자리, 차트의 그림 폭만 다시 만든다.
 * @param layoutWidth 그래프 보기의 배치 목표 폭(그래프 보기가 있을 때만)
 * @param chartWidth 차트를 그리는 폭. 차트 보기와 차트 카드가 모두 이 폭 이하로 그려진다(차트의 `layout.width`)
 */
export async function reflowFigure(reference, { layoutWidth, chartWidth, strict = false, budget } = {}) {
  const { figure } = reference;
  const problems = createProblems();
  checkLayoutWidth(figure, layoutWidth, problems);

  const limits = resolveBudget(budget);
  const built = await buildScene(figure, { limits, layoutWidth, chartWidth, reference }, problems);
  return finish({ figure, ...built }, problems, { strict });
}

// cost: time O(w), heap O(w), stack O(1)
// vars: w = 경고 수
// basis: estimate
// 경고(strict)를 오류로 올리고, 오류가 없으면 남은 진단과 함께 돌려준다.
function finish(result, problems, { strict }) {
  for (const d of strict ? problems.warnings : []) problems.error(d.line, d.message, { code: d.code, column: d.column });
  problems.throwIfAny();
  return { ...result, warnings: problems.warnings };
}

// cost: time O(j + r·k), heap O(j), stack O(1), io 1
// vars: j = JSON 글자 수, r = 원소 수, k = 원소의 키 수
// basis: estimate
// 차트 카드의 `data "경로" at "/포인터"` 배열을 행으로 바꾼다. 키 대응은 docs/design/charts.md 값 출처 절이다.
function loadChartData(plot, baseDir, problems) {
  const { chart, chartType } = plot;
  const { line } = chart.data;
  const where = `data "${chart.data.path}" at "${chart.data.pointer}"`;
  let records;
  try {
    records = pointer(parseJson(readFileSync(resolve(baseDir, chart.data.path), 'utf8')), chart.data.pointer);
  } catch (error) {
    // 파일 시스템 오류는 코드만, JSON 오류는 위치만 알린다. 읽은 파일의 글은 진단에 싣지 않는다.
    problems.error(line, `cannot read ${where}: ${error.code ?? error.message}`);
    return;
  }
  if (!Array.isArray(records)) {
    problems.error(line, `data at "${chart.data.pointer}" is not an array`);
    return;
  }
  const byKey = new Map(chart.series.map((s) => [s.key, s.id]));
  chart.rows = records.map((record, index) => toRow(record, { chart, chartType, byKey, line, index }, problems)).filter(Boolean);
  // 원소를 하나라도 버렸으면 그 오류가 원인이라, 행 수와 행 값 규칙은 보지 않는다. 덧붙는 오류를 막기 위해서다.
  if (chart.rows.length < records.length) return;
  checkChartRows(plot, problems);
  checkChartLightTargets(plot, problems);
}

// cost: time O(j), heap O(j), stack O(d)
// vars: j = JSON 글자 수, d = JSON 깊이
// basis: estimate
// JSON 글을 읽는다. 실패하면 읽은 글이 든 엔진의 메시지(`Unexpected token 'T', "TOKEN=…" is not valid JSON`) 대신 `not valid JSON`과 엔진이 알린 위치만 담은 오류를 던진다.
function parseJson(text) {
  try {
    return JSON.parse(text.replace(/^﻿/, ''));
  } catch (error) {
    const at = /position (\d+)(?: \(line (\d+) column (\d+)\))?/.exec(error.message);
    throw new Error(`not valid JSON${at ? ` at position ${at[1]}${at[2] ? ` (line ${at[2]} column ${at[3]})` : ''}` : ''}`);
  }
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 원소의 키 수
// basis: estimate
// 원소 하나를 행으로. 계열 키는 계열 이름으로 바꾸고, 빠진 키와 null은 빠진 값이다.
function toRow(record, { chart, chartType, byKey, line, index }, problems) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    problems.error(line, `data element ${index} must be an object`);
    return undefined;
  }
  if (chartType === 'waterfall') return waterfallDataRow(record, { line, index }, problems);
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
    else if (['scatter', 'ecdf'].includes(chartType) && key === 'series') values.series = byKey.get(String(value)) ?? String(value);
    else if (series) values[part ? `${series}.${part}` : series] = value;
    else if (['x', 'y', 'min', 'q1', 'median', 'q3', 'max', 'value'].includes(key) || (key === 'rule' && hasRowRule(chart, chartType))) values[key] = value;
    else problems.warn(line, `data key "${key}" is not used by a ${chartType} chart`);
  }
  for (const [key, value] of Object.entries(values)) {
    const isNumber = typeof value === 'number' && Number.isFinite(value);
    if (key !== 'series' && key !== 'row' && key !== 'col' && value !== null && !isNumber) problems.error(line, `data element ${index} value "${key}" must be a number or null. Found ${Array.isArray(value) ? 'array' : typeof value}`);
  }
  // 빠진 키는 빠진 값이다(막대, 쌓는 막대, 비율, 선, 계단). 선택하지 않은 표본 값은 없다.
  for (const s of byKey.values()) if (['bar', 'stacked', 'percent', 'line', 'step'].includes(chartType) && !(s in values)) values[s] = null;
  if (chartType === 'heatmap') return { label: `${values.row}\u0000${values.col}`, row: values.row, col: values.col, values: { value: values.value }, line };
  return { label, values, line };
}

// cost: time O(d), heap O(d), stack O(1)
// vars: d = 포인터 단계 수
// basis: estimate
// JSON Pointer(RFC 6901)로 값을 찾는다.
function pointer(document, path) {
  if (path === '') return document;
  if (!path.startsWith('/')) throw new Error('a JSON Pointer is "" or starts with "/"');
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
// vars: n = 문서 모형의 글 글자 수, t = 글 수, d = 모형 깊이
// basis: estimate
// 그림 글꼴에 없는 글자를 줄 번호와 함께 알린다. 대신 그릴 글꼴의 폭을 알 수 없기 때문이다.
// 모형의 글은 그려지는 역할의 글꼴로 한 번만 본다(LITERAL_KEYS: 클래스 멤버, 열 형식, mono 줄, 값 글. 나머지는 산문). 산문은 백틱 구간이 코드라서 짝이 안 맞으면 오류이고,
// 글 그대로 읽는 글(text.js isLiteralFace)은 백틱도 글자라 홀수 개여도 받는다. 글 종류를 빠뜨리지 않기 위해 모형 전체를 훑는다.
function checkGlyphs(figure, problems) {
  const texts = [];
  for (const key of ['nodes', 'groups', 'edges', 'views', 'values', 'steps']) collectTexts(figure[key], figure.line ?? 1, texts, { owner: key });
  for (const text of [figure.title, figure.subtitle]) collectTexts(text, figure.line ?? 1, texts);
  const reported = new Set();
  for (const [text, line, face] of texts) {
    if (!isLiteralFace(face) && hasUnpairedBacktick(text) && !reported.has(`${line}\u0000${text}`)) {
      reported.add(`${line}\u0000${text}`);
      problems.error(line, `the backticks in "${text}" are not paired. Close the code span with a second backtick`);
    }
    const missing = text ? findMissingGlyph(text, face) : undefined;
    if (missing === undefined || reported.has(`${line}\u0000${missing}`)) continue;
    reported.add(`${line}\u0000${missing}`);
    problems.error(line, `the font has no glyph for "${missing}". Remove the character`);
  }
}

// cost: time O(n), heap O(t), stack O(d)
// vars: n = 모형 원소 수, t = 글 수, d = 모형 깊이
// basis: estimate
function collectTexts(value, line, out, { owner, face = PROSE_FACE } = {}, seen = new Set()) {
  // 차트 행 이름처럼 \u0000으로 이은 안쪽 키는 그리지 않는 글이라 이음 글자를 빼고 본다.
  if (typeof value === 'string') out.push([value.replaceAll('\u0000', ' '), line, face]);
  else if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    const own = typeof value.line === 'number' ? value.line : line;
    if (Array.isArray(value)) for (const item of value) collectTexts(item, line, out, { owner, face }, seen);
    else for (const [key, item] of Object.entries(value)) collectTexts(item, own, out, { owner: key, face: faceOfKey(owner, value, key) }, seen);
  }
}

// 모형에서 산문이 아닌 글의 자리: 담고 있는 키 → 글 키 → 그려지는 역할의 글꼴. 클래스 멤버의 표기, 표·API 열 형식, 값 글은 글 그대로 그린다.
const LITERAL_KEYS = {
  members: { id: STYLE.mono.face, signature: STYLE.mono.face },
  columns: { type: STYLE.type.face },
  values: { from: STYLE.value.face },
  sets: { operand: STYLE.value.face },
};
const PROSE_FACE = STYLE.row.face;

// 글 키가 그려지는 글꼴. `show ... mono` 줄(row)의 글과 덧붙임도 고정폭 글꼴이다.
function faceOfKey(owner, parent, key) {
  if (owner === 'row' && parent.isMono && (key === 'text' || key === 'meta')) return STYLE.mono.face;
  return LITERAL_KEYS[owner]?.[key] ?? PROSE_FACE;
}

export { FigureError };
