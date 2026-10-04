// 차트의 움직이는 SVG keyframes. 계열마다 보임과, 드러내는 박자에서 자라는 움직임을 만들고, 밝히지 않은 행은 흐린다.
// 자라는 규칙은 HTML 재생기(chart/motion.js)와 같다.
import { tokens, values } from '../tokens.js';

// 점이 나타나는 시각 비율(0~1)을 keyframes 이름에 쓸 정수로 바꾸는 배율
const AT_KEY_SCALE = 1000;

// 자라는 움직임. [keyframes 접두사, 시작 값, 끝 값, 걸 class]
const GROWS = [
  ['g', 'transform: scaleX(0)', 'transform: none', '.grow'],
  ['d', 'stroke-dashoffset: 1', 'stroke-dashoffset: 0', '.draw'],
  ['w', 'clip-path: inset(0 100% 0 0)', 'clip-path: inset(0 0 0 0)', '.wipe'],
];

// cost: time O(s·b + r·b), heap O(b), stack O(1)
// vars: s = 계열 수, r = 행 수, b = 박자 수
// basis: estimate
/**
 * 차트 keyframes를 css에 쌓는다.
 * @param ctx { clock, segs, growMs, css, windows, fadeFrames }. 움직이는 SVG가 한 그림에 하나 쓰는 묶음
 * @param seriesIds 시간표가 다루는 계열 id 목록
 * @param drawn 차트 그리기 결과(dotAts, rowKeys, dimsInkColor). dimsInkColor이면 흐림이 서서히 가지 않고 한꺼번에 바뀐다
 */
export function animateChart(ctx, seriesIds, drawn) {
  seriesIds.forEach((id, s) => animateSeries(ctx, { id, s }, drawn.dotAts));
  animateLabelShifts(ctx, drawn.rowKeys);
  animateDimming(ctx, drawn);
}

// cost: time O(b + a), heap O(a), stack O(1)
// vars: b = 박자 수, a = 점이 나타나는 서로 다른 시각 수
// basis: estimate
// 계열 { id, s }(s는 계열 번호): 보임 keyframes와 자라는 keyframes. 드러내는 박자가 없으면 보임만 건다.
function animateSeries({ clock, segs, growMs, css, windows }, { id, s }, dotAts) {
  const show = windows(segs.map((g) => g.series.includes(id)), { on: 'opacity: 1', off: 'opacity: 0' });
  const reveal = segs.find((g) => g.growing.includes(id));
  css.push(`.fl .cs-${s} { animation: ${show} ${clock.duration} infinite linear; }`);
  if (!reveal) return;
  // 막대와 선과 띠는 자라는 시간 내내, 점과 값 글자는 그 뒤 절반에 나타난다. HTML 재생기(chart/motion.js)와 같다.
  const [a, half, b] = [clock.percent(reveal.t0), clock.percent(reveal.t0 + growMs / 2), clock.percent(reveal.t0 + growMs)];
  const ease = `animation-timing-function: ${tokens.easing.reveal}`;
  const rule = ([key, from, to, cls]) =>
    `@keyframes ${key}${s} { 0%,${a} { ${from}; ${ease} } ${b},100% { ${to} } }\n.fl .cs-${s} ${cls}, .fl .cs-${s}${cls} { animation: ${key}${s} ${clock.duration} infinite; }`;
  css.push([...GROWS.map(rule), lateFade({ clock, s, ease }, [half, b])].join('\n'));
  // 선 차트 점은 선이 닿는 시각(data-at × 자라는 시간)에 나타난다. 시각 계산은 chart/line.js arrivals가 끝냈다.
  for (const at of dotAts) css.push(dotFade({ clock, s, ease }, reveal.t0 + at * growMs, at));
}

