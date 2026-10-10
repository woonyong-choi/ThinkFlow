// 재생기에 넘길 그림 내용: 판마다의 SVG와 재생 데이터. 모든 그림은 장면(scene)과 시간표(timeline) 하나로 만들어지고, 그래프, 순서, 차트, 시간 보기는 판(scene.panels)이 된다.
// 도형 id는 논리 id로 넘긴다. 같은 카드가 여러 판에 그려지면 도형 번호(#n-번호)는 다르지만 논리 id는 같고, 재생기가 모든 그림 요소를 찾아 같은 모습으로 맞춘다.
import { tokenize } from '../chart-tokens.js';
import { chartCards } from '../chart-frames.js';
import { mapSceneCharts, sceneCharts } from '../chart-scene.js';
import { withPulseOverlays } from '../chart/pulse-overlay.js';
import { drawScene } from '../draw/figure.js';
import { drawStatusPills } from '../draw/status.js';
import { drawTrackPaths } from '../draw/tracks.js';
import { drawFlashes, drawValues } from '../draw/values.js';
import { WHOLE_CHART } from '../timeline-charts.js';
import { figureViewBounds } from './view-bounds.js';
import { FLOW_METRICS, PLAYER_METRICS } from './metrics.js';

/**
 * 그림 내용. 판마다 SVG 한 장을 만들고(판 상자가 viewBox), 재생 데이터를 모은다.
 * @returns { panels, width, height, data, dotAts, hasCharts, charts }. charts는 그려진 차트 그림 목록(무늬 정의 defs를 문서에 한 번 모을 때 쓴다). panels[i]는 { index, view, label, box, svg }이다. svg는 판 안쪽 내용(SVG 요소의 자식)이다.
 */
export function figureContent(result, glyphs) {
  const { scene, timeline, figure } = result;
  // 재생기는 장면 0에서 시작하므로 처음 그림은 장면 0의 순서 요소만 보인다(재생기가 장면이 바뀔 때 맞춘다).
  // 장면이 없는 문서는 재생기가 그리지 않으므로(player/play.js) 선언한 처음 모습(카드 값 줄과 큐 찬 칸)을 처음부터 보이게 그린다. 정지 SVG와 같은 시간표 값 줄이다.
  const isStill = !timeline.segs.length;
  const shownCards = isStill ? timeline.initialCards : undefined;
  const { body, pills } = drawScene({ ...withOverlays(scene), flashes: drawFlashes(scene, timeline, {}), shownSi: 0, shownCards }, () => '', glyphs);
  const parts = {
    body,
    tracks: drawTrackPaths(timeline),
    values: drawValues(scene, timeline, { glyphs, windows: () => '', isStatic: isStill }),
    // 상태 알약은 `논리 id-종류`로 찾는다. 같은 카드가 여러 판에 그려져도 알약은 시간표에 하나이고, 그린 도형에 붙는다.
    status: drawStatusPills(scene, timeline, { glyphs, windows: () => '', name: (node) => node }),
    pills,
  };
  const { panels, trackPanels } = splitPanels(scene, parts);
  const drawn = sceneCharts(scene);
  const data = {
    tight: figureViewBounds(result),
    steps: timeline.steps,
    segs: playerSegs(timeline),
    itemIds: scene.items.map((it) => it.id),
    cardCounts: scene.items.map((it) => it.content?.layouts.length ?? 0),
    groupIds: scene.groups.map((g) => g.id),
    edgePanels: scene.edges.map((e) => e.panel ?? 0),
    trackPanels,
    panels: panels.map(({ index, view, strategy, box }) => ({ index, view, strategy, box })),
    width: scene.width,
    height: scene.height,
    marks: timeline.marks ?? {},
    pulses: timeline.pulses ?? [],
    presentation: timeline.presentation ?? [],
    charts: timeline.charts ?? {},
    chartFrames: scene.chartFrames ?? {},
    chartMeta: chartMeta(figure, drawn),
    ...(timeline.tracks ? { trackCount: timeline.tracks.length } : {}),
    ...(timeline.values ? { values: timeline.values.map(({ si, periods }) => ({ si, periods })) } : {}),
    metrics: timeline.tracks || timeline.values || timeline.segs.some((seg) => seg.hops.some((hop) => hop.tone)) ? { ...PLAYER_METRICS, ...FLOW_METRICS } : PLAYER_METRICS,
  };
  const dotAts = [...new Set([...drawn.values()].flatMap((chart) => chart.dotAts ?? []))].sort((a, b) => a - b);
  return { panels, width: scene.width, height: scene.height, data, dotAts, hasCharts: drawn.size > 0, charts: [...drawn.values()] };
}

