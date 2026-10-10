// 같은 출처의 정적 도표만 높이와 라이트·다크 상태를 주고받는다.
const selector = 'iframe[data-diagram]';
const initialized = new WeakSet();
const theme = () => document.documentElement.dataset.theme ?? 'system';
const sendTheme = frame => frame.contentWindow?.postMessage({ theme: theme() }, location.origin);

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
  const height = event.data.figureHeight;
  if (Number.isFinite(height) && height > 0) frame.height = String(Math.ceil(height));
});
new MutationObserver(() => document.querySelectorAll(selector).forEach(sendTheme))
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
document.addEventListener('content-added', initialize);
initialize();
