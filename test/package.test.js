// 배포 계약: 어떤 파일이 패키지에 오르고 어떤 진입점이 있는지. 시험 이름 첫 낱말(P1~P4)이 요구사항 번호이고, 대응은 docs/design/expression-coverage.md의 시험 번호 표에 있다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildFigure, FigureError } from 'daphnis';

import { cli, ROOT } from './support.js';

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

test('P1 the package ships src, the logo SVGs, the licence and the notice, and nothing else', () => {
  assert.deepEqual(pkg.files, ['src', 'docs/assets/daphnis-*.svg', 'LICENSE', 'NOTICE']);
});

test('P2 the command and static build API are explicit package entry points', () => {
  assert.deepEqual(pkg.bin, { daphnis: 'src/cli.js' });
  assert.deepEqual(pkg.exports, {
    '.': { types: './src/index.d.ts', default: './src/index.js' },
    './design-manifest.json': './src/vendor/theme/manifest.json',
    './package.json': './package.json',
  });
  assert.equal(pkg.types, './src/index.d.ts');
  assert.equal(pkg.main, undefined);
  assert.equal(pkg.type, 'module');
});

test('P3 npm test runs this suite and nothing from a deleted one', () => {
  assert.match(pkg.scripts.test, /^node --test\b/);
  assert.match(pkg.scripts.test, /test\/\*\.test\.js/);
});

test('P4 the command with no arguments prints usage for all four commands and exits 2', () => {
  const run = cli([]);
  assert.equal(run.status, 2);
  for (const command of ['render', 'check', 'gallery', 'md']) assert.match(run.stderr, new RegExp(`daphnis ${command} `));
  assert.equal(run.stdout, '');
});

// docs/usage.md의 공개 오류 계약: 메시지 파싱 없이 위치와 종류를 처리한다.
test('buildFigure_invalid_source_throws_public_diagnostics', async () => {
  await assert.rejects(buildFigure('daphnis 2\nbox a "A"\na -> missing\n'), (error) => {
    assert.ok(error instanceof FigureError);
    assert.equal(error.name, 'FigureError');
    assert.deepEqual(error.problems, [{
      severity: 'error', code: 'syntax', line: 3, column: 1,
      message: 'unknown card "missing". Declared: a',
    }]);
    return true;
  });
});
