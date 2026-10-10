// 차트의 움직이는 SVG keyframes. 계열마다 보임과, 드러내는 박자에서 자라는 움직임을 만들고, 밝히지 않은 행은 흐린다.
// 자라는 규칙은 HTML 재생기(chart/motion.js)와 같다. 차트는 카드 id로 가려(`[data-chart="id"]`) 같은 문서의 차트마다, 같은 차트가 여러 곳에 그려져도 따로 움직인다.
import { tokens, values } from '../vendor/theme/tokens.js';

// 점이 나타나는 시각 비율(0~1)을 keyframes 이름에 쓸 정수로 바꾸는 배율
const AT_KEY_SCALE = 1000;

// 자라는 움직임. [keyframes 접두사, 시작 값, 끝 값, 걸 class]
const GROWS = [
  ['h', 'transform: scaleY(0)', 'transform: none', '.rise'],
  ['g', 'transform: scaleX(0)', 'transform: none', '.grow'],
  ['d', 'stroke-dashoffset: 1', 'stroke-dashoffset: 0', '.draw'],
  ['w', 'clip-path: inset(0 100% 0 0)', 'clip-path: inset(0 0 0 0)', '.wipe'],
];

// cost: time O(s·b + r·b), heap O(b), stack O(1)
// vars: s = 계열 수, r = 행 수, b = 박자 수
// basis: estimate
/**
 * 차트 카드 하나의 keyframes를 css에 쌓는다.
 * @param ctx { clock, segs, growMs, css, windows, root }. 움직이는 SVG가 한 그림에 하나 쓰는 묶음이고 root는 규칙이 걸리는 층의 선택자(기본 `.fl`)다
 * @param chart { id, seriesIds, drawn }. seriesIds는 시간표가 다루는 계열 id 목록, drawn은 차트 그리기 결과(dotAts, rowKeys, dimsInkColor)다. dimsInkColor(히트맵)이면 흐리지 않고 밝힌 칸의 글자 굵기만 한꺼번에 바꾼다
 */
export function animateChart(ctx, { id, seriesIds, drawn }) {
  // 규칙이 걸리는 범위. 움직임 층과 마지막 모습 층이 한 문서에 함께 있어도 서로의 차트 규칙이 겹치지 않도록 층 뿌리(root)로 좁힌다.
  const scope = `${ctx.root ?? '.fl'} [data-chart="${id}"]`;
  const state = (g) => g.charts?.[id] ?? { series: seriesIds, growing: [], lights: [] };
  seriesIds.forEach((sid, s) => animateSeries(ctx, { scope, sid, s, state }, drawn.dotAts));
  // 정지 그림은 마지막 상태의 계열과 밝히기를 움직임 없이 적는다.
  animateDimming({ ...ctx, scope, state }, drawn);
}

// cost: time O(b + a), heap O(a), stack O(1)
// vars: b = 박자 수, a = 점이 나타나는 서로 다른 시각 수
// basis: estimate
// 계열 { sid, s }(s는 계열 번호): 보임 keyframes와 자라는 keyframes. 드러내는 박자가 없으면 보임만 건다.
function animateSeries({ clock, segs, growMs, css, windows }, { scope, sid, s, state }, dotAts) {
  const show = windows(segs.map((g) => state(g).series.includes(sid)), { on: 'opacity: 1', off: 'opacity: 0' });
  const reveal = segs.find((g) => state(g).growing.includes(sid));
  css.push(clock.mode === 'static' ? `${scope} .cs-${s} { opacity: ${segs.at(-1) && state(segs.at(-1)).series.includes(sid) ? 1 : 0}; }` : `${scope} .cs-${s} { animation: ${show} ${clock.duration} ${clock.css} linear; }`);
  if (!reveal || clock.mode === 'static') return;
  // 막대와 선과 띠는 자라는 시간 내내, 점과 값 글자는 그 뒤 절반에 나타난다. HTML 재생기(chart/motion.js)와 같다.
  const [a, half, b] = [clock.percent(reveal.t0), clock.percent(reveal.t0 + growMs / 2), clock.percent(reveal.t0 + growMs)];
  const ease = `animation-timing-function: ${tokens.ease.reveal}`;
  const key = (prefix) => `${prefix}-${scope.replace(/\W+/g, '')}-${s}`;
  const rule = ([prefix, from, to, cls]) =>
    `@keyframes ${key(prefix)} { 0%,${a} { ${from}; ${ease} } ${b},100% { ${to} } }\n${scope} .cs-${s} ${cls}, ${scope} .cs-${s}${cls} { animation: ${key(prefix)} ${clock.duration} ${clock.css}; }`;
  css.push([...GROWS.map(rule), lateFade({ clock, scope, s, ease, key }, [half, b])].join('\n'));
  // 선 차트 점은 선이 닿는 시각(data-at × 자라는 시간)에 나타난다. 시각 계산은 chart/line.js arrivals가 끝냈다.
  for (const at of dotAts) css.push(dotFade({ clock, scope, s, ease, key }, reveal.t0 + at * growMs, at));
}

