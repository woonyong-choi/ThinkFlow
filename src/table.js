// 테이블 열의 표시는 측정, 충돌 검사, SVG가 공유한다.
// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
export function columnKey(column) {
  return [column.pk && 'PK', column.fk && 'FK', column.unique && 'UNQ'].filter(Boolean).join(' ');
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 타입 글자 수
// basis: estimate
function columnType(column) {
  return [column.type, ...columnRules(column)].join(' ');
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 삭제 정책 글자 수
// basis: estimate
export function columnRules(column) {
  const nullability = column.nullable ? 'NULL' : column.required ? 'NOT NULL' : '';
  const deletion = column.ondelete ? `ON DELETE ${column.ondelete.replaceAll('-', ' ').toUpperCase()}` : '';
  return [nullability, deletion].filter(Boolean);
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 테이블과 열 표시의 전체 글자 수
// basis: estimate
export function tableDescription(table) {
  return [table.label, ...table.columns.map((column) => `${column.name} ${columnKey(column)} ${columnType(column)}`)].join('; ');
}
