// 둘째 판 원본이 실제로 쓴 문장, 선택 사항, 값을 줄 번호와 함께 모은다. 해석한 그림이 아니라 원본의 낱말을 읽으므로 "예제가 이 기능을 적었다"만 말하고 그림이 맞는지는 말하지 않는다.
import { OPTIONS } from '../../src/source/grammar.js';
import { tokenizeLine } from '../../src/source/lexer.js';
import { createProblems } from '../../src/source/problems.js';

// 값 없이 낱말만 쓰는 선택 사항(`quiet`, `dashed`, `pk` ...)의 이름
const FLAGS = new Set(Object.entries(OPTIONS).filter(([, spec]) => spec.type === 'flag').map(([key]) => key.split('.')[1]));
// 줄마다 칸이나 멤버를 적는 블록. 안의 첫 낱말은 문장이 아니라 이름이다.
const COLUMN_BLOCKS = new Set(['table', 'api']);

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 줄 수
// basis: estimate
/**
 * 원본에서 쓴 기능 이름 → 줄 번호 목록.
 * 이름은 문장 첫 낱말(`scene`, `track`, 선 줄은 `edge`와 `hop`, 칸 줄은 `column`), `chart:종류`, `view:방식`, `fragment:종류`,
 * 선택 사항 키(`quiet`, `time`), 낱말 값이 있는 선택 사항(`role=reference`), 이어 붙인 이동(`&`), 읽기 식(`:=`)이다.
 */
export function catalogCoverage(source) {
  const found = new Map();
  const problems = createProblems(source);
  const blocks = [];
  let inScenes = false;
  for (const [index, line] of source.split('\n').entries()) {
    const tokens = tokenizeLine(line, index + 1, problems);
    if (!tokens.length) continue;
    const at = index + 1;
    const [first] = tokens;
    const closing = first.type === 'close';
    if (closing) {
      blocks.pop();
      continue;
    }
    const inColumns = COLUMN_BLOCKS.has(blocks.at(-1));
    const isArrow = tokens[1]?.type === 'arrow';
    const word = isArrow ? (inScenes ? 'hop' : 'edge') : inColumns ? 'column' : first.value;
    if (first.value === 'scene' && !isArrow) inScenes = true;
    add(found, word, at);
    if (word === 'chart') add(found, `chart:${tokens[3]?.value}`, at);
    if (word === 'view') add(found, `view:${tokens[1]?.value}`, at);
    if (word === 'fragment') add(found, `fragment:${tokens[1]?.value}`, at);
    for (const token of tokens) {
      if (token.type === 'amp') add(found, '&', at);
      if (token.type === 'option') {
        add(found, token.key, at);
        if (token.valueType !== 'text') add(found, `${token.key}=${token.value}`, at);
        if (token.value.includes(':=')) add(found, ':=', at);
      } else if (token.type === 'word' && token !== first && FLAGS.has(token.value)) add(found, token.value, at);
    }
    if (tokens.some((token) => token.type === 'open')) blocks.push(inColumns ? 'column' : first.value);
    if (first.value === 'on' && line.includes(':=')) add(found, ':=', at);
  }
  problems.throwIfAny();
  return Object.fromEntries(found);
}

function add(found, name, line) {
  if (!found.has(name)) found.set(name, []);
  if (!found.get(name).includes(line)) found.get(name).push(line);
}
