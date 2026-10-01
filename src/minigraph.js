// 카드 안의 작은 관계 그래프. `show 도형 graph 가 -> 나, 가 -> 다 ; 가`처럼 적는다.
// 이름은 왼쪽에서 오른쪽으로 깊이별 열에 놓고, `;` 뒤에 적은 이름을 밝힌다.
import { centerBaseline, escapeXml, measureText, roundCoord } from './text.js';
import { tokens, values } from './tokens.js';

const SPACE = values.space;
const NODE_TEXT = values.size.text['10-5'];
const NODE_H = values.size.pill;
const ROW_GAP = SPACE['3'];

// cost: time O(n·e), heap O(n + e), stack O(1)
// vars: n = 이름 수, e = 관계 수
// basis: estimate
/**
 * `가 -> 나, 가 -> 다 ; 가, 나`를 읽는다. `;` 뒤는 밝힐 이름이다.
 * @returns { nodes: string[], edges: [number, number][], lit: string[] }
 * @throws Error 관계에 이름이 빠졌거나, 이름이 하나도 없거나, 관계가 돌아 제자리로 올 때
 */
export function parseMiniGraph(text) {
  const [body, litText = ''] = text.split(';');
  const nodes = [];
  // cost: time O(n), heap O(1), stack O(1)
  // vars: n = 이름 수
  // basis: estimate
  const indexOf = (name) => {
    if (!nodes.includes(name)) nodes.push(name);
    return nodes.indexOf(name);
  };
  const edges = [];
  for (const part of body.split(',').map((p) => p.trim()).filter(Boolean)) {
    const names = part.split('->').map((n) => n.trim());
    if (names.some((n) => !n)) throw new Error(`graph 관계에 이름이 빠졌다: ${part}`);
    names.forEach(indexOf);
    for (let k = 1; k < names.length; k++) edges.push([indexOf(names[k - 1]), indexOf(names[k])]);
  }
  if (!nodes.length) throw new Error('graph에 이름이 없다');
  if (!depthsOf(nodes, edges)) throw new Error('graph 관계가 돌아 제자리로 온다. 열로 놓을 수 없다');
  const lit = litText.split(',').map((n) => n.trim()).filter(Boolean);
  return { nodes, edges, lit };
}

// cost: time O(n·e), heap O(n), stack O(1)
// vars: n = 이름 수, e = 관계 수
// basis: estimate
// 이름마다 가장 긴 앞선 관계 수(깊이). n번 넘게 늘어나면 관계가 돌고 있어 undefined다.
function depthsOf(nodes, edges) {
  const depth = nodes.map(() => 0);
  for (let round = 0; round <= nodes.length; round++) {
    let isChanged = false;
    for (const [a, b] of edges) {
      if (depth[b] < depth[a] + 1) {
        depth[b] = depth[a] + 1;
        isChanged = true;
      }
    }
    if (!isChanged) return depth;
  }
  return undefined;
}

// cost: time O(n·e + n² + n·m), heap O(n), stack O(1)
// vars: n = 이름 수, e = 관계 수, m = 이름 글자 수
// basis: estimate
/**
 * 너비 width 안에 이름을 깊이별 열로 놓는다. 좌표는 그래프 왼쪽 위 기준이다. graph는 parseMiniGraph가 검사한 것이다.
 * @returns { height, nodes: { name, x, y, w, h, isLit }[], edges: { from, to, isLit, isSkip }[] }
 *   isSkip은 열을 건너뛰는 관계다. 가운데 이름을 가리지 않게 위로 휘어 그리고, 그 자리만큼 위를 비운다.
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
  const height = arc + bodyH;
  const nodes = graph.nodes.map((name, i) => {
    const d = depth[i];
    const w = Math.min(columnW - SPACE['2'], measureText(name, NODE_TEXT) + SPACE['11']);
    const columnH = counts[i] * NODE_H + (counts[i] - 1) * ROW_GAP;
    const order = depth.slice(0, i).filter((x) => x === d).length;
    return {
      name,
      x: columnW * d + (columnW - w) / 2,
      y: arc + (bodyH - columnH) / 2 + order * (NODE_H + ROW_GAP),
      w,
      h: NODE_H,
      isLit: graph.lit.includes(name),
    };
  });
  const edges = graph.edges.map(([a, b]) => ({ from: nodes[a], to: nodes[b], isLit: nodes[a].isLit && nodes[b].isLit, isSkip: Math.abs(depth[b] - depth[a]) > 1 }));
  return { height, nodes, edges };
}

// cost: time O(n + e), heap O(out), stack O(1)
// vars: n = 이름 수, e = 관계 수, out = 만든 SVG 글자 수
// basis: estimate
/** layoutMiniGraph 결과를 (x, y)에 그린다. 밝힌 이름과, 밝힌 두 이름 사이 선은 강조 색이다. */
export function drawMiniGraph(laid, x, y) {
  const r = roundCoord;
  const lines = laid.edges.map(({ from, to, isLit, isSkip }) => {
    const stroke = isLit ? tokens.color.accent : tokens.color.border;
    if (isSkip) {
      // 두 이름의 위 가운데를 잇고, 꼭대기가 그래프 맨 위(y)에 닿게 조절점을 둔다.
      const [x1, x2] = [from.x + from.w / 2, to.x + to.w / 2];
      const top = Math.min(from.y, to.y);
      return `<path d="M ${r(x + x1)} ${r(y + from.y)} Q ${r(x + (x1 + x2) / 2)} ${r(y - top)} ${r(x + x2)} ${r(y + to.y)}" fill="none" stroke="${stroke}" stroke-width="${values.border.thin}"/>`;
    }
    const isSameColumn = Math.abs(from.x - to.x) < 1;
    const [x1, y1] = isSameColumn ? [from.x + from.w / 2, from.y + from.h] : [from.x + from.w, from.y + from.h / 2];
    const [x2, y2] = isSameColumn ? [to.x + to.w / 2, to.y] : [to.x, to.y + to.h / 2];
    return `<line x1="${r(x + x1)}" y1="${r(y + y1)}" x2="${r(x + x2)}" y2="${r(y + y2)}" stroke="${stroke}" stroke-width="${values.border.thin}"/>`;
  });
  const pills = laid.nodes.map((n) => {
    const fill = n.isLit ? tokens.color.accent : tokens.color.bg;
    const stroke = n.isLit ? tokens.color.accent : tokens.color.border;
    return (
      `<rect x="${r(x + n.x)}" y="${r(y + n.y)}" width="${r(n.w)}" height="${n.h}" rx="${n.h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${values.border.thin}"/>` +
      `<text x="${r(x + n.x + n.w / 2)}" y="${r(centerBaseline(y + n.y + n.h / 2, NODE_TEXT))}" class="mini${n.isLit ? ' on' : ''}">${escapeXml(n.name)}</text>`
    );
  });
  return lines.join('') + pills.join('');
}
