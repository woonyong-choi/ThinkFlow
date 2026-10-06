// 선택한 테마 완성본을 가져오고 렌더러의 기존 토큰 경로에 연결한다.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyTheme } from './theme-snapshot.mjs';

const ROOT = new URL('../', import.meta.url);
const config = JSON.parse(readFileSync(new URL('theme.config.json', ROOT), 'utf8'));
const args = process.argv.slice(2);
verifyTheme();
checkCopies();
if (!args.includes('--check')) {
  const from = args.indexOf('--from');
  if (from < 0 || !args[from + 1]) throw new Error('usage: sync-theme.mjs --from <design-tokens-root> | --check');
  const result = spawnSync(process.execPath, [resolve(args[from + 1], 'scripts/export-theme.mjs'), config.theme, new URL('src/design-theme/', ROOT).pathname], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('theme import failed');
  for (const name of ['tokens.json', 'tokens.dark.json']) writeFileSync(new URL(`src/${name}`, ROOT), readFileSync(new URL(`src/design-theme/diagram.${name}`, ROOT)));
}
verifyTheme();
checkCopies();

// cost: time O(n), heap O(n), stack O(1), io 4
// vars: n = 토큰 바이트 수
// basis: estimate
function checkCopies() {
  for (const name of ['tokens.json', 'tokens.dark.json']) {
    if (!readFileSync(new URL(`src/${name}`, ROOT)).equals(readFileSync(new URL(`src/design-theme/diagram.${name}`, ROOT)))) throw new Error(`modified imported token source: src/${name}`);
  }
}