// 값 글자와 점이 자라는 시간의 뒤 절반에 나타난다.
function lateFade({ clock, s, ease }, [half, end]) {
  return `@keyframes f${s} { 0%,${half} { opacity: 0; ${ease} } ${end},100% { opacity: 1 } }\n.fl .cs-${s} .late, .fl .cs-${s} .pop, .fl .cs-${s}.pop { animation: f${s} ${clock.duration} infinite; }`;
}

// 선 차트 점 하나가 시각 start(ms)부터 duration.fast 동안 나타난다.
function dotFade({ clock, s, ease }, start, at) {
  const [from, to] = [clock.percent(start), clock.percent(start + values.duration.fast)];
  const name = `p${s}-${Math.round(at * AT_KEY_SCALE)}`;
  return `@keyframes ${name} { 0%,${from} { opacity: 0; ${ease} } ${to},100% { opacity: 1 } }\n.fl .cs-${s} .dot[data-at="${at}"] { animation: ${name} ${clock.duration} infinite; }`;
}

// cost: time O(r·b), heap O(r·b), stack O(1)
// vars: r = 행 수, b = 박자 수
// basis: estimate
// 행 이름의 세로 옮김은 시간표가 행마다 박자마다 정해 둔 값을 그대로 건다. 모든 박자가 0이면 만들지 않고, 옮김이 같은 행은 keyframes를 나눠 쓴다.
function animateLabelShifts({ clock, segs, css, fadeFrames }, rowKeys) {
  const names = new Map();
  rowKeys.forEach((_, k) => {
    const shifts = segs.map((g) => g.labelShifts[k] ?? 0);
    if (!shifts.some(Boolean)) return;
    const key = shifts.join(',');
    if (!names.has(key)) {
      const name = `ls${names.size}`;
      names.set(key, name);
      css.push(`@keyframes ${name} { ${fadeFrames(segs.map((g, i) => [g.t0, g.t1, `transform: translateY(${shifts[i]}px)`]))} }`);
    }
    css.push(`.fl .cr-${k} .chart-label.shift { animation: ${names.get(key)} ${clock.duration} infinite linear; }`);
  });
}

// cost: time O(r·b), heap O(r), stack O(1)
// vars: r = 행 수, b = 박자 수
// basis: estimate
// 밝히지 않은 행은 면을 흐리고(`opacity.dim`), 글자(`.ink`)는 덜 흐리고(`opacity.dim-ink`), 면의 테두리(`.rim`)는 이때만 보인다(대비 3). 히트맵 칸 글자는 색도 어두운 글자로 바뀐다(chart.css `.chart-cell.dim`).
// 히트맵은 칸 면과 글자가 구간 시작에서 한꺼번에 바뀐다. 면이 바탕 쪽으로 옅어지는 중간에는 밝은 글자와 어두운 글자 어느 쪽도 대비 4.5에 못 미친다.
function animateDimming({ clock, segs, css, windows }, drawn) {
  const isStep = drawn.dimsInkColor;
  const inkColor = drawn.dimsInkColor ? { on: '; fill: var(--color-data-heat-ink)', off: '; fill: var(--ink)' } : { on: '', off: '' };
  drawn.rowKeys.forEach((key, k) => {
    const isDim = segs.map((g) => g.lights.length > 0 && !g.lights.includes(key));
    const face = windows(isDim, { on: `opacity: ${values.opacity.dim}`, off: 'opacity: 1', isStep });
    const ink = windows(isDim, { on: `opacity: ${values.opacity['dim-ink']}${inkColor.on}`, off: `opacity: 1${inkColor.off}`, isStep });
    const rim = windows(isDim, { on: 'opacity: 1', off: 'opacity: 0', isStep });
    css.push(`.fl .cr-${k} { animation: ${face} ${clock.duration} infinite linear; }`, `.fl .cr-${k}.ink { animation: ${ink} ${clock.duration} infinite linear; }`, `.fl .cr-${k}.rim { animation: ${rim} ${clock.duration} infinite linear; }`);
  });
}
