// 스크립트 없이 움직이는 SVG와 멈춘 SVG. 장면 하나의 시간표 상태를 CSS keyframes와 SMIL로 옮긴다(docs/design/playback.md).
// 장면의 mode가 재생 방식을 정한다: static은 마지막 상태 하나, once는 한 번 재생하고 마지막 상태에 머물며, loop는 되풀이한다. speed는 재생 속도일 뿐 시간표의 ms는 바꾸지 않는다.
import { canvasOf, fitCanvas } from './canvas.js';
import { chartCards } from './chart-frames.js';
import { mapSceneCharts, sceneCharts } from './chart-scene.js';
import { animateFrameBody } from './animate/frames.js';
import { createAnimator } from './animate/animator.js';
import { createClock } from './animate/clock.js';
import { chartMotionCss } from './chart/motion.js';
import { drawScene } from './draw/figure.js';
import { hasStatus } from './draw/status.js';
import { paintCss } from './draw/paint.js';
import { drawTrackPaths } from './draw/tracks.js';
import { createGlyphSet, embedFonts } from './measure/fonts.js';
import { STYLES, tokensFor, figureDefs, patternDefs } from './styles.js';
import { WHOLE_CHART } from './timeline-charts.js';
import { escapeXml, plainText, roundCoord as r } from './text.js';
import { tokens, values } from './vendor/theme/tokens.js';

// cost: time O(g·b + b·h + out), heap O(out), stack O(1), io 1
// vars: g = 켜고 끄는 요소 수, b = 박자 수, h = 박자의 이동 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 장면 하나의 SVG 문서를 만든다.
 * @param result buildFigure 결과
 * @param options { scene, isStatic, name }. scene은 장면 번호(0부터)나 장면 이름이고 생략하면 첫 장면이다. isStatic이면 장면의 mode와 상관없이 마지막 상태 하나를 그린다. name은 원본 파일 이름이고 그림 제목(title)이 없을 때 SVG 제목으로 쓴다
 * @throws RangeError 없는 장면을 골랐을 때
 */