// 값에 묶인 차트의 그림에 갱신 효과 겹침(chart/pulse-overlay.js)을 넣은 장면. 겹침은 불투명도 0으로 있다가 재생기가 표식이 바뀐 때만 켠다.
function withOverlays(scene) {
  const overlaid = (id, chart) => (scene.chartFrames?.[id] ? { ...chart, body: withPulseOverlays(chart.body) } : chart);
  return mapSceneCharts(scene, overlaid);
}

// 차트 카드마다 계열 id 목록(계열 번호 = class `cs-번호`)과 행 이름 목록(행 번호 = class `cr-번호`). 계열이 없는 차트는 차트 전체가 계열 하나다(timeline-charts.js와 같은 규칙).
function chartMeta(figure, drawn) {
  return Object.fromEntries(chartCards(figure).map((card) => [card.id, { series: card.plot.chart.series.length ? card.plot.chart.series.map((s) => s.id) : [WHOLE_CHART], rowKeys: drawn.get(card.id)?.rowKeys ?? [] }]));
}

// 재생기가 읽는 구간 목록. 도형 id는 논리 id 그대로이고, 상태 알약은 `논리 id-종류` 글로 넘긴다. 켜 둔 도형, 부분, 차트 행(`light`)은 구간이 그 장면에서 지금까지 켠 목록(nodesOn, partsOn, charts[id].lights)으로 갖고, 조용한 선이 보이는 구간은 시간표의 marks가 갖는다.
function playerSegs(timeline) {
  return timeline.segs.map((seg) => ({
    si: seg.si,
    t0: seg.t0,
    t1: seg.t1,
    hops: seg.hops,
    cards: seg.cards,
    cardsBefore: seg.cardsBefore,
    cardsAt: seg.cardsAt,
    nodesOn: seg.nodesOn,
    partsOn: seg.partsOn,
    charts: seg.charts ?? {},
    ...(seg.status ? { status: seg.status.map(({ node, kind }) => `${node}-${kind}`) } : {}),
    ...(seg.pulses ? { pulses: seg.pulses.map(({ id, at }) => ({ id, at })) } : {}),
  }));
}

// ---- 판 나누기 ----

// cost: time O(n), heap O(n), stack O(1)
// vars: n = SVG 글자 수
// basis: estimate
/**
 * 글 한 덩어리의 가장 바깥 요소들. 요소 사이에는 공백만 있어야 한다(그리기가 요소를 줄바꿈으로 이어 붙인다).
 * @returns 요소 글의 목록
 */
function topLevel(markup) {
  const tokens = tokenize(markup);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'text' && t.text.trim() === '') continue;
    if (t.type === 'open' && t.close !== undefined) {
      out.push(markup.slice(t.start, tokens[t.close].end));
      i = t.close;
    } else if (t.type === 'self') out.push(markup.slice(t.start, t.end));
    else throw new Error(`판을 나눌 수 없는 SVG 조각이다(${t.type === 'text' ? '요소 밖 글' : `짝이 없는 <${t.tag}>`}): ${markup.slice(t.start, t.start + 60)}`);
  }
  return out;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = SVG 글자 수
// basis: estimate
// 감싼 요소 하나의 자식 요소들 `{ open, children, close }`. 빈 글이면 없다.
function wrapperOf(markup) {
  if (!markup) return undefined;
  const tokens = tokenize(markup);
  const root = tokens[0];
  const inner = markup.slice(root.end, tokens[root.close].start);
  return { open: markup.slice(root.start, root.end), children: topLevel(inner), close: markup.slice(tokens[root.close].start, tokens[root.close].end) };
}

