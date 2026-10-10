// 카드 내용 한 줄을 읽는다. 배치와 그리기는 같은 줄 모형을 쓴다.
import { parseMiniGraph } from './minigraph.js';
import { flagNames, optionsOf, valueNames, VALUES } from './grammar.js';

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
    const lit = more.find((t) => t.type === 'option' && t.key === 'lit' && t.valueType === 'text');
    if (more.length !== (lit ? 1 : 0)) ctx.problems.error(line, 'a graph row takes only lit="names"');
    const graph = parseMiniGraph(text.value, lit?.value ?? '');
    if (graph.error) ctx.problems.error(line, graph.error);
    else return { graph };
    return;
  }
  if (first?.type !== 'text') {
    ctx.problems.error(line, 'a text row needs quoted text: "text"');
    return;
  }
  const row = { text: first.value };
  for (const t of rest) readRowOption(t, row, { line, ctx });
  checkRowLengths(row, line, ctx);
  checkRowTone(row, line, ctx);
  row.appearance ??= VALUES.appearance.default;
  return row;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 색 선택 사항 둘의 짝. tone은 태그 알약을 칠하거나(plain), appearance=filled|outline일 때 카드 줄 내용의 면과 경계를 칠한다. filled와 outline은 칠할 색(tone)이 있어야 한다.
function checkRowTone(row, line, ctx) {
  const isPlain = (row.appearance ?? VALUES.appearance.default) === 'plain';
  if (!isPlain && row.tone === undefined) ctx.problems.error(line, `appearance=${row.appearance} needs tone. Add tone=name or use appearance=plain`);
  else if (row.tone !== undefined && row.tag === undefined && isPlain) ctx.problems.error(line, 'tone colors a tag or, with appearance=filled|outline, the card. Add tag="..." or appearance, or remove tone');
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 선택 사항 수
// basis: estimate
// 글자 수 상한이 있는 선택 사항(mark)을 넘으면 오류다. 카드 오른쪽 끝에 들어갈 자리가 정해져 있기 때문이다.
function checkRowLengths(row, line, ctx) {
  for (const [key, spec] of Object.entries(optionsOf('show'))) {
    const isTooLong = spec.maxLength && row[key] !== undefined && [...row[key]].length > spec.maxLength;
    if (isTooLong) ctx.problems.error(line, `${key} is at most ${spec.maxLength} characters`);
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 카드 줄 선택 사항 하나. 키와 값 목록은 grammar.js의 show 범위다.
function readRowOption(t, row, { line, ctx }) {
  const spec = t.type === 'option' ? optionsOf('show')[t.key] : undefined;
  if (t.type === 'word' && flagNames('show').includes(t.value) && !row.isMono) row.isMono = true;
  else if (spec && spec.type !== 'flag' && row[t.key] === undefined) readRowValue(t, { spec, row }, { line, ctx });
  else {
    const keys = Object.entries(optionsOf('show')).filter(([, o]) => o.type !== 'flag').map(([key]) => `${key}=`);
    ctx.problems.error(line, `a card row takes ${keys.join(', ')}, and ${flagNames('show').join(', ')} once each. Found "${t.key ?? t.value}"`);
  }
}

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 값 목록의 값 수
// basis: estimate
// 카드 줄 선택 사항의 값. 값 목록이 있으면 그 안의 값만 받는다.
function readRowValue(t, { spec, row }, { line, ctx }) {
  if (spec.values && (t.valueType !== 'word' || !valueNames(spec.values).includes(t.value))) ctx.problems.error(line, `${t.key} is one of ${valueNames(spec.values).join(', ')}`);
  else if (!spec.values && t.valueType !== 'text') ctx.problems.error(line, `write ${t.key} as quoted text: ${t.key}="..."`);
  else row[t.key] = t.value;
}
