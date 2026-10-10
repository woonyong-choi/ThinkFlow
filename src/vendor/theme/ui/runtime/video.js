import { cssTimeMs } from './time.js';
// 원본의 거리 비례 스크롤과 swing 곡선을 사용한다.
let scrollFrame;
export function revealVideo(element, downward = false) {
  const rect = element.getBoundingClientRect();
  const viewport = window.innerHeight;
  if ((rect.top >= 0 && rect.bottom <= viewport) || (rect.top < 0 && rect.bottom > viewport)) return;
  const partial = (rect.top < 0 && rect.bottom > 0) || (rect.top < viewport && rect.bottom > viewport);
  if (partial && !downward) return;
  const style = getComputedStyle(document.body);
  const margin = parseFloat(style.getPropertyValue('--spacing-scroll-margin'));
  const speed = parseFloat(style.getPropertyValue('--component-scroll-speed'));
  const maximumMs = cssTimeMs(style.getPropertyValue('--duration-scroll-duration'));
  const start = window.scrollY;
  const end = Math.max(0, Math.min(start + (partial ? rect.bottom - viewport + margin : rect.top - margin), document.documentElement.scrollHeight - viewport));
  const distance = end - start;
  const durationMs = Math.min(Math.abs(distance / speed * 1000), maximumMs);
  cancelAnimationFrame(scrollFrame);
  if (!durationMs || matchMedia('(prefers-reduced-motion: reduce)').matches) { window.scrollTo({ top: end, behavior: 'instant' }); return; }
  const started = performance.now();
  function frame(now) {
    const progress = Math.min((now - started) / durationMs, 1);
    const eased = (1 - Math.cos(Math.PI * progress)) / 2;
    window.scrollTo({ top: start + distance * eased, behavior: 'instant' });
    if (progress < 1) scrollFrame = requestAnimationFrame(frame);
  }
  scrollFrame = requestAnimationFrame(frame);
}
for (const event of ['wheel', 'touchstart', 'pointerdown']) window.addEventListener(event, () => cancelAnimationFrame(scrollFrame), { passive: true });

// 설정 문구(data-label)가 있는 히어로 버튼은 문구와 aria-label이 고정이고 아이콘만 재생/일시정지 두 상태다.
// 끝난 영상은 재생 상태로 돌아가며 다시 누르면 처음부터 재생한다.
export function updateRemote(button, video, selected = true) {
  const playing = selected && !video.paused;
  const ended = selected && video.ended;
  button.classList.toggle('is-playing', playing);
  const fixed = button.dataset.label;
  if (fixed === undefined) {
    const text = playing ? 'Pause video' : ended ? 'Replay video' : 'Play video';
    button.setAttribute('aria-label', text);
  } else button.setAttribute('aria-label', fixed);
  const icon = button.querySelector('img');
  icon.src = new URL(`${playing ? 'pause' : !fixed && ended ? 'replay' : 'play'}.svg`, icon.src).href;
}
const initialized = new WeakSet();
function initContent(container) {
  for (const root of container.querySelectorAll('[data-player]')) {
    if (initialized.has(root)) continue;
    initialized.add(root);
    const video = root.querySelector('video');
    const controls = [...document.querySelectorAll('[data-remote]')].filter(button => button.dataset.remote === root.id);
    const status = root.querySelector('[role=status]');
    async function toggle(button) {
      const next = button?.dataset.videoSrc;
      const changed = next && new URL(next, location.href).href !== video.currentSrc;
      if (changed) { video.src = next; video.load(); }
      root.classList.add('has-played');
      if (button?.dataset.scroll) revealVideo(root, button.dataset.scroll === 'down');
      if (!changed && !video.paused) { video.pause(); return; }
      if (video.ended) video.currentTime = 0;
      try {
        await video.play(); status.textContent = ''; status.classList.remove('app-video-error'); status.classList.add('app-sr'); if (!button?.dataset.scroll) revealVideo(root);
      }
      catch {
        status.textContent = '영상을 재생하지 못했습니다. 재생 버튼을 다시 눌러 주세요.';
        status.classList.remove('app-sr'); status.classList.add('app-video-error');
      }
    }
    root.classList.add('is-initialized');
    root.querySelector('[data-player-play]')?.removeAttribute('hidden');
    if (video.hasAttribute('data-native-controls') && root.querySelector('[data-player-play]')) video.controls = false;
    root.querySelector('[data-player-play]')?.addEventListener('click', () => toggle());
    controls.forEach(button => button.addEventListener('click', event => { event.preventDefault(); toggle(button); }));
    for (const event of ['play', 'pause', 'ended']) video.addEventListener(event, () => {
      root.classList.toggle('is-playing', !video.paused);
      if (!video.paused) { root.classList.add('has-played'); if (video.hasAttribute('data-native-controls')) video.controls = true; }
      controls.forEach(button => updateRemote(button, video, !button.dataset.videoSrc || new URL(button.dataset.videoSrc, location.href).href === video.currentSrc));
    });
  }
}
initContent(document);
document.addEventListener('content-added', event => initContent(event.detail));
