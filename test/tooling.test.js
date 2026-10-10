// 저장소 관문 도구의 계약: 하드코딩 검사(scripts/check-tokens.mjs)와 테마 사본 출처 검사(scripts/sync-theme.mjs --check). 새 프로세스로 돌려 종료 코드와 출력으로만 본다.
// 배포하는 명령이 아니라 이 저장소의 `npm run check`가 쓰는 도구라서 시험 이름 첫 낱말(G1~G3)은 요구사항 번호표에 없다.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { ROOT, workspace } from './support.js';

const node = (args, cwd) => spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
const checkTokens = (dir) => node([join(ROOT, 'src/vendor/theme/ui/build/check-tokens.mjs'), dir, '--tokens', join(ROOT, 'src/vendor/theme/tokens.json')], ROOT);
const hits = (run) => run.stdout.trim().split('\n').filter((line) => !line.startsWith('total')).map((line) => line.replace(/^.*[\\/]/, ''));

test('G1 a hard-coded color in JavaScript is found where the language puts it: after a regex or string that contains <!--, and not inside comments or regex literals', (t) => {
  const dir = workspace(t, {
    'markup.js': ['const OPEN = /<!--/;', "const RED = '#ff0000';", 'const CLOSE = /-->/;', "const NOTE = '<!--';", "const BLUE = '#0000ff';", "const END = '-->';", ''].join('\n'),
    'quiet.js': ["// const GONE = '#ff0000';", "/* const GONE = '#ff0000'; */", 'const PATTERN = /#00ff00/;', 'const QUOTES = /[\'"`]/;', 'const HALF = 3 / 2;', "const OK = 'text';", ''].join('\n'),
    'template.js': ['const html = `<p>${`<!--`}</p> ${1 / 2}`;', "const GREEN = '#00ff00';", ''].join('\n'),
  });
  const run = checkTokens(dir);
  assert.equal(run.status, 1, run.stdout);
  assert.deepEqual(hits(run), ['markup.js:2: hex color: #ff0000', 'markup.js:5: hex color: #0000ff', 'template.js:2: hex color: #00ff00']);
  assert.match(run.stdout, /total 3\n$/);
});

test('G2 a CSS /* */ comment hides its values and the declaration after it is still checked', (t) => {
  const dir = workspace(t, { 'a.css': '/* color: #ff0000; */\n.a { color: #00ff00; }\n' });
  assert.deepEqual(hits(checkTokens(dir)), ['a.css:2: hex color: #00ff00']);
});

test('G3 an edited design artifact fails verification before rendering', (t) => {
  const dir = workspace(t);
  for (const name of ['scripts/check-design.mjs', 'src/vendor/theme']) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    cpSync(join(ROOT, name), join(dir, name), { recursive: true });
  }
  assert.equal(node(['scripts/check-design.mjs'], dir).status, 0);
  writeFileSync(join(dir, 'src/vendor/theme/tokens.css'), 'changed');
  const changed = node(['scripts/check-design.mjs'], dir);
  assert.notEqual(changed.status, 0);
  assert.match(changed.stderr, /modified design artifact: tokens.css/);
});
