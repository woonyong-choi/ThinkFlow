import { cssTimeMs } from './time.js';
import { ToolIcon } from '../toolbar.mjs';

/** 원문과 다운로드 작업만 소비자가 제공한다. 복사·결과 알림·재시도는 모든 블록이 공유한다. */
export function bindToolbar(root, { source, download } = {}) {
  const status = root.querySelector('[data-tool-status]');
  let timer;
  let shown;
  function clear() {
    clearTimeout(timer);
    if (!shown) return;
    shown.button.innerHTML = ToolIcon(shown.icon);
    shown.button.title = shown.title;
    delete shown.button.dataset.state;
    status.textContent = '';
    shown = undefined;
  }
  function announce(button, icon, ok, text) {
    clear();
    shown = { button, icon, title: button.title };
    button.innerHTML = ToolIcon(ok ? 'check' : 'alert');
    button.dataset.state = ok ? 'done' : 'failed';
    button.title = ok ? text : `${text}. 다시 시도하세요`;
    status.textContent = text;
    timer = setTimeout(clear, cssTimeMs(getComputedStyle(button).getPropertyValue('--duration-notice')));
  }
  async function copy(text) {
    if (globalThis.isSecureContext && navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch { /* 브라우저 복사 명령으로 다시 시도한다. */ }
    }
    const holder = document.createElement('textarea');
    holder.value = text;
    holder.readOnly = true;
    holder.className = 'app-copy-holder';
    holder.setAttribute('aria-hidden', 'true');
    holder.tabIndex = -1;
    const active = document.activeElement;
    root.append(holder);
    holder.select();
    const onCopy = event => { event.clipboardData.setData('text/plain', text); event.preventDefault(); };
    document.addEventListener('copy', onCopy, { once: true });
    try { return document.execCommand('copy'); } catch { return false; }
    finally {
      document.removeEventListener('copy', onCopy);
      holder.remove();
      active?.focus?.({ preventScroll: true });
    }
  }
  function bind(action, available, run, success) {
    const button = root.querySelector(`[data-tool="${action}"]`);
    if (!button) return;
    button.hidden = !available;
    if (!available) return;
    const failure = action === 'copy' ? '복사하지 못했습니다' : '다운로드하지 못했습니다';
    let busy = false;
    button.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      button.setAttribute('aria-disabled', 'true');
      try {
        const ok = await run();
        announce(button, action, ok !== false, ok === false ? failure : success);
      } catch {
        announce(button, action, false, failure);
      } finally { busy = false; button.removeAttribute('aria-disabled'); }
    });
  }
  bind('copy', source !== undefined, () => copy(typeof source === 'function' ? source() : source), '복사했습니다');
  bind('download', typeof download === 'function', download, '다운로드를 시작했습니다');
}
