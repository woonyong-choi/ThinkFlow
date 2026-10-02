// 여러 그림을 한 쪽에서 보는 목록과 문서 안 모습 미리보기.
import { STYLES } from '../styles.js';
import { escapeXml, plainText, renderRichHtml } from '../text.js';
import { THEME_BUTTONS, THEME_SCRIPT } from './theme.js';

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 이름과 제목 글자 수
// basis: estimate
// 카드 머리와 문서 미리보기 절 제목. 원본 파일 이름(코드 글꼴)과 종류 꼬리표가 기본이다. 그림이 제목을 직접 그리는 차트는 그림 제목을 되풀이하지 않고, 그리지 않는 그림(흐름, 순서, 상태, 데이터)만 제목을 앞에 붙인다. 세 요소는 따로 놓인 flex 칸이라 간격과 기준선을 CSS가 정한다.
function cardHead({ name, title, kind, isChart }) {
  const heading = title && !isChart ? `<span class="title">${renderRichHtml(title)}</span>` : '';
  return `<h2>${heading}<code class="name">${escapeXml(name)}.muto</code><span class="kind">${escapeXml(kind)}</span></h2>`;
}

// cost: time O(f), heap O(out), stack O(1)
// vars: f = 그림 수, out = 만든 HTML 글자 수
// basis: estimate
/**
 * 여러 그림을 한 쪽에서 보는 목록. 그림마다 재생 화면을 iframe으로 넣는다.
 * @param figures { name, title, kind, isChart, href }[]. href는 목록 쪽에서 본 확장자 뺀 상대 경로다.
 */
export function toGallery(figures, heading) {
  const cards = figures
    .map(
      (f) =>
        `<section><header>${cardHead(f)}<nav><a href="${escapeXml(f.href)}.html">열기</a><a href="${escapeXml(f.href)}.svg">SVG</a></nav></header>` +
        `<iframe src="${escapeXml(f.href)}.html" loading="lazy" allowfullscreen title="${escapeXml(f.name)}"></iframe></section>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(heading)}</title>
<style>${STYLES.tokens}${STYLES.control}${STYLES.gallery}</style>
<script>${THEME_SCRIPT}</script>
</head>
<body>
<div class="top">
<h1>${escapeXml(heading)}</h1>
<p>그림 ${figures.length}개 · <a href="document.html">문서 안 모습 보기</a></p>
<div class="theme" role="group" aria-label="테마">${THEME_BUTTONS}</div>
</div>
<main>
${cards}
</main>
<script>
// 그림 쪽이 알려 준 본문 높이로 iframe 높이를 맞추고(그림 아래 빈 공간을 없애기 위해서다), 새로 뜬 그림에는 현재 테마를 보낸다.
addEventListener('message', (e) => {
  const frame = [...document.querySelectorAll('iframe')].find((f) => f.contentWindow === e.source);
  if (!frame) return;
  if (e.data?.figureHeight) frame.style.height = e.data.figureHeight + 'px';
  if (e.data?.themeRequest) frame.contentWindow.postMessage({ theme: savedTheme() }, '*');
});
</script>
</body>
</html>
`;
}

// cost: time O(f), heap O(out), stack O(1)
// vars: f = 그림 수, out = 만든 HTML 글자 수
// basis: estimate
/**
 * 문서(README) 안 모습 미리보기. 그림마다 움직이는 SVG를 img로 넣는다(GitHub README와 같은 방식).
 * @param figures { name, title, kind, isChart, href }[]. href는 이 쪽에서 본 확장자 뺀 상대 경로다.
 */
export function toDocument(figures, heading) {
  const sections = figures
    .map((f) => `${cardHead(f)}\n<p class="figure"><img src="${escapeXml(f.href)}.svg" alt="${escapeXml(plainText(f.title || f.name))}"></p>`)
    .join('\n');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(heading)} 문서 미리보기</title>
<style>${STYLES.tokens}${STYLES.control}${STYLES.document}</style>
<script>${THEME_SCRIPT}</script>
</head>
<body>
<div class="bar">
<a href="index.html">목록으로</a>
<div class="theme" role="group" aria-label="테마">${THEME_BUTTONS}</div>
</div>
<article>
<h1>${escapeXml(heading)}</h1>
<p>문서에 넣은 모습 그대로 보는 미리보기다. 그림은 움직이는 SVG 파일을 img로 넣은 것이라 회색 판이 흰 문서 위에서 그림 경계를 만든다.</p>
${sections}
</article>
</body>
</html>
`;
}
