// 재생 화면 HTML 한 장과 목록 쪽. 스크립트, 스타일, 글꼴, 그림을 모두 안에 넣어 파일 하나로 열린다.
import { readFileSync } from 'node:fs';
import { chartMotionCss } from './chart/motion.js';
import { canvasOf, fitCanvas } from './canvas.js';
import { LUCIDE_ICONS } from './icons/lucide/icons.js';
import { createGlyphSet, embedFonts } from './measure/fonts.js';
import { paintCss } from './draw/paint.js';
import { hasStatus } from './draw/status.js';
import { DEFS, STYLES } from './styles.js';
import { escapeXml, plainText, roundCoord as r } from './text.js';
import { values } from './tokens.js';
import { chartContent, figureContent } from './html/content.js';
import { faviconLinks } from './html/favicon.js';
import { roundedNumbers } from './format.js';

// 브라우저 스크립트 파일(src/player/). 한 스크립트로 이어 붙여 HTML에 넣는다.
const PLAYER_FILES = ['view', 'play', 'controls', 'stage', 'curve', 'values'];
// 단계별 도형 상태와 구간별 이동 시간을 쓰는 그림에만 뒤에 붙는 재생기 파일. 앞 파일의 함수를 감싸서 이 기능을 쓰지 않는 그림의 재생기 글은 그대로다.
const PLAYER_EXTRAS = { pace: 'pace', status: 'status' };
// 조작부 아이콘: Lucide(ISC) 24 격자 외곽선 아이콘의 도형(src/icons/lucide/icons.js)을 재생기 스크립트 앞에 상수로 붙인다. 선 굵기와 끝 모양은 그리는 쪽(view.js)이 정한다.
const UI_ICONS = LUCIDE_ICONS;
const UI_ICON_SCRIPT = `const UI_ICONS = ${JSON.stringify(UI_ICONS).replace(/</g, '\\u003c')};\n`;
const readPlayerFile = (name) => readFileSync(new URL(`./player/${name}.js`, import.meta.url), 'utf8');
const PLAYER = UI_ICON_SCRIPT + PLAYER_FILES.map(readPlayerFile).join('\n');
const PLAYER_EXTRA = Object.fromEntries(Object.entries(PLAYER_EXTRAS).map(([key, name]) => [key, readPlayerFile(name)]));

// cost: time O(b·h), heap O(1), stack O(1)
// vars: b = 구간 수, h = 구간의 이동 수
// basis: estimate
// 재생기 스크립트. 구간별 이동 시간(hop.pace)이나 단계별 도형 상태(seg.status)를 쓰는 시간표에만 그 파일을 뒤에 붙인다.
function playerScript(timeline) {
  const extras = [...(timeline.segs.some((seg) => seg.hops.some((hop) => hop.pace)) ? [PLAYER_EXTRA.pace] : []), ...(hasStatus(timeline) ? [PLAYER_EXTRA.status] : [])];
  return [PLAYER, ...extras].join('\n');
}
// iframe 안에서 열리면 틀을 빼고, 목록 쪽이 iframe 높이를 맞추도록 본문 높이를 알린다. 문서(html) 높이는 iframe 창보다 작아지지 않아 쓰지 않는다.
// 목록 쪽의 라이트·다크 선택은 iframe의 prefers-color-scheme에 안정적으로 전해지지 않아, 목록 쪽이 보내는 테마 메시지로 이 문서의 data-theme을 바꾼다. 처음에는 목록 쪽에 현재 테마를 물어본다.
const EMBED_SCRIPT = `<script>if (window.self !== window.top) {
  document.documentElement.classList.add('embedded');
  addEventListener('message', (e) => {
    if (e.source !== parent || !e.data || !('theme' in e.data)) return;
    const root = document.documentElement;
    if (e.data.theme === 'light' || e.data.theme === 'dark') {
      root.setAttribute('data-theme', e.data.theme);
      root.style.colorScheme = e.data.theme;
    } else {
      root.removeAttribute('data-theme');
      root.style.colorScheme = '';
    }
  });
  parent.postMessage({ themeRequest: true }, '*');
  addEventListener('load', () => new ResizeObserver(() => parent.postMessage({ figureHeight: Math.ceil(document.body.getBoundingClientRect().height) }, '*')).observe(document.body));
}</script>`;
// 원 단추 하나. 일시정지, 배속, 전체 화면, 확대·축소가 모두 이 구성을 쓴다. 아이콘이 필요한 단추는 player/view.js와 player/controls.js가 그린다.
function roundButton(extraClass, { label, zoom, content = '' } = {}) {
  const className = extraClass ? `fl-round ${extraClass}` : 'fl-round';
  const labelAttr = label ? ` aria-label="${label}"` : '';
  const zoomAttr = zoom ? ` data-zoom="${zoom}"` : '';
  return `<button type="button" class="${className}"${zoomAttr}${labelAttr}>${content}</button>`;
}

