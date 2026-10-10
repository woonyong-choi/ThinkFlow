// 도형, 그룹, 카드 내용이 고른 모습을 읽는 한 곳. 모습은 색 이름(tone)과 표현(appearance) 둘이다.
// tone은 tone.js의 색 이름(범주 계열과 gray)이고, appearance는 plain(중립 면과 경계, 색은 아이콘과 작은 표식만), filled(같은 계열의 옅은 면), outline(같은 계열 경계와 중립 면)이다. 기본은 plain이다.
// tone이 없으면 appearance는 아무것도 바꾸지 않는다. 문법이 모형에 넘기는 값은 이 둘뿐이다.

/**
 * 도형이나 그룹이 고른 모습 { tone, appearance }. 고른 색이 없으면 tone이 undefined다.
 * @param item scene.items나 scene.groups의 원소
 */
export function lookOf(item) {
  return item.tone === undefined ? { tone: undefined, appearance: 'plain' } : { tone: item.tone, appearance: item.appearance ?? 'plain' };
}

/**
 * 카드 내용(`show`)이 고른 면 { tone, appearance }. 줄의 tone은 태그의 색이라, 면은 appearance가 plain이 아닐 때만 그 tone으로 칠한다.
 * @param row 카드 줄(show 한 줄)
 */
export function faceOf(row) {
  const isFace = row.appearance !== undefined && row.appearance !== 'plain' && row.tone !== undefined;
  return isFace ? { tone: row.tone, appearance: row.appearance } : { tone: undefined, appearance: 'plain' };
}

/** CSS class 글. 고른 색이 없으면 빈 글이다(앞에 공백 포함). */
export function lookClass({ tone, appearance }) {
  return tone === undefined ? '' : ` tn-${tone} ap-${appearance}`;
}
