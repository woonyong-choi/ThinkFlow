// 도형 좌표와 원본 SVG의 고유 크기는 디자인 값과 구분한다.
import { out } from './html.mjs';
const SOCIAL_PATHS = {
  github: '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.49c-2.23.48-2.7-.95-2.7-.95-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.22.82 1.22.82.71 1.22 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 3.85c.68 0 1.36.09 2 .27 1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.21c0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>',
  rss: '<circle cx="3" cy="13" r="2"/><path d="M1 6v3a6 6 0 0 1 6 6h3A9 9 0 0 0 1 6Zm0-5v3a11 11 0 0 1 11 11h3A14 14 0 0 0 1 1Z"/>',
  linkedin: '<path d="M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854V1.146zm4.943 12.248V6.169H2.542v7.225h2.401zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248-.822 0-1.359.54-1.359 1.248 0 .694.521 1.248 1.327 1.248h.016zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016a5.54 5.54 0 0 1 .016-.025V6.169h-2.4c.03.678 0 7.225 0 7.225h2.4z"/>',
};
export const SOCIAL_ICONS = /* @__PURE__ */ Object.keys(SOCIAL_PATHS);

export function ArticleIcon(name = 'question') {
  if (typeof name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('invalid article icon');
  return out(`<span class="app-article-icon app-icon-${name}" aria-hidden="true"></span>`);
}

export function SocialIcon(name, className = 'app-social-icon') {
  if (!/^[a-z][a-z -]*$/.test(className)) throw new Error('invalid icon class');
  const path = SOCIAL_PATHS[name];
  if (!path) throw new Error(`알 수 없는 아이콘입니다: ${name}`);
  return out(`<svg class="${className}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">${path}</svg>`);
}

const sizes = { search: [24, 24], clear: [24, 24], play: [32, 32], pause: [32, 32], replay: [32, 32] };
export function ControlImage(name, className = '', base = '') {
  const size = sizes[name];
  if (!size || !/^[a-z -]*$/.test(className) || !/^(?:\/[a-z0-9-]+)*$/.test(base)) throw new Error('invalid control image');
  return out(`<img width="${size[0]}" height="${size[1]}" class="${className}" src="${base}/theme/assets/controls/${name}.svg" alt="" decoding="async">`);
}
