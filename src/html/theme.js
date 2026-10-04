// 목록 쪽과 문서 미리보기의 테마 전환 단추와 스크립트.
// 목록 쪽 테마 전환. 시스템은 OS 설정을 따르고, 라이트와 다크는 목록 쪽 루트에 color-scheme을 걸어 iframe 안 그림의 prefers-color-scheme도 같은 값이 되게 한다.
// 목록 쪽 자체 색은 토큰 CSS의 data-theme 값으로 바꾼다. 고른 값은 localStorage에 기억하고, 첫 그림이 그려지기 전에 적용해 깜빡임을 막는다.
const THEME_MODES = [
  ['system', '시스템'],
  ['light', '라이트'],
  ['dark', '다크'],
];
export const THEME_BUTTONS = THEME_MODES.map(([mode, label]) => `<button type="button" data-mode="${mode}" aria-pressed="false">${label}</button>`).join('');
export const THEME_SCRIPT = `
const THEME_KEY = 'daphnis-theme';
// 옛 이름의 저장 키. 읽기만 하고, 새 키가 없을 때 한 판 동안 이어 받는다.
const LEGACY_THEME_KEY = 'mutoscope-theme';
// cost: time O(1), heap O(1), stack O(1)
// vars: 단추 3개
// basis: estimate
function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') {
    root.setAttribute('data-theme', mode);
    root.style.colorScheme = mode;
  } else {
    root.removeAttribute('data-theme');
    root.style.colorScheme = 'light dark';
  }
  for (const frame of document.querySelectorAll('iframe')) frame.contentWindow?.postMessage({ theme: mode }, '*');
  for (const button of document.querySelectorAll('.theme button')) button.setAttribute('aria-pressed', String(button.dataset.mode === (mode === 'light' || mode === 'dark' ? mode : 'system')));
}
function savedTheme() {
  try {
    return localStorage.getItem(THEME_KEY) ?? localStorage.getItem(LEGACY_THEME_KEY);
  } catch {
    return null;
  }
}
applyTheme(savedTheme());
addEventListener('DOMContentLoaded', () => {
  applyTheme(savedTheme());
  document.querySelector('.theme').addEventListener('click', (e) => {
    const mode = e.target.dataset?.mode;
    if (!mode) return;
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {}
    applyTheme(mode);
  });
});`;
