// design-tokens 연결(이슈 #90): 공통 토큰은 패키지에서 받고, daphnis 정본은 그림 전용 토큰만 갖는다. 근거: docs/architecture.md 토큰 출처.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { commonTokenPaths, findRedefined, readCommonTokens } from '../scripts/lib/design-tokens.mjs';
import { readJson } from '../scripts/lib/read-json.mjs';
import { withFolder } from './helpers.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const BUILD = join(ROOT, 'scripts/build-tokens.mjs');
const CHECK = join(ROOT, 'scripts/check-tokens.mjs');
const PACKAGE = '@woonyong-choi/design-tokens';

const run = (script, args) => spawnSync(process.execPath, [script, ...args], { cwd: ROOT, encoding: 'utf8' });

// 근거: 계약 "의존성: github:woonyong-choi/design-tokens#v0.1.0". package.json의 태그와 설치된 패키지 버전이 같다
test('package_json_pins_design_tokens_to_the_tag_of_the_installed_version', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const installed = JSON.parse(readFileSync(createRequire(import.meta.url).resolve(`${PACKAGE}/package.json`), 'utf8'));

  assert.equal(manifest.devDependencies[PACKAGE], `github:woonyong-choi/design-tokens#v${installed.version}`);
});

// 근거: 계약 "같은 이름을 daphnis가 다시 정의하면 검사가 실패한다". 지금 정본에는 겹치는 이름이 없다
test('findRedefined_is_empty_for_the_committed_sources_and_names_a_shared_token', () => {
  const common = readCommonTokens();
  const local = { light: readJson(join(SRC, 'tokens.json')), dark: readJson(join(SRC, 'tokens.dark.json')) };
  const shared = new Map([['color', new Map([['fg', new Map([['$value', '#000000']])]])]]);

  assert.deepEqual(findRedefined(local, common), []);
  assert.deepEqual(findRedefined({ light: shared, dark: new Map() }, common), ['color.fg']);
  assert.deepEqual(findRedefined({ light: new Map(), dark: shared }, common), ['color.fg']);
});

// 근거: 계약 같은 줄. 다시 정의한 토큰이 있으면 `build-tokens --check`(npm run check)가 이름과 함께 1로 끝난다
test('build_tokens_check_fails_and_names_a_token_the_daphnis_source_redefines', () => withFolder((folder) => {
  copyFileSync(join(SRC, 'tokens.dark.json'), join(folder, 'tokens.dark.json'));
  const source = JSON.parse(readFileSync(join(SRC, 'tokens.json'), 'utf8'));
  source.color.fg = { $value: '#000000' };
  writeFileSync(join(folder, 'tokens.json'), JSON.stringify(source));
  const result = run(BUILD, [join(folder, 'tokens.json'), '--check']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /design-tokens already defines these tokens.*color\.fg/);
}));

// 근거: 규칙 "tokens.css, tokens.js 직접 수정 금지". 정본이나 design-tokens 버전이 바뀌었는데 생성물을 다시 만들지 않으면 실패한다
test('build_tokens_check_passes_for_the_committed_generated_files_and_fails_for_a_stale_one', () => withFolder((folder) => {
  assert.equal(run(BUILD, [join(SRC, 'tokens.json'), '--check']).status, 0);
  for (const name of ['tokens.json', 'tokens.dark.json', 'tokens.js']) copyFileSync(join(SRC, name), join(folder, name));
  writeFileSync(join(folder, 'tokens.css'), `${readFileSync(join(SRC, 'tokens.css'), 'utf8')}/* stale */\n`);
  const result = run(BUILD, [join(folder, 'tokens.json'), '--check']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /stale generated file.*tokens\.css/);
}));

// 근거: 규칙 "하드코딩 금지 유지". design-tokens의 기본 색 단계도 코드에서 직접 쓰면 check-tokens가 잡는다
test('check_tokens_reports_a_design_tokens_primitive_color_used_in_code', () => withFolder((folder) => {
  writeFileSync(join(folder, 'sample.css'), 'a { color: var(--color-blue-light-fill); }\n');
  const result = run(CHECK, ['--tokens', join(SRC, 'tokens.json'), folder]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /primitive token reference: --color-blue-light-fill/);
}));
