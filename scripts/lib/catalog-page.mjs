// 예제 갤러리의 목록 페이지. 예제마다 미리보기, 재생 화면, SVG, 원본 내려받기와 원본 보기를 한 쪽에 둔다. 새 프런트엔드 틀 없이 정적 HTML과 CSS만 쓴다.
import { readFileSync } from 'node:fs';

import { THEME_BUTTONS, THEME_SCRIPT } from '../../src/html/theme.js';
import { STYLES } from '../../src/styles.js';
import { escapeXml } from '../../src/text.js';

const css = readFileSync(new URL('../catalog.css', import.meta.url), 'utf8');
const esc = escapeXml;

// 재생 방식 이름. 장면 표시에 쓴다.
const MODE_LABELS = { static: '정지', once: '한 번', loop: '반복' };

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 본문 글자 수
// basis: estimate
function page(title, content) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · ThinkFlow</title><style>${STYLES.tokens}${STYLES.control}${css}</style><script>${THEME_SCRIPT}</script></head><body><header class="catalog-header"><a href="index.html">ThinkFlow · 예제 갤러리</a><div class="theme app-tablist is-segmented" role="group" aria-label="테마">${THEME_BUTTONS}</div></header><main class="catalog-main">${content}</main></body></html>`;
}

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 장면 수
// basis: estimate
const sceneList = (scenes) => `<ol class="catalog-scenes">${scenes.map(({ label, mode, speed }) => `<li>${esc(label)} <span>${MODE_LABELS[mode]}${speed === 1 ? '' : ` · ${speed}배속`}</span></li>`).join('')}</ol>`;

// cost: time O(f), heap O(f), stack O(1)
// vars: f = 자료 파일 수
// basis: estimate
// 원본이 읽는 자료 파일 링크. 원본을 내려받아 쓰려면 같은 상대 경로에 놓아야 한다.
const supportList = (files) => (files.length ? `<p class="catalog-support">원본이 읽는 자료(원본과 같은 폴더 구조로 받습니다): ${files.map((file) => `<a href="${esc(file)}" download><code>${esc(file)}</code></a>`).join(', ')}</p>` : '');

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 예제 수와 원본 글자 수
// basis: estimate
/**
 * 예제 목록. 구성원은 { id, group, title, subtitle, scenes: [{ label, mode, speed }], source, support?, warnings }다.
 * 그룹마다 제목 아래에 예제 카드를 놓고, 카드마다 원본 전체를 펼쳐 볼 수 있다.
 */
export function galleryPage(entries, heading) {
  const groups = [...new Set(entries.map((entry) => entry.group))];
  const sections = groups.map((group) => {
    const cards = entries.filter((entry) => entry.group === group).map((entry) => `<article class="catalog-card" id="${entry.id}">
<h3>${esc(entry.title)} <code>${esc(entry.id)}.thinkflow</code></h3>
<p>${esc(entry.subtitle ?? '')}</p>
<a class="catalog-preview" href="${entry.id}.html"><img src="${entry.id}.svg" alt="${esc(entry.title)} 첫 장면" loading="lazy"></a>
${sceneList(entry.scenes)}
<nav class="catalog-downloads"><a href="${entry.id}.html">재생 화면 열기</a><a href="${entry.id}.svg">SVG</a><a href="${entry.id}.thinkflow" download>원본 내려받기</a></nav>
${supportList(entry.support ?? [])}
<details><summary>원본 보기</summary><pre><code>${esc(entry.source)}</code></pre></details>
</article>`).join('\n');
    return `<section><h2>${esc(group)}</h2><div class="catalog-grid">${cards}</div></section>`;
  }).join('\n');
  const index = entries.map((entry) => `<li><a href="#${entry.id}">${esc(entry.id)}</a></li>`).join('');
  return page(heading, `<h1>${esc(heading)}</h1><p class="catalog-lead">예제 ${entries.length}개. 첫 장면은 정지 상태이고, 움직이는 장면은 재생 화면의 탭에서 고릅니다.</p><p>수치는 모두 기능을 설명하려고 만든 예시 데이터이며 실제 측정값이 아닙니다.</p><nav aria-label="예제 목록"><ul class="catalog-index">${index}</ul></nav>${sections}`);
}
