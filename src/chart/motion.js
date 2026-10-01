// 차트가 자라는 움직임 CSS. 자라는 시간이 원본의 speed라서 CSS 파일이 아닌 여기서 만든다.
// 막대와 선은 자라는 시간 내내, 점과 값 글자는 그 뒤 절반에 나타난다. 움직이는 SVG(svg.js chart)도 같은 규칙이다.
import { tokens, values } from '../tokens.js';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 재생기의 `play`와 되풀이하는 차트(`chart-loop`)의 움직임 CSS.
 * @param growMs 계열이 자라는 시간(ms)
 */
export function chartMotionCss(growMs) {
  const cycle = values.duration['chart-cycle'];
  const ease = tokens.easing.reveal;
  const end = percent(growMs / cycle);
  const half = percent(growMs / 2 / cycle);
  return `
.fl .play .grow, .fl .play.grow { animation: chart-grow ${growMs}ms ${ease} both; }
.fl .play .draw, .fl .play.draw { animation: chart-draw ${growMs}ms ${ease} both; }
.fl .play .pop, .fl .play.pop, .fl .play .late, .fl .play.late { animation: chart-fade ${growMs}ms ${ease} both; }
.fl.chart-loop .grow { animation: chart-grow-loop ${cycle}ms infinite both; }
.fl.chart-loop .draw { animation: chart-draw-loop ${cycle}ms infinite both; }
.fl.chart-loop .pop, .fl.chart-loop .late { animation: chart-fade-loop ${cycle}ms infinite both; }
@keyframes chart-grow { from { transform: scaleX(0); } }
@keyframes chart-draw { from { stroke-dashoffset: 1; } }
@keyframes chart-fade { 0%, 50% { opacity: 0; } }
@keyframes chart-grow-loop { 0% { transform: scaleX(0); animation-timing-function: ${ease}; } ${end}, 100% { transform: none; } }
@keyframes chart-draw-loop { 0% { stroke-dashoffset: 1; animation-timing-function: ${ease}; } ${end}, 100% { stroke-dashoffset: 0; } }
@keyframes chart-fade-loop { 0%, ${half} { opacity: 0; animation-timing-function: ${ease}; } ${end}, 100% { opacity: 1; } }
`;
}

function percent(ratio) {
  return `${Math.min(100, Math.round(ratio * 10000) / 100)}%`;
}
