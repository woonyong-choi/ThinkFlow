// 테이블 열의 표시는 측정, 충돌 검사, SVG가 공유한다.
// cost: time O(k+f), heap O(k+f), stack O(1)
// vars: k = 키에 포함된 열 수, f = 외래 키에 포함된 열 수
// basis: estimate
export function columnKeyLabel(column, table) {
  const keys = table.keys ?? [];
  const order = [...keys.filter(key => key.kind === 'pk'), ...(table.foreignKeys ?? []), ...keys.filter(key => key.kind === 'unique')];
  return [...new Set(order.filter(key => key.columns.includes(column.name)).map(key => key.label))].join(' ');
}

// cost: time O(n+f), heap O(n+f), stack O(1)
// vars: n = 타입과 삭제 정책의 전체 글자 수, f = 외래 키에 포함된 열 수
// basis: estimate
function columnType(column, table) {
  return [column.type, ...columnRules(column, table)].join(' ');
}

// cost: time O(n+f), heap O(n+f), stack O(1)
// vars: n = 삭제 정책의 전체 글자 수, f = 외래 키에 포함된 열 수
// basis: estimate
export function columnRules(column, table) {
  const nullability = column.nullable ? 'NULL' : column.required ? 'NOT NULL' : '';
  const deletions = (table.foreignKeys ?? []).filter(key => key.ondelete && key.columns.includes(column.name)).map(key => `${key.columns.length > 1 ? `${key.label} ` : ''}ON DELETE ${key.ondelete.replaceAll('-', ' ').toUpperCase()}`);
  return [nullability, ...new Set(deletions)].filter(Boolean);
}

// cost: time O(n+c*(k+f)), heap O(n+k+f), stack O(1)
// vars: n = 설명의 전체 글자 수, c = 열 수, k = 키에 포함된 열 수, f = 외래 키에 포함된 열 수
// basis: estimate
export function tableDescription(table) {
  const keys = (table.keys ?? []).map(key => `${key.label} (${key.columns.join(', ')})`);
  const references = (table.foreignKeys ?? []).map(key => `${key.label} (${key.columns.join(', ')}) references ${key.target.table} (${key.target.columns.join(', ')})`);
  return [table.label, ...table.columns.map((column) => `${column.name} ${columnKeyLabel(column, table)} ${columnType(column, table)}`), ...keys, ...references].join('; ');
}

// cost: time O(c+r), heap O(c+r), stack O(1)
// vars: c = 연결한 열 수, r = 테이블 행 수
// basis: estimate
// 단일 열은 그 행 가운데, 열 묶음은 포함된 행 범위의 가운데를 쓴다. 배치와 연결점 검사가 같은 계산을 사용한다.
export function columnAnchorY(rows, columns) {
  const names = new Set(columns);
  const centers = rows.filter(row => names.has(row.id)).map(row => row.center);
  return (Math.min(...centers) + Math.max(...centers)) / 2;
}