// 요소 글에서 가장 먼저 나오는 세로 좌표. 판은 위에서 아래로 쌓이므로 이 좌표가 어느 판 상자 안인지가 요소의 판이다.
const FIRST_Y = /transform="translate\(\s*[-\d.e]+[\s,]+([-\d.e]+)\s*\)"|\sy1?="([-\d.e]+)"|\scy="([-\d.e]+)"|\sd="M\s*[-\d.e]+[\s,]+([-\d.e]+)/;

// cost: time O(len + p), heap O(1), stack O(1)
// vars: len = 요소 글자 수, p = 판 수
// basis: estimate
/**
 * 요소가 속한 판 번호. 번호가 붙은 요소(도형 n-, 그룹 g-, 선 e-, 선 알약 l-)는 장면이 적은 판이고, 보기 이름(data-view)을 단 요소는 그 보기의 판이다.
 * 나머지(생명선, 메모, 값 글자, 상태 알약, 흐름 길)는 첫 세로 좌표가 든 판 상자다.
 */
function panelOf(element, scene) {
  const id = /^<\w+[^>]*?\sid="([a-z]+)-(\d+)"/.exec(element);
  const owners = { n: scene.items, g: scene.groups, e: scene.edges, l: scene.edges };
  if (id && owners[id[1]]?.[id[2]]) return owners[id[1]][id[2]].panel ?? 0;
  const view = /^<\w+[^>]*?\sdata-view="([^"]*)"/.exec(element);
  if (view) {
    const found = scene.panels.findIndex((p) => p.view === view[1]);
    if (found >= 0) return found;
  }
  const y = Number(FIRST_Y.exec(element)?.slice(1).find((v) => v !== undefined));
  if (!Number.isFinite(y)) return 0;
  const found = scene.panels.findIndex(({ box }) => y >= box.y && y < box.y + box.h);
  return found >= 0 ? found : y < 0 ? 0 : scene.panels.length - 1;
}

// cost: time O(n + m·p), heap O(n), stack O(1)
// vars: n = SVG 글자 수, m = 가장 바깥 요소 수, p = 판 수
// basis: estimate
/**
 * 그려진 층(도형, 흐름 길, 값 글자, 점 층, 선 알약, 상태 알약)을 판마다 나눈다. 같은 번호 규칙(#n-번호)을 쓰므로 판을 나눠도 번호는 바뀌지 않는다.
 * 점 층(.fl-packets)은 판마다 하나이고 재생기가 점을 그 선이 있는 판의 층에 놓는다.
 * @returns { panels, trackPanels }. panels[i]는 장면 판 정보에 svg(내용)를 더한 것이고, trackPanels[k]는 흐름 길 k가 있는 판 번호다.
 */
function splitPanels(scene, parts) {
  const layers = scene.panels.map(() => ({ body: [], tracks: [], values: [], status: [], pills: [] }));
  for (const element of topLevel(parts.body)) layers[panelOf(element, scene)].body.push(element);
  for (const element of topLevel(parts.values)) layers[panelOf(element, scene)].values.push(element);
  const trackPanels = [];
  for (const element of wrapperOf(parts.tracks)?.children ?? []) {
    const panel = panelOf(element, scene);
    trackPanels[Number(/id="tp-(\d+)"/.exec(element)[1])] = panel;
    layers[panel].tracks.push(element);
  }
  const status = wrapperOf(parts.status);
  for (const element of status?.children ?? []) layers[panelOf(element, scene)].status.push(element);
  const pills = wrapperOf(parts.pills);
  for (const element of pills?.children ?? []) layers[panelOf(element, scene)].pills.push(element);
  const panels = scene.panels.map((panel, i) => {
    const layer = layers[i];
    const defs = layer.tracks.length ? `<defs>${layer.tracks.join('')}</defs>` : '';
    const wrap = (wrapper, list) => (list.length ? `${wrapper.open}${list.join('')}${wrapper.close}` : '');
    const svg = `${layer.body.join('\n')}${defs}${layer.values.join('\n')}<g class="fl-packets"></g>${wrap(pills, layer.pills)}${wrap(status, layer.status)}`;
    return { ...panel, svg };
  });
  return { panels, trackPanels };
}
