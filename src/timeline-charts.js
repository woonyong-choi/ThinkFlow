// 차트 카드의 움직임 상태. 박자마다 차트 카드별로 보이는 계열, 자라는 계열, 밝힌 대상을 적는다. 차트 카드는 어느 보기에 그려지든 같은 움직임을 받는다.

/** 계열이 없는 차트(상자, 히트맵, 계열 없는 산점도)가 통째로 자랄 때 쓰는 계열 id */
export const WHOLE_CHART = '*';

// cost: time O(c + r), heap O(c + r), stack O(1)
// vars: c = 차트 카드 수, r = reveal 수
// basis: estimate
/**
 * 시간표가 차트 카드마다 알아야 하는 것. 시간표가 다루는 계열 id(계열이 없으면 차트 전체 하나), reveal을 한 번이라도 쓰는지, 장면마다 reveal에 나온 계열이다.
 * @returns Map<차트 카드 id, { seriesIds, hasReveal, sceneReveals: Map<장면 번호, 계열 id[]> }>
 */
export function createChartRun(figure) {
  const charts = new Map();
  for (const card of figure.nodes.filter((n) => n.shape === 'chart' && !n.isRejected)) {
    const { plot } = card;
    const sceneReveals = new Map();
    for (const { series, si } of plot.motion?.reveals ?? []) sceneReveals.set(si, [...(sceneReveals.get(si) ?? []), series ?? WHOLE_CHART]);
    charts.set(card.id, { seriesIds: plot.chart.series.length ? plot.chart.series.map((s) => s.id) : [WHOLE_CHART], hasReveal: Boolean(plot.motion?.reveals.length), sceneReveals });
  }
  return charts;
}

// cost: time O(c·(s + l)), heap O(c·(s + l)), stack O(1)
// vars: c = 차트 카드 수, s = 계열 수, l = 밝힌 대상 수
// basis: estimate
/**
 * 박자 하나의 차트 상태를 차트 카드마다 정한다. memory.charts는 장면 안에서 쌓이는 밝히기다.
 * - series: 보이는 계열. 장면의 reveal에 나온 계열은 장면이 시작할 때 숨고 reveal 박자부터 보이며, 나오지 않은 계열은 처음부터 보인다.
 * - growing: 이 박자에 자라는 계열. reveal을 쓰는 차트는 이 박자의 reveal이고, 쓰지 않는 차트는 첫 장면의 첫 박자에 모든 계열이다.
 * - lights: 이 장면에서 지금까지 밝힌 행(x=값 또는 행 이름을 \u0000으로 이은 글)
 */
export function chartSegState(run, memory, { si, bi, beat }) {
  const out = {};
  for (const [id, chart] of run.charts) {
    const state = memory.charts.get(id) ?? { revealed: [], lights: [] };
    memory.charts.set(id, state);
    const mine = (beat?.reveal ?? []).filter((r) => r.chart === id).map((r) => r.series ?? WHOLE_CHART);
    state.revealed.push(...mine);
    state.lights.push(...(beat?.chartLight ?? []).filter((l) => l.chart === id).map((l) => (l.x !== undefined ? `x=${l.x}` : l.names.join('\u0000'))));
    const hidden = chart.sceneReveals.get(si) ?? [];
    out[id] = {
      series: chart.seriesIds.filter((s) => !hidden.includes(s) || state.revealed.includes(s)),
      growing: chart.hasReveal ? mine : bi === 0 && si === 0 ? chart.seriesIds : [],
      lights: [...state.lights],
    };
  }
  return out;
}
