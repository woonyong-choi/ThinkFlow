// 패키지 공개 계약: npm에 올라가는 파일과 package.json 공개 항목(docs/design/markdown.md 요구사항 "패키지").
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// cost: time O(f), heap O(f), stack O(1), io 1
// vars: f = 패키지 파일 수
// basis: estimate
// npm이 올릴 파일 경로 목록
function packedFiles() {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout)[0].files.map((file) => file.path);
}

// 근거: 계약 package.json "files는 배포에 필요한 것만". 반대 사례: 시험, 문서, 예제, 스크립트, 저장소 설정이 새면 실패한다
test('package_files_hold_what_runs_and_the_licenses_and_nothing_else', () => {
  const files = packedFiles();
  const required = [manifest.bin.mutoscope, 'LICENSE', 'NOTICE', 'README.md', 'package.json', 'src/tokens.json', 'src/icons/names.json', 'src/icons/LICENSE', 'src/icons/simple-icons/LICENSE'];
  const leaked = files.filter((path) => !/^(src\/|LICENSE$|NOTICE$|README(\.ko)?\.md$|package\.json$)/.test(path));

  assert.deepEqual(required.filter((path) => !files.includes(path)), []);
  assert.ok(files.some((path) => path.startsWith('src/icons/carbon/')) && files.some((path) => path.startsWith('src/icons/simple-icons/')));
  assert.deepEqual(leaked, []);
});

// 근거: 계약 package.json 공개 항목. 글꼴은 의존 패키지로 설치되고 시험 도구는 설치되지 않는다
test('package_manifest_is_public_and_installs_the_fonts_but_not_the_test_tools', () => {
  assert.equal(manifest.private, undefined);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.engines.node, '>=20');
  assert.equal(manifest.license, 'MIT');
  assert.ok(manifest.description && manifest.keywords.length && manifest.repository.url && manifest.homepage && manifest.bugs.url);
  for (const font of ['@expo-google-fonts/inter', '@expo-google-fonts/noto-sans-kr', 'jetbrains-mono']) assert.ok(manifest.dependencies[font], font);
  assert.equal(manifest.dependencies['playwright-core'], undefined);
});
