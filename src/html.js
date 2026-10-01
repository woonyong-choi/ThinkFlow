// 재생 화면 HTML 한 장과 목록 쪽. 스크립트, 스타일, 글꼴, 그림을 모두 안에 넣어 파일 하나로 열린다.
import { readFileSync } from 'node:fs';
import { chartText } from './chart/draw.js';
import { drawScene } from './draw/figure.js';
import { curveOf } from './easing.js';
import { createGlyphSet, embedFonts } from './measure/fonts.js';
import { DEFS, STYLES } from './styles.js';
import { escapeXml, roundCoord as r } from './text.js';
import { chartMotionCss } from './chart/motion.js';
import { chartSeriesIds, litIds } from './timeline.js';
import { tokens, values } from './tokens.js';

const PLAYER = readFileSync(new URL('./player.js', import.meta.url), 'utf8');
const VIEWER = readFileSync(new URL('./viewer.js', import.meta.url), 'utf8');
// iframe 안에서 열리면 틀을 빼고, 목록 쪽이 iframe 높이를 맞추도록 본문 높이를 알린다. 문서(html) 높이는 iframe 창보다 작아지지 않아 쓰지 않는다.
const EMBED_SCRIPT = `<script>if (window.self !== window.top) {\n  document.documentElement.classList.add('embedded');\n  addEventListener('load', () => new ResizeObserver(() => parent.postMessage({ figureHeight: Math.ceil(document.body.getBoundingClientRect().height) }, '*')).observe(document.body));\n}</script>`;
// 전체 화면 단추와, 전체 화면에서만 보이는 확대·축소 단추. 아이콘은 viewer.js가 그린다.
const VIEW_BUTTONS =
  '<button type="button" class="fl-round fl-full"></button>' +
  '<div class="fl-zoom"><button type="button" class="fl-round" data-zoom="in" aria-label="확대"></button><button type="button" class="fl-round" data-zoom="out" aria-label="축소"></button><button type="button" class="fl-round" data-zoom="fit" aria-label="전체 보기"></button></div>';
// 재생기가 점과 글 상자, 아이콘을 그릴 때 쓰는 값. 브라우저 코드는 tokens.js를 불러올 수 없어 데이터로 넘긴다.
const PLAYER_METRICS = Object.freeze({
  accent: tokens.color.accent,
  halo: values.size.halo,
  haloOpacity: values.opacity.halo,
  packet: values.size.packet,
  chipRadius: values.radius.lg,
  chipLine: values.size.line['15'],
  chipPadX: values.space['9'],
  chipPadY: values.space['4'],
  chipGap: values.space['6'],
  icon: values.size.icon,
  iconStroke: values.border.edge,
  pauseStroke: values.border.strong,
  zoomMax: values.scale['zoom-max'],
  zoomStep: values.scale['zoom-step'],
  move: curveOf('move'),
});

// cost: time O(s + e + b·(e + k) + out), heap O(out), stack O(1), io 1
// vars: s = 도형 수, e = 선 수, b = 박자 수, k = 카드 있는 도형 수, out = 만든 HTML 글자 수
// basis: estimate
/** 재생기 HTML 문서. 그림, 시간표, 재생 스크립트를 모두 안에 넣는다. */
export async function toHtml(result, name) {
  const { figure, timeline } = result;
  const glyphs = createGlyphSet();
  const content = result.chart ? chartContent(result, glyphs) : figureContent(result, glyphs);
  for (const label of timeline.steps) glyphs.add(label, 'regular');
  for (const seg of timeline.segs) {
    glyphs.add(seg.caption, 'regular');
    for (const hop of seg.hops) for (const line of hop.data ?? []) glyphs.add(line, 'regular');
  }
  const fonts = await embedFonts(glyphs.used);
  const { width, height } = content;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" class="fl" width="${r(width)}" height="${r(height)}" style="aspect-ratio: ${r(width)} / ${r(height)}" viewBox="0 0 ${r(width)} ${r(height)}" role="img">` +
    `<title>${escapeXml(figure.title ?? name)}</title><defs>${DEFS}</defs>${content.svg}<g class="fl-packets"></g></svg>`;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(figure.title ?? name)}</title>
