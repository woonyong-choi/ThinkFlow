// 원본 하나를 장면과 시간표로 만든다. 읽기, 차트 값 읽기, 크기, 배치, 시간표(선 길이를 쓰려고 배치 뒤), 그림 검사를 차례로 부른다(docs/architecture.md 그림 만들기).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkChartFigure, checkFigure } from './check.js';
import { CHIP_GAP, sizeChip } from './chip.js';
import { planHops } from './chip-plan.js';
import { chipLines, chipObstacles } from './draw/boxes.js';
import { drawChart } from './chart/draw.js';
import { LayoutError } from './layout/error.js';
import { layoutGraph } from './layout/graph.js';
import { layoutSequence } from './layout/sequence.js';
import { findMissingGlyph, wrap } from './measure/fonts.js';
import { hasUnpairedBacktick } from './text.js';
import { STYLE, sizeNode } from './measure/sizes.js';
import { INTERVAL_TYPES, checkChartLightTargets, checkChartRows } from './source/chart-rules.js';
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
 * @param strict 경고도 오류로 올린다
 * @param noDeprecated 폐기 진단도 오류로 올린다
 * @returns { figure, scene, timeline, warnings, deprecations }. 차트면 scene 대신 chart가 있다
 * @throws FigureError 원본 오류나 그림 검사 오류가 있을 때. 모든 문제를 담는다
 */
export async function buildFigure(source, { baseDir = '.', strict = false, noDeprecated = false, requireData = false, requireCi = false } = {}) {
  const problems = createProblems(source);
  const figure = readFigure(source, problems);
  if (figure.kind === 'chart' && figure.chart.data) loadChartData(figure, baseDir, problems);
  checkGlyphs(figure, problems);
  if (figure.kind === 'chart') checkSkillRules(figure, { requireData, requireCi }, problems);
  problems.throwIfAny();
  const cards = collectCards(figure);
  if (figure.kind === 'chart') {
    const timeline = buildTimeline(figure, { cards, chips: wrapChip });
    const chart = drawChart(figure);
    checkChartFigure(chart, problems);
    return finish({ figure, chart, timeline }, problems, { strict, noDeprecated });
  }
  const sizes = new Map(figure.nodes.map((n) => [n.id, sizeNode(n, cards.contents.get(n.id), figure.kind === 'sequence' ? undefined : countLines(figure, n.id))]));
  const { scene, timeline } = await placeScene(figure, { sizes, cards, source }, problems);
  return finish({ figure, scene, timeline }, problems, { strict, noDeprecated });
}

// 선이 도형을 뚫거나 선 끝이 연결점을 벗어나거나 두 선이 붙는 그림 검사(3번, 4번, 5번). elkjs의 줄 바꿈(aspect)과 모델 순서 배치가 낸다.
const LAYOUT_CHECKS = new Set(['check-3', 'check-4', 'check-5']);

// cost: time O(2·(elk + check)), heap O(s + e), stack O(1)
// vars: elk = 배치 시간, check = 그림 검사 시간, s = 도형 수, e = 선 수
// basis: estimate
/**
 * 배치, 시간표, 그림 검사를 한 번 하고 장면을 돌려준다. 구조 그림이 3번이나 4번 오류를 내면 안전 배치(줄 바꿈, 모델 순서 없음)로 한 번 더 하고,
 * 그 오류가 줄면 그쪽을 쓴다. aspect를 적었는데 안전 배치를 쓰면 무시했다고 경고한다.
 * @param inputs { sizes, cards, source }
 */
async function placeScene(figure, inputs, problems) {
  const first = await attemptScene(figure, inputs);
  const failures = (a) => a.local.errors.filter((d) => LAYOUT_CHECKS.has(d.code)).length;
  let chosen = first;
  if (figure.kind !== 'sequence' && failures(first) && !figure.safeLayout) {
    const second = await attemptScene({ ...figure, aspect: undefined, safeLayout: true }, inputs);
    if (failures(second) < failures(first)) {
      chosen = second;
      if (figure.aspect !== undefined) problems.warn(figure.line, 'the layout ignored "aspect" because wrapping drew an edge through a shape or off its connection point. Remove the aspect line or change a group direction');
    }
  }
  problems.errors.push(...chosen.local.errors);
  problems.warnings.push(...chosen.local.warnings);
  return chosen;
}

// cost: time O(elk + check), heap O(s + e), stack O(1)
// vars: elk = 배치 시간, check = 그림 검사 시간, s = 도형 수, e = 선 수
// basis: estimate
// 장면 한 번. 검사 결과는 따로 모은 진단 그릇(local)에 담는다.
async function attemptScene(figure, { sizes, cards, source }) {
  const local = createProblems(source);
  const scene = figure.kind === 'sequence' ? layoutSequence(figure, sizes) : await layoutOrFail(figure, sizes, local);
  const timeline = buildTimeline(figure, { cards, chips: wrapChip, scene });
  widenForChips(scene, timeline);
  planChips(scene, timeline);
  // 태그 색은 원본에 처음 나온 순서로 정한다(docs/design/figure-syntax.md 카드 줄).
  scene.tagOrder = figure.steps.flatMap((s) => s.beats.flatMap((b) => b.ops.filter((o) => o.row?.tag && !o.row.tone).map((o) => o.row.tag)));
  checkFigure({ figure, scene, timeline }, local);
  return { scene, timeline, local };
}

