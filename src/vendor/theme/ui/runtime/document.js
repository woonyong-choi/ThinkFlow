import { bindTabs } from './tabs.js';
import { bindToolbar } from './toolbar.js';

const initialized = new WeakSet();
function initContent(root) {
  // 정적 문서의 독립적인 상호작용을 연결한다. 갤러리는 번호형 탭이라 탭 처리 하나를 쓴다.
  for (const tabs of root.querySelectorAll('[data-tabs]')) {
    if (initialized.has(tabs)) continue;
    initialized.add(tabs);
    const container = tabs.querySelector(':scope > [role=tablist]');
    const { buttons, select: mark } = bindTabs(container, (index) => {
      select(index);
      if (tabs.hasAttribute('data-platform')) {
        const later = [...document.querySelectorAll('[data-platform]')];
        later.slice(later.indexOf(tabs) + 1).forEach(next => next.dispatchEvent(new CustomEvent('platform-select', { detail: buttons[index].textContent })));
      }
    });
    const panels = [...tabs.querySelectorAll(':scope > [role=tabpanel]')];
    const select = (index) => {
      mark(index);
      panels.forEach((panel, at) => { panel.hidden = at !== index; if (panel.hidden) panel.querySelectorAll('video').forEach((video) => video.pause()); });
    };
    if (tabs.hasAttribute('data-platform')) {
      function selectPlatform(label) {
        const at = buttons.findIndex(button => button.textContent.toLowerCase().includes(label.toLowerCase()));
        if (at >= 0) select(at);
      }
      tabs.addEventListener('platform-select', event => selectPlatform(event.detail));
      const platform = new URLSearchParams(location.search).get('platform');
      if (platform) selectPlatform(platform);
    }

  }
  for (const block of root.querySelectorAll('.app-code')) {
    if (initialized.has(block)) continue;
    initialized.add(block);
    bindToolbar(block, { source: () => block.querySelector('code').textContent });
  }
  for (const button of root.querySelectorAll('[data-tooltip-trigger]')) {
    if (initialized.has(button)) continue;
    initialized.add(button);
    const bubble = document.getElementById(button.getAttribute('popovertarget'));
    const position = () => {
      const rect = button.getBoundingClientRect();
      const gap = parseFloat(getComputedStyle(bubble).getPropertyValue('--spacing-gap-xs'));
      const width = parseFloat(getComputedStyle(bubble).width);
      bubble.style.setProperty('--anchor-x', `${rect.left + rect.width / 2 - width / 2}px`);
      const height = bubble.getBoundingClientRect().height;
      const top = rect.bottom + gap + height > window.innerHeight ? rect.top - gap - height : rect.bottom + gap;
      bubble.style.setProperty('--anchor-y', `${Math.max(gap, top)}px`);
    };
    button.addEventListener('click', position);
    bubble.addEventListener('toggle', event => { if (event.newState === 'open') position(); });
    window.addEventListener('resize', () => { if (bubble.matches(':popover-open')) position(); });
    window.addEventListener('scroll', () => { if (bubble.matches(':popover-open')) bubble.hidePopover(); }, { passive: true });
  }
}
initContent(document);
document.addEventListener('content-added', event => initContent(event.detail));