export async function toSvg(result, { scene: selector = 0, isStatic = false, name = '' } = {}) {
  const { figure } = result;
  const si = result.timeline.steps.length ? sceneIndex(result.timeline.steps, selector) : 0;
  const step = result.timeline.steps[si] ?? { label: '', mode: 'static', speed: 1 };
  const mode = isStatic ? 'static' : step.mode;
  const sliced = sliceTimeline(result.timeline, si, result.scene);
  // 정지 장면과, 표시 길이가 0인 장면(움직임도 효과도 없다)은 마지막 모습 하나다. 길이 0의 SMIL은 올바르지 않아 `<animate>`를 만들지 않는다.
  const isStill = mode === 'static' || result.timeline.presentation[si] === 0;
  const timeline = isStill ? finalState(sliced) : sliced;
  const clock = isStill ? createClock(1, { mode: 'static', displayMs: 1 }) : createClock(timeline.total, { speed: step.speed, mode, displayMs: result.timeline.presentation[si] });
  const glyphs = createGlyphSet();
  const charts = chartDrawings(result);
  // 움직이는 SVG는 움직임 층(`.fl-motion`)과 스크립트 없는 마지막 모습 층(`.fl-still`) 둘을 싣는다. 움직임 줄이기(`prefers-reduced-motion: reduce`)에서는 마지막 모습 층만 보이고 SMIL과 keyframes가 도는 층은 숨는다.
  // 정지 장면과 길이 0인 장면은 층이 하나뿐인 마지막 모습이다.
  const motionLayer = drawLayer(result, { si, timeline, clock, glyphs, charts, root: isStill ? '.fl' : '.fl .fl-motion' });
  const stillLayer = isStill ? undefined : drawLayer(result, { si, timeline: finalState(sliced), clock: createClock(1, { mode: 'static', displayMs: 1 }), glyphs, charts, root: '.fl .fl-still', prefix: 's' });
  const { content } = motionLayer;
  const { viewWidth: width, shownWidth, scale } = fitCanvas(content.width, 0, canvasOf(figure));
  const height = content.height;
  const shownHeight = height * scale;
  const fonts = await embedFonts(glyphs.used);
  const title = figure.title ?? name;
  const motion = charts.length ? STYLES.chart + chartMotionCss(timeline.growMs, charts.flatMap((c) => c.drawn.dotAts)) : '';
  const place = (layer, className) => `<g${className ? ` class="${className}"` : ''} transform="translate(${r((width - layer.content.width) / 2)} 0)">\n${layer.content.svg}\n</g>`;
  const layers = stillLayer ? `${place(motionLayer, 'fl-motion')}\n${place({ content: { ...stillLayer.content, svg: scopeIds(stillLayer.content.svg, 'still-') } }, 'fl-still')}` : place(motionLayer);
  const head = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="fl" width="${r(shownWidth)}" height="${r(shownHeight)}" viewBox="0 0 ${r(width)} ${r(height)}" role="img" data-scene="${si}" data-mode="${mode}">
<title>${escapeXml(plainText(title))}</title>
`;
  const styles = `${STYLES.figure}${paintCss(result.scene)}${motion}${hasStatus(timeline) ? STYLES.status : ''}
${motionLayer.css.join('\n')}${stillLayer ? `\n${stillLayer.css.join('\n')}\n${STILL_CSS}` : ''}
`;
  const body = `<defs>${figureDefs(figure)}${patternDefs(charts.map(({ drawn }) => drawn))}</defs>
<rect x="${values["border-width"].thin / 2}" y="${values["border-width"].thin / 2}" width="${r(width - values["border-width"].thin)}" height="${r(height - values["border-width"].thin)}" rx="${values.radius["card-radius"]}" fill="${tokens.color["prose-pre-background"]}"/>
${layers}
</svg>
`;
  // 배경, defs와 정지 층까지 완성한 뒤 문서 전체가 쓰는 토큰을 남긴다.
  return `${head}<style>${fonts}\n${tokensFor(head + fonts + styles + body)}${styles}</style>\n${body}`;
}

// 움직임 줄이기에서 보이는 층. 움직임 층(SMIL, keyframes)은 스크립트 없이 CSS 미디어 질의 하나로 숨기고 마지막 모습 층을 보인다. 문서에 직접 넣은(인라인) SVG에서 동작한다(실제 Chrome으로 확인). `<img>`로 넣은 SVG는 Chrome이 이 질의를 평가하지 않아 움직임 줄이기에서도 처음 모습이므로, 그 자리에서는 `<picture>`의 `media` 소스로 정지 SVG를 골라야 한다.
const STILL_CSS = '.fl .fl-still { display: none; }\n@media (prefers-reduced-motion: reduce) {\n  .fl .fl-motion { display: none; }\n  .fl .fl-still { display: inline; }\n}';

// cost: time O(g·b + b·h + out), heap O(out), stack O(1)
// vars: g = 켜고 끄는 요소 수, b = 박자 수, h = 박자의 이동 수, out = 만든 SVG 글자 수
// basis: estimate
// 한 시계로 그린 층 하나: 움직이는 층이나 마지막 모습 층. 같은 그리기 길(drawBody)을 쓰고 시계와 시간표만 다르다. root는 이 층의 CSS 규칙이 걸리는 범위, prefix는 이 층의 CSS class 이름 앞 글이다.
// 장면 하나의 SVG라 그 장면의 순서 요소만 보이고 다른 장면의 메시지는 숨는다(자리는 같다).
function drawLayer(result, { si, timeline, clock, glyphs, charts, root, prefix }) {
  const animator = createAnimator(timeline, clock, { prefix, root });
  for (const chart of charts) animator.chart(chart);
  const content = drawBody({ ...result, scene: { ...withFrames(result.scene, { timeline, clock }), shownSi: si } }, { animator, glyphs, timeline });
  return { content, css: animator.css };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = SVG 글자 수
// basis: estimate
// 한 층 안에서 정의된 id를 모두 prefix를 붙인 이름으로 바꾸고, 그 id를 가리키는 참조(`url(#id)`, `href="#id"`)도 같이 바꾼다. 층 밖(공통 defs)에서 정의된 id는 건드리지 않는다. 한 문서에 id가 겹치지 않게 한다.
function scopeIds(markup, prefix) {
  const ids = [...new Set([...markup.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))].sort((a, b) => b.length - a.length);
  if (!ids.length) return markup;
  const escaped = ids.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return markup.replace(new RegExp(`(\\sid="|url\\(#|href="#)(${escaped})(?=["\\)])`, 'g'), (_, lead, id) => `${lead}${prefix}${id}`);
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 장면 수
// basis: estimate
/** 명령줄 `--scene`의 값(1부터 센 번호나 장면 이름)을 장면 번호(0부터)로. 없으면 첫 장면이다. 없는 장면이면 사용자가 쓴 값을 알리는 RangeError다. 장면이 없는 그림에 값을 주면 고를 장면이 없어 RangeError다. */
export function selectScene(steps, option) {
  if (option === undefined) return 0;
  const index = /^\d+$/.test(option) ? Number(option) - 1 : steps.findIndex((s) => s.label === option);
  if (!hasScene(steps, index)) throw new RangeError(noSceneMessage(steps, option));
  return index;
}

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 장면 수
// basis: estimate
/** 장면 번호(0부터)나 이름을 장면 번호로. 없으면 있는 장면 이름을 알린다. */
function sceneIndex(steps, selector) {
  const index = typeof selector === 'number' ? selector : steps.findIndex((s) => s.label === selector);
  if (!hasScene(steps, index)) throw new RangeError(noSceneMessage(steps, selector));
  return index;
}

function hasScene(steps, index) {
  return Number.isInteger(index) && index >= 0 && index < steps.length;
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 장면 수
// basis: estimate
// 없는 장면 오류 글. shown은 부른 쪽이 받은 값 그대로다(명령줄은 1부터 센 입력, 공개 API는 0부터 센 번호).
function noSceneMessage(steps, shown) {
  return `no scene ${JSON.stringify(shown)}. ${steps.length ? `Scenes: ${steps.map((s, i) => `${i + 1} "${s.label}"`).join(', ')}` : 'This figure has no scenes'}`;
}

// cost: time O(b + v·c + f), heap O(b + v·c + f), stack O(1)
// vars: b = 박자 수, v = 값 줄 수, c = 값이 바뀌는 횟수, f = 차트 프레임 구간 수
// basis: estimate
/**
 * 시간표에서 장면 하나만 떼어 시각을 0부터 다시 센다. 값 줄, 펄스, 차트 프레임은 그 장면 것만 남는다. 장면이 없는 문서는 모든 것이 보이는 구간 하나다.
 */
function sliceTimeline(timeline, si, scene) {
  const segs = timeline.segs.filter((s) => s.si === si);
  if (!segs.length) return { segs: [emptySeg(timeline.initialCards)], total: 1, growMs: timeline.growMs, pulses: [], values: timeline.values ?? [], charts: {}, tracks: timeline.tracks };
  const t0 = segs[0].t0;
  const shift = (t) => t - t0;
  const rebased = (row) => ({ ...row, t0: shift(row.t0), t1: shift(row.t1), changes: row.changes.map(([t, text]) => [shift(t), text]), periods: row.periods.map(([a, b, text]) => [shift(a), shift(b), text]) });
  const total = segs.at(-1).t1 - t0;
  return {
    ...timeline,
    segs: segs.map((s) => ({ ...s, t0: shift(s.t0), t1: shift(s.t1) })),
    total,
    // 펄스 키(`value:번호`)는 시간표 전체의 값 줄 번호이고 장면만 남긴 값 줄은 장면 안 순서로 다시 센다. 그래서 값 줄마다 전체 번호(number)를 싣는다.
    values: (timeline.values ?? []).flatMap((row, number) => (row.si === si ? [{ ...rebased(row), number }] : [])),
    pulses: [...(timeline.pulses ?? []).filter((p) => p.si === si).map((p) => ({ ...p, at: shift(p.at) })), ...arrivalsOf(segs, shift)].sort((a, b) => a.at - b.at),
    marks: Object.fromEntries(Object.entries(timeline.marks ?? {}).map(([key, ranges]) => [key, ranges.filter(([, , owner]) => owner === si).map(([from, to]) => [shift(from), shift(to)])])),
    charts: Object.fromEntries(Object.entries(timeline.charts ?? {}).map(([id, chart]) => [id, { ...chart, rows: chart.rows.filter((row) => row.si === si).map((row) => ({ ...row, t0: shift(row.t0), t1: shift(row.t1), periods: row.periods.map(([a, b, frame, changed]) => [shift(a), shift(b), frame, changed]) })) }])),
  };
}

// 점이 도형에 닿는 후광(구간의 pulses)을 값과 차트의 펄스와 같은 모양 { key: `node:도형`, at }로 장면 시각에 놓는다.
const arrivalsOf = (segs, shift) => segs.flatMap((seg) => (seg.pulses ?? []).map(({ id, at }) => ({ key: `node:${id}`, at: shift(seg.t0) + at })));

// 장면이 없는 문서의 구간: 카드는 선언한 값 줄이 놓인 내용(rows는 시간표의 선언한 값 줄)이고 모든 계열이 보이며 선과 도형은 켜지지 않는다.
// 차트 상태(charts)는 비워 둔다. 상태가 없는 차트는 animateChart가 선언한 모든 계열(계열이 없으면 차트 전체)을 보이고, 밝힌 행과 자라는 계열은 없다.
function emptySeg(cards) {
  return { si: 0, bi: 0, t0: 0, t1: 1, move: 0, hops: [], nodesOn: [], partsOn: [], cards, cardsBefore: cards, cardsAt: {}, charts: {} };
}

// cost: time O(b + v), heap O(b + v), stack O(1)
// vars: b = 박자 수, v = 값 줄 수
// basis: estimate
/**
 * 장면의 마지막 상태 하나로 줄인다: 마지막 구간의 카드, 지나온 선과 밝힌 도형과 밝힌 차트 행, 값 줄마다 마지막 글, 차트 프레임의 마지막 구간. 점, 펄스, 자라는 움직임은 없다. 밝히기(light)는 효과가 아니라 장면 끝까지 남는 상태다.
 * once 재생이 끝난 모습과 같다.
 */
function finalState(timeline) {
  const last = timeline.segs.at(-1);
  const seg = {
    ...last,
    t0: 0,
    t1: 1,
    hops: [],
    cardsBefore: last.cards,
    cardsAt: {},
    pulses: undefined,
    charts: Object.fromEntries(Object.entries(last.charts ?? {}).map(([id, c]) => [id, { series: c.series, growing: [], lights: c.lights }])),
  };
  const lastText = (row) => row.periods.at(-1)[2];
  // 장면에서 한 번이라도 지난 조용한 선은 마지막 모습에서도 보인다(보임일 뿐 활성은 아니다). 켜 둔 도형은 구간의 nodesOn이 정한다.
  const marks = Object.fromEntries(Object.entries(timeline.marks ?? {}).filter(([, ranges]) => ranges.length).map(([key]) => [key, [[0, 1]]]));
  return {
    ...timeline,
    segs: [seg],
    total: 1,
    marks,
    pulses: [],
    values: timeline.values.map((row) => ({ ...row, t0: 0, t1: 1, initial: lastText(row), changes: [], periods: [[0, 1, lastText(row)]] })),
    charts: Object.fromEntries(Object.entries(timeline.charts).map(([id, chart]) => [id, { ...chart, rows: chart.rows.map((row) => ({ ...row, t0: 0, t1: 1, periods: row.periods.length ? [[0, 1, row.periods.at(-1)[2], []]] : [] })) }])),
  };
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 차트 카드 수
// basis: estimate
// 장면에 그려진 차트 카드마다 { id, seriesIds, drawn }. 같은 차트가 차트 보기와 카드로 함께 놓이면 한 번이다.
function chartDrawings({ figure, scene }) {
  const drawings = sceneCharts(scene);
  return chartCards(figure).flatMap((card) => {
    const drawn = drawings.get(card.id);
    if (!drawn) return [];
    const series = card.plot.chart.series.map((s) => s.id);
    return [{ id: card.id, seriesIds: series.length ? series : [WHOLE_CHART], drawn }];
  });
}

// cost: time O(m·p), heap O(out), stack O(1)
// vars: m = 표식 수, p = 구간 수, out = 만든 SVG 글자 수
// basis: estimate
// 값에 묶인 차트의 그림을 프레임 전환 SMIL을 담은 그림으로 바꾼 장면.
function withFrames(scene, { timeline, clock }) {
  const frames = scene.chartFrames ?? {};
  const animate = (id, drawn) => (frames[id] ? { ...drawn, body: animateFrameBody(drawn.body, { id, chartFrames: frames[id], rows: timeline.charts[id]?.rows ?? [], clock, pulses: timeline.pulses }) } : drawn);
  return mapSceneCharts(scene, animate);
}

// cost: time O(scene + b·h), heap O(out), stack O(1)
// vars: scene = 장면 그리기 비용, b = 박자 수, h = 박자의 이동 수, out = 만든 SVG 글자 수
// basis: estimate
// 보기마다의 판과 점. 판은 쌓인 채 한 장면으로 그려지고, 점은 판의 선을 따라 움직인다.
function drawBody(result, { animator, glyphs, timeline }) {
  const { scene } = result;
  const { body, pills } = drawScene({ ...scene, flashes: animator.flashes(scene, timeline), borders: animator.borders(scene) }, animator.decorate(scene), glyphs);
  const packets = timeline.segs.flatMap((seg, si) => seg.hops.map((hop, hi) => animator.packet({ seg, hop, name: `p${si}-${hi}` }, glyphs)));
  const tracks = animator.isStatic ? '' : drawTrackPaths(timeline);
  const status = animator.status(scene, timeline, glyphs);
  return { svg: `${body}\n${tracks}${animator.values(scene, timeline, glyphs)}\n${packets.join('\n')}\n${pills}${status ? `\n${status}` : ''}`, width: scene.width, height: scene.height };
}
