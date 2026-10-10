// 값에 묶인 차트의 프레임을 표식 이름으로 맞춘다. 그리기가 표식 이름과 원자료(`data-mark`, `data-mark-text`, `data-raw`)를 직접 붙이므로(marks.js)
// 여기서는 그림 구조를 정규식으로 추측하지 않고 이름이 붙은 요소만 읽는다. 모든 칸에 표식이 늘 있으니 값이 0에서 양수로 바뀌어도 구조가 같다.
// 강조는 원자료가 달라진 표식만 받는다. 위치만 달라진 표식(퍼센트에서 다른 조각, 축이 같을 때 움직인 선)은 조용히 옮겨진다.
import { tokenize } from '../chart-tokens.js';

// 프레임 상태에서 빼는 속성: 이름, 원자료, 갱신 효과의 색은 프레임이 바꾸는 속성이 아니다.
export const IDENTITY = new Set(['data-mark', 'data-mark-text', 'data-raw', 'data-effect']);

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 토큰 수
// basis: estimate
// 요소 바로 뒤에 오는 글 낱말(열린 요소 뒤 글, 그 뒤에 닫는 태그가 온다). 글이 없으면 undefined다.
const textAfter = (tokens, index) => (tokens[index]?.type === 'open' && tokens[index + 1]?.type === 'text' && tokens[index + 2]?.type === 'close' ? tokens[index + 1].text : undefined);

// cost: time O(n), heap O(m), stack O(1)
// vars: n = 토큰 수, m = 표식 수
// basis: estimate
/**
 * 이름이 붙은 요소들. 글 요소(`data-mark-text`)와 면 요소(`data-mark`)를 모두 문서 순서로 돌려준다.
 * @returns { id, tag, isText, index, attrs, text, raw }[]
 * @throws Error 같은 이름이 둘 이상일 때
 */
function markedElements(body) {
  const tokens = tokenize(body);
  const seen = new Set();
  return tokens.flatMap((token, index) => {
    const attr = (name) => token.attrs?.find(([key]) => key === name)?.[1];
    const isText = attr('data-mark-text') !== undefined;
    const id = isText ? attr('data-mark-text') : attr('data-mark');
    if (id === undefined) return [];
    if (seen.has(id)) throw new Error(`chart mark "${id}" appears twice`);
    seen.add(id);
    return [{ id, tag: token.tag, isText, index, attrs: Object.fromEntries(token.attrs.filter(([key]) => !IDENTITY.has(key))), text: textAfter(tokens, index), raw: attr('data-raw'), children: childMarkup(body, tokens, index) }];
  });
}

// cost: time O(n), heap O(d), stack O(1)
// vars: n = 토큰 수, d = 설명 수
// basis: estimate
// 프레임이 바꿔 끼울 수 없는 설명: 모든 `<title>`의 글과 표식이 아닌 요소의 `aria-label`. 표식 요소의 `aria-label`은 재생기가 프레임마다 바꾸고, 값이 바뀌는 표식은 `<title>`을 갖지 않는다(chart/parts.js).
// 이 목록은 프레임이 바뀌어도 같아야 한다. 달라지면 처음 프레임의 설명이 남아 값과 어긋나므로 그리기의 결함이다.
function describedOutsideMarks(body) {
  const tokens = tokenize(body);
  return tokens.flatMap((token, index) => {
    if (token.type !== 'open' && token.type !== 'self') return [];
    const isMark = token.attrs.some(([name]) => name === 'data-mark' || name === 'data-mark-text');
    const label = token.attrs.find(([name]) => name === 'aria-label')?.[1];
    const title = token.tag === 'title' ? (textAfter(tokens, index) ?? '') : undefined;
    return [...(title === undefined ? [] : [`title:${title}`]), ...(label !== undefined && !isMark ? [`label:${label}`] : [])];
  });
}

