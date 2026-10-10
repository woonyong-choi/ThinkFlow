// 독립 판, 차트 카드, 카드 본문이 같은 차트 그림과 프레임을 쓴다.

const bodyCharts = (item) => item.content?.layouts.flatMap((layout) => layout.rows.filter((row) => row.chart)) ?? [];
const placements = (scene) => [...scene.plots, ...scene.items.filter((item) => item.chart), ...scene.items.flatMap(bodyCharts)];

export function sceneCharts(scene) {
  return new Map(placements(scene).map(({ id, chart }) => [id, chart]));
}

// 결과 장면을 바꾸지 않아 정지·움직이는 출력과 다른 장면 내보내기가 서로 영향을 주지 않는다.
export function mapSceneCharts(scene, transform) {
  const copy = {
    ...scene,
    plots: scene.plots.map((plot) => ({ ...plot })),
    items: scene.items.map((item) => ({
      ...item,
      ...(item.content ? { content: {
        ...item.content,
        layouts: item.content.layouts.map((layout) => ({ ...layout, rows: layout.rows.map((row) => ({ ...row })) })),
      } } : {}),
    })),
  };
  for (const place of placements(copy)) place.chart = transform(place.id, place.chart);
  return copy;
}
