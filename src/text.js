// SVG에 넣을 글자와 좌표를 다듬는다. 글 폭은 measure/fonts.js가 글꼴 파일로 잰다.

// 글자 크기 대비, 글자 세로 가운데에서 기준선까지의 거리. Pretendard 대문자·한글 높이에서 온 비율이라 토큰 대상이 아니다.
const CAP_CENTER = 0.36;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** SVG와 HTML 안에 넣을 수 있게 `<`, `>`, `&`, `"`를 바꾼다. */
export function escapeXml(text) {
  return String(text ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
}

/** 세로 가운데가 center인 한 줄 글자의 기준선 y. */
export function centerBaseline(center, fontSize) {
  return center + fontSize * CAP_CENTER;
}

/** 좌표를 소수 첫째 자리로 줄인다. SVG 파일 크기를 줄이기 위해서다. */
export function roundCoord(value) {
  return Math.round(value * 10) / 10;
}
