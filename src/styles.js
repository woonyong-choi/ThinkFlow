// 결과 파일에 넣을 스타일과 SVG defs. 값은 모두 토큰(tokens.css, tokens.js)에서 온다.
import { pruneTokens } from './vendor/theme/ui/build/prune-tokens.mjs';
import { readFileSync } from 'node:fs';
import { CHART_ARROW, roleArrowDefs } from './draw/arrow.js';

// cost: time O(n), heap O(n), stack O(1), io 1
// vars: n = CSS 파일 글자 수
// basis: estimate
function readStyle(name) {
  return readFileSync(new URL(name, import.meta.url), 'utf8');
}

/** 결과 파일 안 `<style>`에 넣을 CSS. tokens.css는 생성물이다. */
export const STYLES = Object.freeze({
  tokens: readStyle('./vendor/theme/tokens.css'),
  figure: readStyle('./vendor/theme/styles/diagram/figure.css'),
  control: readStyle('./vendor/theme/styles/tabs.css') + readStyle('./vendor/theme/styles/diagram/control.css'),
  player: readStyle('./vendor/theme/styles/diagram/player.css'),
  gallery: readStyle('./vendor/theme/styles/diagram/gallery.css'),
  document: readStyle('./vendor/theme/styles/diagram/document.css'),
  chart: readStyle('./vendor/theme/styles/diagram/chart.css'),
  chartData: readStyle('./vendor/theme/styles/diagram/chart-data.css'),
  status: readStyle('./vendor/theme/styles/diagram/status.css'),
});

// cost: time O(c·p), heap O(p), stack O(1)
// vars: c = 차트 수, p = 무늬 정의 수
// basis: estimate
/**
 * 그려진 차트들이 쓴 무늬 정의(`<pattern>`)를 SVG마다 한 번씩만 모은 글. 정의 id는 무늬 종류, 간격, 선 색에서 만든 값이라(chart/pattern.js) 판이 여럿이어도 같은 무늬는 같은 id와 같은 내용이고
 * id로 걸러 한 번만 넣으면 판 사이에 id가 겹치지도 빠지지도 않는다. id 순서로 정렬해 같은 그림은 같은 글이 된다.
 * @param drawings 그려진 차트 목록 { defs }(chart/draw.js의 drawChart 결과)
 */
export function patternDefs(drawings) {
  const defs = new Map();
  for (const { defs: markup = '' } of drawings) {
    for (const [pattern, id] of markup.matchAll(/<pattern id="([^"]+)"[\s\S]*?<\/pattern>/g)) {
      // 같은 id는 같은 내용이어야 한다. 다르면 먼저 넣은 쪽이 다른 차트의 무늬를 바꾸므로 조용히 고르지 않고 알린다.
      if (defs.has(id) && defs.get(id) !== pattern) throw new Error(`pattern "${id}" has two different definitions`);
      defs.set(id, pattern);
    }
  }
  return [...defs.keys()].sort().map((id) => defs.get(id)).join('');
}

/** 차트 방향선의 화살촉 표식. 쓰인 역할(draw/arrow.js CHART_ARROW)마다 하나씩, 그 역할의 색을 상속하게 넣는다. 차트 종류가 섞여도 선언 순서에 기대지 않는다. */
export function figureDefs(figure) {
  return roleArrowDefs(figure.nodes.filter((n) => n.shape === 'chart' && !n.isRejected).map((n) => CHART_ARROW[n.plot.chartType]).filter(Boolean));
}

export const tokensFor = usage => pruneTokens(STYLES.tokens, usage);
