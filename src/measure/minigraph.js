// 카드 안 관계 그래프의 배치. 이름을 관계 깊이별 열에 놓고, 열을 건너뛰는 관계는 위로 휘게 자리를 비운다.
import { depthsOf } from '../source/minigraph.js';
import { values } from '../tokens.js';
import { measure } from './fonts.js';

const SPACE = values.space;
const NODE_TEXT = values.size.text['11'];
const NODE_H = values.size.pill.height;
const ROW_GAP = SPACE['3'];

// cost: time O(n·e + n² + n·m), heap O(n), stack O(1)
// vars: n = 이름 수, e = 관계 수, m = 이름 글자 수
// basis: estimate
/**
 * 너비 width 안에 이름을 깊이별 열로 놓는다. 좌표는 그래프 왼쪽 위 기준이다.
 * @returns { height, nodes: { name, x, y, w, h, isLit }[], edges: { from, to, isLit, isSkip }[] }
 */
export function layoutMiniGraph(graph, width) {
  const depth = depthsOf(graph.nodes, graph.edges);
  const columns = Math.max(...depth) + 1;
  const columnW = width / columns;
  const counts = depth.map((d) => depth.filter((x) => x === d).length);
  const tallest = Math.max(...counts);
  const hasSkip = graph.edges.some(([a, b]) => Math.abs(depth[b] - depth[a]) > 1);
  const arc = hasSkip ? NODE_H : 0;
  const bodyH = tallest * NODE_H + (tallest - 1) * ROW_GAP;
  const nodes = graph.nodes.map((name, i) => {
    const d = depth[i];
    const w = Math.min(columnW - SPACE['2'], measure(name, NODE_TEXT) + SPACE['11']);
    const columnH = counts[i] * NODE_H + (counts[i] - 1) * ROW_GAP;
    const order = depth.slice(0, i).filter((x) => x === d).length;
    return { name, x: columnW * d + (columnW - w) / 2, y: arc + (bodyH - columnH) / 2 + order * (NODE_H + ROW_GAP), w, h: NODE_H, isLit: graph.lit.includes(name) };
  });
  const edges = graph.edges.map(([a, b]) => ({ from: nodes[a], to: nodes[b], isLit: nodes[a].isLit && nodes[b].isLit, isSkip: Math.abs(depth[b] - depth[a]) > 1 }));
  return { height: arc + bodyH, nodes, edges };
}

export { NODE_TEXT as MINI_TEXT };
