// 카드 안 관계 그래프 글 `가 -> 나; 가 -> 다`를 읽는다. 규칙은 docs/design/figure-syntax.md의 카드 절이다.

// cost: time O(n·e + g), heap O(n + e), stack O(1)
// vars: n = 이름 수, e = 관계 수, g = 글자 수
// basis: estimate
/**
 * 관계 그래프 글과 밝힐 이름 글을 읽는다.
 * @returns { nodes: string[], edges: [number, number][], lit: string[] } 또는 { error }
 */
export function parseMiniGraph(text, litText) {
  const nodes = [];
  const edges = [];
  // cost: time O(n), heap O(1), stack O(1)
  // vars: n = 이름 수
  // basis: estimate
  const indexOf = (name) => {
    if (!nodes.includes(name)) nodes.push(name);
    return nodes.indexOf(name);
  };
  for (const part of text.split(';').map((p) => p.trim())) {
    if (!part) return { error: 'a graph has an empty relation. Remove the extra ";"' };
    const names = part.split('->').map((n) => n.trim());
    if (names.length > 2) return { error: `write one relation per "a -> b". Found "${part}"` };
    if (names.some((n) => !n || n.includes(','))) return { error: `a graph name cannot be empty or contain ",". Found "${part}"` };
    const [a, b] = names.map(indexOf);
    if (b !== undefined) edges.push([a, b]);
  }
  if (!depthsOf(nodes, edges)) return { error: 'graph relations loop back. A graph must be drawn in columns' };
  const lit = litText ? litText.split(',').map((n) => n.trim()) : [];
  const unknown = lit.find((n) => !nodes.includes(n));
  if (unknown !== undefined) return { error: `lit name "${unknown}" is not in the graph` };
  return { nodes, edges, lit };
}

// cost: time O(n·e), heap O(n), stack O(1)
// vars: n = 이름 수, e = 관계 수
// basis: estimate
/** 이름마다 앞선 관계의 가장 긴 수(깊이). 관계가 돌면 undefined다. */
export function depthsOf(nodes, edges) {
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
