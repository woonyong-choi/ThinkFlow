// 스크립트 없이 움직이는 SVG와 멈춘 SVG. 시간표의 박자 상태를 CSS keyframes와 SMIL로 옮긴다(docs/design/playback.md).
import { chartText } from './chart/draw.js';
import { drawScene } from './draw/figure.js';
import { createGlyphSet, embedFonts, measure } from './measure/fonts.js';
import { STYLE } from './measure/sizes.js';
import { DEFS, STYLES } from './styles.js';
import { escapeXml, roundCoord as r } from './text.js';
import { litIds } from './timeline.js';
import { tokens, values } from './tokens.js';

const SPACE = values.space;
const LINE = values.size.line;
const CAPTION = { size: values.size.text['13-5'], face: 'regular' };
const STEP_LABEL = { size: values.size.text['13'], face: 'mono' };
// 켜짐 구간 끝을 다음 구간 시작보다 이만큼(ms) 앞당긴다. 같은 퍼센트에 두 값이 겹치지 않게 하기 위해서다.
const EPSILON_MS = 0.1;

// cost: time O(g·b + b·h + out), heap O(out), stack O(1), io 1
// vars: g = 켜고 끄는 요소 수, b = 박자 수, h = 박자의 이동 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * SVG 문서를 만든다.
 * @param result buildFigure 결과
 * @param isStatic 멈춘 SVG면 true. 모든 선과 계열을 보이고 카드는 비운다
 */
