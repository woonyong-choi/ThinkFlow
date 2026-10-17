// 여러 그림을 한 쪽에서 보는 목록과 문서 안 모습 미리보기.
import { bindDiagramHost } from '@woonyong-choi/design-tokens/ui/runtime/diagram-host.js';
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
function cardHead({ name, ext = '.torso', title, kind, isChart }) {
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
  return galleryDocument(heading, cards, { count: figures.length });
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

// 재생 방식 이름. 장면 표시에 쓴다.
const MODE_LABELS = { static: '정지', once: '한 번', loop: '반복' };

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 장면 수
// basis: estimate
const sceneList = (scenes) => `<ol class="catalog-scenes">${scenes.map(({ label, mode, speed }) => `<li>${escapeXml(label)} <span>${MODE_LABELS[mode]}${speed === 1 ? '' : ` · ${speed}배속`}</span></li>`).join('')}</ol>`;

// cost: time O(f), heap O(f), stack O(1)
// vars: f = 자료 파일 수
// basis: estimate
// 원본이 읽는 자료 파일 링크. 원본을 내려받아 쓰려면 같은 상대 경로에 놓아야 한다.
const supportList = (files) => (files.length ? `<p class="catalog-support">원본이 읽는 자료(원본과 같은 폴더 구조로 받습니다): ${files.map((file) => `<a href="${hrefAttr(file)}" download><code>${escapeXml(file)}</code></a>`).join(', ')}</p>` : '');

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 예제 수와 원본 글자 수
// basis: estimate
/**
 * 예제 목록. 구성원은 { id, group, title, subtitle, scenes: [{ label, mode, speed }], source, support?, warnings }다.
 * 그룹마다 제목 아래에 예제 카드를 놓고, 카드마다 원본 전체를 펼쳐 볼 수 있다.
 */
export function toExamples(entries, heading) {
  const groups = [...new Set(entries.map((entry) => entry.group))];
  const sections = groups.map((group) => {
    const cards = entries.filter((entry) => entry.group === group).map((entry) => `<article class="catalog-card" id="${escapeXml(entry.id)}">
<h3>${escapeXml(entry.title)} <code>${escapeXml(entry.id)}.torso</code></h3>
<p>${escapeXml(entry.subtitle ?? '')}</p>
<a class="catalog-preview" href="${hrefAttr(`${entry.id}.html`)}"><img src="${hrefAttr(`${entry.id}.svg`)}" alt="${escapeXml(entry.title)} 첫 장면" loading="lazy"></a>
${sceneList(entry.scenes)}
<nav class="catalog-downloads"><a href="${hrefAttr(`${entry.id}.html`)}">재생 화면 열기</a><a href="${hrefAttr(`${entry.id}.svg`)}">SVG</a><a href="${hrefAttr(`${entry.id}.torso`)}" download>원본 내려받기</a></nav>
${supportList(entry.support ?? [])}
<details><summary>원본 보기</summary><pre><code>${escapeXml(entry.source)}</code></pre></details>
</article>`).join('\n');
    return `<section><h2>${escapeXml(group)}</h2><div class="catalog-grid">${cards}</div></section>`;
  }).join('\n');
  const index = entries.map((entry) => `<li><a href="#${escapeXml(encodeURIComponent(entry.id))}">${escapeXml(entry.id)}</a></li>`).join('');
  return galleryDocument(heading, `<h1>${escapeXml(heading)}</h1><p class="catalog-lead">예제 ${entries.length}개. 첫 장면은 정지 상태이고, 움직이는 장면은 재생 화면의 탭에서 고릅니다.</p><p>수치는 모두 기능을 설명하려고 만든 예시 데이터이며 실제 측정값이 아닙니다.</p><nav aria-label="예제 목록"><ul class="catalog-index">${index}</ul></nav>${sections}`);
}

function galleryDocument(heading, content, { count } = {}) {
  const examples = count === undefined;
  const top = examples
    ? `<a href="index.html">Torso · 예제 갤러리</a>`
    : `<h1>${escapeXml(heading)}</h1><p>그림 ${count}개 · <a href="document.html">문서 안 모습 보기</a></p>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeXml(heading)}</title>${faviconLinks()}<style>${STYLES.tokens}${STYLES.control}${STYLES.gallery}</style><script>${THEME_SCRIPT}</script></head><body${examples ? ' class="is-examples"' : ''}><div class="top${examples ? ' catalog-header' : ''}">${top}<div class="theme app-tablist is-segmented" role="group" aria-label="테마">${THEME_BUTTONS}</div></div><main${examples ? ' class="catalog-main"' : ''}>${content}</main>${GALLERY_SCRIPT}</body></html>`;
}
