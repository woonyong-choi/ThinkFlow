// design-tokens 갱신 이슈의 라벨·제목·프로젝트 등록(이슈 #106): 가짜 gh로 이슈, PR, 진행판 호출을 시험한다. 근거: 이슈 #106 완료 조건
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { issueTitle } from '../scripts/lib/design-tokens-board.mjs';
import { publish } from '../scripts/update-design-tokens.mjs';
import { withFolder } from './helpers.js';

const REPO = 'woonyong-choi/daphnis';
const SECRET = 'ghp_secret0123456789';
const FAILURE = 'HTTP 403: Resource not accessible by integration';

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 호출 수
// basis: estimate
/** 상태를 가진 가짜 gh. fail은 'lookup' | 'register' | 'status' 중 실패시킬 호출이다. */
function fakeGh({ fail = null, issues = [], prs = [], item = null } = {}) {
  const state = { issues: [...issues], prs: [...prs], item, created: { issues: [], prs: [] }, added: 0, statusSet: 0 };
  // cost: time O(a), heap O(1), stack O(1)
  // vars: a = 인자 수
  // basis: estimate
  const arg = (args, key) => args.find((value) => value.startsWith(`${key}=`))?.slice(key.length + 1);
  const refuse = (step) => (fail === step ? { status: 1, stdout: '', stderr: `${FAILURE} ${SECRET}\nextra line` } : null);
  // cost: time O(1), heap O(1), stack O(1)
  // basis: estimate
  const graphql = (args) => {
    const query = arg(args, 'query');
    if (query.includes('projectsV2')) {
      return refuse('lookup') ?? { status: 0, stdout: JSON.stringify({ data: { repository: { issue: { id: 'ISSUE', projectItems: { nodes: state.item ? [{ id: state.item.id, project: { id: 'PROJECT' }, status: state.item.status ? { name: state.item.status } : null }] : [] } }, projectsV2: { nodes: [{ id: 'PROJECT', title: '진행판', field: { id: 'FIELD', options: [{ id: 'WAIT', name: '대기' }, { id: 'DOING', name: '진행' }] } }] } } } }), stderr: '' };
    }
    if (query.includes('addProjectV2ItemById')) {
      const refused = refuse('register');
      if (!refused) { state.added += 1; state.item = { id: 'ITEM', status: null }; }
      return refused ?? { status: 0, stdout: JSON.stringify({ data: { addProjectV2ItemById: { item: { id: 'ITEM' } } } }), stderr: '' };
    }
    const refused = refuse('status');
    if (!refused) { state.statusSet += 1; assert.equal(arg(args, 'option'), 'WAIT'); state.item.status = '대기'; }
    return refused ?? { status: 0, stdout: '{"data":{}}', stderr: '' };
  };
  // cost: time O(a), heap O(a), stack O(1)
  // vars: a = 인자 수
  // basis: estimate
  const gh = (args) => {
    const [group, action] = args;
    if (group === 'api') return graphql(args);
    if (group === 'issue' && action === 'list') return { status: 0, stdout: JSON.stringify(state.issues), stderr: '' };
    if (group === 'issue') {
      const labels = args.flatMap((value, i) => (args[i - 1] === '--label' ? [value] : []));
      const number = 200 + state.created.issues.length;
      state.created.issues.push({ title: args[args.indexOf('--title') + 1], labels });
      return { status: 0, stdout: `https://github.com/${REPO}/issues/${number}\n`, stderr: '' };
    }
    if (action === 'list') return { status: 0, stdout: JSON.stringify(state.prs), stderr: '' };
    state.created.prs.push(args);
    return { status: 0, stdout: `https://github.com/${REPO}/pull/300\n`, stderr: '' };
  };
  return { gh, state };
}

