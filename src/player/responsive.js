// 브라우저에서는 이미 검사한 두 배치의 판 묶음만 교체한다. 시계, 선택 단계, 탭은 같은 객체를 유지하고, 교체한 그림은 지금 시계의 모습(마지막 모습 포함)으로 다시 그린다.
// 두 배치의 시각은 같다(reflow-timeline.js). 장면 모델은 점이 지나는 선 구간이 배치마다 달라서 새 데이터로 다시 만든다.
// 좁은 배치는 그래프·차트·시간 보기가 있는 그림에 들어갈 수 있다(html/responsive.js). 판이 여럿인 그림은 모든 판이 같은 비율로 줄어 구역 안에 들어온다.

/**
 * 좁은 배치가 있으면 배치를 고르는 함수 (isNarrow) → 그 배치의 재생 데이터를 돌려준다. 좁은 배치가 없으면 undefined다.
 * 같은 배치를 다시 고르면 아무것도 바꾸지 않는다.
 */
function bindResponsiveScene(root, player) {
  const template = root.querySelector('template.fl-narrow');
  if (!template) return;
  const panels = root.querySelector('.dp-panels');
  const layoutOf = (container, data) => ({ data, nodes: [...container.childNodes], style: container.getAttribute('style') });
  const wide = layoutOf(panels.cloneNode(true), player.data);
  const narrow = layoutOf(template.content.querySelector('.dp-panels'), player.data.responsive.data);
  let current = wide;
  return (isNarrow) => {
    const next = isNarrow ? narrow : wide;
    if (next === current) return next.data;
    const focused = panels.contains(document.activeElement) ? document.activeElement.id : undefined;
    for (const animation of panels.getAnimations({ subtree: true })) animation.cancel();
    panels.replaceChildren(...next.nodes.map((node) => node.cloneNode(true)));
    panels.setAttribute('style', next.style);
    panels.dataset.layout = isNarrow ? 'narrow' : 'wide';
    player.data = next.data;
    player.scenes = player.data.segs.length ? buildScenes(player.data) : [];
    player.stage = createStage(root, next.data);
    if (document.documentElement.classList.contains('embedded')) fitEmbedded(root, next.data);
    // 시계는 그대로이고 새 그림에 지금 시각의 모습을 그린다. 절대 시각과 마지막 모습 여부가 보존된다.
    if (player.scene >= 0) renderScene(player);
    if (focused) panels.querySelector(`#${CSS.escape(focused)}`)?.focus({ preventScroll: true });
    current = next;
    return next.data;
  };
}
