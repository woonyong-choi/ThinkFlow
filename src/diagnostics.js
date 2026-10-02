// `--json` 출력 한 줄의 모양을 한 곳에 선언한다. 출력 계약도 문법처럼 추가만 하고, 옛 필드는 deprecated로 표시해 다음 판까지 함께 낸다.

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 옛 `check`: 검사 번호(숫자) 또는 'syntax', 'io', 'internal'
const oldCheck = (d) => {
  const number = /^check-(\d+)$/.exec(d.code);
  if (number) return Number(number[1]);
  return ['io', 'internal'].includes(d.code) ? d.code : 'syntax';
};

// cost: time O(m), heap O(m), stack O(1)
// vars: m = 메시지 글자 수
// basis: estimate
// 옛 `lines`: 첫 줄과 메시지 안 "(line N)"의 줄 번호. 줄 없는 진단은 빈 목록
const oldLines = (d) => (d.line ? [d.line, ...[...d.message.matchAll(/\(line (\d+)\)/g)].map((m) => Number(m[1]))] : []);

/**
 * 필드마다 { since, deprecated?, value(file, diagnostic) }. 순서가 곧 출력 순서다.
 * deprecated: { since, until }은 `until` 판이 오를 때까지 함께 내는 옛 필드다. 옛 `level`에는 deprecated 종류가 없어 warning으로 낸다.
 */
const JSON_FIELDS = {
  file: { since: 1, value: (file) => file },
  line: { since: 1, value: (file, d) => d.line },
  lines: { since: 1, deprecated: { since: 1, until: 2 }, value: (file, d) => oldLines(d) },
  check: { since: 1, deprecated: { since: 1, until: 2 }, value: (file, d) => oldCheck(d) },
  level: { since: 1, deprecated: { since: 1, until: 2 }, value: (file, d) => (d.severity === 'error' ? 'error' : 'warning') },
  message: { since: 1, value: (file, d) => d.message },
  severity: { since: 1, value: (file, d) => d.severity },
  code: { since: 1, value: (file, d) => d.code },
  column: { since: 1, value: (file, d) => d.column },
  fix: { since: 1, value: (file, d) => d.fix },
};

// cost: time O(f), heap O(f), stack O(1)
// vars: f = 필드 수
// basis: estimate
/** 진단 하나를 `--json` 한 줄의 객체로. 값이 없는 필드(fix)는 뺀다. */
export function toJson(file, diagnostic) {
  return Object.fromEntries(Object.entries(JSON_FIELDS).map(([name, field]) => [name, field.value(file, diagnostic)]).filter(([, value]) => value !== undefined));
}
