// 고른 모습(tone, appearance)의 CSS. 값은 문법이 고른 색 이름(tone.js)과 표현(look.js)이고, 색은 역할 토큰 `color.paint.<이름>`의 단계(fill 옅은 면, outline 경계, ink 글자)다.
// 고르지 않은 도형, 그룹, 카드는 이 파일의 어떤 것도 쓰지 않아 출력이 그대로다. 고른 색의 CSS 규칙은 쓴 색에만 결과 파일에 들어간다.
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
 * - plain: 면과 경계는 중립이고 색은 아이콘 실루엣과 그룹 제목 글자뿐이다.
 * - filled: 도형, 그룹, 카드 내용의 면이 같은 계열의 옅은 면(fill)이다. 경계는 중립이다.
 * - outline: 경계가 같은 계열 경계(outline)이고 면은 중립이다.
 * 도착 후광(.fl-pulse)과 켜짐은 고른 색과 상관없이 공통 UI 강조다(figure.css). 쓴 색이 없으면 빈 글이다.
 */
export function paintCss(scene) {
  if (!scene) return '';
  const rules = usedTones(scene).flatMap((name) => {
    const t = `.tn-${name}`;
    return [
      // 도형은 평소 값(--fx-face, --fx-edge-rest)만 바꾼다. 켜짐은 figure.css의 효과 한 벌이 정하므로 움직이는 SVG의 keyframes도 같은 값을 읽는다.
      `.fl .fl-node.ap-filled${t} {\n  --fx-face: var(--color-paint-${name}-fill);\n}`,
      `.fl .fl-node.ap-outline${t} {\n  --fx-edge-rest: var(--color-paint-${name}-outline);\n}`,
      `.fl .fl-group.ap-filled${t} > .frame-box {\n  fill: var(--color-paint-${name}-fill);\n}`,
      `.fl .fl-group.ap-outline${t} > .frame-box {\n  --fx-edge-rest: var(--color-paint-${name}-outline);\n}`,
      `.fl .fl-group${t} > .frame {\n  fill: var(--color-paint-${name}-ink);\n}`,
      `.fl .face${t}.ap-filled {\n  fill: var(--color-paint-${name}-fill);\n}`,
      `.fl .fl-layer${t}.ap-filled {\n  --chart-ground: var(--color-paint-${name}-fill);\n}`,
      `.fl .face${t}.ap-outline {\n  stroke: var(--color-paint-${name}-outline);\n}`,
    ];
  });
  return rules.length ? `\n${rules.join('\n')}\n` : '';
}
