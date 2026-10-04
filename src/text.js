// SVG에 넣을 글자와 좌표를 다듬는다. 글 폭은 measure/fonts.js가 글꼴 파일로 잰다.
import { coord } from './format.js';

// 글자 크기 대비, 글자 세로 가운데에서 기준선까지의 거리. Pretendard 대문자 높이(0.707em)의 절반에 한글 높이를 맞춘 비율이라 토큰 대상이 아니다.
const CAP_CENTER = 0.36;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** SVG와 HTML 안에 넣을 수 있게 `<`, `>`, `&`, `"`를 바꾼다. */
export function escapeXml(text) {
  return String(text ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 글을 일반 구간과 백틱 코드 구간으로 나눈다. 백틱은 표시 문자라 결과에 없다. 짝이 안 맞으면 마지막 구간이 코드가 된다. */
export function codeParts(text) {
  return String(text ?? '')
    .split('`')
    .map((part, i) => ({ text: part, code: i % 2 === 1 }))
    .filter((part) => part.text);
}

/** 백틱 짝이 맞지 않는 글인가. 원본 검사에서 줄 번호와 함께 알리려고 쓴다. */
export function hasUnpairedBacktick(text) {
  return (String(text ?? '').split('`').length - 1) % 2 === 1;
}

/** 백틱 표시를 지운 글. title, alt처럼 서식을 못 쓰는 자리에 쓴다. */
export function plainText(text) {
  return String(text ?? '').replaceAll('`', '');
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/**
 * SVG text 안에 넣을 글. 백틱 구간은 class="code" tspan으로 그리고, 표시 글자(백틱 뺀 글)의 mutedFrom번째부터는 class="muted"를 붙인다.
 * 코드도 흐림도 없으면 escapeXml과 같다.
 */
export function renderRich(text, mutedFrom = Infinity) {
  let at = 0;
  return codeParts(text)
    .flatMap((part) => {
      const cut = Math.min(part.text.length, Math.max(0, mutedFrom - at));
      at += part.text.length;
      return [
        { text: part.text.slice(0, cut), code: part.code, muted: false },
        { text: part.text.slice(cut), code: part.code, muted: true },
      ];
    })
    .filter((piece) => piece.text)
    .map((piece) => {
      const classes = [piece.code ? 'code' : '', piece.muted ? 'muted' : ''].filter(Boolean).join(' ');
      return classes ? `<tspan class="${classes}">${escapeXml(piece.text)}</tspan>` : escapeXml(piece.text);
    })
    .join('');
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** HTML 글 안에 넣을 글. 백틱 구간은 code 요소로 그린다. */
export function renderRichHtml(text) {
  return codeParts(text)
    .map((part) => (part.code ? `<code>${escapeXml(part.text)}</code>` : escapeXml(part.text)))
    .join('');
}

/** 세로 가운데가 center인 한 줄 글자의 기준선 y. */
export function centerBaseline(center, fontSize) {
  return center + fontSize * CAP_CENTER;
}

/** 좌표를 소수 첫째 자리로 줄인다. SVG 파일 크기를 줄이고 실행 환경마다 다른 끝자리를 없애기 위해서다. */
export const roundCoord = coord;
