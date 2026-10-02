// 재생기에 넘길 그림 내용: SVG 본문과 재생 데이터. 도형, 그룹, 계열은 번호로 바꿔 넘긴다.
import { CHART_FACES, chartText } from '../chart/draw.js';
import { drawScene } from '../draw/figure.js';
import { curveOf } from '../easing.js';
import { chartSeriesIds, litIds } from '../timeline.js';
import { tokens, values } from '../tokens.js';

// 재생기가 점과 글 상자, 아이콘을 그릴 때 쓰는 값. 브라우저 코드는 tokens.js를 불러올 수 없어 데이터로 넘긴다.
const PLAYER_METRICS = Object.freeze({
  active: tokens.color.state.active,
  chipFill: tokens.color.state['active-fill'],
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

// cost: time O(s + e + b·(e + k)), heap O(b·(e + k)), stack O(1)
// vars: s = 도형 수, e = 선 수, b = 박자 수, k = 카드 있는 도형 수
// basis: estimate
// 구조, 상태, 데이터, 순서 그림. 시간표의 id를 도형, 그룹 번호로 바꿔 넘긴다.
export function figureContent(result, glyphs) {
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
    columnsOn: [],
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