// 일시정지 단추 둘레의 진행 고리. 단추 바깥 테두리(size.control.outer)를 덮고, 선 굵기의 한가운데가 둘레다. 12시에서 시작한다.
const RING_START_DEGREES = -90;
function ringSvg() {
  const size = values.size.control.outer;
  const width = values.simple2['progress-stroke'];
  const center = size / 2;
  const radius = (size - width) / 2;
  const start = `rotate(${RING_START_DEGREES} ${center} ${center})`;
  return `<svg class="fl-ring" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="fl-ring-fill" cx="${center}" cy="${center}" r="${radius}" stroke-width="${width}" stroke-linecap="round" transform="${start}"/></svg>`;
}

// 전체 화면 단추와, 전체 화면에서만 보이는 확대·축소 단추.
const VIEW_BUTTONS =
  roundButton('fl-full') +
  `<div class="fl-zoom">${roundButton('', { label: '확대', zoom: 'in' })}${roundButton('', { label: '축소', zoom: 'out' })}${roundButton('', { label: '전체 보기', zoom: 'fit' })}</div>`;
const PAUSE_BUTTON = roundButton('fl-pause', { content: `${ringSvg()}<span class="fl-pause-icon"></span>` });
const RATE_BUTTON = roundButton('fl-rate', { label: '배속', content: '1×' });

// cost: time O(s + e + b·(e + k) + out), heap O(out), stack O(1), io 1
// vars: s = 도형 수, e = 선 수, b = 박자 수, k = 카드 있는 도형 수, out = 만든 HTML 글자 수
// basis: estimate
/** 재생기 HTML 문서. 그림, 시간표, 재생 스크립트를 모두 안에 넣는다. */
export async function toHtml(result, name) {
  const { figure, timeline } = result;
  const glyphs = createGlyphSet();
  const content = result.chart ? chartContent(result, glyphs) : figureContent(result, glyphs);
  addTimelineGlyphs(timeline, glyphs);
  const fonts = await embedFonts(glyphs.used);
  const svg = playerSvg(content, plainText(figure.title ?? name), canvasOf(figure));
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(plainText(figure.title ?? name))}</title>
${faviconLinks()}
${EMBED_SCRIPT}
<style>${fonts}
${STYLES.tokens}${STYLES.control}${STYLES.player}${STYLES.figure}${paintCss(result.scene)}${STYLES.chart}${result.chart ? chartMotionCss(timeline.growMs, result.chart.dotAts) : ''}${hasStatus(timeline) ? STYLES.status : ''}</style>
</head>
<body>
<figure class="fl-figure${result.chart ? ' fl-chart-page' : ''}" tabindex="0"${figure.width === 'wide' ? ` style="--figure-canvas: ${canvasOf(figure)}px"` : ''}>
${VIEW_BUTTONS}
<div class="fl-canvas">${svg}</div>
<figcaption class="fl-foot">
<div class="fl-context"><span class="fl-position" aria-label="현재 단계"></span><p class="fl-caption" aria-live="polite"></p></div>
<div class="fl-bar">${PAUSE_BUTTON}<div class="fl-tabs" role="tablist" aria-label="장면 선택"></div>${RATE_BUTTON}</div>
</figcaption>
</figure>
<script>
${playerScript(timeline)}
figurePlay(document.querySelector('.fl-figure'), ${JSON.stringify(content.data, roundedNumbers).replace(/</g, '\\u003c')});
</script>
</body>
</html>
`;
}

// cost: time O(b·h), heap O(1), stack O(1)
// vars: b = 박자 수, h = 박자의 이동 수
// basis: estimate
// 재생기가 설명, 단계 이름, 이동 글로 그리는 글자를 글꼴 부분 집합에 더한다.
function addTimelineGlyphs(timeline, glyphs) {
  glyphs.add('0123456789 /×.', 'regular');
  for (const label of timeline.steps) {
    glyphs.add(label, 'regular');
    glyphs.add(label, 'semibold');
  }
  for (const seg of timeline.segs) {
    glyphs.add(seg.caption, 'regular');
    for (const hop of seg.hops) for (const line of hop.data ?? []) glyphs.add(line, 'regular');
  }
}

// 재생기 SVG. 표시 폭은 SVG 파일과 같은 표준 캔버스 폭이다. 좁은 내용은 viewBox를 왼쪽으로 넓혀 가운데에 두고, 넓은 내용은 viewBox 그대로 표시 폭만 줄인다.
function playerSvg(content, title, canvas) {
  const { height } = content;
  const { viewWidth, shownWidth, shownHeight } = fitCanvas(content.width, height, canvas);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="fl" width="${r(shownWidth)}" height="${r(shownHeight)}" style="aspect-ratio: ${r(viewWidth)} / ${r(height)}" viewBox="${r((content.width - viewWidth) / 2)} 0 ${r(viewWidth)} ${r(height)}" role="img">` +
    `<title>${escapeXml(title)}</title><defs>${DEFS}</defs>${content.svg}<g class="fl-packets"></g>${content.pills ?? ''}</svg>`
  );
}

export { toDocument, toGallery } from './html/listing.js';