// cost: time O(elk), heap O(s + e), stack O(1)
// vars: elk = 배치 시간, s = 도형 수, e = 선 수
// basis: estimate
// 구조 그림 배치. 배치가 끝내 실패하면 원인 선의 줄 번호가 있는 오류로 바꿔 알린다(내부 오류로 끝내지 않는다).
async function layoutOrFail(figure, sizes, problems) {
  try {
    return await layoutGraph(figure, sizes);
  } catch (error) {
    if (!(error instanceof LayoutError)) throw error;
    problems.error(error.line ?? figure.line, `${error.message}. Change a group direction, remove "aspect", or break the cycle into fewer back edges`, { code: 'layout' });
    return problems.throwIfAny();
  }
}

// cost: time O(e), heap O(1), stack O(1)
// vars: e = 선 수
// basis: estimate
// 도형 하나에서 나가고 들어오는 선 수. 사람 몸통 높이를 배치 전에 정하는 데 쓴다.
function countLines(figure, id) {
  return { out: figure.edges.filter((e) => e.from === id).length, in: figure.edges.filter((e) => e.to === id).length };
}

// cost: time O(h·l + s + e·p), heap O(1), stack O(1)
// vars: h = 이동 수, l = 글 상자 줄 수, s = 도형 수, e = 선 수, p = 경로 점 수
// basis: estimate
// 가장 넓은 글 상자가 그림 폭에 들어가도록 그림을 넓히고 내용을 가운데로 옮긴다. 좁은 세로 그림에서 글 상자가 밖으로 나가지 않게 하기 위해서다.
function widenForChips(scene, timeline) {
  const widest = Math.max(0, ...timeline.segs.flatMap((seg) => seg.hops.filter((h) => h.data).map((h) => sizeChip(h.data).w)));
  const need = widest + CHIP_GAP * 2;
  if (need <= scene.width) return;
  const dx = (need - scene.width) / 2;
  for (const box of [...scene.items, ...scene.groups, ...(scene.notes ?? [])]) box.x += dx;
  for (const line of scene.lifelines ?? []) line.x += dx;
  for (const e of scene.edges) {
    e.points = e.points.map((p) => ({ x: p.x + dx, y: p.y }));
    if (e.labelAt) e.labelAt = { x: e.labelAt.x + dx, y: e.labelAt.y };
  }
  scene.width = need;
}

// cost: time O(h·(k·p + k·a)), heap O(a + h·k), stack O(1)
// vars: h = 글 상자 있는 이동 수, k = 재는 지점 수(21), p = 경로 점 수, a = 글자 사각형 수
// basis: estimate
// 글 상자 자리를 경로 지점마다 미리 정해 이동에 담는다. 움직이는 SVG와 재생기는 이 계획을 그대로 걸어 같은 자리를 쓴다.
function planChips(scene, timeline) {
  const avoid = [...chipObstacles(scene), ...chipLines(scene)];
  planHops(scene, timeline, avoid);
}

// cost: time O(w), heap O(w), stack O(1)
// vars: w = 경고와 폐기 수
// basis: estimate
// 경고(strict)와 폐기(noDeprecated)를 오류로 올리고, 오류가 없으면 남은 진단과 함께 돌려준다.
function finish(result, problems, { strict, noDeprecated }) {
  const promoted = [...(strict ? problems.warnings : []), ...(noDeprecated ? problems.deprecations : [])];
  for (const d of promoted) problems.error(d.line, d.message, { code: d.code, column: d.column, fix: d.fix });
  problems.throwIfAny();
  return { ...result, warnings: problems.warnings, deprecations: problems.deprecations };
}

/** 글 상자 글을 토큰 `size.chip-max` 너비의 줄로 나눈다. HTML과 SVG가 같은 줄을 쓴다. */
function wrapChip(text) {
  return wrap(text, values.size['chip-max'], STYLE.chip);
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
// 문서 스킬이 실험 차트에 거는 규칙. 값 손 기재 금지(예시 데이터 제외)와 신뢰구간.
function checkSkillRules(figure, { requireData, requireCi }, problems) {
  const { chart } = figure;
  const isIllustrative = figure.subtitle?.startsWith('예시 데이터.') ?? false;
  if (requireData && !chart.data && !isIllustrative) problems.error(chart.rows[0]?.line ?? figure.line, 'values must come from data "results/summary.json" at "/..." (--require-data). Hand-written rows are only for subtitles starting with "예시 데이터."');
  if (!requireCi || !INTERVAL_TYPES.includes(figure.chartType)) return;
  for (const row of chart.rows) {
    for (const { id } of chart.series) {
      const hasCi = row.values[`${id}.low`] !== undefined && row.values[`${id}.high`] !== undefined;
      const name = row.label ?? `x=${row.values.x}`;
      if (row.values[id] !== null && !hasCi) problems.error(row.line, `${figure.chartType} "${name}" needs ${id}.low= and ${id}.high= (--require-ci)`);
    }
  }
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
// vars: n = 그림 모형의 글 글자 수, t = 글 수, d = 모형 깊이
// basis: estimate
// 그림 글꼴에 없는 글자를 줄 번호와 함께 알린다. 대신 그릴 글꼴의 폭을 알 수 없기 때문이다.
// 모형의 모든 글을 본문 글꼴로, 테이블 열 타입은 고정폭 글꼴로도 본다. 백틱 구간은 글 안에서 고정폭으로 보고, 짝이 안 맞는 백틱은 오류다. 글 종류를 빠뜨리지 않기 위해 모형 전체를 훑는다.
function checkGlyphs(figure, problems) {
  const texts = [];
  collectTexts(figure, figure.line ?? 1, texts);
  const mono = figure.nodes.flatMap((n) => (n.columns ?? []).map((c) => [c.type, c.line ?? n.line]));
  const reported = new Set();
  for (const [text, line, face] of [...texts.map(([t, l]) => [t, l, 'regular']), ...mono.map(([t, l]) => [t, l, 'mono'])]) {
    if (hasUnpairedBacktick(text) && !reported.has(`${line}\u0000${text}`)) {
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
