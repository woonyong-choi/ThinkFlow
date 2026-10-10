// 브라우저에서 돈다(play.js와 한 스크립트로 이어 붙는다).
// 도구 막대(문법 복사, HTML 다운로드, 전체 화면 순서. 앞 둘은 player/export.js)와, 전체 화면에서만 켜지는 확대·축소·끌어 옮기기를 맡는다. 문서 안에서는 그림을 그대로 보인다. 전체 화면은 보는 방식만 바꾸고 장면과 시계에 손대지 않는다.
// 판은 SVG 한 장씩이고, 문서 안에서는 모든 판이 같은 비율로 줄어 구역에 다 들어온다(CSS .dp-panel > svg). 전체 화면의 확대는 판 묶음 폭의 배수이고 옮기기는 그림 영역의 스크롤이다.

/**
 * 그림 틀에 문법 복사, HTML 다운로드, 전체화면 단추와 확대·축소를 붙인다.
 * @param root `.fl-figure` 요소. 안에 `.fl-copy`, `.fl-download`, `.fl-full`, `.fl-zoom` 단추와 `.dp-panels`가 있다
 * @param data { metrics: { zoomMax, zoomStep }, width, height, responsive? }. width, height는 장면 크기다
 * @param swapLayout 좁은 배치로 바꾸는 함수(isNarrow) → 그 배치의 데이터. 좁은 배치가 없는 그림은 undefined
 */
function figureView(root, data, swapLayout) {
  // 보는 상태 한 덩어리. zoom은 전체 화면의 확대 배수(1이면 그림 전체가 보임), drag는 끄는 중인 손짓이다.
  const viewer = { root, canvas: root.querySelector('.fl-canvas'), panels: root.querySelector('.dp-panels'), metrics: data.metrics, data, zoom: 1, drag: undefined, fullButton: root.querySelector('.fl-full') };
  bindResponsiveView(viewer, swapLayout);
  bindExport(root);
  bindFull(viewer);
  bindZoom(viewer);
  bindPan(viewer);
  showFull(viewer, false);
}

// 좁은 배치가 있는 그림은 화면 폭에 맞춰 배치를 고른다.
// 좁은 배치로 바꾸는 기준은 가장 넓은 판의 상자 폭(box.w)이다. 확대 중(전체 화면)에는 하지 않는다.
function bindResponsiveView(viewer, swapLayout) {
  const { root } = viewer;
  // 판정은 처음(넓은) 배치의 판으로 한 번만 정한다. 좁은 배치로 바꾼 뒤의 판 폭으로 다시 정하면 같은 폭에서 두 배치를 오간다.
  const { responsive } = viewer.data;
  const widest = Math.max(...viewer.data.panels.map((panel) => panel.box.w));
  viewer.fit = () => {
    if (root.classList.contains('full')) return;
    const isNarrow = Boolean(swapLayout && responsive && root.clientWidth < responsive.breakpoint && root.clientWidth < widest);
    if (swapLayout) viewer.data = { ...viewer.data, ...swapLayout(isNarrow) };
  };
  addEventListener('resize', viewer.fit);
}

function bindFull(viewer) {
  const { root, fullButton } = viewer;
  fullButton.addEventListener('click', () => setFull(viewer, !root.classList.contains('full')));
  document.addEventListener('fullscreenchange', () => showFull(viewer, document.fullscreenElement === root));
  // 창을 덮는 대체 모양은 브라우저가 Escape를 처리하지 않으므로 직접 닫는다. 재생에는 영향이 없다.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('full') && !document.fullscreenElement) setFull(viewer, false);
  });
  addEventListener('resize', () => root.classList.contains('full') && layoutFull(viewer));
  addEventListener('message', event => {
    if (event.source === parent && event.data?.figureExitFullscreen === true) setFull(viewer, false);
  });
}

function bindZoom(viewer) {
  const { root, metrics } = viewer;
  root.querySelectorAll('.fl-zoom button').forEach((b) => {
    b.addEventListener('click', () => (b.dataset.zoom === 'fit' ? zoomAt(viewer, 1 / viewer.zoom) : zoomAt(viewer, b.dataset.zoom === 'in' ? metrics.zoomStep : 1 / metrics.zoomStep)));
  });
}

function bindPan(viewer) {
  const { canvas } = viewer;
  canvas.addEventListener('wheel', (e) => onWheel(viewer, e), { passive: false });
  canvas.addEventListener('pointerdown', (e) => onPointerDown(viewer, e));
  canvas.addEventListener('pointermove', (e) => onPointerMove(viewer, e));
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => (viewer.drag = undefined));
}

// 브라우저 전체 화면을 먼저 쓰고, 막혀 있으면(iframe에 allowfullscreen이 없을 때 등) 창을 덮는 모양으로 대신한다.
function setFull(viewer, isFull) {
  const { root } = viewer;
  if (isFull && !root.classList.contains('full')) viewer.returnFocus = document.activeElement;
  const canUseApi = Boolean(root.requestFullscreen) && document.fullscreenEnabled;
  if (!canUseApi) return showFull(viewer, isFull);
  if (isFull) root.requestFullscreen().catch(() => showFull(viewer, true));
  else if (document.fullscreenElement) document.exitFullscreen();
  else showFull(viewer, false);
}

