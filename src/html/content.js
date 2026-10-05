// 재생기에 넘길 그림 내용: SVG 본문과 재생 데이터. 도형, 그룹, 계열은 번호로 바꿔 넘긴다.
import { CHART_FACES, chartText } from '../chart/draw.js';
import { drawScene } from '../draw/figure.js';
import { drawStatusPills } from '../draw/status.js';
import { drawTrackPaths } from '../draw/tracks.js';
import { drawValues } from '../draw/values.js';
import { STYLE } from '../measure/sizes.js';
import { curveOf } from '../easing.js';
import { chartSeriesIds, litIds } from '../timeline.js';
import { tokens, values } from '../tokens.js';

// 재생기가 점과 글 상자, 아이콘을 그릴 때 쓰는 값. 브라우저 코드는 tokens.js를 불러올 수 없어 데이터로 넘긴다.
const PLAYER_METRICS = Object.freeze({
  active: tokens.color.state.active,
  chipFill: tokens.color.state['active-fill'],
  halo: values.size.packet.halo,
  haloOpacity: values.opacity.halo,
  packet: values.size.packet.radius,
  chipRadius: values.radius.lg,
  pulseMs: values.duration.pulse,
  chipLine: STYLE.chip.line,
  chipPadX: values.space['9'],
  chipPadY: values.space['4'],
  chipGap: values.space['6'],
  icon: values.size.control.icon,
  iconStroke: values.size.control['icon-stroke'],
  zoomMax: values.scale['zoom-max'],
  zoomStep: values.scale['zoom-step'],
  move: curveOf('move'),
});

// 갈래색(tone)이나 값 줄을 쓰는 그림에만 더하는 재생기 값. 쓰지 않는 그림의 재생기 파일은 그대로다.
const FLOW_METRICS = Object.freeze({ tones: tokens.color.flow, chipStroke: values.border.edge, cutFadeMs: values.duration['cut-fade'] });

// cost: time O(s + e + b·(e + k)), heap O(b·(e + k)), stack O(1)
// vars: s = 도형 수, e = 선 수, b = 박자 수, k = 카드 있는 도형 수
// basis: estimate
// 구조, 상태, 데이터, 순서 그림. 시간표의 id를 도형, 그룹 번호로 바꿔 넘긴다. 흐름 단계(edgesAt가 있는 구간)는 값 카드가 있어도 도형을 켜 두지 않고 점이 닿는 순간의 후광(pulses)만 알린다.
export function figureContent(result, glyphs) {
  const { scene, timeline } = result;
  const itemIndex = new Map(scene.items.map((it, i) => [it.id, i]));
  const groupIndex = new Map(scene.groups.map((g, i) => [g.id, i]));
  const segs = playerSegs(timeline, { scene, itemIndex, groupIndex });
  const data = {
    ...flowData(timeline),
    segs,
    steps: timeline.steps,
    cardCounts: scene.items.map((it) => it.card?.layouts.length ?? 0),
    edgeEnds: scene.edges.map((e) => [itemIndex.get(e.from.split('.')[0]) ?? -1, itemIndex.get(e.to.split('.')[0]) ?? -1]),
    seriesCount: 0,
    rowCount: 0,
    metrics: timeline.tracks || timeline.values || timeline.segs.some((seg) => seg.hops.some((hop) => hop.tone)) ? { ...PLAYER_METRICS, ...FLOW_METRICS } : PLAYER_METRICS,
  };
  const { body: figure, pills } = drawScene(scene, () => '', glyphs);
  const body = figure + drawTrackPaths(timeline) + drawValues(scene, timeline, { glyphs, windows: () => '' });
  // 상태 알약은 점 층 위에 선 라벨 알약과 같은 층에 둔다. 켜고 끄는 것은 재생기가 구간의 status로 한다.
  const status = drawStatusPills(scene, timeline, { glyphs, windows: () => '', index: itemIndex });
  return { svg: body, pills: pills + status, width: scene.width, height: scene.height, data };
}

