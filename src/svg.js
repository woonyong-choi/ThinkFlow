// 스크립트 없이 움직이는 SVG와 멈춘 SVG. 시간표의 박자 상태를 CSS keyframes와 SMIL로 옮긴다(docs/design/playback.md).
import { canvasOf, fitCanvas } from './canvas.js';
import { CHART_FACES, chartText } from './chart/draw.js';
import { createAnimator } from './animate/animator.js';
import { drawScene } from './draw/figure.js';
import { paintCss } from './draw/paint.js';
import { drawTrackPaths } from './draw/tracks.js';
import { createGlyphSet, embedFonts, wrap } from './measure/fonts.js';
import { lineHeight } from './measure/sizes.js';
import { DEFS, STYLES } from './styles.js';
import { escapeXml, plainText, renderRich, roundCoord as r } from './text.js';
import { chartMotionCss } from './chart/motion.js';
import { tokens, values } from './tokens.js';

const SPACE = values.space;
const CAPTION = { size: values.size.text['13'], face: 'regular' };
const CAPTION_LINE = lineHeight(CAPTION.size, values.leading.normal);
const STEP_LABEL = { size: values.size.text['15'], face: 'semibold' };

// cost: time O(g·b + b·h + out), heap O(out), stack O(1), io 1
// vars: g = 켜고 끄는 요소 수, b = 박자 수, h = 박자의 이동 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * SVG 문서를 만든다.
 * @param result buildFigure 결과
 * @param isStatic 멈춘 SVG면 true. 모든 선과 계열을 보이고 카드는 비운다
 * @param name 원본 파일 이름. 그림 제목(title)이 없을 때 SVG 제목으로 쓴다
 */
export async function toSvg(result, { isStatic = false, name = '' } = {}) {
  const { figure, timeline } = result;
  const glyphs = createGlyphSet();
  const animator = isStatic || !timeline.segs.length ? staticAnimator() : createAnimator(timeline);
  const content = result.chart ? drawChartBody(result, { animator, glyphs, isStatic }) : drawFigureBody(result, animator, glyphs);
  const { viewWidth: width, shownWidth, scale } = fitCanvas(content.width, 0, canvasOf(figure));
  const captions = isStatic ? { svg: '', height: 0 } : drawCaptions(timeline, { animator, glyphs }, { width, top: content.height });
  const height = content.height + captions.height;
  const shownHeight = height * scale;
  const fonts = await embedFonts(glyphs.used);
  const title = figure.title ?? name;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" class="fl${content.className}" width="${r(shownWidth)}" height="${r(shownHeight)}" viewBox="0 0 ${r(width)} ${r(height)}" role="img">
<title>${escapeXml(plainText(title))}</title>
<style>${fonts}
${STYLES.tokens}${STYLES.figure}${STYLES.animated}${paintCss(result.scene)}${result.chart ? STYLES.chart + chartMotionCss(timeline.growMs, result.chart.dotAts) : ''}
${animator.css.join('\n')}
</style>
<defs>${DEFS}</defs>
<rect x="${values.border.thin / 2}" y="${values.border.thin / 2}" width="${r(width - values.border.thin)}" height="${r(height - values.border.thin)}" rx="${values.radius.xl}" fill="${tokens.color.bg}" stroke="${tokens.color['plate-border']}" stroke-width="${values.border.thin}"/>
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
  const body = drawScene(scene, animator.decorate(scene), glyphs);
  const packets = timeline.segs.flatMap((seg, si) => seg.hops.map((hop, hi) => animator.packet({ seg, hop, name: `p${si}-${hi}` }, glyphs)));
  const tracks = animator.isStatic ? '' : drawTrackPaths(timeline);
  return { svg: `${body}\n${tracks}${animator.values(scene, timeline, glyphs)}\n${packets.join('\n')}`, width: scene.width, height: scene.height, className: '' };
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 차트 글자 수
// basis: estimate
// 차트 본문. 시간 흐름이 없으면 되풀이 class를 단다.
function drawChartBody(result, { animator, glyphs, isStatic }) {
  const { figure, chart, timeline } = result;
  for (const face of CHART_FACES) glyphs.add(chartText(figure), face);
  const isLoop = !isStatic && !timeline.segs.length;
  if (!isStatic && timeline.segs.length) animator.chart(figure, chart);
  return { svg: chart.body, width: chart.width, height: chart.height, className: isLoop ? ' chart-loop' : '' };
}

// cost: time O(c·n), heap O(out), stack O(1)
// vars: c = 서로 다른 설명 수, n = 설명 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 그림 아래에 단계 이름과 설명을 박자에 맞춰 바꿔 보인다.
function drawCaptions(timeline, { animator, glyphs }, { width, top }) {
  if (!timeline.segs.length) return { svg: '', height: 0 };
  const captions = [...new Set(timeline.segs.map((s) => s.caption))].filter(Boolean);
  const wrapWidth = width - SPACE['30'];
  const wrapped = new Map(captions.map((c) => [c, wrap(c, wrapWidth, CAPTION)]));
  const lines = Math.max(1, ...[...wrapped.values()].map((l) => l.length));
  // 설명 글 아래 여백은 그림 내용 위 여백(그림 둘레 여백 space.14)과 같다. 마지막 줄 기준선에서 글자 내림 4를 더한 만큼 아래에 둔다.
  const height = captions.length ? SPACE['22'] + (lines - 1) * CAPTION_LINE + SPACE['2'] + SPACE['14'] : SPACE['15'];
  const labels = timeline.steps.map((label, si) => {
    glyphs.add(label, STEP_LABEL.face);
    const cls = animator.windows(timeline.segs.map((s) => s.si === si), { on: 'opacity: 1', off: 'opacity: 0', isSwap: true });
    return `<text x="${r(width / 2)}" y="${r(top + SPACE['9'])}" opacity="0" class="steplabel ${cls}">${renderRich(label)}</text>`;
  });
  const said = captions.map((text) => {
    glyphs.add(text, CAPTION.face);
    const cls = animator.windows(timeline.segs.map((s) => s.caption === text), { on: 'opacity: 1', off: 'opacity: 0', isSwap: true });
    const rows = wrapped.get(text).map((line, li) => `<text x="${r(width / 2)}" y="${r(top + SPACE['22'] + li * CAPTION_LINE)}" class="caption">${renderRich(line)}</text>`);
    return `<g opacity="0" class="${cls}">${rows.join('')}</g>`;
  });
  return { svg: [...labels, ...said].join('\n'), height };
}

// 멈춘 SVG: 모든 선과 도형을 보이고 카드는 비운다. 움직임 class는 없다.
function staticAnimator() {
  return { css: [], decorate: () => () => '', packet: () => '', windows: () => '', chart: () => {}, values: () => '', isStatic: true };
}
