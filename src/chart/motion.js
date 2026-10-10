// 차트가 자라는 움직임 CSS. 자라는 시간이 원본의 speed라서 CSS 파일이 아닌 여기서 만든다.
// 막대와 선과 띠는 자라는 시간 내내 자라고, 값 글자는 그 뒤 절반에 나타난다. 선 차트 점(`dot`)은 선이 닿는 시각에 나타난다.
// 그 시각은 그리기 단계(line.js arrivals)가 자라는 시간 대비 비율로 계산해 요소의 `data-at`에 담았고, 여기서는 자라는 시간을 곱해 걸기만 한다. 움직이는 SVG(animate/chart.js)도 같은 규칙이다.
import { tokens, values } from '../vendor/theme/tokens.js';

// cost: time O(a), heap O(out), stack O(1)
// vars: a = 점이 나타나는 서로 다른 시각 수, out = 만든 CSS 글자 수
// basis: estimate
/**
 * 재생기의 `play` 움직임 CSS. 시간 흐름이 없는 차트는 움직이지 않으므로 되풀이나 한 번 드러내는 움직임이 없다.
 * @param growMs 계열이 자라는 시간(ms)
 * @param dotAts 점이 나타나는 시각 비율 목록(drawChart가 돌려주는 dotAts)
 */
export function chartMotionCss(growMs, dotAts = []) {
  const ease = tokens.ease.reveal;
  const fade = values.duration.fast;
  const dots = dotAts.map((at) => `.fl .play .dot[data-at="${at}"] { animation-delay: ${Math.round(at * growMs)}ms; }`);
  return `
.fl .play .dot, .fl .play.dot { animation: chart-dot ${fade}ms ${ease} both; }
@keyframes chart-dot { from { opacity: 0; } }
${dots.join('\n')}
.fl .play .grow, .fl .play.grow { animation: chart-grow ${growMs}ms ${ease} both; }
.fl .play .rise, .fl .play.rise { animation: chart-rise ${growMs}ms ${ease} both; }
.fl .play .draw, .fl .play.draw { animation: chart-draw ${growMs}ms ${ease} both; }
.fl .play .wipe, .fl .play.wipe { animation: chart-wipe ${growMs}ms ${ease} both; }
.fl .play .pop, .fl .play.pop, .fl .play .late, .fl .play.late { animation: chart-fade ${growMs}ms ${ease} both; }
@keyframes chart-rise { from { transform: scaleY(0); } }
@keyframes chart-grow { from { transform: scaleX(0); } }
@keyframes chart-draw { from { stroke-dashoffset: 1; } }
@keyframes chart-wipe { from { clip-path: inset(0 100% 0 0); } }
@keyframes chart-fade { 0%, 50% { opacity: 0; } }
`;
}
