// 가져온 테마의 파일과 해시를 검증한다. 값은 공통 정본에서 갱신한다.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../src/design-theme/', import.meta.url);
const hash = (value) => createHash('sha256').update(value).digest('hex');

// cost: time O(n), heap O(n), stack O(1), io f
// vars: n = 테마 바이트 수, f = 테마 파일 수
// basis: estimate
export function verifyTheme() {
  const meta = JSON.parse(readFileSync(new URL('theme.json', ROOT), 'utf8'));
  if (hash(JSON.stringify(meta.files, null, 2) + '\n') !== meta.contentHash) throw new Error('invalid theme manifest hash');
  for (const [name, expected] of Object.entries(meta.files)) {
    if (name.startsWith('/') || name.split('/').includes('..')) throw new Error(`invalid theme path: ${name}`);
    if (hash(readFileSync(new URL(name, ROOT))) !== expected) throw new Error(`modified imported theme: ${name}`);
  }
  return meta;
}
