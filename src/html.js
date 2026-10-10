// 재생 화면 HTML 한 장과 목록 쪽. 스크립트, 스타일, 글꼴, 그림을 모두 안에 넣어 파일 하나로 열린다.
import { chartMotionCss } from './chart/motion.js';
import { canvasOf } from './canvas.js';
import { createGlyphSet, embedFonts } from './measure/fonts.js';
import { paintCss } from './draw/paint.js';
import { hasStatus } from './draw/status.js';
import { STYLES, tokensFor, figureDefs, patternDefs } from './styles.js';
import { escapeXml, plainText, roundCoord as r } from './text.js';
import { figureContent } from './html/content.js';
import { responsiveContent } from './html/responsive.js';
import { faviconLinks } from './html/favicon.js';
import { THEME_KEY } from './html/theme.js';
import { CANONICAL_NAME, PLAYER_SCRIPT, figureFrame } from './html/player-script.js';
import { roundedNumbers } from './format.js';

// iframe 안에서 열리면 틀을 빼고, 목록 쪽이 iframe 높이를 맞추도록 본문 높이를 알린다. 문서(html) 높이는 iframe 창보다 작아지지 않아 쓰지 않는다.
// 목록 쪽의 라이트·다크 선택은 iframe의 prefers-color-scheme에 안정적으로 전해지지 않아, 목록 쪽이 보내는 테마 메시지로 이 문서의 data-theme을 바꾼다. 처음에는 목록 쪽에 현재 테마를 물어본다.
// 목록 밖에서 따로 열린 재생 화면(목록의 `열기`)은 목록이 기억한 같은 선택(localStorage)을 처음 그리기 전에 읽어 따른다. 그림마다 테마 단추를 두지 않는다(도구 막대와 겹치지 않는다). 고르지 않았거나(시스템) 읽을 수 없으면 시스템 설정을 따른다.
// 이 스크립트는 정본 템플릿의 고정 글이라 내려받은 파일은 바이트까지 같다. 읽는 값은 실행 때만 정해진다.
const EMBED_SCRIPT = `<script>
(() => {
  const root = document.documentElement;
  const apply = (mode) => {
    if (mode === 'light' || mode === 'dark') {
      root.setAttribute('data-theme', mode);
      root.style.colorScheme = mode;
    } else {
      root.removeAttribute('data-theme');
      root.style.colorScheme = '';
    }
  };
  if (window.self === window.top) {
    const saved = () => {
      try {
        return localStorage.getItem('${THEME_KEY}');
      } catch {
        return null;
      }
    };
    apply(saved());
    addEventListener('storage', (e) => e.key === '${THEME_KEY}' && apply(saved()));
    return;
  }
  root.classList.add('embedded');
  addEventListener('message', (e) => {
    if (e.source === parent && e.data && 'theme' in e.data) apply(e.data.theme);
  });
  parent.postMessage({ themeRequest: true }, '*');
  addEventListener('load', () => new ResizeObserver(() => parent.postMessage({ figureHeight: Math.ceil(document.body.getBoundingClientRect().height) }, '*')).observe(document.body));
})();
</script>`;
/**
 * 재생기 HTML 문서. 그림, 시간표, 재생 스크립트를 모두 안에 넣는다.
 * 문서 머리 meta 칸에는 칸이 빈 정본 템플릿(이 문서의 나머지 전부)을 base64로 담는다. 내려받기는 이 정본에 같은 base64를 다시 채우므로 파일이 자기 자신과 바이트까지 같다.
 */
export async function toHtml(result, name) {
  return withCanonical(await canonicalHtml(result, name));
}

