// 소비자별 설정 없이 같은 배포본을 가져온다.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const source = process.argv[2];
if (!source) throw new Error('usage: npm run design:sync -- <design-tokens repository>');
const target = fileURLToPath(new URL('../../', import.meta.url));
const result = spawnSync(process.execPath, [resolve(source, 'scripts/export.mjs'), target], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
