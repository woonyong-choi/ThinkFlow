// 카드 내용 한 줄을 읽는다. 배치와 그리기는 같은 줄 모형을 쓴다.
import { parseMiniGraph } from './minigraph.js';
import { VALUES } from './grammar.js';
import { readOptions } from './options.js';
import { NEUTRAL } from '../tone.js';

// cost: time O(t + g), heap O(g), stack O(1)
// vars: t = 문장 낱말 수, g = 관계 그래프 글자 수
// basis: estimate
// 정지 본문과 장면이 공유하는 글·관계 그래프 한 줄.
export function readContent({ tokens, line }, ctx) {
  const [first, ...rest] = tokens;
  if (first?.type === 'word' && first.value === 'graph') {
    const [text, ...more] = rest;
    if (text?.type !== 'text') {
      ctx.problems.error(line, 'a graph row needs graph "a -> b; a -> c" [lit="a"]');
      return;
    }
    const { lit } = readOptions(more, { scopes: ['graph'], what: 'a graph row', line, ctx });
    const graph = parseMiniGraph(text.value, lit ?? '');
    if (graph.error) ctx.problems.error(line, graph.error);
    else return { graph };
    return;
  }
  if (first?.type !== 'text') {
    ctx.problems.error(line, 'a text row needs quoted text: "text"');
    return;
  }
  const { mono, ...found } = readOptions(rest, { scopes: ['show'], what: 'a card row', line, ctx });
  const row = { text: first.value, ...found, ...(mono ? { isMono: true } : {}) };
  checkRowTone(row, line, ctx);
  row.appearance ??= VALUES.appearance.default;
  if (row.appearance !== VALUES.appearance.default && row.tone === undefined) row.tone = NEUTRAL;
  return row;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// plain의 tone은 태그 알약의 색이라 태그가 있어야 한다. appearance=filled|outline이면 tone은 카드 줄 내용의 면과 경계 색이고, 적지 않으면 무채색 gray다(도형과 같은 규칙).
function checkRowTone(row, line, ctx) {
  const isPlain = (row.appearance ?? VALUES.appearance.default) === 'plain';
  if (row.tone !== undefined && row.tag === undefined && isPlain) ctx.problems.error(line, 'tone colors a tag or, with appearance=filled|outline, the card. Add tag="..." or appearance, or remove tone');
}