// cost: time O(b·(e + k)), heap O(b·(e + k)), stack O(1)
// vars: b = 박자 수, e = 선 수, k = 카드 있는 도형 수
// basis: estimate
// 재생기가 읽는 구간 목록. 도형, 그룹 id는 번호로 바꾸고, 상태 알약은 `도형 번호-종류` 글로 넘긴다.
function playerSegs(timeline, { scene, itemIndex, groupIndex }) {
  const toIndex = (map, obj) => Object.fromEntries(Object.entries(obj).map(([id, v]) => [map.get(id), v]));
  return timeline.segs.map((seg) => {
    const lit = litIds(seg, scene.edges);
    return {
      si: seg.si,
      t0: seg.t0,
      t1: seg.t1,
      hops: seg.hops,
      edgesOn: seg.edgesOn,
      nodesOn: seg.pulses ? [] : [...lit].filter((id) => itemIndex.has(id)).map((id) => itemIndex.get(id)),
      groupsOn: seg.pulses ? [] : [...lit].filter((id) => groupIndex.has(id)).map((id) => groupIndex.get(id)),
      partsOn: seg.partsOn,
      cards: toIndex(itemIndex, seg.cards),
      cardsBefore: toIndex(itemIndex, seg.cardsBefore),
      cardsAt: toIndex(itemIndex, seg.cardsAt),
      caption: seg.caption,
      series: [],
      growing: [],
      lights: [],
      ...(seg.status ? { status: seg.status.map(({ node, kind }) => `${itemIndex.get(node)}-${kind}`) } : {}),
      ...timedLights(seg, { itemIndex, groupIndex }),
    };
  });
}

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 처음 닿는 선과 도형 수
// basis: estimate
// 흐름 구간이 처음 닿을 때 켜지는 선, 도형, 그룹과 그 시각(구간 안 ms). 도형과 그룹은 번호로 바꿔 넘긴다. 박자 구간은 대기가 풀린 뒤 출발한 이동이 처음 켜는 것만 갖고, 없으면 빈 객체다.
function timedLights(seg, { itemIndex, groupIndex }) {
  if (!seg.edgesAt) return {};
  const pick = (map) => Object.fromEntries(Object.entries(seg.nodesAt).filter(([id]) => map.has(id)).map(([id, at]) => [map.get(id), at]));
  const pulses = seg.pulses?.filter(({ id }) => itemIndex.has(id)).map(({ id, at }) => ({ n: itemIndex.get(id), at })).sort((a, b) => a.at - b.at);
  return { edgesAt: seg.edgesAt, nodesAt: pick(itemIndex), groupsAt: pick(groupIndex), ...(pulses ? { pulses } : {}) };
}

// cost: time O(r·c), heap O(r·c), stack O(1)
// vars: r = 값 줄 수, c = 값이 바뀌는 횟수
// basis: estimate
// 흐름이 지나는 길의 수와 값 줄의 변화 목록. 값 줄 글자 요소는 그림 안에 있고, 재생기는 이 목록으로 보일 글자를 고른다.
function flowData(timeline) {
  const { tracks, values: rows } = timeline;
  return { ...(tracks ? { trackCount: tracks.length } : {}), ...(rows ? { values: rows.map(({ si, periods, flashes }) => ({ si, periods, flashes })) } : {}) };
}

// cost: time O(b·(s + l) + c), heap O(b·(s + l)), stack O(1)
// vars: b = 박자 수, s = 계열 수, l = 밝히기 수, c = 차트 글자 수
// basis: estimate
// 차트. 계열은 번호로, light는 행 번호로 바꿔 넘긴다.
export function chartContent(result, glyphs) {
  const { figure, chart, timeline } = result;
  for (const face of CHART_FACES) glyphs.add(chartText(figure), face);
  const ids = chartSeriesIds(figure);
  const segs = timeline.segs.map((seg) => ({
    si: seg.si,
    t0: seg.t0,
    t1: seg.t1,
    hops: [],
    edgesOn: [],
    nodesOn: [],
    groupsOn: [],
    partsOn: [],
    cards: {},
    cardsBefore: {},
    cardsAt: {},
    caption: seg.caption,
    labelShifts: seg.labelShifts,
    series: seg.series.map((id) => ids.indexOf(id)),
    growing: seg.growing.map((id) => ids.indexOf(id)),
    lights: seg.lights.map((key) => chart.rowKeys.indexOf(key)),
  }));
  const data = { segs, steps: timeline.steps, cardCounts: [], edgeEnds: [], seriesCount: ids.length, rowCount: chart.rowKeys.length, metrics: PLAYER_METRICS };
  // 재생기 안에서는 그림 바탕 사각형을 그리지 않는다. 카드가 유일한 틀이고, 회색 판은 문서에 넣는 SVG 파일에만 있다.
  return { svg: chart.body, width: chart.width, height: chart.height, data };
}
