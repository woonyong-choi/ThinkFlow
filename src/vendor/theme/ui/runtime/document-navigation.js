// 넓은 화면의 탐색 열과 좁은 화면의 기본 접기를 같은 DOM으로 사용한다.
export function initDocumentNavigation(layout) {
  const doc = layout.ownerDocument;
  const view = doc.defaultView;
  const panels = [...layout.querySelectorAll('[data-document-panel]')];
  const modes = new WeakMap();
  function resize() {
    for (const panel of panels) {
      const wide = view.getComputedStyle(panel.parentElement).position === 'sticky';
      if (modes.get(panel) === wide) continue;
      modes.set(panel, wide);
      panel.open = wide;
      panel.querySelector(':scope > summary').tabIndex = wide ? -1 : 0;
    }
    update();
  }
  for (const panel of panels) panel.querySelector(':scope > summary').addEventListener('click', event => {
    if (modes.get(panel)) event.preventDefault();
  });
  const links = [...layout.querySelectorAll('.app-document-outline a[href^="#"]')];
  const headings = links.map(link => doc.getElementById(decodeURIComponent(link.hash.slice(1))));
  const outline = layout.querySelector('.app-document-outline');
  let frame;
  let active = -1;
  function update() {
    frame = undefined;
    if (!headings.length) return;
    const offset = parseFloat(view.getComputedStyle(layout).getPropertyValue('--spacing-gap-lg')) || 0;
    let next = 0;
    for (let index = 0; index < headings.length; index++) {
      if (headings[index]?.getBoundingClientRect().top <= offset) next = index;
    }
    // 짧은 마지막 절은 화면 위까지 올라오지 못하므로 문서 끝에서도 선택한다.
    if (view.scrollY > 0 && view.scrollY + view.innerHeight >= doc.documentElement.scrollHeight - 1) next = headings.length - 1;
    if (next === active) return;
    active = next;
    links.forEach(link => { link.removeAttribute('aria-current'); link.classList.remove('is-parent'); });
    const link = links[active];
    link.setAttribute('aria-current', 'location');
    if (link.dataset.headingLevel === '3') {
      for (let index = active - 1; index >= 0; index--) {
        if (links[index].dataset.headingLevel === '2') { links[index].classList.add('is-parent'); break; }
      }
    }
    if (view.getComputedStyle(outline).position === 'sticky') {
      const row = link.getBoundingClientRect();
      const pane = outline.getBoundingClientRect();
      if (row.top < pane.top || row.bottom > pane.bottom) outline.scrollTop += row.top - pane.top - offset;
    }
  }
  function schedule() { if (frame === undefined) frame = view.requestAnimationFrame(update); }
  view.addEventListener('scroll', schedule, { passive: true });
  view.addEventListener('resize', resize);
  view.addEventListener('hashchange', schedule);
  if (view.ResizeObserver) new view.ResizeObserver(schedule).observe(layout.querySelector('.app-document-content'));
  doc.fonts?.ready.then(schedule);
  resize();
  const sidebar = layout.querySelector('.app-document-sidebar');
  const navigation = sidebar?.querySelector('nav');
  const groups = [...(navigation?.querySelectorAll('details') ?? [])];
  navigation?.addEventListener('click', event => {
    const summary = event.target.closest('summary');
    const row = summary?.querySelector(':scope > span') ?? event.target.closest('a');
    if (!row) return;
    navigation.querySelectorAll('.is-selected').forEach(selected => selected.classList.remove('is-selected'));
    row.classList.add('is-selected');
    if (summary) {
      const group = summary.parentElement;
      for (const other of groups) if (!other.contains(group)) other.open = false;
    }
  });
  const current = sidebar?.querySelector('[aria-current="page"]');
  if (current && view.getComputedStyle(sidebar).position === 'sticky') {
    const row = current.getBoundingClientRect();
    const pane = sidebar.getBoundingClientRect();
    if (row.bottom > pane.bottom) sidebar.scrollTop += row.bottom - pane.bottom;
  }
}

if (typeof document !== 'undefined') document.querySelectorAll('[data-document-layout]').forEach(initDocumentNavigation);