${EMBED_SCRIPT}
<style>${fonts}
${STYLES.tokens}${STYLES.player}${STYLES.figure}${STYLES.chart}${result.chart ? chartMotionCss(timeline.growMs, result.chart.dotAts) : ''}</style>
</head>
<body>
<figure class="fl-figure${result.chart ? ' fl-chart-page' : ''}" tabindex="0">
${VIEW_BUTTONS}
<div class="fl-canvas">${svg}</div>
<figcaption class="fl-foot">
<div class="fl-bar"><button type="button" class="fl-round fl-pause"></button><div class="fl-tabs" role="tablist"></div><button type="button" class="fl-round fl-rate" aria-label="배속">1×</button></div>
<p class="fl-caption" aria-live="polite"></p>
</figcaption>
</figure>
<script>
${VIEWER}
${PLAYER}
figurePlay(document.querySelector('.fl-figure'), ${JSON.stringify(content.data).replace(/</g, '\\u003c')});
</script>
</body>
</html>
`;
}

// cost: time O(s + e + b·(e + k)), heap O(b·(e + k)), stack O(1)
// vars: s = 도형 수, e = 선 수, b = 박자 수, k = 카드 있는 도형 수
// basis: estimate
// 구조, 상태, 데이터, 순서 그림. 시간표의 id를 도형, 그룹 번호로 바꿔 넘긴다.
function figureContent(result, glyphs) {
  const { scene, timeline } = result;
  const itemIndex = new Map(scene.items.map((it, i) => [it.id, i]));
  const groupIndex = new Map(scene.groups.map((g, i) => [g.id, i]));
  const toIndex = (map, obj) => Object.fromEntries(Object.entries(obj).map(([id, v]) => [map.get(id), v]));
  const segs = timeline.segs.map((seg) => {
    const lit = litIds(seg, scene.edges);
    return {
      si: seg.si,
      t0: seg.t0,
      t1: seg.t1,
      hops: seg.hops,
      edgesOn: seg.edgesOn,
      nodesOn: [...lit].filter((id) => itemIndex.has(id)).map((id) => itemIndex.get(id)),
      groupsOn: [...lit].filter((id) => groupIndex.has(id)).map((id) => groupIndex.get(id)),
      columnsOn: seg.columnsOn,
      cards: toIndex(itemIndex, seg.cards),
      cardsBefore: toIndex(itemIndex, seg.cardsBefore),
      cardsAt: toIndex(itemIndex, seg.cardsAt),
      caption: seg.caption,
      series: [],
      growing: [],
      lights: [],
    };
  });
  const data = {
    segs,
    steps: timeline.steps,
    cardCounts: scene.items.map((it) => it.card?.layouts.length ?? 0),
    edgeEnds: scene.edges.map((e) => [itemIndex.get(e.from.split('.')[0]) ?? -1, itemIndex.get(e.to.split('.')[0]) ?? -1]),
    seriesCount: 0,
    rowCount: 0,
    metrics: PLAYER_METRICS,
  };
  return { svg: drawScene(scene, () => '', glyphs), width: scene.width, height: scene.height, data };
}

// cost: time O(b·(s + l) + c), heap O(b·(s + l)), stack O(1)
// vars: b = 박자 수, s = 계열 수, l = 밝히기 수, c = 차트 글자 수
// basis: estimate
// 차트. 계열은 번호로, light는 행 번호로 바꿔 넘긴다.
function chartContent(result, glyphs) {
  const { figure, chart, timeline } = result;
  for (const face of ['regular', 'mono', 'semibold']) glyphs.add(chartText(figure), face);
  const ids = chartSeriesIds(figure);
  const segs = timeline.segs.map((seg) => ({
    si: seg.si,
    t0: seg.t0,
    t1: seg.t1,
    hops: [],
    edgesOn: [],
    nodesOn: [],
    groupsOn: [],
    columnsOn: [],
    cards: {},
    cardsBefore: {},
    cardsAt: {},
    caption: seg.caption,
    labelShift: seg.labelShift,
    series: seg.series.map((id) => ids.indexOf(id)),
    growing: seg.growing.map((id) => ids.indexOf(id)),
    lights: seg.lights.map((key) => chart.rowKeys.indexOf(key)),
  }));
  const data = { segs, steps: timeline.steps, cardCounts: [], edgeEnds: [], seriesCount: ids.length, rowCount: chart.rowKeys.length, metrics: PLAYER_METRICS };
  const bg = `<rect width="100%" height="100%" fill="${tokens.color.bg}"/>`;
  return { svg: bg + chart.body, width: chart.width, height: chart.height, data };
}

// cost: time O(f), heap O(out), stack O(1)
// vars: f = 그림 수, out = 만든 HTML 글자 수
// basis: estimate
/**
 * 여러 그림을 한 쪽에서 보는 목록. 그림마다 재생 화면을 iframe으로 넣는다.
 * @param figures { name, title, href }[]. href는 목록 쪽에서 본 확장자 뺀 상대 경로다.
 */
export function toGallery(figures, heading) {
  const cards = figures
    .map(
      (f) =>
        `<section><header><h2>${escapeXml(f.name)}</h2><p>${escapeXml(f.title)}</p><nav><a href="${escapeXml(f.href)}.html">열기</a><a href="${escapeXml(f.href)}.svg">SVG</a></nav></header>` +
        `<iframe src="${escapeXml(f.href)}.html" loading="lazy" allowfullscreen title="${escapeXml(f.name)}"></iframe></section>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(heading)}</title>
<style>${STYLES.tokens}${STYLES.gallery}</style>
</head>
<body>
<h1>${escapeXml(heading)}</h1>
<p>그림 ${figures.length}개</p>
<main>
${cards}
</main>
<script>
// 그림 쪽이 알려 준 본문 높이로 iframe 높이를 맞춘다. 그림 아래 빈 공간을 없애기 위해서다.
addEventListener('message', (e) => {
  const frame = [...document.querySelectorAll('iframe')].find((f) => f.contentWindow === e.source);
  if (frame && e.data?.figureHeight) frame.style.height = e.data.figureHeight + 'px';
});
</script>
</body>
</html>
`;
}
