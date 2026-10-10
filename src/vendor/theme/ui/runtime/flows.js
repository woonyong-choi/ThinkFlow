import { cssTimeMs } from './time.js';
// 자동 이동은 합성 가능한 transform으로, 직접 탐색은 네이티브 스크롤로 처리한다.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const scopes = new Map();
for (const rail of document.querySelectorAll('[data-flow-rail]')) {
  const scope = rail.closest('[data-flow-rows]') ?? rail;
  scopes.set(scope, [...(scopes.get(scope) ?? []), rail]);
}

for (const [scope, rails] of scopes) {
  const shared = scope.hasAttribute('data-flow-rows');
  const durationValue = getComputedStyle(rails[0]).getPropertyValue('--duration-motion-rail').trim();
  const duration = cssTimeMs(durationValue) * 2;
  let focused = false; let manual = false; let suspended = false;
  const rows = rails.map(rail => ({
    viewport: rail.querySelector('[data-flow-viewport]'), track: rail.querySelector('[data-flow-track]'),
    group: rail.querySelector('[data-flow-group]'), reverse: rail.dataset.flowDirection === 'right',
    clones: [], distance: 0, width: 0, animation: null, visible: false,
  }));

  const position = row => row.animation
    ? (row.animation.effect.getComputedTiming().progress ?? 0) * row.distance
    : row.viewport.scrollLeft;

  function handoff(row) {
    if (!row.animation) return;
    const offset = position(row);
    row.animation.cancel(); row.animation = null;
    row.viewport.scrollLeft = offset;
  }

  function update() {
    const interacting = focused || manual || reduced.matches;
    const running = rows.some(row => row.visible) && !document.hidden && !suspended;
    // 길이가 다른 두 줄도 같은 픽셀 속도로 흐르게 한다.
    const longest = Math.max(...rows.map(row => row.distance));
    for (const row of rows) {
      if (interacting) { handoff(row); continue; }
      if (!row.distance) continue;
      if (!row.animation) {
        const progress = (row.viewport.scrollLeft % row.distance) / row.distance;
        const rowDuration = duration * row.distance / longest;
        row.viewport.scrollLeft = 0;
        row.animation = row.track.animate([
          { transform: 'translate3d(0, 0, 0)' },
          { transform: `translate3d(${-row.distance}px, 0, 0)` },
        ], { duration: rowDuration, iterations: Infinity, easing: 'linear', direction: row.reverse ? 'reverse' : 'normal' });
        row.animation.pause();
        row.animation.currentTime = (row.reverse ? 1 - progress : progress) * rowDuration;
      }
      if (running) row.animation.play();
      else row.animation.pause();
    }
  }

  function measure() {
    const sizes = rows.map(row => ({
      width: row.viewport.clientWidth,
      distance: row.group.children.length > (shared ? 0 : 1)
        ? row.group.getBoundingClientRect().width + (parseFloat(getComputedStyle(row.track).columnGap) || 0) : 0,
    }));
    if (sizes.every((size, index) => size.width === rows[index].width && size.distance === rows[index].distance)) return;
    for (const [index, row] of rows.entries()) {
      const progress = row.distance ? position(row) / row.distance : 0;
      row.animation?.cancel(); row.animation = null;
      row.clones.forEach(clone => clone.remove()); row.clones = [];
      Object.assign(row, sizes[index]);
      row.viewport.classList.toggle('has-flow', !!row.distance);
      if (row.distance) {
        for (let count = Math.ceil(row.width / row.distance); count > 0; count--) {
          const clone = row.group.cloneNode(true); clone.removeAttribute('data-flow-group');
          clone.setAttribute('aria-hidden', 'true');
          clone.querySelectorAll('a').forEach(link => { link.tabIndex = -1; });
          row.track.append(clone); row.clones.push(clone);
        }
      }
      row.viewport.scrollLeft = progress * row.distance;
    }
    update();
  }

  const area = shared ? scope : rows[0].viewport;
  area.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse' && manual) { manual = false; update(); } });
  area.addEventListener('pointerdown', event => { if (event.pointerType !== 'mouse') { manual = true; update(); } });
  area.addEventListener('wheel', event => { if (event.deltaX) { manual = true; update(); } }, { passive: true });
  area.addEventListener('focusin', () => {
    focused = !!area.querySelector(':focus-visible') || area.matches(':focus-visible');
    update();
    // 이동 중 화면 밖에 있던 원본 링크도 Tab으로 초점을 받으면 드러낸다.
    if (focused) for (const row of rows) {
      const target = row.group.querySelector(':focus-visible');
      if (!target) continue;
      const item = target.getBoundingClientRect(); const view = row.viewport.getBoundingClientRect();
      row.viewport.scrollLeft += Math.min(0, item.left - view.left) || Math.max(0, item.right - view.right);
    }
  });
  area.addEventListener('focusout', () => queueMicrotask(() => {
    focused = !!area.querySelector(':focus-visible') || area.matches(':focus-visible'); update();
  }));
  reduced.addEventListener('change', update);
  document.addEventListener('visibilitychange', update);
  window.addEventListener('pagehide', () => { suspended = true; update(); });
  window.addEventListener('pageshow', () => { suspended = false; update(); });
  const resize = new ResizeObserver(measure);
  for (const row of rows) {
    resize.observe(row.viewport); resize.observe(row.group);
    new IntersectionObserver(entries => {
      row.visible = entries[0].isIntersecting;
      if (!rows.some(item => item.visible)) manual = false;
      update();
    }).observe(row.viewport);
  }
}
