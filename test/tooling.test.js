// 저장소 관문 도구의 계약: 하드코딩 검사(design-tokens의 check-tokens.mjs)와 디자인 의존성 선언. 검사는 새 프로세스로 돌려 종료 코드와 출력으로만 본다.
// 배포하는 명령이 아니라 이 저장소의 `npm run check`가 쓰는 도구라서 시험 이름 첫 낱말(G1~G3)은 요구사항 번호표에 없다.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';
import { ROOT, workspace } from './support.js';

const node = (args, cwd) => spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
const DESIGN = join(ROOT, 'node_modules/@woonyong-choi/design-tokens/dist');
const checkTokens = (dir) => node([join(DESIGN, 'ui/build/check-tokens.mjs'), dir, '--tokens', join(DESIGN, 'tokens.json')], ROOT);
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

test('G3 the design is the peer package the host installs, pinned to a commit for this repository, with no copy in src', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.peerDependencies['@woonyong-choi/design-tokens'], /^\^\d+\.\d+\.\d+$/);
  assert.match(pkg.devDependencies['@woonyong-choi/design-tokens'], /^github:woonyong-choi\/design-tokens#[0-9a-f]{40}$/);
  assert.equal(pkg.dependencies['@woonyong-choi/design-tokens'], undefined);
  assert.equal(existsSync(join(ROOT, 'src/vendor/theme')), false);
  const resolved = createRequire(join(ROOT, 'src/styles.js')).resolve('@woonyong-choi/design-tokens/tokens.css');
  assert.equal(resolved, join(DESIGN, 'tokens.css'));
});
