// 카드 안 관계 그래프의 배치. 이름을 관계 깊이별 열에 놓고, 열을 건너뛰는 관계는 위로 휘게 자리를 비운다.
import { depthsOf } from '../source/minigraph.js';
import { values } from '../vendor/theme/tokens.js';
import { measure } from './fonts.js';
import { STYLE } from './texts.js';

const SPACE = values.spacing;
const NODE_H = values.spacing.figure.pill.height;
const ROW_GAP = SPACE["1-5"];

// 이름 알약 하나의 폭: 글 폭에 좌우 안쪽을 더한다. 열 폭과 알약을 그리는 폭이 같다.
const pillWidth = (name) => measure(name, STYLE.mini.size, STYLE.mini.face) + SPACE["5-5"];

// cost: time O(n·e + n²), heap O(n), stack O(1)
// vars: n = 이름 수, e = 관계 수
// basis: estimate
// 이름의 깊이와 깊이별 열의 필요 폭. 열마다 가장 넓은 알약에 열 사이 간격(이어 주는 선이 읽히도록 `space.4`)을 더한다.
function columnsOf(graph) {
  const depth = depthsOf(graph.nodes, graph.edges);
  const need = Array.from({ length: Math.max(...depth) + 1 }, () => 0);
  graph.nodes.forEach((name, i) => {
    need[depth[i]] = Math.max(need[depth[i]], pillWidth(name) + SPACE["2"]);
  });
  return { depth, need };
}

// cost: time O(n·e + n²), heap O(n), stack O(1)
// vars: n = 이름 수, e = 관계 수
// basis: estimate
/** 이름을 줄이거나 자르지 않고 깊이별 열에 놓는 데 필요한 그래프 폭. 카드는 이 폭 이상이어야 한다(measure/content.js). */
export const miniGraphWidth = (graph) => columnsOf(graph).need.reduce((sum, width) => sum + width, 0);

// cost: time O(n·e + n² + n·m), heap O(n), stack O(1)
// vars: n = 이름 수, e = 관계 수, m = 이름 글자 수
// basis: estimate
/**
 * 너비 width(miniGraphWidth 이상) 안에 이름을 깊이별 열로 놓는다. 남는 폭은 열마다 똑같이 나눠 갖는다. 좌표는 그래프 왼쪽 위 기준이다.
 * @returns { height, nodes: { name, x, y, w, h, isLit }[], edges: { from, to, isLit, isSkip }[] }
 */
export function layoutMiniGraph(graph, width) {
  const { depth, need } = columnsOf(graph);
  const slack = (width - need.reduce((sum, w) => sum + w, 0)) / need.length;
  const starts = need.map((_, d) => need.slice(0, d).reduce((sum, w) => sum + w + slack, 0));
  const counts = depth.map((d) => depth.filter((x) => x === d).length);
  const tallest = Math.max(...counts);
  const hasSkip = graph.edges.some(([a, b]) => Math.abs(depth[b] - depth[a]) > 1);
  const arc = hasSkip ? NODE_H : 0;
  const bodyH = tallest * NODE_H + (tallest - 1) * ROW_GAP;
  const nodes = graph.nodes.map((name, i) => {
    const d = depth[i];
    const w = pillWidth(name);
    const columnH = counts[i] * NODE_H + (counts[i] - 1) * ROW_GAP;
    const order = depth.slice(0, i).filter((x) => x === d).length;
    return { name, x: starts[d] + (need[d] + slack - w) / 2, y: arc + (bodyH - columnH) / 2 + order * (NODE_H + ROW_GAP), w, h: NODE_H, isLit: graph.lit.includes(name) };
  });
  const edges = graph.edges.map(([a, b]) => ({ from: nodes[a], to: nodes[b], isLit: nodes[a].isLit && nodes[b].isLit, isSkip: Math.abs(depth[b] - depth[a]) > 1 }));
  return { height: arc + bodyH, nodes, edges };
}
