// 여러 그림을 한 쪽에서 보는 목록과 문서 안 모습 미리보기.
import { bindDiagramHost } from '../vendor/theme/ui/runtime/diagram-host.js';
import { STYLES } from '../styles.js';
import { escapeXml, plainText, renderRichHtml } from '../text.js';
import { hrefAttr } from '../href.js';
import { faviconLinks } from './favicon.js';
import { THEME_BUTTONS, THEME_SCRIPT } from './theme.js';

const GALLERY_SCRIPT = `<script>${bindDiagramHost.toString()}; bindDiagramHost();</script>`;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 이름과 제목 글자 수
// basis: estimate
// 카드 머리와 문서 미리보기 절 제목. 원본 파일 이름(코드 글꼴)과 종류 꼬리표가 기본이다. 그림이 제목을 직접 그리는 차트는 그림 제목을 되풀이하지 않고, 그리지 않는 그림(흐름, 순서, 상태, 데이터)만 제목을 앞에 붙인다. 세 요소는 따로 놓인 flex 칸이라 간격과 기준선을 CSS가 정한다.
function cardHead({ name, ext = '.dap', title, kind, isChart }) {
  const heading = title && !isChart ? `<span class="title">${renderRichHtml(title)}</span>` : '';
  return `<h2>${heading}<code class="name">${escapeXml(name)}${escapeXml(ext)}</code><span class="kind">${escapeXml(kind)}</span></h2>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 그림 재생 화면의 파일 이름(확장자 없이). 따로 정한 이름(`page`)이 없으면 `href`다.
const pageOf = ({ href, page }) => (page ?? href);

// cost: time O(f), heap O(out), stack O(1)
// vars: f = 그림 수, out = 만든 HTML 글자 수
// basis: estimate
/**
 * 여러 그림을 한 쪽에서 보는 목록. 그림마다 재생 화면을 iframe으로 넣는다.
 * @param figures { name, ext?, title, kind, isChart, href, page? }[]. href는 목록 쪽에서 본 확장자 뺀 상대 경로 원본 글자다(인코딩은 여기서 한다). page는 재생 화면 파일 이름(확장자 없이, 같은 폴더)이고 없으면 href와 같다.
 */
export function toGallery(figures, heading) {
  const cards = figures
    .map(
      (f) =>
        `<section><header>${cardHead(f)}<nav><a href="${hrefAttr(`${pageOf(f)}.html`)}">열기</a><a href="${hrefAttr(`${f.href}.svg`)}">SVG</a></nav></header>` +
        `<iframe data-diagram src="${hrefAttr(`${pageOf(f)}.html`)}" loading="lazy" allowfullscreen title="${escapeXml(f.name)}"></iframe></section>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(heading)}</title>
${faviconLinks()}
<style>${STYLES.tokens}${STYLES.control}${STYLES.gallery}</style>
<script>${THEME_SCRIPT}</script>
</head>
<body>
<div class="top">
<h1>${escapeXml(heading)}</h1>
<p>그림 ${figures.length}개 · <a href="document.html">문서 안 모습 보기</a></p>
<div class="theme app-tablist is-segmented" role="group" aria-label="테마">${THEME_BUTTONS}</div>
</div>
<main>
${cards}
</main>
${GALLERY_SCRIPT}
</body>
</html>
`;
}

// cost: time O(f), heap O(out), stack O(1)
// vars: f = 그림 수, out = 만든 HTML 글자 수
// basis: estimate
/**
 * 문서(README) 안 모습 미리보기. 그림마다 움직이는 SVG를 img로 넣는다(GitHub README와 같은 방식).
 * @param figures { name, ext?, title, kind, isChart, href }[]. href는 이 쪽에서 본 확장자 뺀 상대 경로 원본 글자다(인코딩은 여기서 한다).
 */
export function toDocument(figures, heading) {
  const sections = figures
    .map((f) => `${cardHead(f)}\n<p class="figure-open"><a href="${hrefAttr(`${pageOf(f)}.html`)}">글자를 크게 보고 재생하기</a></p>\n<p class="figure"><a href="${hrefAttr(`${pageOf(f)}.html`)}" aria-label="${escapeXml(plainText(f.title || f.name))} 크게 보기"><img src="${hrefAttr(`${f.href}.svg`)}" alt="${escapeXml(plainText(f.title || f.name))}"></a></p>`)
    .join('\n');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(heading)} 문서 미리보기</title>
${faviconLinks()}
<style>${STYLES.tokens}${STYLES.control}${STYLES.document}</style>
<script>${THEME_SCRIPT}</script>
</head>
<body>
<div class="bar">
<a href="index.html">목록으로</a>
<div class="theme app-tablist is-segmented" role="group" aria-label="테마">${THEME_BUTTONS}</div>
</div>
<article>
<h1>${escapeXml(heading)}</h1>
<p>문서에 넣는 SVG의 전체 구성을 보는 미리보기입니다. 그림은 화면 폭에 맞춰 전체가 보이고, 전체화면에서는 확대하고 이동할 수 있습니다.</p>
${sections}
</article>
</body>
</html>
`;
}