export async function toSvg(result, { isStatic = false } = {}) {
  const { figure, timeline } = result;
  const glyphs = createGlyphSet();
  const animator = isStatic || !timeline.segs.length ? staticAnimator() : createAnimator(timeline);
  const content = result.chart ? drawChartBody(result, animator, glyphs, isStatic) : drawFigureBody(result, animator, glyphs);
  const width = Math.max(content.width, values.size['figure-min']);
  const captions = isStatic ? { svg: '', height: 0 } : drawCaptions(timeline, animator, width, content.height, glyphs);
  const height = content.height + captions.height;
  const fonts = await embedFonts(glyphs.used);
  const title = figure.title ?? '';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="fl${content.className}" width="${r(width)}" height="${r(height)}" viewBox="0 0 ${r(width)} ${r(height)}" role="img">
<title>${escapeXml(title)}</title>
<style>${fonts}
${STYLES.tokens}${STYLES.figure}${STYLES.animated}${result.chart ? STYLES.chart : ''}
${animator.css.join('\n')}
</style>
<defs>${DEFS}</defs>
<rect width="100%" height="100%" fill="${tokens.color.bg}"/>${result.chart ? '' : '<rect width="100%" height="100%" fill="url(#fl-dots)"/>'}
<g transform="translate(${r((width - content.width) / 2)} 0)">
${content.svg}
</g>
${captions.svg}
</svg>
`;
}

// cost: time O(scene + b·h), heap O(out), stack O(1)
// vars: scene = 장면 그리기 비용, b = 박자 수, h = 박자의 이동 수, out = 만든 SVG 글자 수
// basis: estimate
// 구조, 상태, 데이터, 순서 그림 본문과 점
function drawFigureBody(result, animator, glyphs) {
  const { scene, timeline } = result;
  const body = drawScene(scene, (kind, i, extra) => animator.decorate(kind, i, extra, scene), glyphs);
  const packets = timeline.segs.flatMap((seg, si) => seg.hops.map((hop, hi) => animator.packet(seg, hop, `p${si}-${hi}`, glyphs)));
  return { svg: `${body}\n${packets.join('\n')}`, width: scene.width, height: scene.height, className: '' };
}

// 차트 본문. 시간 흐름이 없으면 되풀이 class를 단다.
function drawChartBody(result, animator, glyphs, isStatic) {
  const { figure, chart, timeline } = result;
  glyphs.add(chartText(figure), 'regular');
  glyphs.add(chartText(figure), 'mono');
  glyphs.add(chartText(figure), 'semibold');
  const isLoop = !isStatic && !timeline.segs.length;
  if (!isStatic && timeline.segs.length) animator.chart(figure, chart);
  return { svg: chart.body, width: chart.width, height: chart.height, className: isLoop ? ' chart-loop' : '' };
}

// cost: time O(c·n), heap O(out), stack O(1)
// vars: c = 서로 다른 설명 수, n = 설명 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 그림 아래에 단계 이름과 설명을 박자에 맞춰 바꿔 보인다.
function drawCaptions(timeline, animator, width, top, glyphs) {
  if (!timeline.segs.length) return { svg: '', height: 0 };
  const captions = [...new Set(timeline.segs.map((s) => s.caption))].filter(Boolean);
  const wrapWidth = width - SPACE['30'];
  const wrapped = new Map(captions.map((c) => [c, wrapLines(c, wrapWidth)]));
  const lines = Math.max(1, ...[...wrapped.values()].map((l) => l.length));
  const height = captions.length ? SPACE['17'] + lines * LINE['20'] : SPACE['15'];
  const labels = timeline.steps.map((label, si) => {
    glyphs.add(label, STEP_LABEL.face);
    const cls = animator.windows(timeline.segs.map((s) => s.si === si), 'opacity: 1', 'opacity: 0', 's');
    return `<text x="${r(width / 2)}" y="${r(top + SPACE['9'])}" opacity="0" class="steplabel ${cls}">${escapeXml(label)}</text>`;
  });
  const said = captions.map((text) => {
    glyphs.add(text, CAPTION.face);
    const cls = animator.windows(timeline.segs.map((s) => s.caption === text), 'opacity: 1', 'opacity: 0', 'y');
    const rows = wrapped.get(text).map((line, li) => `<text x="${r(width / 2)}" y="${r(top + SPACE['22'] + li * LINE['20'])}" class="caption">${escapeXml(line)}</text>`);
    return `<g opacity="0" class="${cls}">${rows.join('')}</g>`;
  });
  return { svg: [...labels, ...said].join('\n'), height };
}

// cost: time O(w·n), heap O(n), stack O(1)
// vars: w = 낱말 수, n = 글자 수
// basis: estimate
function wrapLines(text, width) {
  const words = text.split(' ');
  const lines = [''];
  for (const w of words) {
    const next = lines.at(-1) ? `${lines.at(-1)} ${w}` : w;
    if (measure(next, CAPTION.size, CAPTION.face) <= width || !lines.at(-1)) lines[lines.length - 1] = next;
    else lines.push(w);
  }
  return lines;
}

// 멈춘 SVG: 모든 선과 도형을 보이고 카드는 비운다. 움직임 class는 없다.
function staticAnimator() {
  return { css: [], decorate: () => '', packet: () => '', windows: () => '', chart: () => {} };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 박자별 상태를 CSS keyframes class로 바꾼다. 같은 켜짐 순서는 class 하나를 나눠 쓴다.
function createAnimator({ segs, total }) {
  const duration = `${r(total / 1000)}s`;
  const css = [];
  const names = new Map();
  const percent = (ms) => `${Math.round((ms / total) * 100000) / 1000}%`;

  // cost: time O(b), heap O(b), stack O(1)
  // vars: b = 박자 수
  // basis: estimate
  // states[i]는 박자 i의 켜짐이다. { before, after, at }이면 박자 안 at(ms)에서 before가 after로 바뀐다.
  function windows(states, onCss, offCss, prefix) {
    const spans = segs.flatMap((s, i) => {
      const st = typeof states[i] === 'object' ? states[i] : { before: states[i], after: states[i], at: 0 };
      const at = s.t0 + st.at;
      return st.at > 0 && st.before !== st.after ? [[s.t0, at, st.before], [at, s.t1, st.after]] : [[s.t0, s.t1, st.after]];
    });
    const key = prefix + spans.map(([start, , on]) => `${Math.round(start)}${on ? 1 : 0}`).join('');
    if (!names.has(key)) {
      const name = `a${names.size}`;
      names.set(key, name);
      const frames = spans.map(([start, end, on]) => `${percent(start)},${percent(Math.max(start, end - EPSILON_MS))} { ${on ? onCss : offCss} }`).join(' ');
      css.push(`@keyframes ${name} { ${frames} }\n.fl .${name} { animation: ${name} ${duration} infinite step-end; }`);
    }
    return names.get(key);
  }

  const lit = (j) => segs.map((s) => s.edgesOn.includes(j));
  const cardState = (n, test) => segs.map((s) => ({ before: test(s.cardsBefore[n]), after: test(s.cards[n]), at: s.cardsAt[n] ?? 0 }));

  // cost: time O(b), heap O(b), stack O(1)
  // vars: b = 박자 수
  // basis: estimate
  function decorate(kind, i, extra, scene) {
    const id = kind === 'group' ? scene?.groups[i]?.id : scene?.items[i]?.id;
    switch (kind) {
      case 'node':
      case 'group':
        return windows(segs.map((s) => litIds(s, scene.edges).has(id)), `stroke: ${tokens.color.accent}`, `stroke: ${tokens.color.border}`, 'n');
      case 'column':
        return windows(segs.map((s) => s.columnsOn.includes(extra)), `fill: ${tokens.color['card-on']}`, 'fill: transparent', 'k');
      case 'edge':
        return windows(lit(i), `stroke: ${tokens.color.accent}; stroke-width: ${tokens.border.strong}; marker-end: url(#fl-arrow-on)`, `stroke: ${tokens.color.muted}; stroke-width: ${tokens.border.edge}; marker-end: url(#fl-arrow)`, 'e');
      case 'pill':
        return windows(lit(i), `fill: ${tokens.color.accent}; stroke: ${tokens.color.accent}`, `fill: ${tokens.color.bg}; stroke: ${tokens.color.border}`, 'l');
      case 'pilltext':
        return windows(lit(i), `fill: ${tokens.color['on-accent']}`, `fill: ${tokens.color.muted}`, 'x');
      case 'quiet':
        return windows(lit(i), 'opacity: 1', 'opacity: 0', 'q');
      case 'card':
        return windows(cardState(id, (v) => v !== undefined), `stroke: ${tokens.color.accent}; fill: ${tokens.color['card-on']}`, `stroke: ${tokens.color.border}; fill: ${tokens.color.surface}`, 'c');
      case 'layer':
        return windows(cardState(id, (v) => v === extra), 'opacity: 1', 'opacity: 0', 'v');
      case 'empty':
        return windows(cardState(id, (v) => v === undefined), 'opacity: 1', 'opacity: 0', 'v');
      default:
        return '';
    }
  }

  // 점 하나가 한 박자 동안 선을 건너고, 실어 보내는 글은 점 위의 상자로 따라간다.
  function packet(seg, hop, name, glyphs) {
    const end = seg.t0 + hop.ms;
    css.push(
      `@keyframes ${name} { 0%,${percent(seg.t0)} { opacity: 0 } ${percent(seg.t0 + EPSILON_MS)},${percent(end - EPSILON_MS)} { opacity: 1 } ${percent(end)},100% { opacity: 0 } }\n` +
        `.fl .${name} { animation: ${name} ${duration} infinite step-end; }`,
    );
    const keyTimes = `0;${round4(seg.t0 / total)};${round4(end / total)};1`;
    const chip = hop.data ? drawChip(hop.data, glyphs) : '';
    return (
      `<g class="${name}" opacity="0"><circle r="${values.size.halo}" fill="${tokens.color.accent}" opacity="${values.opacity.halo}"/><circle r="${values.size.packet}" fill="${tokens.color.accent}"/>${chip}` +
      `<animateMotion dur="${duration}" repeatCount="indefinite" calcMode="linear" keyTimes="${keyTimes}" keyPoints="${hop.isBack ? '1;1;0;0' : '0;0;1;1'}">` +
      `<mpath href="#p-${hop.edge}" xlink:href="#p-${hop.edge}"/></animateMotion></g>`
    );
  }

  // cost: time O(s·b + r·b), heap O(b), stack O(1)
  // vars: s = 계열 수, r = 행 수, b = 박자 수
  // basis: estimate
  // 차트: 계열마다 보임 keyframes와, 드러내는 박자에서 자라는 keyframes. 밝히지 않은 행은 흐린다.
  function chart(figure, drawn) {
    const grow = values.duration.reveal;
    figure.chart.series.forEach((series, s) => {
      const show = windows(segs.map((g) => g.series.includes(series.id)), 'opacity: 1', 'opacity: 0', `cs${s}`);
      const reveal = segs.find((g) => g.growing.includes(series.id));
      css.push(`.fl .cs-${s} { animation: ${show} ${duration} infinite step-end; }`);
      if (!reveal) return;
      const [a, b] = [percent(reveal.t0), percent(reveal.t0 + grow)];
      css.push(
        `@keyframes g${s} { 0%,${a} { transform: scaleX(0) } ${b},100% { transform: none } }\n.fl .cs-${s} .grow, .fl .cs-${s}.grow { animation: g${s} ${duration} infinite; }\n` +
          `@keyframes d${s} { 0%,${a} { stroke-dashoffset: 1 } ${b},100% { stroke-dashoffset: 0 } }\n.fl .cs-${s} .draw, .fl .cs-${s}.draw { animation: d${s} ${duration} infinite; }\n` +
          `@keyframes f${s} { 0%,${a} { opacity: 0 } ${b},100% { opacity: 1 } }\n.fl .cs-${s} .late, .fl .cs-${s} .pop, .fl .cs-${s}.pop { animation: f${s} ${duration} infinite; }`,
      );
    });
    drawn.rowKeys.forEach((key, k) => {
      const dim = windows(segs.map((g) => g.lights.length > 0 && !g.lights.includes(key)), `opacity: ${values.opacity.dim}`, 'opacity: 1', `r${k}`);
      css.push(`.fl .cr-${k} { animation: ${dim} ${duration} infinite step-end; }`);
    });
  }

  return { css, decorate, packet, windows, chart };
}

// cost: time O(l·n), heap O(out), stack O(1)
// vars: l = 줄 수, n = 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 점 위에 뜨는 글 상자. 줄은 시간표가 이미 나눴다.
function drawChip(lines, glyphs) {
  for (const line of lines) glyphs.add(line, STYLE.chip.face);
  const w = Math.max(...lines.map((line) => measure(line, STYLE.chip.size, STYLE.chip.face))) + SPACE['9'];
  const h = lines.length * STYLE.chip.line + SPACE['4'];
  const top = -h - SPACE['6'];
  return (
    `<rect x="${r(-w / 2)}" y="${r(top)}" width="${r(w)}" height="${r(h)}" rx="${values.radius.lg}" fill="${tokens.color.accent}"/>` +
    lines.map((line, li) => `<text x="0" y="${r(top + STYLE.chip.line * (li + 1))}" class="chip">${escapeXml(line)}</text>`).join('')
  );
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}
