// 재생 화면 HTML 한 장. 스크립트, 스타일, 그림을 모두 안에 넣어 파일 하나로 열린다.
import { readFileSync } from 'node:fs';
import { renderScene } from './render.js';
import { DEFS, STYLES } from './styles.js';
import { wrapChip } from './svg.js';
import { escapeXml, roundCoord } from './text.js';
import { tokens, values } from './tokens.js';

const PLAYER = readFileSync(new URL('./player.js', import.meta.url), 'utf8');
export const VIEWER = readFileSync(new URL('./viewer.js', import.meta.url), 'utf8');
// iframe 안에서 열리면 틀을 빼고, 목록 쪽이 iframe 높이를 맞추도록 본문 높이를 알린다. 문서(html) 높이는 iframe 창보다 작아지지 않아 쓰지 않는다.
export const EMBED_SCRIPT = `<script>if (window.self !== window.top) {\n  document.documentElement.classList.add('embedded');\n  addEventListener('load', () => new ResizeObserver(() => parent.postMessage({ d2flowHeight: Math.ceil(document.body.getBoundingClientRect().height) }, '*')).observe(document.body));\n}</script>`;
/** 전체 화면 단추와, 전체 화면에서만 보이는 확대·축소 단추. 아이콘은 viewer.js가 그린다. */
export const VIEW_BUTTONS =
  '<button type="button" class="fl-round fl-full"></button>' +
  '<div class="fl-zoom"><button type="button" class="fl-round" data-zoom="in" aria-label="확대"></button><button type="button" class="fl-round" data-zoom="out" aria-label="축소"></button><button type="button" class="fl-round" data-zoom="fit" aria-label="전체 보기"></button></div>';
// 재생기가 점과 글 상자를 그릴 때 쓰는 값. 브라우저 코드는 tokens.js를 불러올 수 없어 데이터로 넘긴다.
export const PLAYER_METRICS = Object.freeze({
  accent: tokens.color.accent,
  halo: values.size.halo,
  haloOpacity: values.opacity.halo,
  packet: values.size.packet,
  chipRadius: values.radius.lg,
  chipLine: values.size.line['15'],
  chipPadX: values.space['9'],
  chipPadY: values.space['4'],
  chipGap: values.space['6'],
  iconStroke: values.border.edge,
  zoomMax: values.scale['zoom-max'],
  zoomStep: values.scale['zoom-step'],
});

// cost: time O(s + c + h·n² + out), heap O(out), stack O(1), io 1
// vars: c = 선 수, s = 도형 수, h = 글 상자 수, n = 글 상자 글자 수, out = 만든 HTML 글자 수
// basis: estimate
/**
 * 재생기 HTML 문서를 만든다. 그림, 시간표, 재생 스크립트를 모두 안에 넣는다.
 * io 1은 모듈을 불러올 때 player.js를 한 번 읽는 것이다.
 */
export function toHtml({ title, scene, tl }) {
  const itemIndex = new Map(scene.items.map((it, i) => [it.id, i]));
  const data = {
    // 글 상자 글은 움직이는 SVG와 같은 줄로 미리 나눠 넘긴다.
    segs: tl.segs.map((s) => ({ ...s, hops: s.hops.map((h) => (h.data ? { ...h, data: wrapChip(h.data) } : h)) })),
    total: tl.total,
    steps: tl.steps,
    edges: scene.edges.map((e) => [itemIndex.get(e.src) ?? -1, itemIndex.get(e.dst) ?? -1]),
    cards: scene.items.map((it) => (it.cards ? it.cards.length : 0)),
    metrics: PLAYER_METRICS,
  };
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" class="fl" width="${roundCoord(scene.width)}" height="${roundCoord(scene.height)}" style="aspect-ratio: ${roundCoord(scene.width)} / ${roundCoord(scene.height)}" viewBox="0 0 ${roundCoord(scene.width)} ${roundCoord(scene.height)}">` +
    `<defs>${DEFS}</defs>${renderScene(scene)}<g class="fl-packets"></g></svg>`;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(title)}</title>
${EMBED_SCRIPT}
<style>${STYLES.tokens}${STYLES.player}${STYLES.figure}</style>
</head>
<body>
<figure class="fl-figure" tabindex="0">
${VIEW_BUTTONS}
<div class="fl-canvas">${svg}</div>
<figcaption class="fl-foot">
<div class="fl-bar"><button type="button" class="fl-round fl-pause"></button><div class="fl-tabs" role="tablist"></div><button type="button" class="fl-round fl-rate" aria-label="배속">1×</button></div>
<p class="fl-caption" aria-live="polite"></p>
</figcaption>
</figure>
<script>
${VIEWER}
${PLAYER}
d2flowPlay(document.querySelector('.fl-figure'), ${JSON.stringify(data).replace(/</g, '\\u003c')});
</script>
</body>
</html>
`;
}

// cost: time O(f), heap O(out), stack O(1)
// vars: f = 그림 수, out = 만든 HTML 글자 수
// basis: estimate
/**
 * 여러 그림을 한 쪽에서 보는 목록을 만든다. 그림마다 재생 화면을 iframe으로 넣는다.
 * @param figures { name, title, href }[]. href는 목록 쪽에서 본 확장자 뺀 상대 경로다.
 */
export function toGallery(figures) {
  const cards = figures
    .map(
      (f) => `<section><header><h2>${escapeXml(f.name)}</h2><p>${escapeXml(f.title)}</p><nav><a href="${escapeXml(f.href)}.html">열기</a><a href="${escapeXml(f.href)}.svg">SVG</a></nav></header>` +
        `<iframe src="${escapeXml(f.href)}.html" loading="lazy" allowfullscreen title="${escapeXml(f.name)}"></iframe></section>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>d2-flow 예제</title>
<style>${STYLES.tokens}${STYLES.gallery}</style>
</head>
<body>
<h1>d2-flow 예제</h1>
<p>D2 문법으로 적고, Hindsight 모양으로 그리고, 흐름을 입힌 그림 ${figures.length}개</p>
<main>
${cards}
</main>
<script>
// 그림 쪽이 알려 준 문서 높이로 iframe 높이를 맞춘다. 그림 아래 빈 공간을 없애기 위해서다.
addEventListener('message', (e) => {
  const frame = [...document.querySelectorAll('iframe')].find((f) => f.contentWindow === e.source);
  if (frame && e.data?.d2flowHeight) frame.style.height = e.data.d2flowHeight + 'px';
});
</script>
</body>
</html>
`;
}
