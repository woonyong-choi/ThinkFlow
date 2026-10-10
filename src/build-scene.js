// 보기마다 도형 크기와 배치를 정하고 판을 합쳐, 시간표와 이동 글상자를 함께 검사한 장면을 만든다.
// 값 글자 자리는 값이 모든 장면에서 가질 글의 실제 폭이라 시간표에 기대고, 시간표는 배치에 기댄다. 그래서 자리가 더는 넓어지지 않을 때까지 되풀이한다(value-slots.js).
import { checkChartFigure, checkFigure } from './check.js';
import { buildChartFrames, chartCards, drawChartBase, extentOf } from './chart-frames.js';
import { mapSceneCharts, sceneCharts } from './chart-scene.js';
import { planClashes } from './chip-clash.js';
import { planHops } from './chip-plan.js';
import { roomByView, sweepByView, widenForHiddenChips } from './chip-room.js';
import { CHIP_GAP, sizeChip, wrapChip } from './chip.js';
import { chipLines, chipObstacles } from './draw/boxes.js';
import { checkEventBudget } from './event-budget.js';
import { layoutOrFail } from './layout/graph.js';
import { composePanels } from './layout/panels.js';
import { layoutSequence } from './layout/sequence.js';
import { shiftScene } from './layout/shift.js';
import { layoutTime } from './layout/time.js';
import { checkGridBudget, checkGridExtent } from './measure/grid-cost.js';
import { countLines } from './measure/line-counts.js';
import { sizeNode, sizeParticipant } from './measure/sizes.js';
import { reflowTimeline } from './reflow-timeline.js';
import { FigureError, createProblems, makeDiagnostic } from './source/problems.js';
import { collectCards, buildTimeline } from './timeline.js';
import { marksOf, presentationOf, pulsesOf } from './timeline-marks.js';
import { SLOT_ITERATIONS, grownSlots, unionTexts } from './value-slots.js';
import { collectValueTexts, initialValueTexts } from './values.js';
import { viewFigure } from './views.js';

// cost: time O(rounds·(elk + check)), heap O(s + e), stack O(d)
// vars: rounds = 값 글자 자리를 맞추는 횟수(최대 SLOT_ITERATIONS), elk = 배치 시간, check = 그림 검사 시간, s = 도형 수, e = 선 수, d = 그룹 깊이
// basis: estimate
/**
 * 같은 크기·배치·시간표로 그릴 수 있는지 검사한 장면을 반환한다. 값 글자 자리는 값이 가질 글의 집합이 더는 자리를 넓히지 않을 때까지 되풀이해 맞춘다.
 * @param reference 재배치할 때 쓸 이전 결과(figure, scene, timeline, valueTexts). 있으면 사건과 시각을 그대로 두고 경로만 새로 만든다
 * @returns { scene, timeline, valueTexts }
 */
export async function buildScene(figure, { source, limits, layoutWidth, chartWidth, reference }, problems) {
  checkGridBudget(figure, limits);
  checkEventBudget(figure, limits);
  let texts = reference?.valueTexts ?? initialValueTexts(figure);
  for (let round = 1; ; round++) {
    const placed = await placeScene(figure, { texts, source, limits, layoutWidth, chartWidth, reference }, problems);
    const observed = collectValueTexts(figure, placed.timeline);
    const next = unionTexts(texts, observed);
    const grown = grownSlots(texts, next);
    const isExtentGrown = chartCards(figure).some((card) => JSON.stringify(extentOf(card, figure, texts)) !== JSON.stringify(extentOf(card, figure, next)));
    if (reference || (!grown.length && !isExtentGrown)) return finish(placed, texts, { figure, layoutWidth }, problems);
    texts = next;
    if (round >= SLOT_ITERATIONS) throw unstable(figure, grown);
  }
}

