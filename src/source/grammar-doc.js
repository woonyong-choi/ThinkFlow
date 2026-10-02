// 문법 표(grammar.js)를 문서 표로 쓴다. docs/design/figure-syntax.md의 "문법 표" 구간이 이 출력과 같아야 하고, 어긋나면 테스트가 실패한다.
import { KINDS, OPTIONS, STATEMENTS, VALUES } from './grammar.js';

export const DOC_START = '<!-- grammar-table:start -->';
export const DOC_END = '<!-- grammar-table:end -->';

const SECTION_NAMES = { version: '판 표기', header: '머리', declare: '선언', timeline: '시간 흐름' };
const TYPE_NAMES = { flag: '값 없음(낱말만)', text: '글', word: '낱말', number: '숫자' };
const ALL_KINDS = Object.keys(KINDS);

const code = (text) => `\`${text}\``;
const isAll = (kinds) => kinds.length === ALL_KINDS.length;
const sinceText = (entry) => (entry.since > 1 ? `판 ${entry.since}` : '판 1');
const statusOf = (entry, noteForm) => (entry.deprecated ? `폐기(판 ${entry.deprecated.since}), ${code(entry.deprecated.replace)}${noteForm}` : '');

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 문장 낱말 수
// basis: estimate
// 부분, 그림 종류, 판, 폐기 상태가 같은 낱말을 한 행으로 묶는다.
function statementRows() {
  const groups = new Map();
  for (const [word, entry] of Object.entries(STATEMENTS)) {
    const kinds = isAll(entry.kinds) ? '모든 그림' : entry.kinds.join(', ');
    const key = [entry.section, kinds, sinceText(entry), statusOf(entry, '로 읽는다')].join('|');
    groups.set(key, [...(groups.get(key) ?? []), code(entry.display ?? word)]);
  }
  return [...groups].map(([key, words]) => {
    const [section, kinds, since, status] = key.split('|');
    return `| ${SECTION_NAMES[section]} | ${words.join(', ')} | ${kinds} | ${since} | ${status} |`;
  });
}

// cost: time O(o), heap O(o), stack O(1)
// vars: o = 선택 사항 수
// basis: estimate
// 선택 사항 한 줄. 값은 값 목록의 현재 값이거나 값 형식이다.
function optionRows() {
  return Object.entries(OPTIONS).map(([key, spec]) => {
    const names = spec.values ? Object.entries(VALUES[spec.values].items).filter(([, item]) => !item.deprecated).map(([name]) => code(name)).join(', ') : '';
    const limit = spec.maxLength ? `, 최대 ${spec.maxLength}자` : '';
    return `| ${code(key)} | ${names || spec.format || TYPE_NAMES[spec.type]}${limit} | ${sinceText(spec)} | ${statusOf(spec, '로 읽는다')} |`;
  });
}

// cost: time O(v), heap O(v), stack O(1)
// vars: v = 값 목록 수
// basis: estimate
// 값 목록이 쓰이는 곳: 선택 사항 키, 낱말 뒤 자리, 그림 종류 둘째 낱말
function usedBy(list) {
  const options = Object.entries(OPTIONS).filter(([, spec]) => spec.values === list).map(([key]) => code(key));
  const words = Object.entries(STATEMENTS).filter(([, entry]) => entry.positional?.includes(list)).map(([word]) => code(`${word} 값`));
  const kinds = Object.entries(KINDS).filter(([, entry]) => entry.argument === list).map(([kind]) => code(`${kind} 뒤`));
  return [...options, ...words, ...kinds].join(', ');
}

// cost: time O(v·i), heap O(v·i), stack O(1)
// vars: v = 값 목록 수, i = 목록의 값 수
// basis: estimate
// 값 목록 한 줄. 기본값은 목록의 default, 역할은 차트 종류의 firstRole이 정한 선언 순서 규칙이다.
function valueRows() {
  return Object.entries(VALUES).map(([list, { items, default: fallback }]) => {
    const names = Object.entries(items).filter(([, item]) => !item.deprecated).map(([name, item]) => `${code(name)}${item.since > 1 ? ` (판 ${item.since})` : ''}`);
    const old = Object.entries(items).filter(([, item]) => item.deprecated).map(([name, item]) => `${code(name)} → ${code(item.deprecated.replace)}`);
    return `| ${code(list)} | ${usedBy(list)} | ${names.join(', ')} | ${fallback ? code(fallback) : defaultText(list)} | ${old.join(', ') || '없음'} |`;
  });
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 차트 종류 수
// basis: estimate
// 기본값이 없는 목록의 기본 규칙 글
function defaultText(list) {
  if (list !== 'role') return '없음';
  const roles = Object.keys(VALUES.role.items);
  const first = Object.entries(VALUES.chartType.items).filter(([, item]) => item.firstRole).map(([type, item]) => `${code(type)}은 ${[item.firstRole, ...roles.filter((r) => r !== item.firstRole)].join(', ')}`);
  return `선언 순서대로 ${roles.join(', ')}${first.length ? `(${first.join(', ')})` : ''}`;
}

// cost: time O(s + o + v·i), heap O(s + o + v·i), stack O(1)
// vars: s = 문장 낱말 수, o = 선택 사항 수, v = 값 목록 수, i = 목록의 값 수
// basis: estimate
/** 문서에 넣는 문법 표 글. 낱말, 선택 사항, 값 목록 세 표다. */
export function renderGrammarTables() {
  return [
    '| 부분 | 낱말 | 그림 종류 | 판 | 폐기 |',
    '|---|---|---|---|---|',
    ...statementRows(),
    '',
    '| 선택 사항 | 값 | 판 | 폐기 |',
    '|---|---|---|---|',
    ...optionRows(),
    '',
    '| 값 목록 | 쓰는 곳 | 값 | 기본값 | 옛 값 → 읽는 값 |',
    '|---|---|---|---|---|',
    ...valueRows(),
  ].join('\n');
}
