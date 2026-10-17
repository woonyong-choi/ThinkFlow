// 재생기 HTML과 목록 쪽 HTML의 파비콘 링크. 라이트와 다크를 media로 가른다.
// README 로고를 탭 아이콘 크기로 줄인 PNG(scripts/build-favicon.mjs가 만든다)를 내장해 단독 HTML에서도 같은 브랜드를 표시한다.
// 원본 로고(약 0.4MB)를 그대로 넣으면 HTML마다 두 장이 base64로 1MB 넘게 늘어난다.
import { readFileSync } from 'node:fs';

const ASSETS = new URL('../../docs/assets/', import.meta.url);
const SCHEMES = ['light', 'dark'];
let cached;

// cost: time O(s), heap O(s), stack O(1), io 2
// vars: s = 탭 아이콘 PNG 바이트 수
// basis: estimate
/** `<link rel="icon">` 두 줄(라이트, 다크). 첫 호출에 파일을 읽고 이후는 같은 글을 돌려준다. */
export function faviconLinks() {
  cached ??= SCHEMES.map((scheme) => {
    const logo = readFileSync(new URL(`torso-favicon${scheme === 'dark' ? '-dark' : ''}.png`, ASSETS));
    return `<link rel="icon" type="image/png" media="(prefers-color-scheme: ${scheme})" href="data:image/png;base64,${logo.toString('base64')}">`; // tokens-allow: 브라우저 탭은 문서 토큰이 닿지 않아 media로 승인된 로고 테마를 선택한다
  }).join('\n');
  return cached;
}