function showFull(viewer, isFull) {
  const { root, fullButton } = viewer;
  const wasFull = root.classList.contains('full');
  if (isFull && !wasFull && !viewer.returnFocus) viewer.returnFocus = document.activeElement;
  root.classList.toggle('full', isFull);
  // 스크롤하는 전체 화면 캔버스만 키보드 초점을 받아 방향키로 옮겨 볼 수 있다. 문서 안 캔버스는 넘치지 않는다.
  if (isFull) viewer.canvas.tabIndex = 0;
  else viewer.canvas.removeAttribute('tabindex');
  if (window.self !== window.top) parent.postMessage({ figureFullscreen: isFull && document.fullscreenElement !== root }, '*');
  fullButton.innerHTML = ToolIcon(isFull ? 'minimize-2' : 'maximize-2');
  const label = isFull ? '전체화면 종료' : '전체화면';
  fullButton.setAttribute('aria-label', label);
  fullButton.title = label;
  viewer.zoom = 1;
  if (isFull) layoutFull(viewer);
  else {
    clearFull(viewer);
    viewer.fit?.();
    if (wasFull) {
      const previous = viewer.returnFocus;
      const target = previous?.isConnected && previous !== document.body && previous !== document.documentElement ? previous : fullButton;
      viewer.returnFocus = undefined;
      target.focus({ preventScroll: true });
    }
  }
}

// 판 묶음의 실제 좌표 크기. 폭은 가장 넓은 판 상자이고, 판은 이 폭에 대한 자기 상자 폭의 비율로 그려져 자기 비율의 높이를 가지므로 묶음 높이는 같은 단위의 판 상자 높이 합이다.
function bundleBox(panels) {
  const boxes = [...panels.querySelectorAll('svg.fl')].map((svg) => svg.viewBox.baseVal);
  return { w: Math.max(...boxes.map((box) => box.width)), h: boxes.reduce((sum, box) => sum + box.height, 0) };
}

// 전체 화면에서 판 묶음의 폭. 그림 전체가 그림 영역에 들어가는 폭(맞춤)에 확대 배수를 곱한다. 그림이 영역보다 넓어지면 영역이 스크롤된다.
// 맞춤은 문서 안의 보기 폭(--view-w, 가장 넓은 판의 폭)과 같은 값이며 판 묶음의 실제 좌표 크기로 잰다. 같은 폭을 판 비율의 분모(--bundle-w)로 써서 판의 상대 크기는 문서 안과 같고 줄어드는 비율은 한 번뿐이다.
function layoutFull(viewer) {
  const { canvas, panels, zoom } = viewer;
  const bundle = bundleBox(panels);
  const fit = Math.min(canvas.clientWidth, (canvas.clientHeight * bundle.w) / bundle.h);
  panels.style.setProperty('--bundle-w', bundle.w);
  panels.style.setProperty('--fit-w', `${fit}px`);
  panels.style.setProperty('--zoom', zoom);
  viewer.root.classList.toggle('zoomed', zoom > 1);
}

function clearFull(viewer) {
  viewer.panels.style.removeProperty('--bundle-w');
  viewer.panels.style.removeProperty('--fit-w');
  viewer.panels.style.removeProperty('--zoom');
  viewer.root.classList.remove('zoomed');
  viewer.canvas.scrollTo(0, 0);
}

// 휠을 굴린 자리를 중심으로 확대한다. 전체 화면이 아닐 때는 문서 스크롤에 맡긴다.
function onWheel(viewer, e) {
  if (!viewer.root.classList.contains('full')) return;
  e.preventDefault();
  // 가로로만 미는 손짓은 확대·축소가 아니다.
  if (e.deltaY === 0) return;
  const { zoomStep } = viewer.metrics;
  zoomAt(viewer, e.deltaY < 0 ? zoomStep : 1 / zoomStep, { x: e.clientX, y: e.clientY });
}

function onPointerDown(viewer, e) {
  const { root, canvas } = viewer;
  const isMainButton = e.button === 0;
  if (!root.classList.contains('full') || viewer.zoom <= 1 || !isMainButton) return;
  viewer.drag = { x: e.clientX, y: e.clientY, left: canvas.scrollLeft, top: canvas.scrollTop };
  canvas.setPointerCapture(e.pointerId);
}

// 끈 거리만큼 그림을 반대로 옮긴다. 잡은 자리가 손가락 아래에 머문다.
function onPointerMove(viewer, e) {
  const { drag, canvas } = viewer;
  if (!drag) return;
  canvas.scrollLeft = drag.left - (e.clientX - drag.x);
  canvas.scrollTop = drag.top - (e.clientY - drag.y);
}

// factor만큼 확대한다. 배율은 1배(전체)에서 metrics.zoomMax배 사이다. center(화면 좌표)가 가리키던 그림 자리가 확대 뒤에도 같은 자리에 머문다. 없으면 영역 가운데다.
function zoomAt(viewer, factor, center) {
  const { canvas, panels, metrics } = viewer;
  const next = Math.min(metrics.zoomMax, Math.max(1, viewer.zoom * factor));
  const box = canvas.getBoundingClientRect();
  const at = center ?? { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const before = panels.getBoundingClientRect();
  const fraction = { x: (at.x - before.left) / before.width, y: (at.y - before.top) / before.height };
  viewer.zoom = next;
  layoutFull(viewer);
  const after = panels.getBoundingClientRect();
  canvas.scrollLeft += after.left + fraction.x * after.width - at.x;
  canvas.scrollTop += after.top + fraction.y * after.height - at.y;
}
