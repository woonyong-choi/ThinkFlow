// 결과 파일에 넣을 스타일과 SVG defs. 값은 모두 토큰(tokens.css, tokens.js)에서 온다.
import { readFileSync } from 'node:fs';
import { tokens, values } from './tokens.js';

// cost: time O(n), heap O(n), stack O(1), io 1
// vars: n = CSS 파일 글자 수
// basis: estimate
function readStyle(name) {
  return readFileSync(new URL(name, import.meta.url), 'utf8');
}

/** 결과 파일 안 `<style>`에 넣을 CSS. tokens.css는 생성물이다. */
export const STYLES = Object.freeze({
  tokens: readStyle('./tokens.css'),
  figure: readStyle('./styles/figure.css'),
  animated: readStyle('./styles/animated.css'),
  player: readStyle('./styles/player.css'),
  gallery: readStyle('./styles/gallery.css'),
  chart: readStyle('./styles/chart.css'),
});

/** 점 격자 바탕과 화살촉. 화살촉은 평소(`fl-arrow`), 밝힌 선(`fl-arrow-on`), 덤벨 둘째 계열(`fl-arrow-second`) 세 가지다. */
export const DEFS =
  drawDotPattern() +
  drawArrowMarker('fl-arrow', tokens.color.muted, values.size.marker) +
  drawArrowMarker('fl-arrow-on', tokens.color.accent, values.size['marker-on']) +
  drawArrowMarker('fl-arrow-second', tokens.color['series-2'], values.size['marker-on']);

function drawDotPattern() {
  const grid = values.size.grid;
  const dot = values.size['grid-dot'];
  // 점 중심을 칸 모서리에서 반지름의 1.5배 안쪽에 둔다.
  return `<pattern id="fl-dots" width="${grid}" height="${grid}" patternUnits="userSpaceOnUse"><circle cx="${dot * 1.5}" cy="${dot * 1.5}" r="${dot}" fill="${tokens.color.dot}"/></pattern>`;
}

// 화살촉 모양은 viewBox 10 안의 삼각형 좌표다. 크기는 markerWidth로 정한다.
function drawArrowMarker(id, color, size) {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="${size}" markerHeight="${size}" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" fill="${color}"/></marker>`;
}