// 값 글자와 점이 자라는 시간의 뒤 절반에 나타난다.
function lateFade({ clock, scope, s, ease, key }, [half, end]) {
  return `@keyframes ${key('f')} { 0%,${half} { opacity: 0; ${ease} } ${end},100% { opacity: 1 } }\n${scope} .cs-${s} .late, ${scope} .cs-${s} .pop, ${scope} .cs-${s}.pop { animation: ${key('f')} ${clock.duration} ${clock.css}; }`;
}

// 선 차트 점 하나가 시각 start(ms)부터 duration.fast 동안 나타난다.
function dotFade({ clock, scope, s, ease, key }, start, at) {
  const [from, to] = [clock.percent(start), clock.percent(start + values.duration.fast)];
  const name = `${key('p')}-${Math.round(at * AT_KEY_SCALE)}`;
  return `@keyframes ${name} { 0%,${from} { opacity: 0; ${ease} } ${to},100% { opacity: 1 } }\n${scope} .cs-${s} .dot[data-at="${at}"] { animation: ${name} ${clock.duration} ${clock.css}; }`;
}

// cost: time O(r·b), heap O(r), stack O(1)
// vars: r = 행 수, b = 박자 수
// basis: estimate
// 밝히지 않은 행은 면을 흐리고(`opacity.dim`), 글자(`.ink`)는 덜 흐린다(`opacity.dim-ink`). 계열의 테두리 색은 그대로라 따로 윤곽을 더하지 않는다.
// 히트맵은 값과 색 강도의 대응을 지키려 칸 면과 글자 색을 바꾸지 않고, 밝힌 칸의 글자만 굵게 한다(chart.css `.chart-cell`과 같은 규칙). 흐림과 굵기 모두 구간 시작에서 바로 바뀐다.
// 정지 시계는 마지막 구간이 켜짐일 때만 그 선언을 그대로 적는다(꺼짐은 기본 모습이라 규칙이 없다). 움직이는 시계는 구간마다의 keyframes다.
function animateDimming({ clock, segs, css, windows, scope, state }, drawn) {
  const declare = (states, look) => (clock.mode !== 'static' ? `animation: ${windows(states, look)} ${clock.duration} ${clock.css} linear;` : states.at(-1) ? `${look.on};` : '');
  const push = (...rules) => css.push(...rules.filter(([, body]) => body).map(([selector, body]) => `${selector} { ${body} }`));
  drawn.rowKeys.forEach((key, k) => {
    const lit = (g) => state(g).lights;
    if (drawn.dimsInkColor) {
      // 밝힌 칸이 있고 밝히지 않은 칸도 있을 때만 밝힌 칸이 굵다. 모든 칸을 밝히면 구별할 칸이 없어 굵기가 그대로다(재생기 chart.css `:has(.chart-cell.dim)`과 같다).
      const isBold = segs.map((g) => lit(g).includes(key) && drawn.rowKeys.some((other) => !lit(g).includes(other)));
      push([`${scope} .cr-${k}.ink`, declare(isBold, { on: 'font-weight: var(--font-weight-semibold)', off: 'font-weight: var(--weight-regular)' })]);
      return;
    }
    const isDim = segs.map((g) => lit(g).length > 0 && !lit(g).includes(key));
    const face = declare(isDim, { on: `opacity: ${values.opacity.dim}`, off: 'opacity: 1' });
    const ink = declare(isDim, { on: `opacity: ${values.opacity['dim-ink']}`, off: 'opacity: 1' });
    push([`${scope} .cr-${k}`, face], [`${scope} .cr-${k}.ink`, ink]);
  });
}
