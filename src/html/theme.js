// 목록 쪽과 문서 미리보기의 테마 전환 단추와 스크립트.
// 목록 쪽 테마 전환. 시스템은 OS 설정을 따르고, 라이트와 다크는 목록 쪽 루트에 color-scheme을 걸어 iframe 안 그림의 prefers-color-scheme도 같은 값이 되게 한다.
// 목록 쪽 자체 색은 토큰 CSS의 data-theme 값으로 바꾼다. 고른 값은 localStorage에 기억하고, 첫 그림이 그려지기 전에 적용해 깜빡임을 막는다.
const THEME_MODES = [
  ['system', '시스템'],
  ['light', '라이트'],
  ['dark', '다크'],
];
/** 고른 테마를 기억하는 localStorage 키. 목록 쪽이 쓰고, 목록 밖에서 열린 재생 화면도 같은 키를 읽는다. */
export const THEME_KEY = 'thinkflow-theme';
export const THEME_BUTTONS = THEME_MODES.map(([mode, label]) => `<button type="button" data-mode="${mode}" aria-pressed="false">${label}</button>`).join('');
export const THEME_SCRIPT = `
const THEME_KEY = '${THEME_KEY}';
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
  for (const button of document.querySelectorAll('.theme button')) button.setAttribute('aria-pressed', String(button.dataset.mode === (mode === 'light' || mode === 'dark' ? mode : 'system')));
}
function savedTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
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
