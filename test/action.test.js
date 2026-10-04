// GitHub Action: action.yml의 Run daphnis 스크립트를 실제 Git 인덱스가 있는 저장소에서 그대로 실행한다(docs/design/markdown.md 경로 수집).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { withFolder } from './helpers.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// cost: time O(a), heap O(a), stack O(1)
// vars: a = action.yml 줄 수
// basis: estimate
// action.yml의 `Run daphnis` 단계 스크립트 본문. 들여쓰기를 걷어 낸다.
function actionScript() {
  const lines = readFileSync(join(ROOT, 'action.yml'), 'utf8').split('\n');
  const start = lines.findIndex((l) => l.includes('- name: Run daphnis'));
  const body = lines.slice(lines.findIndex((l, i) => i > start && l.trim() === 'run: |') + 1);
  const end = body.findIndex((l) => l.trim() && !l.startsWith('        '));
  return body.slice(0, end === -1 ? undefined : end).map((l) => l.slice(8)).join('\n');
}

const GOOD_MD = '# 문서\n\n그림 없는 본문\n';
const BAD_MD = '# 문서\n\n```dap\nchart\n```\n';
const GOOD_DAP = 'flow right\nbox a "A"\n';

// cost: time O(f), heap O(f), stack O(1), io 3
// vars: f = 파일 수
// basis: estimate
// files({ 경로: 내용 })를 Git 인덱스에 올린 저장소에서 Action 스크립트를 돌린다. 이름에 줄바꿈이 들어갈 수 있어 경로는 NUL로 넘긴다.
function runAction(folder, files, { paths = '**/*.dap **/*.md', mode = 'check', strict = 'false' } = {}) {
  spawnSync('git', ['init', '-q'], { cwd: folder });
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, name)), { recursive: true });
    writeFileSync(join(folder, name), text);
  }
  const tracked = spawnSync('git', ['add', '-A', '--', ...Object.keys(files)], { cwd: folder, encoding: 'utf8' });
  assert.equal(tracked.status, 0, tracked.stderr);
  const env = { ...process.env, GITHUB_ACTION_PATH: ROOT, PATHS: paths, MODE: mode, STRICT: strict };
  return spawnSync('bash', ['-c', actionScript()], { cwd: folder, env, encoding: 'utf8' });
}

// 근거: 이슈 #78, 설계 markdown.md: Git에 등록되고 paths에 맞는 모든 파일을 이름의 문자와 무관하게 검사한다
test('action_check_fails_for_a_bad_block_in_a_file_whose_name_is_hangul_spaced_or_has_a_newline', () => {
  for (const name of ['설계.md', 'a b.md', 'docs/한글 폴더/글.md', 'line\nbreak.md', "it's.md"]) {
    withFolder((folder) => {
      const result = runAction(folder, { 'ok.md': GOOD_MD, [name]: BAD_MD });

      assert.equal(result.status, 1, `${JSON.stringify(name)}: ${result.stdout}${result.stderr}`);
      assert.ok((result.stdout + result.stderr).includes(name.split('\n')[0]), `${JSON.stringify(name)}: ${result.stdout}${result.stderr}`);
    });
  }
});

// 근거: 이슈 #78 댓글: 명시한 옛 확장자(.muto) 원본도 같은 경로 수집과 검사를 거친다
test('action_check_reads_an_explicitly_selected_old_extension_source_instead_of_dropping_it', () => {
  withFolder((folder) => {
    const result = runAction(folder, { 'ok.md': GOOD_MD, 'legacy.muto': 'chart\n', '한글.muto': 'chart\n' }, { paths: 'legacy.muto 한글.muto **/*.md' });

    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr + result.stdout, /legacy\.muto/);
    assert.match(result.stderr + result.stdout, /한글\.muto/);
  });
});

// 근거: 이슈 #78 완료 조건: 같은 파일을 여러 glob이 고르면 한 번만 검사하고, 올바른 파일은 이름과 상관없이 통과한다
test('action_check_runs_each_matched_file_once_and_passes_valid_files_with_any_name', () => {
  withFolder((folder) => {
    const files = { '설계.md': GOOD_MD, 'a b.md': GOOD_MD, 'line\nbreak.md': GOOD_MD, '그림.dap': GOOD_DAP, 'docs/글.md': BAD_MD };
    const once = runAction(folder, files, { paths: '**/*.md **/*.md docs/*.md **/*.dap' });
    const diagnostics = (once.stdout + once.stderr).split('\n').filter((l) => l.includes('docs/글.md'));

    assert.equal(once.status, 1, once.stdout + once.stderr);
    assert.equal(diagnostics.length, 1, diagnostics.join('\n'));
  });
  withFolder((folder) => {
    const ok = runAction(folder, { '설계.md': GOOD_MD, 'a b.md': GOOD_MD, 'line\nbreak.md': GOOD_MD, '그림.dap': GOOD_DAP });

    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  });
});

// 근거: action.yml 입력 계약: 어느 파일과도 맞지 않는 paths는 오류다
test('action_check_with_no_matching_tracked_file_fails_with_an_error_annotation', () => {
  withFolder((folder) => {
    const result = runAction(folder, { 'x.txt': 'x' });

    assert.equal(result.status, 1);
    assert.match(result.stdout, /::error::no tracked \.dap or \.md file matches/);
  });
});
