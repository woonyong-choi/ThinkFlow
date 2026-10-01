// 브라우저 없이 글자 폭을 어림하고, 줄을 나누고, SVG에 넣을 글자를 다듬는다.
// 폭은 상자를 놓을 만큼만 맞으면 된다. 실제 글꼴과 조금 달라도 된다.

// 글자 크기 대비, 글자 세로 가운데에서 기준선까지의 거리. 글꼴 모양에서 온 측정 비율이라 토큰 대상이 아니다.
const CAP_CENTER = 0.39;

// 한글, 한자, 가나처럼 글자 하나가 정사각형에 가까운 문자인지 본다.
function isWide(c) {
  const p = c.codePointAt(0);
  return (p >= 0x1100 && p <= 0x115f) || p >= 0x2e80;
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 비례 글꼴로 쓴 글자 폭. 좁은 글자, 대문자와 숫자, 넓은 글자를 나눠 어림한다. */
export function measureText(text, size) {
  let width = 0;
  for (const c of String(text ?? '')) {
    if (isWide(c)) width += size * 0.96;
    else if (c === ' ') width += size * 0.28;
    else if (/[A-Z0-9]/.test(c)) width += size * 0.62;
    else if (/[iljtf.,:;'|!()[\]]/.test(c)) width += size * 0.3;
    else width += size * 0.53;
  }
  return width;
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 고정폭 글꼴로 쓴 글자 폭. 라틴 글자는 0.61em, 넓은 글자는 1em이다. */
export function measureMono(text, size) {
  let width = 0;
  for (const c of String(text ?? '')) width += size * (isWide(c) ? 1 : 0.61);
  return width;
}

// cost: time O(n²), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
// alt: 줄마다 폭을 누적. time O(n), heap O(n). 잃는 것: 공백 폭 계산의 단순함
/**
 * `width`에 맞게 줄을 나눈다. 원래 있던 줄바꿈은 지킨다.
 * 띄어쓰기 없는 긴 낱말은 글자 단위로 자른다.
 */
export function wrapText(text, width, size) {
  const lines = [];
  for (const paragraph of String(text ?? '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (measureText(next, size) <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      for (const c of word) {
        if (line && measureText(line + c, size) > width) {
          lines.push(line);
          line = '';
        }
        line += c;
      }
    }
    lines.push(line);
  }
  return lines;
}

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