// 글 요소 안에 요소(`tspan` 등)가 있으면 그 안쪽 글. 프레임이 글 요소의 속성만 바꾸고 안쪽 요소의 자리(x, y)는 처음 프레임에 머물러 라벨이 어긋나기 때문에 따로 가린다. 없으면 undefined다.
function childMarkup(body, tokens, index) {
  const open = tokens[index];
  if (open.tag !== 'text' || open.type !== 'open' || open.close === undefined) return undefined;
  const inner = body.slice(open.end, tokens[open.close].start);
  return inner.includes('<') ? inner : undefined;
}

// cost: time O(f·n), heap O(f·m), stack O(1)
// vars: f = 프레임 수, n = SVG 토큰 수, m = 표식 수
// basis: estimate
/**
 * 프레임마다 그린 그림(body)에서 프레임 상태를 만든다.
 * 모든 프레임이 같은 이름을 같은 순서로 같은 태그로 가져야 한다. 그리기가 칸마다 표식을 늘 두므로 어긋나면 그리기의 버그다.
 * 표식은 속성, 글, 원자료 가운데 하나라도 프레임 사이에 달라지는 것만 담는다.
 * @returns { marks: { id, tag }[], frames: { [id]: { attrs, text? } }[], raws: { [id]: 원자료 }[], body }. raws는 강조를 가릴 때만 쓰고 시간표에 싣지 않는다
 * @throws Error 프레임끼리 표식 이름이나 태그가 다를 때. 메시지에 어긋난 이름이 있다
 */
export function frameSet(bodies) {
  const lists = bodies.map(markedElements);
  const first = lists[0];
  lists.forEach((list, f) => {
    const [a, b] = [first.map((m) => `${m.id}<${m.tag}>`), list.map((m) => `${m.id}<${m.tag}>`)];
    if (a.length !== b.length || a.some((key, i) => key !== b[i])) {
      const missing = a.find((key) => !b.includes(key)) ?? b.find((key) => !a.includes(key));
      throw new Error(`chart frame ${f} has a different set of marks than frame 0 (${missing ?? 'order differs'})`);
    }
  });
  const outside = bodies.map(describedOutsideMarks);
  outside.forEach((list, f) => {
    if (JSON.stringify(list) !== JSON.stringify(outside[0])) throw new Error(`chart frame ${f} changes a description outside a mark (a title or an aria-label that a frame cannot swap)`);
  });
  // 안쪽 요소가 있는 글 표식은 모든 프레임에서 안쪽이 같아야 한다. 프레임이 바꾸는 것은 표식 요소 자신의 속성과 글뿐이라, 다르면 움직인 글의 안쪽 요소가 처음 프레임의 자리에 남는다.
  for (const [i, m] of first.entries()) {
    const moved = lists.findIndex((list) => list[i].children !== m.children);
    if (moved >= 0) throw new Error(`chart mark "${m.id}" holds child elements that differ in frame ${moved}; a moving label must be one text per line without tspans`);
  }
  const varies = (m, i) => lists.some((list) => JSON.stringify(list[i].attrs) !== JSON.stringify(m.attrs) || list[i].text !== m.text || list[i].raw !== m.raw);
  const kept = first.map((m, i) => ({ m, i })).filter(({ m, i }) => varies(m, i));
  return {
    marks: kept.map(({ m }) => ({ id: m.id, tag: m.isText ? 'text' : m.tag })),
    frames: lists.map((list) => Object.fromEntries(kept.map(({ m, i }) => [m.id, { attrs: list[i].attrs, ...(m.isText ? { text: list[i].text } : {}) }]))),
    raws: lists.map((list) => Object.fromEntries(kept.map(({ i }) => [list[i].id, list[i].raw]))),
    body: bodies[0],
  };
}

// cost: time O(m), heap O(m), stack O(1)
// vars: m = 표식 수
// basis: estimate
/** 프레임 a에서 b로 바뀔 때 원자료가 달라진 표식 이름들. 위치나 모양만 달라진 표식은 넣지 않는다. */
export function changedBetween(raws, a, b) {
  return Object.keys(raws[b]).filter((id) => raws[a][id] !== raws[b][id]);
}
