/** 같은 출처의 등록된 도표만 높이·테마·대체 전체화면을 주고받는다. */
export function bindDiagramHost() {
  const selector = 'iframe[data-diagram]';
  const initialized = new WeakSet();
  const target = location.protocol === 'file:' ? '*' : location.origin;
  const theme = () => document.documentElement.dataset.theme ?? 'system';
  const sendTheme = frame => frame.contentWindow?.postMessage({ theme: theme() }, target);
  function initialize() {
    for (const frame of document.querySelectorAll(selector)) {
      if (initialized.has(frame)) continue;
      initialized.add(frame);
      frame.addEventListener('load', () => sendTheme(frame));
      sendTheme(frame);
    }
  }
  addEventListener('message', event => {
    if (event.origin !== location.origin || !event.data || typeof event.data !== 'object') return;
    const frame = [...document.querySelectorAll(selector)].find(item => item.contentWindow === event.source);
    if (!frame) return;
    if (event.data.themeRequest === true) sendTheme(frame);
    if (typeof event.data.figureFullscreen === 'boolean') {
      frame.classList.toggle('is-fullscreen', event.data.figureFullscreen);
      document.documentElement.classList.toggle('has-fullscreen-diagram', Boolean(document.querySelector(`${selector}.is-fullscreen`)));
    }
    const height = event.data.figureHeight;
    if (!frame.classList.contains('is-fullscreen') && Number.isFinite(height) && height > 0) frame.height = String(Math.ceil(height));
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    document.querySelector(`${selector}.is-fullscreen`)?.contentWindow?.postMessage({ figureExitFullscreen: true }, target);
  });
  new MutationObserver(() => document.querySelectorAll(selector).forEach(sendTheme))
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('content-added', initialize);
  initialize();
}