// 값 글 집합이 수렴하지 않을 때의 오류. 줄은 아직 자리가 넓어지는 첫 값의 선언 줄이다.
function unstable(figure, grown) {
  const value = figure.values.find((v) => v.id === grown[0]);
  const id = value?.id ?? grown[0] ?? 'a chart';
  return new FigureError([makeDiagnostic({ severity: 'error', line: value?.line ?? figure.line, message: `value "${id}" text set does not settle; its width changes hop times` }, { code: 'layout-unstable' })]);
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 장면 수
// basis: estimate
// 고른 배치의 진단을 알리고, 장면의 재생 속도가 시간 막대를 0ms로 만들지 않는지 본다. 결과에 논리 시각과 표시 정보를 붙인다.
function finish(placed, texts, { figure, layoutWidth }, problems) {
  const { scene, timeline, local } = placed;
  problems.errors.push(...local.errors);
  problems.warnings.push(...local.warnings);
  // 배치 목표 폭은 그래프 보기에만 걸린다. 순서나 차트 판이 더 넓어도 그래프의 폭이 아니다.
  const graphWidth = Math.max(0, ...scene.panels.filter((panel) => panel.strategy === 'graph').map((panel) => panel.box.w));
  if (layoutWidth !== undefined && graphWidth > layoutWidth) problems.warn(figure.line, `the layout needs ${Math.ceil(graphWidth)}px, exceeding the requested ${layoutWidth}px. Shape sizes are preserved`, { code: 'layout-width' });
  checkSpeeds(figure, timeline);
  return { scene, timeline, valueTexts: texts };
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 장면 수
// basis: estimate
// 재생 속도로 나눈 장면 길이를 ms로 반올림해 1보다 작아지면 SMIL과 CSS의 길이가 0이 되어 재생할 수 없다. 그 장면의 줄에서 알린다. 반올림 때문에 받는 가장 큰 속도는 장면 길이의 2배다. 다른 상한은 없다.
function checkSpeeds(figure, timeline) {
  const spans = new Map();
  for (const seg of timeline.segs) spans.set(seg.si, { t0: spans.get(seg.si)?.t0 ?? seg.t0, t1: seg.t1 });
  figure.steps.forEach((step, si) => {
    const span = spans.get(si);
    // 길이 0인 장면(움직임이 없는 장면)은 흘릴 시간이 없어 SMIL이나 CSS의 길이도 쓰지 않는다. 길이가 있는데 1ms보다 짧아지는 속도만 막는다.
    const ms = span ? span.t1 - span.t0 : 0;
    if (ms > 0 && Math.round(ms / step.speed) < 1) throw new FigureError([makeDiagnostic({ severity: 'error', line: step.line, message: `speed=${step.speed} makes scene "${step.label}" shorter than 1ms (max speed for this scene: ${ms * 2})` }, { code: 'invalid-speed' })]);
  });
}

// 선이 도형을 뚫거나 선 끝이 연결점을 벗어나거나 두 선이 붙거나 그룹 제목 줄을 지나거나 선 번호 알약이 도형과 겹치는 그림 검사(2번, 3번, 4번, 5번, 13번). elkjs의 줄 바꿈(aspect)과 모델 순서 배치가 낸다.
const LAYOUT_CHECKS = new Set(['check-2', 'check-3', 'check-4', 'check-5', 'check-13']);

// cost: time O(2·(elk + check)), heap O(s + e), stack O(1)
// vars: elk = 배치 시간, check = 그림 검사 시간, s = 도형 수, e = 선 수
// basis: estimate
/**
 * 한 번의 값 글자 자리로 배치, 시간표, 그림 검사를 하고 장면을 돌려준다. 그래프 보기가 3번이나 4번 오류를 내면 안전 배치(줄 바꿈, 모델 순서 없음)로 한 번 더 하고,
 * 그 오류가 줄면 그쪽을 쓴다. aspect를 적었는데 안전 배치를 쓰면 무시했다고 경고한다.
 */
async function placeScene(figure, { texts, source, limits, layoutWidth, chartWidth, reference }, problems) {
  const cards = collectCards(figure, texts);
  const charts = new Map();
  for (const card of chartCards(figure)) charts.set(card.id, drawChartBase(card, { figure, texts, chartWidth, problems: createProblems(source) }));
  const inputs = { cards, charts, source, limits, layoutWidth, chartWidth, reference };
  const graphs = figure.views.filter((v) => v.strategy === 'graph');
  const directions = new Map(graphs.map((v) => [v.id, v.direction]));
  const failures = (a) => a.local.errors.filter((d) => LAYOUT_CHECKS.has(d.code)).length;
  const attempt = (asked) => attemptScene(figure, inputs, { safe: new Set(), room: roomByView(asked), sweep: sweepByView(asked) });
  const first = await widenForHiddenChips(await attempt(new Map()), { attempt, failures, directions });
  if (!graphs.length || !failures(first)) return first;
  const second = await attemptScene(figure, inputs, { safe: new Set(graphs.map((v) => v.id)), room: new Map() });
  if (failures(second) >= failures(first)) return first;
  if (figure.aspect !== undefined) problems.warn(figure.line, 'the layout ignored "aspect" because wrapping drew an edge through a shape or off its connection point. Remove the aspect line or change a group direction');
  return second;
}

// cost: time O(elk + check), heap O(s + e), stack O(1)
// vars: elk = 배치 시간, check = 그림 검사 시간, s = 도형 수, e = 선 수
// basis: estimate
// 장면 한 번. variant는 안전 배치로 다시 배치할 보기(safe)와 보기별 선 간격 요구(room), 선 옆 폭 요구(sweep)다. 검사 결과는 따로 모은 진단 그릇(local)에 담는다.
async function attemptScene(figure, inputs, variant) {
  const { cards, charts, source, limits, reference } = inputs;
  const local = createProblems(source);
  const names = new Map(figure.nodes.map((n) => [n.id, n.label]));
  const panels = [];
  for (const view of figure.views) panels.push(await layoutPanel(figure, view, { ...inputs, names }, variant, local));
  const scene = composePanels(panels);
  const timeline = reference ? reflowTimeline(reference, { figure, scene }) : buildTimeline(figure, { cards, chips: wrapChip, scene, limits });
  widenForChips(scene, timeline);
  planChips(scene, timeline, limits);
  attachCharts(figure, { scene, timeline, charts }, local);
  // 태그 색은 원본에 처음 나온 순서로 정한다(docs/design/figure-syntax.md 카드 줄).
  const rows = [...figure.nodes.flatMap((node) => node.content ?? []), ...figure.steps.flatMap((s) => s.beats.flatMap((b) => b.ops.map((o) => o.row)))];
  scene.tagOrder = rows.filter((row) => row?.tag && !row.tone).map((row) => row.tag);
  checkFigure({ figure, scene, timeline }, local);
  for (const chart of sceneCharts(scene).values()) checkChartFigure(chart, local);
  return { scene, timeline, local };
}

// cost: time O(elk), heap O(s + e), stack O(d)
// vars: elk = 배치 시간, s = 도형 수, e = 선 수, d = 그룹 깊이
// basis: estimate
// 보기 하나를 배치한다. 그래프는 elkjs, 순서는 격자 배치, 차트와 시간은 그림 크기대로다.
async function layoutPanel(figure, view, { cards, charts, names, layoutWidth, chartWidth }, variant, local) {
  const base = { view: view.id, strategy: view.strategy, label: view.label };
  if (view.strategy === 'plot') return { ...base, chart: { ...charts.get(view.cardIds[0]).drawn, id: view.cardIds[0] } };
  if (view.strategy === 'time') return { ...base, time: layoutTime(figure.nodes.find((n) => n.id === view.cardIds[0]), names, chartWidth) };
  if (view.strategy === 'sequence') {
    const sequence = viewFigure(figure, view);
    // 순서 보기의 참여자는 머리 모양만 그린다(표, API, 클래스는 공통 카드 머리). 카드 내용은 같은 카드를 담은 그래프 보기가 보인다.
    const sizes = new Map(sequence.nodes.map((n) => [n.id, sizeParticipant(n)]));
    return { ...base, scene: layoutSequence(sequence, sizes) };
  }
  const isSafe = variant.safe.has(view.id);
  const graph = { ...viewFigure(figure, view), ...(isSafe ? { aspect: undefined, safeLayout: true } : {}), chipRoom: variant.room.get(view.id), chipSweep: variant.sweep?.get(view.id) };
  const contentOf = (id) => (cards.contents.get(id) ?? []).map((rows) => rows.map((row) => row.chartId ? { ...row, chart: charts.get(row.chartId).drawn } : row));
  const sizes = new Map(graph.nodes.map((n) => [n.id, sizeNode(n, contentOf(n.id), countLines(graph, n.id), charts.get(n.id)?.drawn)]));
  checkGridExtent(graph, sizes, local);
  local.throwIfAny();
  return { ...base, scene: await layoutOrFail(graph, sizes, { problems: local, width: layoutWidth }) };
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
  shiftScene(scene, dx, 0);
  for (const item of [...scene.plots, ...scene.times]) item.x += dx;
  for (const panel of scene.panels) {
    panel.box.x += dx;
    if (panel.labelAt) panel.labelAt.x += dx;
  }
  for (const track of timeline.tracks ?? []) {
    track.parts = track.parts.map((part) => part.map((p) => ({ x: p.x + dx, y: p.y })));
    track.route = track.route.map((p) => ({ x: p.x + dx, y: p.y }));
  }
  scene.width = need;
}

// cost: time O(h·(k·p + k·a)), heap O(a + h·k), stack O(1)
// vars: h = 글 상자 있는 이동 수, k = 재는 지점 수(21), p = 경로 점 수, a = 글자 사각형 수
// basis: estimate
// 글 상자 자리를 경로 지점마다 미리 정해 이동에 담고, 흐름에서 점끼리 글 상자가 겹치는 구간은 나중에 출발한 점의 글 상자를 숨긴다. 움직이는 SVG와 재생기는 이 계획을 그대로 걸어 같은 자리를 쓴다.
function planChips(scene, timeline, limits) {
  const avoid = [...chipObstacles(scene, timeline), ...chipLines(scene)];
  planHops(scene, timeline, { avoid, limits });
  planClashes(scene, timeline);
}

// cost: time O(c·f·draw), heap O(c·f·out), stack O(1)
// vars: c = 값에 묶인 차트 카드 수, f = 프레임 수, draw = 차트를 그리는 비용, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 값에 묶인 차트 카드의 프레임을 만들어 장면(chartFrames)과 시간표(charts)에 붙이고, 표식 id가 붙은 그림으로 바꾼다. 시간표의 표시 정보(marks, pulses)도 여기서 정한다.
 * 묶은 값이 없는 차트는 프레임이 하나뿐이라 장면의 chartFrames와 시간표의 charts에 들지 않는다.
 */
function attachCharts(figure, { scene, timeline, charts }, local) {
  scene.chartFrames = {};
  timeline.charts = {};
  const bodies = new Map();
  for (const card of chartCards(figure)) {
    const { drawn, pin } = charts.get(card.id);
    const built = buildChartFrames(card, { figure, timeline, base: drawn, pin }, local);
    if (!built) continue;
    scene.chartFrames[card.id] = { marks: built.marks, frames: built.frames };
    timeline.charts[card.id] = { id: card.id, rows: built.rows };
    bodies.set(card.id, { body: built.body, defs: built.defs });
  }
  Object.assign(scene, mapSceneCharts(scene, (id, chart) => bodies.has(id) ? { ...chart, ...bodies.get(id) } : chart));
  timeline.marks = marksOf(timeline, { quiet: new Set(scene.edges.flatMap((edge, j) => (edge.quiet ? [j] : []))) });
  timeline.pulses = pulsesOf(timeline, timeline.charts);
  timeline.presentation = presentationOf(timeline);
}
