// 저장소의 마크다운 문서(*.md) 모두에 `thinkflow md`를 돌린다. 문서는 폴더를 걸어 찾으므로 울타리 모양(백틱, 물결표, 인용, 목록)과 상관없고,
// 블록을 모두 지운 문서에 남은 이미지 줄과 낡은 SVG도 정리한다. 심볼릭 링크는 가리키는 문서가 이미 들어 있어 뺀다.
// 사용: node scripts/run-md.mjs [md 명령 옵션 ...]   예: node scripts/run-md.mjs --check --strict
import { spawnSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iterFiles } from '../src/vendor/theme/ui/build/lib/walk-files.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));
// 설치한 패키지, 버전 관리 내부, 만든 결과(.local, out)는 걸어 들어가지 않는다.
const DOCUMENTS = { wants: (name) => name.endsWith('.md'), skipDirs: new Set(['node_modules', '.git', '.local', 'out']) };

const documents = [...iterFiles([ROOT], DOCUMENTS)].filter((path) => !lstatSync(path).isSymbolicLink()).map((path) => relative(ROOT, path));
const run = spawnSync(process.execPath, [CLI, 'md', ...process.argv.slice(2), '--', ...documents], { cwd: ROOT, stdio: 'inherit' });
process.exitCode = run.status ?? 1;
