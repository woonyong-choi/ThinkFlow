// 검사 항목 목록(items.js)을 문서 표로 쓴다. docs/design/figure-check.md의 "검사 항목" 구간이 이 출력과 같아야 하고, 어긋나면 테스트가 실패한다.
import { CHECKS } from './items.js';

export const DOC_START = '<!-- check-table:start -->';
export const DOC_END = '<!-- check-table:end -->';

const SEVERITY_NAMES = { error: '오류', warning: '경고' };

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 검사 항목 수
// basis: estimate
/** 검사 항목 표(Markdown). 머리 줄, 구분 줄, 항목마다 한 줄이다. */
export function renderCheckTable() {
  const rows = CHECKS.map((c) => `| ${c.number} | \`${c.code}\` | ${c.title} | ${c.severity.map((s) => SEVERITY_NAMES[s]).join(', ')} | ${c.criterion} |`);
  return ['| 번호 | code | 검사 | 등급 | 기준 |', '|---|---|---|---|---|', ...rows].join('\n');
}
