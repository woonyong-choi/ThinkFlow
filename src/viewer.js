// 브라우저에서 돈다. html.js가 HTML 안에 그대로 넣는다.
// 전체 화면과, 전체 화면에서만 켜지는 확대·축소·끌어 옮기기를 맡는다. 문서 안에서는 그림을 그대로 보인다.

// cost: time O(1) 시작, 휠·끌기마다 O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 그림 틀에 전체 화면 단추와 확대·축소를 붙인다.
 * @param root `.fl-figure` 요소. 안에 `.fl-full`, `.fl-zoom` 단추와 `svg.fl`이 있다
 * @param metrics { iconStroke, zoomMax, zoomStep }
 */
function figureView(root, metrics) {
  const svg = root.querySelector('svg.fl');
  const fullButton = root.querySelector('.fl-full');
  const base = svg.viewBox.baseVal;
  const home = { x: base.x, y: base.y, w: base.width, h: base.height };
  const icons = {
    open: 'M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4',
    close: 'M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4',
    in: 'M8 3v10M3 8h10',
    out: 'M3 8h10',
    fit: 'M3 3h10v10H3z',
  };
  let view = { ...home };
  let drag;

  fullButton.addEventListener('click', () => setFull(!root.classList.contains('full')));
  document.addEventListener('fullscreenchange', () => showFull(document.fullscreenElement === root));
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.fullscreenElement) setFull(false);
  });
  root.querySelectorAll('.fl-zoom button').forEach((b) => {
    b.innerHTML = drawIcon(icons[b.dataset.zoom]);
    b.addEventListener('click', () => (b.dataset.zoom === 'fit' ? setView(home) : zoomAt(b.dataset.zoom === 'in' ? metrics.zoomStep : 1 / metrics.zoomStep)));
  });
  svg.addEventListener('wheel', onWheel, { passive: false });
  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) svg.addEventListener(type, () => (drag = undefined));
  showFull(false);

  // 브라우저 전체 화면을 먼저 쓰고, 막혀 있으면(iframe에 allowfullscreen이 없을 때 등) 창을 덮는 모양으로 대신한다.
  function setFull(isFull) {
    const canUseApi = Boolean(root.requestFullscreen) && document.fullscreenEnabled;
    if (!canUseApi) return showFull(isFull);
    if (isFull) root.requestFullscreen().catch(() => showFull(true));
    else if (document.fullscreenElement) document.exitFullscreen();
    else showFull(false);
  }

  function showFull(isFull) {
    root.classList.toggle('full', isFull);
    fullButton.innerHTML = drawIcon(isFull ? icons.close : icons.open);
    const label = isFull ? '전체 화면 끝내기' : '전체 화면';
    fullButton.setAttribute('aria-label', label);
    fullButton.title = label;
    // 문서 안에서는 늘 전체 그림을 보인다.
    if (!isFull) setView(home);
  }

  // cost: time O(1), heap O(1), stack O(1)
  // basis: estimate
  // 휠을 굴린 자리를 중심으로 확대한다. 전체 화면이 아닐 때는 문서 스크롤에 맡긴다.
  function onWheel(e) {
    if (!root.classList.contains('full')) return;
    e.preventDefault();
    // 가로로만 미는 손짓은 확대·축소가 아니다.
    if (e.deltaY === 0) return;
    zoomAt(e.deltaY < 0 ? metrics.zoomStep : 1 / metrics.zoomStep, toSvgPoint(e));
  }

  // cost: time O(1), heap O(1), stack O(1)
  // basis: estimate
  function onPointerDown(e) {
    const isMainButton = e.button === 0;
    if (!root.classList.contains('full') || view.w >= home.w || !isMainButton) return;
    // 끄는 동안 viewBox가 바뀌므로, 잡은 순간의 화면→그림 변환으로 거리를 잰다.
    drag = { start: toSvgPoint(e), matrix: svg.getScreenCTM().inverse(), view: { ...view } };
    svg.setPointerCapture(e.pointerId);
  }

  // cost: time O(1), heap O(1), stack O(1)
  // basis: estimate
  // 끈 거리만큼 그림을 반대로 옮긴다. 잡은 자리가 손가락 아래에 머문다.
  function onPointerMove(e) {
    if (!drag) return;
    const now = new DOMPoint(e.clientX, e.clientY).matrixTransform(drag.matrix);
    setView({ ...drag.view, x: drag.view.x - (now.x - drag.start.x), y: drag.view.y - (now.y - drag.start.y) });
  }

  // factor만큼 확대한다. 배율은 1배(전체)에서 metrics.zoomMax배 사이다.
  function zoomAt(factor, center = { x: view.x + view.w / 2, y: view.y + view.h / 2 }) {
    const w = Math.min(home.w, Math.max(home.w / metrics.zoomMax, view.w / factor));
    const k = w / view.w;
    setView({ x: center.x - (center.x - view.x) * k, y: center.y - (center.y - view.y) * k, w, h: view.h * k });
  }

  // cost: time O(1), heap O(1), stack O(1)
  // basis: estimate
  // 그림 밖으로 벗어나지 않게 자리를 막고 viewBox에 쓴다.
  function setView(next) {
    const x = Math.min(home.x + home.w - next.w, Math.max(home.x, next.x));
    const y = Math.min(home.y + home.h - next.h, Math.max(home.y, next.y));
    view = { ...next, x, y };
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    root.classList.toggle('zoomed', view.w < home.w);
  }

  // 화면 좌표를 그림 좌표로 바꾼다. 그림 비율과 svg 상자 비율이 달라 생기는 여백까지 브라우저 변환 행렬이 반영한다.
  function toSvgPoint(e) {
    const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    return { x: point.x, y: point.y };
  }

  function drawIcon(d) {
    return `<svg width="12" height="12" viewBox="0 0 16 16"><path d="${d}" fill="none" stroke="currentColor" stroke-width="${metrics.iconStroke}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
}
