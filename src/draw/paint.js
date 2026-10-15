// 고른 색(tone)의 CSS 변수. 값은 문법이 고른 색 이름(tone.js)과 표현(look.js)이고, 색은 역할 토큰 `color.paint.<이름>`의 단계(fill 옅은 면, outline 경계, ink 글자)다.
// 면·경계·제목과 켜짐의 역할은 정본 figure.css가 소유한다. 고른 색의 CSS 규칙은 쓴 색에만 결과 파일에 들어간다.
import { lookOf, faceOf } from './look.js';

// cost: time O(s + g + r), heap O(c), stack O(1)
// vars: s = 도형 수, g = 그룹 수, r = 카드 줄 수, c = 고른 색 수
// basis: estimate
// 그림이 고른 색 이름 목록(처음 나온 순서).
function usedTones(scene) {
  const names = new Set();
  for (const item of [...scene.items, ...scene.groups]) names.add(lookOf(item).tone);
  for (const item of scene.items) for (const layout of item.content?.layouts ?? []) for (const { row } of layout.rows) names.add(faceOf(row).tone);
  names.delete(undefined);
  return [...names];
}

// cost: time O(c), heap O(out), stack O(1)
// vars: c = 고른 색 수, out = 만든 CSS 글자 수
// basis: estimate
/**
 * 고른 색의 CSS. 표현마다 칠하는 곳이 정해져 있다.
 * - plain: 면과 경계는 중립이고 색은 아이콘 실루엣뿐이다. 그룹 제목은 고른 색과 상관없이 공통 그룹 제목 색이다.
 * - filled: 도형, 그룹, 카드 내용의 면이 같은 계열의 옅은 면(fill)이다. 경계는 중립이다.
 * - outline: 경계가 같은 계열 경계(outline)를 기본 윤곽과 섞은 색이고(figure.css) 면은 중립이다.
 * 도착 후광(.fl-pulse)과 켜짐은 고른 색과 상관없이 공통 UI 강조다(figure.css). 쓴 색이 없으면 빈 글이다.
 */
export function paintCss(scene) {
  if (!scene) return '';
  const rules = usedTones(scene).map((name) => `.fl .tn-${name} {\n  --paint-fill: var(--color-paint-${name}-fill);\n  --paint-outline: var(--color-paint-${name}-outline);\n}`);
  return rules.length ? `\n${rules.join('\n')}\n` : '';
}
