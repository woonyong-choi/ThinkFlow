// 결과 파일에 넣을 스타일과 SVG defs. 값은 모두 토큰(tokens.css, tokens.js)에서 온다.
import { readFileSync } from 'node:fs';
import { tokens, values } from './tokens.js';

// cost: time O(n), heap O(n), stack O(1), io 1
// vars: n = CSS 파일 글자 수
// basis: estimate
function readStyle(name) {
  return readFileSync(new URL(name, import.meta.url), 'utf8');
}

// cost: time O(f), heap O(f), stack O(1), io f
// vars: f = 테마 글꼴 바이트 수
// basis: estimate
// 목록도 파일 하나로 열리도록 정본의 글꼴 선언과 자산을 함께 넣는다.
function listingFonts() {
  const theme = JSON.parse(readStyle('./design-theme/tokens.json'));
  return theme.$extensions.theme.fontFaces.map((face) => face.replace(/url\("([^"]+)"\)/g, (_, path) => {
    const font = readFileSync(new URL(`./design-theme/${path}`, import.meta.url));
    return `url("data:font/woff2;base64,${font.toString('base64')}")`;
  })).join('\n');
}

/** 결과 파일 안 `<style>`에 넣을 CSS. tokens.css는 생성물이다. */
export const STYLES = Object.freeze({
  listingFonts: listingFonts(),
  tokens: readStyle('./tokens.css'),
  figure: readStyle('./styles/figure.css'),
  animated: readStyle('./styles/animated.css'),
  control: readStyle('./styles/control.css'),
  player: readStyle('./styles/player.css'),
  gallery: readStyle('./styles/gallery.css'),
  document: readStyle('./styles/document.css'),
  chart: readStyle('./styles/chart.css'),
  status: readStyle('./styles/status.css'),
});

/** 화살촉. 화살촉은 평소(`fl-arrow`), 밝힌 선(`fl-arrow-on`), 덤벨 main 계열(`fl-arrow-main`) 세 가지다. */
export const DEFS =
  drawArrowMarker('fl-arrow', tokens.color.line, values.size.arrow.head) +
  drawArrowMarker('fl-arrow-on', tokens.color.state.active, values.size.arrow['head-lit']) +
  drawArrowMarker('fl-arrow-main', tokens.color.data.main, values.size.arrow['head-lit']);


// 화살촉 모양은 viewBox 10 안의 삼각형 좌표다. 크기는 markerWidth로 정한다.
function drawArrowMarker(id, color, size) {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="${size}" markerHeight="${size}" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9 z" fill="${color}"/></marker>`;
}
