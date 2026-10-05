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
  const required = [manifest.bin.daphnis, 'LICENSE', 'NOTICE', 'README.md', 'package.json', 'src/tokens.json', 'src/icons/names.json', 'src/icons/LICENSE', 'src/icons/simple-icons/LICENSE', 'docs/assets/daphnis-light.svg', 'docs/assets/daphnis-dark.svg', 'docs/assets/daphnis-favicon-light.svg', 'docs/assets/daphnis-favicon-dark.svg'];
  const leaked = files.filter((path) => !/^(src\/|docs\/assets\/daphnis-[a-z-]+\.svg$|LICENSE$|NOTICE$|README(\.ko)?\.md$|package\.json$)/.test(path));

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
  for (const font of ['pretendard', 'jetbrains-mono']) assert.ok(manifest.dependencies[font], font);
  assert.equal(manifest.dependencies['playwright-core'], undefined);
});

// 근거: 이슈 #116 "런타임 의존성은 레지스트리 패키지만". git, GitHub 약칭, URL, 파일 경로 의존성이 있으면 설치할 때 git이나 GitHub, 로컬 경로가 필요해진다
test('package_runtime_dependencies_are_registry_versions_only', () => {
  const notRegistry = /^(git[+:@]|github:|gitlab:|bitbucket:|gist:|https?:|file:|link:|workspace:|[./~]|[\w.-]+\/[\w.-]+(#.*)?$)/;
  const offending = Object.entries(manifest.dependencies).filter(([, spec]) => notRegistry.test(spec)).map(([name, spec]) => `${name}: ${spec}`);

  assert.deepEqual(offending, []);
  assert.equal(manifest.dependencies['@woonyong-choi/design-tokens'], undefined);
  assert.match(manifest.devDependencies['@woonyong-choi/design-tokens'], /^github:woonyong-choi\/design-tokens#v\d+\.\d+\.\d+$/);
});
