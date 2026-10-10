import { bindTabs } from './tabs.js';

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
  for (const button of root.querySelectorAll('[data-copy]')) {
    if (initialized.has(button)) continue;
    initialized.add(button);
    const block = button.closest('.app-code');
    const status = block.querySelector('[data-copy-status]');
    const label = button.getAttribute('aria-label');
    const idle = button.textContent;
    let copying = false;
    let reset;
    button.hidden = false;
    button.addEventListener('click', async () => {
      if (copying) return;
      copying = true;
      clearTimeout(reset);
      button.setAttribute('aria-disabled', 'true');
      status.textContent = `${label} 중입니다.`;
      try {
        await navigator.clipboard.writeText(block.querySelector('code').textContent);
        button.textContent = '복사됨';
        button.dataset.state = 'copied';
        button.setAttribute('aria-label', `${label}됨`);
        status.textContent = `${label}를 완료했습니다.`;
      } catch {
        button.textContent = '복사 실패';
        button.dataset.state = 'failed';
        button.setAttribute('aria-label', `${label} 실패. 다시 시도`);
        status.textContent = `${label}에 실패했습니다. 다시 시도하거나 코드를 선택해 복사하세요.`;
      } finally {
        copying = false;
        button.removeAttribute('aria-disabled');
        reset = setTimeout(() => { delete button.dataset.state; button.textContent = idle; button.setAttribute('aria-label', label); }, parseFloat(getComputedStyle(button).getPropertyValue('--duration-copy-feedback')));
      }
    });
  }
  for (const section of root.querySelectorAll('[data-keyboard]')) {
    if (initialized.has(section)) continue;
    initialized.add(section);
    const select = section.querySelector('[data-keyboard-language]');
    select.addEventListener('change', () => {
      section.querySelectorAll('[data-keyboard-keys]').forEach(element => {
        const variants = JSON.parse(element.dataset.keyboardMap);
        const keys = variants[select.value] ?? variants['en-us'];
        element.replaceChildren(...keys.flatMap((key,index) => {
          const kbd = document.createElement('kbd');
          kbd.textContent = key;
          return index ? [document.createTextNode(' '), kbd] : [kbd];
        }));
      });
    });
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
