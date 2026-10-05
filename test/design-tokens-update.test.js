// design-tokens 새 버전 감지(이슈 #90): 가짜 태그 응답으로 최신 태그 판정과 PR, 이슈 본문을 시험한다. 근거: 이슈 #90 계약 "새 버전 감지"
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { currentTag, decide, isNewer, issueBody, latestTag, normalizeTag, prBody } from '../scripts/update-design-tokens.mjs';
import { withFolder } from './helpers.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/update-design-tokens.mjs');
const spec = (tag) => ({ devDependencies: { '@woonyong-choi/design-tokens': `github:woonyong-choi/design-tokens#${tag}` } });
const tags = (...names) => names.map((name) => ({ name }));

// 근거: 정기 확인은 "최신 태그 비교". 숫자로 비교해 v0.1.10이 v0.1.9보다 새롭고, 시험판과 다른 이름은 무시한다
test('latestTag_compares_versions_numerically_and_ignores_prerelease_and_other_tags', () => {
  assert.equal(latestTag(tags('v0.1.9', 'v0.1.10', 'v0.1.2', 'v0.2.0-rc.1', 'nightly')), 'v0.1.10');
  assert.equal(latestTag(tags('v1.0.0', 'v0.9.9')), 'v1.0.0');
  assert.equal(latestTag(tags('nightly')), null);
  assert.ok(isNewer('v0.1.1', 'v0.1.0') && !isNewer('v0.1.0', 'v0.1.0') && !isNewer('v0.1.0', 'v0.1.1'));
});

// 근거: 새 버전이면 PR을 열고 같은 버전이면 열지 않는다
test('decide_updates_only_when_the_target_tag_is_newer_than_the_pinned_one', () => {
  assert.deepEqual(decide({ manifest: spec('v0.1.0'), tags: tags('v0.1.0', 'v0.1.1'), requested: '' }), { current: 'v0.1.0', latest: 'v0.1.1', update: true });
  assert.equal(decide({ manifest: spec('v0.1.1'), tags: tags('v0.1.0', 'v0.1.1'), requested: '' }).update, false);
  assert.equal(decide({ manifest: spec('v0.1.2'), tags: tags('v0.1.0', 'v0.1.1'), requested: '' }).update, false);
});

// 근거: 릴리스 알림 payload의 version은 `v` 없이(`0.1.1`) 오고 수동 실행은 `v0.1.1`로 쓴다. 없는 태그는 PR을 만들지 않고 오류다
test('decide_takes_the_requested_tag_with_or_without_v_and_rejects_a_tag_that_does_not_exist', () => {
  const manifest = spec('v0.1.0');

  assert.equal(normalizeTag('0.1.1'), 'v0.1.1');
  assert.equal(decide({ manifest, tags: tags('v0.1.0', 'v0.1.1', 'v0.1.2'), requested: '0.1.1' }).latest, 'v0.1.1');
  assert.equal(decide({ manifest, tags: tags('v0.1.0', 'v0.1.1'), requested: 'v0.1.1' }).latest, 'v0.1.1');
  assert.throws(() => decide({ manifest, tags: tags('v0.1.0'), requested: '9.9.9' }), /does not exist/);
  assert.throws(() => decide({ manifest, tags: tags('nightly'), requested: '' }), /no vX\.Y\.Z tag/);
  assert.throws(() => currentTag({ devDependencies: { '@woonyong-choi/design-tokens': '^0.1.0' } }), /pinned to a vX\.Y\.Z tag/);
});

// 근거: 스크립트 입구. 가짜 응답 파일과 REQUESTED로 `key=value` 줄이 나오고, GITHUB_OUTPUT에 그대로 붙일 수 있다
test('detect_command_prints_current_latest_and_update_from_a_fake_tags_response', () => withFolder((folder) => {
  writeFileSync(join(folder, 'package.json'), JSON.stringify(spec('v0.1.0')));
  writeFileSync(join(folder, 'tags.json'), JSON.stringify(tags('v0.1.1', 'v0.1.0')));
  const run = (env) => spawnSync(process.execPath, [SCRIPT, 'detect', '--tags', 'tags.json'], { cwd: folder, encoding: 'utf8', env: { ...process.env, REQUESTED: '', ...env } });

  assert.equal(run({}).stdout, 'current=v0.1.0\nlatest=v0.1.1\nupdate=true\n');
  assert.equal(run({ REQUESTED: '0.1.0' }).stdout, 'current=v0.1.0\nlatest=v0.1.0\nupdate=false\n');
  assert.equal(run({ REQUESTED: '0.3.0' }).status, 1);
}));

// 근거: GITHUB_TOKEN으로 만든 PR은 ci.yml을 실행하지 않으므로 시험 결과를 PR 본문에 적는다. 실패하면 초안이라는 안내와 로그 끝을 적는다
test('prBody_reports_the_results_and_adds_the_log_tail_only_when_something_failed', () => {
  const base = { current: 'v0.1.0', latest: 'v0.1.1', issue: '7' };
  const passed = prBody({ ...base, results: { test: 'pass', check: 'pass' } });
  const failed = prBody({ ...base, results: { test: 'fail', check: 'pass' }, log: `${'line\n'.repeat(50)}last line\n` });

  assert.match(passed, /^Closes #7\n/);
  assert.match(passed, /design-tokens v0\.1\.0에서 v0\.1\.1로 올린다/);
  assert.match(passed, /\| `npm test` \| 통과 \|/);
  assert.doesNotMatch(passed, /초안|details/);
  assert.match(failed, /\| `npm test` \| 실패 \|/);
  assert.match(failed, /초안 PR/);
  assert.match(failed, /last line/);
  assert.equal(failed.match(/^line$/gm).length, 29);
  assert.match(issueBody(base), /design-tokens v0\.1\.1가 나왔다\. v0\.1\.0에서 올리고/);
});

// 근거: 이슈 #90 계약 "repository_dispatch(design-tokens-release)와 정기 확인 둘 다 받는다", 수동 실행, 필요한 권한 명시
test('design_tokens_update_workflow_listens_to_dispatch_schedule_and_manual_runs_with_explicit_permissions', () => {
  const text = readFileSync(join(ROOT, '.github/workflows/design-tokens-update.yml'), 'utf8');

  assert.match(text, /repository_dispatch:\n\s+types: \[design-tokens-release\]/);
  assert.match(text, /schedule:\n\s+- cron: '[^']+'/);
  assert.match(text, /workflow_dispatch:/);
  assert.match(text, /permissions:\n\s+contents: write\n\s+pull-requests: write\n\s+issues: write/);
});

// 근거: 이슈 #106. 이슈와 PR 만들기는 스크립트의 publish가 맡고(YAML에 gh issue create를 두지 않는다), 프로젝트 번호를 하드코딩하지 않으며, 토큰 권한 설명에 Projects를 적는다
test('design_tokens_update_workflow_delegates_publishing_and_documents_the_projects_permission', () => {
  const text = readFileSync(join(ROOT, '.github/workflows/design-tokens-update.yml'), 'utf8');

  assert.match(text, /node scripts\/update-design-tokens\.mjs publish /);
  assert.doesNotMatch(text, /gh issue create|gh pr create/);
  assert.doesNotMatch(text, /project-number|projects\/\d+|projectV2\(number/i);
  assert.match(text.split('\non:')[0], /프로젝트 쓰기 권한\(Projects\)/);
});