// 정본 템플릿 글. 정본 칸(meta content)은 비어 있다.
async function canonicalHtml(result, name) {
  const { figure, timeline } = result;
  const glyphs = createGlyphSet();
  const { content, responsive } = await htmlContent(result, glyphs);
  addTimelineGlyphs(timeline, glyphs);
  const fonts = await embedFonts(glyphs.used);
  const title = plainText(figure.title ?? name);
  const charts = content.hasCharts;
  const defs = documentDefs(figure, [content, responsive?.content]);
  // 점이 나타나는 시각은 배치마다 다르므로(좁은 배치는 선 위치가 다르다) 넓은 배치와 좁은 배치의 시각을 모두 규칙으로 둔다.
  const dotAts = [...new Set([...content.dotAts, ...(responsive?.content.dotAts ?? [])])].sort((a, b) => a - b);
  const styles = [STYLES.control, STYLES.player, STYLES.figure, paintCss(result.scene), STYLES.chart, charts ? chartMotionCss(timeline.growMs, dotAts) : '', hasStatus(timeline) ? STYLES.status : ''].join('');
  const frame = figureFrame({ labels: content.data.steps.map(step => step.label), canvas: panelsMarkup(content, title, defs), style: figure.width === 'wide' ? ` style="--figure-canvas: ${canvasOf(figure)}px"` : '', narrow: responsive ? `<template class="fl-narrow">${panelsMarkup(responsive.content, title)}</template>` : '', source: typeof figure.source === 'string' ? figure.source : undefined });
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(title)}</title>
<meta name="${CANONICAL_NAME}" content="">
${faviconLinks()}
${EMBED_SCRIPT}
<style>${fonts}
${tokensFor(styles + PLAYER_SCRIPT + frame + JSON.stringify(content.data))}${styles}</style>
</head>
<body>
${frame}
<script>
${PLAYER_SCRIPT}
figurePlay(document.querySelector('.fl-figure'), ${JSON.stringify(content.data, roundedNumbers).replace(/</g, '\\u003c')});
</script>
</body>
</html>
`;
}

// cost: time O(c·p), heap O(p), stack O(1)
// vars: c = 차트 수, p = 무늬 정의 수
// basis: estimate
/**
 * 문서에 한 번 두는 정의: 차트 화살표 표식과 모든 판(넓은 배치와 좁은 배치)의 차트가 쓰는 무늬. 무늬 id는 내용에서 만든 값이라(chart/pattern.js) 같은 id는 같은 내용이고, 이 한 벌을 모든 판 SVG가 `url(#id)`로 쓴다.
 * @param contents 그림 내용 목록(figureContent 결과, 없는 것은 건너뛴다)
 */
function documentDefs(figure, contents) {
  return figureDefs(figure) + patternDefs(contents.flatMap((content) => content?.charts ?? []));
}

// 그림 내용과, 좁은 배치가 있으면 그 내용.
async function htmlContent(result, glyphs) {
  const content = figureContent(result, glyphs);
  const responsive = await responsiveContent(result, glyphs);
  if (responsive) content.data.responsive = { breakpoint: responsive.breakpoint, data: responsive.content.data };
  return { content, responsive };
}

// cost: time O(b·h), heap O(1), stack O(1)
// vars: b = 박자 수, h = 박자의 이동 수
// basis: estimate
// 재생기가 장면 탭 이름과 이동 글로 그리는 글자를 글꼴 부분 집합에 더한다. 단계 값은 { label, mode, speed } 정본이다.
function addTimelineGlyphs(timeline, glyphs) {
  for (const { label } of timeline.steps) {
    glyphs.add(label, 'regular');
    glyphs.add(label, 'semibold');
  }
  for (const seg of timeline.segs) for (const hop of seg.hops) for (const line of hop.data ?? []) glyphs.add(line, 'regular');
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 정본 글자 수
// basis: estimate
// 정본 템플릿의 빈 칸에 템플릿 자신의 base64를 채운다. 칸 머리글이 템플릿에 정확히 하나여야 내려받기(player/export.js)가 같은 자리를 찾는다. base64는 `<`, `"`, `&`를 담지 않아 속성 값 밖으로 나가지 않는다.
function withCanonical(template) {
  const head = `<meta name="${CANONICAL_NAME}" content="`;
  if (template.split(head).length !== 2) throw new Error('정본 칸이 문서에 하나만 있어야 한다');
  const at = template.indexOf(head) + head.length;
  return template.slice(0, at) + Buffer.from(template, 'utf8').toString('base64') + template.slice(at);
}

// cost: time O(p + out), heap O(out), stack O(1)
// vars: p = 판 수, out = 만든 글자 수
// basis: estimate
/**
 * 그림 판 묶음 마크업. 판마다 구역(section)과 SVG 한 장이고, 판 상자가 viewBox다.
 * 판의 표시 폭은 보기 폭에 대한 판 상자 폭 비율이고 모든 판이 같은 보기 폭으로 나눈다. 비율은 1을 넘지 않아 판은 자연 크기보다 커지지 않고, 좁은 화면에서는 묶음 전체가 같은 비율로 줄어 구역 안에 다 들어온다.
 * 판이 하나뿐인 그림은 둘레 여백을 걷은 보기 영역(data.tight)을 viewBox로 쓸 수 있도록 재생기가 맞춘다(player/play.js).
 * 보기 폭(--view-w)은 판 가운데 가장 넓은 것(content.width)이다. 묶음 폭은 min(구역 폭, 표준 캔버스 폭, 보기 폭)이라 작은 자연 폭은 줄지 않고 가운데에 놓인다.
 * 마커와 차트 무늬 정의(defs, documentDefs)는 문서에 한 번만 둔다(보이지 않는 SVG). 판 SVG들이 같은 문서 id로 쓰므로 판마다 정의를 복사하지 않아 문서 안 id가 겹치지 않는다.
 */
function panelsMarkup(content, title, defs) {
  const view = content.width;
  const panels = content.panels.map((panel, i) => {
    const { box } = panel;
    const label = panel.label ?? (content.panels.length > 1 ? panel.view : undefined);
    const head = i === 0 ? `<title>${escapeXml(title)}</title>` : '';
    const name = i === 0 || !label ? '' : ` aria-label="${escapeXml(plainText(label))}"`;
    return (
      `<section class="dp-panel" data-view="${escapeXml(panel.view)}" data-strategy="${panel.strategy}" style="--panel-w: ${r(box.w)}">` +
      `<svg xmlns="http://www.w3.org/2000/svg" class="fl" style="aspect-ratio: ${r(box.w)} / ${r(box.h)}" viewBox="${r(box.x)} ${r(box.y)} ${r(box.w)} ${r(box.h)}" role="img"${name}>${head}${panel.svg}</svg>` +
      `</section>`
    );
  });
  return `<div class="dp-panels" style="--view-w: ${r(view)}">${panels.join('')}</div>${defs ? `<svg class="dp-defs" width="0" height="0" aria-hidden="true"><defs>${defs}</defs></svg>` : ''}`;
}

export { toDocument, toGallery } from './html/listing.js';
