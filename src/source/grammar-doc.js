// 문법 표(grammar.js)를 문서 표로 쓴다. docs/design/figure-syntax.md의 "문법 표" 구간이 이 출력과 같아야 하고, 어긋나면 테스트가 실패한다.
import { OPTIONS, STATEMENTS, VALUES } from './grammar.js';

export const DOC_START = '<!-- grammar-table:start -->';
export const DOC_END = '<!-- grammar-table:end -->';

const SECTION_NAMES = { version: '판 표기', header: '머리', declare: '선언', timeline: '시간 흐름' };
const BLOCK_NAMES = { card: '카드 본문 안', chart: '차트 블록 안', class: '클래스 블록 안', table: '테이블 블록 안', grid: '격자 블록 안', trace: '추적 블록 안' };
const TYPE_NAMES = { flag: '값 없음(낱말만)', text: '글', word: '낱말', number: '숫자' };

const code = (text) => `\`${text}\``;

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 문장 낱말 수
// basis: estimate
// 부분과 블록이 같은 낱말을 한 행으로 묶는다.
function statementRows() {
  const groups = new Map();
  for (const [word, entry] of Object.entries(STATEMENTS)) {
    const key = [entry.section, entry.in ?? ''].join('|');
    groups.set(key, [...(groups.get(key) ?? []), code(entry.display ?? word)]);
  }
  return [...groups].map(([key, words]) => {
    const [section, block] = key.split('|');
    return `| ${SECTION_NAMES[section]} | ${block ? BLOCK_NAMES[block] : '문서 줄'} | ${words.join(', ')} |`;
  });
}

// cost: time O(o), heap O(o), stack O(1)
// vars: o = 선택 사항 수
// basis: estimate
// 선택 사항 한 줄. 값은 값 목록의 값이거나 값 형식이다.
function optionRows() {
  return Object.entries(OPTIONS).map(([key, spec]) => {
    const names = spec.values ? Object.keys(VALUES[spec.values].items).map(code).join(', ') : '';
    const limit = spec.maxLength ? `, 최대 ${spec.maxLength}자` : '';
    return `| ${code(key)} | ${names || spec.format || TYPE_NAMES[spec.type]}${limit} |`;
  });
}

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 값 목록 수
// basis: estimate
// 값 목록이 쓰이는 곳: 선택 사항 키, 낱말 뒤 자리
function usedBy(list) {
  const options = Object.entries(OPTIONS).filter(([, spec]) => spec.values === list).map(([key]) => code(key));
  const words = Object.entries(STATEMENTS).filter(([, entry]) => entry.positional?.includes(list)).map(([word]) => code(`${word} 값`));
  return [...options, ...words].join(', ');
}

// cost: time O(v·i), heap O(v·i), stack O(1)
// vars: v = 값 목록 수, i = 목록의 값 수
// basis: estimate
// 값 목록 한 줄. 기본값은 목록의 default, 역할은 차트 종류의 firstRole이 정한 선언 순서 규칙이다.
function valueRows() {
  return Object.entries(VALUES).map(([list, { items, default: fallback }]) => `| ${code(list)} | ${usedBy(list)} | ${Object.keys(items).map(code).join(', ')} | ${fallback ? code(fallback) : defaultText(list)} |`);
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 차트 종류 수
// basis: estimate
// 기본값이 없는 목록의 기본 규칙 글
function defaultText(list) {
  if (list === 'sceneMode') return `줄이 있는 장면은 ${code('once')}, 줄이 없는 장면은 ${code('static')}`;
  if (list !== 'role') return '없음';
  const automatic = ['main', 'compare'];
  const first = Object.entries(VALUES.chartType.items).filter(([, item]) => item.firstRole).map(([type, item]) => `${code(type)}은 ${[item.firstRole, ...automatic.filter((r) => r !== item.firstRole)].join(', ')}`);
  return `계열이 하나나 둘이면 선언 순서대로 ${automatic.join(', ')}${first.length ? `(${first.join(', ')})` : ''}, 셋 이상이면 없음`;
}

// cost: time O(s + o + v·i), heap O(s + o + v·i), stack O(1)
// vars: s = 문장 낱말 수, o = 선택 사항 수, v = 값 목록 수, i = 목록의 값 수
// basis: estimate
/** 문서에 넣는 문법 표 글. 낱말, 선택 사항, 값 목록 세 표다. */
export function renderGrammarTables() {
  return [
    '| 부분 | 자리 | 낱말 |',
    '|---|---|---|',
    ...statementRows(),
    '',
    '| 선택 사항 | 값 |',
    '|---|---|',
    ...optionRows(),
    '',
    '| 값 목록 | 쓰는 곳 | 값 | 기본값 |',
    '|---|---|---|---|',
    ...valueRows(),
  ].join('\n');
}
