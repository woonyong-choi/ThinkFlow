// 도형에 이은 선 수와 격자 칸에 이은 선 끝. 크기를 정하는 단계가 배치 전에 쓴다(docs/design/layout.md 도형 크기와 연결점).

// cost: time O(e), heap O(k), stack O(1)
// vars: e = 선 수, k = 격자 칸에 이은 선 끝 수
// basis: estimate
// 도형 하나에 나가고 들어오는 선 수(사람 몸통 높이를 배치 전에 정하는 데 쓴다)와, 격자 칸에 이은 선 끝 목록(칸 통로를 정하는 데 쓴다).
export function countLines(figure, id) {
  const cells = [];
  figure.edges.forEach((e, index) => {
    const isInner = e.from === id && e.to === id;
    if (e.from === id && e.fromCell) cells.push({ index, way: 'out', cell: e.fromCell, isInner });
    if (e.to === id && e.toCell) cells.push({ index, way: 'in', cell: e.toCell, isInner });
  });
  return { out: figure.edges.filter((e) => e.from === id).length, in: figure.edges.filter((e) => e.to === id).length, cells };
}