// cost: time O(1), heap O(1), stack O(1), io 2
// basis: estimate
/** 임시 폴더에서 publish를 한 번 돌리고 { result, warnings, summary }를 돌려준다. */
function runPublish(gh) {
  return withFolder((dir) => {
    const warnings = [];
    const summaryFile = join(dir, 'summary.md');
    const env = { GITHUB_REPOSITORY: REPO, GITHUB_STEP_SUMMARY: summaryFile, GH_TOKEN: SECRET };
    const options = { current: 'v0.1.1', latest: 'v0.1.2', branch: 'chore/design-tokens-v0.1.2', dir, test: 'pass', check: 'pass' };
    const result = publish({ gh, options, env, write: (text) => warnings.push(text) });
    let summary = '';
    try { summary = readFileSync(summaryFile, 'utf8'); } catch { /* 실패가 없으면 요약 파일도 없다 */ }
    return { result, warnings, summary };
  });
}

// 근거: 완료 조건 1. 새 이슈에 build, area:repo, P3가 붙고 제목이 `{대상} 변경` 20자 이내다. 버전이 길면 짧은 형식을 쓴다
test('publish_creates_the_issue_with_priority_label_and_a_title_within_twenty_characters', () => {
  const { gh, state } = fakeGh();
  runPublish(gh);

  assert.deepEqual(state.created.issues, [{ title: '공통 토큰 v0.1.2 변경', labels: ['build', 'area:repo', 'P3'] }]);
  assert.equal(issueTitle('v100.100.100'), '토큰 v100.100.100 변경');
  assert.throws(() => issueTitle('v1000.1000.1000'), /exceeds 20/);
});

// 근거: 완료 조건 2. 조회, 등록, 상태 설정 어느 호출이 실패해도 요약과 경고에 실패 단계와 이유가 남고 이슈와 PR은 만들어진다. 토큰 값은 남지 않는다
test('publish_records_the_failed_step_and_reason_for_each_project_call_and_still_creates_issue_and_pr', () => {
  for (const [fail, step] of [['lookup', '조회'], ['register', '등록'], ['status', '상태 설정']]) {
    const { gh, state } = fakeGh({ fail });
    const { result, warnings, summary } = runPublish(gh);

    assert.match(summary, /## 프로젝트 등록 실패/, fail);
    assert.ok(summary.includes(`- ${step} 단계: ${FAILURE} ***`), `${fail}: ${summary}`);
    assert.deepEqual(warnings, [`::warning::프로젝트 등록 실패(${step}): ${FAILURE} ***\n`], fail);
    assert.equal(state.created.issues.length, 1, fail);
    assert.equal(state.created.prs.length, 1, fail);
    assert.equal(result.issue, 200, fail);
    assert.ok(!summary.includes(SECRET) && !warnings.join('').includes(SECRET), fail);
  }
});

// 근거: 완료 조건 3. 권한을 고친 재실행은 열린 이슈(옛 제목 포함)와 PR을 쓰고 새로 만들지 않으며, 판에 없는 이슈만 등록해 Status를 `대기`로 둔다
test('publish_rerun_reuses_the_issue_and_pr_and_only_puts_the_issue_on_the_board_as_waiting', () => {
  const issues = [{ number: 150, title: 'design-tokens v0.1.2로 올린다' }];
  const { gh, state } = fakeGh({ issues, prs: [{ number: 160 }] });
  const { result, warnings, summary } = runPublish(gh);

  assert.deepEqual(result, { issue: 150, pr: 160 });
  assert.deepEqual([state.created.issues, state.created.prs], [[], []]);
  assert.deepEqual([state.added, state.statusSet, state.item], [1, 1, { id: 'ITEM', status: '대기' }]);
  assert.deepEqual([warnings, summary], [[], '']);

  const placed = fakeGh({ issues: [{ number: 150, title: '공통 토큰 v0.1.2 변경' }], prs: [{ number: 160 }], item: { id: 'ITEM', status: '진행' } });
  runPublish(placed.gh);
  assert.deepEqual([placed.state.added, placed.state.statusSet, placed.state.item.status], [0, 0, '진행']);
});
