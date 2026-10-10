// 재생기 HTML과 목록 쪽 HTML의 파비콘 링크. 라이트와 다크를 media로 가른다.
// 파비콘 SVG의 획 색은 화면 토큰이 아니라 로고 파일 자체의 값이라 이 폴더가 아닌 docs/assets의 파일을 읽어 넣는다(토큰 검사는 SVG 파일을 보지 않는다).
import { readFileSync } from 'node:fs';

const ASSETS = new URL('../../docs/assets/', import.meta.url);
const SCHEMES = ['light', 'dark'];
let cached;

// cost: time O(s), heap O(s), stack O(1), io 2
// vars: s = 파비콘 SVG 글자 수
// basis: estimate
/** `<link rel="icon">` 두 줄(라이트, 다크). 첫 호출에 파일을 읽고 이후는 같은 글을 돌려준다. */
export function faviconLinks() {
  cached ??= SCHEMES.map((scheme) => {
    const svg = readFileSync(new URL(`thinkflow-favicon-${scheme}.svg`, ASSETS));
    return `<link rel="icon" type="image/svg+xml" media="(prefers-color-scheme: ${scheme})" href="data:image/svg+xml;base64,${svg.toString('base64')}">`; // tokens-allow: 브라우저 탭 아이콘은 문서 색 토큰이 닿지 않는 자리라 media가 라이트와 다크 파일을 고른다. 획 색은 로고 SVG 파일 자체의 값이다
  }).join('\n');
  return cached;
}
