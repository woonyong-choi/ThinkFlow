// design-tokens 갱신 워크플로의 이슈 찾기·만들기와 프로젝트 진행판 등록(이슈 #106). gh 실행은 주입받아 가짜로 시험한다.
// gh 실행 함수의 모양: (args: string[]) => { status, stdout, stderr }
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

export const LABELS = ['build', 'area:repo', 'P3'];
export const STATUS = '대기';
const TITLE_MAX = 20;
const TOKEN_PATTERN = /gh[pousr]_\w+|github_pat_\w+/g;
const TOKEN_ENV = ['GH_TOKEN', 'GITHUB_TOKEN', 'DESIGN_TOKENS_UPDATE_TOKEN'];

const LOOKUP = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){
  issue(number:$number){id projectItems(first:50){nodes{id project{id} status:fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}}
  projectsV2(first:20){nodes{id title field(name:"Status"){... on ProjectV2SingleSelectField{id options{id name}}}}}}}`;
const ADD = 'mutation($project:ID!,$content:ID!){addProjectV2ItemById(input:{projectId:$project,contentId:$content}){item{id}}}';
const SET = 'mutation($project:ID!,$item:ID!,$field:ID!,$option:String!){updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:{singleSelectOptionId:$option}}){projectV2Item{id}}}';

// cost: time O(a), heap O(a), stack O(1), io 1
// vars: a = gh 출력 글자 수
// basis: estimate
/** 실제 gh를 실행한다. */
export function realGh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr || result.error?.message || '' };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 토큰 값과 토큰 모양의 글을 가린다. 한 줄로 줄여 경고 줄에 쓸 수 있게 한다. */
export function redact(text, env = process.env) {
  const secrets = TOKEN_ENV.map((name) => env[name]).filter(Boolean);
  const hidden = secrets.reduce((out, secret) => out.split(secret).join('***'), String(text));
  return hidden.replace(TOKEN_PATTERN, '***').replace(/\s+/g, ' ').trim();
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 새 이슈 제목 `공통 토큰 v0.1.2 변경`. 20자를 넘으면 `토큰 v0.1.2 변경`으로 줄인다. */
export function issueTitle(latest) {
  const title = [`공통 토큰 ${latest} 변경`, `토큰 ${latest} 변경`].find((text) => [...text].length <= TITLE_MAX);
  if (!title) throw new Error(`issue title for ${latest} exceeds ${TITLE_MAX} characters`);
  return title;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 이 형식 전에 만든 이슈 제목. 열려 있으면 중복을 만들지 않으려고 같이 찾는다. */
export const legacyIssueTitle = (latest) => `design-tokens ${latest}로 올린다`;

// cost: time O(1), heap O(a), stack O(1), io 1
// vars: a = 응답 글자 수
// basis: estimate
/** gh를 실행해 stdout을 돌려준다. 실패하면 stderr 첫 줄을 이유로 던진다. */
function call(gh, args) {
  const { status, stdout, stderr } = gh(args);
  if (status !== 0) throw new Error(redact(stderr.trim().split('\n')[0] || `gh exit ${status}`));
  return stdout;
}

// cost: time O(1), heap O(a), stack O(1), io 1
// vars: a = 응답 글자 수
// basis: estimate
/** GraphQL 호출. 응답의 errors도 실패로 본다. */
function graphql(gh, query, variables) {
  const flags = Object.entries(variables).flatMap(([key, value]) => [typeof value === 'number' ? '-F' : '-f', `${key}=${value}`]);
  const body = JSON.parse(call(gh, ['api', 'graphql', '-f', `query=${query}`, ...flags]));
  if (body.errors?.length) throw new Error(redact(body.errors.map((error) => error.message).join('; ')));
  return body.data;
}

// cost: time O(i), heap O(i), stack O(1), io 1
// vars: i = 열린 build 이슈 수(100개까지)
// basis: estimate
/** 같은 버전의 열린 이슈 번호(새 제목과 옛 제목 모두). 없으면 null이다. */
export function findIssue(gh, latest) {
  const titles = new Set([issueTitle(latest), legacyIssueTitle(latest)]);
  const issues = JSON.parse(call(gh, ['issue', 'list', '--state', 'open', '--label', 'build', '--limit', '100', '--json', 'number,title']));
  return issues.find((issue) => titles.has(issue.title))?.number ?? null;
}

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
/** 이슈를 만들고 번호를 돌려준다. 실패하면 던진다(이슈가 없으면 PR도 만들 수 없다). */
export function createIssue({ gh, latest, bodyFile }) {
  const labels = LABELS.flatMap((label) => ['--label', label]);
  const url = call(gh, ['issue', 'create', '--title', issueTitle(latest), '--body-file', bodyFile, ...labels]).trim();
  return Number(url.split('/').pop());
}

// cost: time O(p), heap O(p), stack O(1), io 1
// vars: p = 연결된 프로젝트 수
// basis: estimate
/** 이슈 id와 연결된 프로젝트별 { id, item, field } 목록. item은 이미 등록된 항목 { id, status }, field는 Status 필드. */
function lookup(gh, repo, issue) {
  const [owner, name] = repo.split('/');
  const { repository } = graphql(gh, LOOKUP, { owner, name, number: issue });
  const items = repository.issue?.projectItems.nodes ?? [];
  const boards = repository.projectsV2.nodes.map((board) => {
    const item = items.find((entry) => entry.project.id === board.id);
    return { id: board.id, field: board.field, item: item ? { id: item.id, status: item.status?.name ?? null } : null };
  });
  if (!repository.issue) throw new Error(`issue #${issue} not found`);
  if (boards.length === 0) throw new Error('이 저장소에 연결된 프로젝트가 없다');
  return { issueId: repository.issue.id, boards };
}

// cost: time O(o), heap O(1), stack O(1), io 1
// vars: o = Status 선택지 수
// basis: estimate
/** Status를 `대기`로 둔다. 필드나 선택지가 없으면 던진다. */
function setStatus(gh, board, itemId) {
  const option = board.field?.options?.find((entry) => entry.name === STATUS);
  if (!option) throw new Error(`프로젝트의 Status 필드에 '${STATUS}' 선택지가 없다`);
  graphql(gh, SET, { project: board.id, item: itemId, field: board.field.id, option: option.id });
}

// cost: time O(p·o), heap O(p), stack O(1), io p
// vars: p = 연결된 프로젝트 수, o = Status 선택지 수
// basis: estimate
/**
 * 이슈를 연결된 모든 프로젝트에 등록하고 Status를 `대기`로 둔다. 이미 등록된 항목은 다시 만들지 않고, Status가 비어 있을 때만 채운다.
 * @returns 실패 목록 [{ step: '조회'|'등록'|'상태 설정', reason }]. 모두 성공하면 빈 목록
 */
export function registerOnBoard({ gh, repo, issue }) {
  const failures = [];
  const attempt = (step, work) => {
    try {
      return work();
    } catch (error) {
      failures.push({ step, reason: redact(error.message) });
      return null;
    }
  };
  const found = attempt('조회', () => lookup(gh, repo, issue));
  for (const board of found?.boards ?? []) {
    const itemId = board.item?.id ?? attempt('등록', () => graphql(gh, ADD, { project: board.id, content: found.issueId }).addProjectV2ItemById.item.id);
    if (itemId && !board.item?.status) attempt('상태 설정', () => setStatus(gh, board, itemId));
  }
  return failures;
}

// cost: time O(f), heap O(f), stack O(1), io 1
// vars: f = 실패 수
// basis: estimate
/** 실패를 실행 요약의 "프로젝트 등록 실패" 문단과 `::warning::` 줄로 남긴다. 실패가 없으면 아무것도 쓰지 않는다. */
export function reportFailures({ failures, issue, summaryFile, write }) {
  if (failures.length === 0) return;
  const lines = failures.map(({ step, reason }) => `- ${step} 단계: ${reason}`);
  const text = ['## 프로젝트 등록 실패', '', `이슈 #${issue}를 프로젝트 진행판에 등록하지 못했다. 이슈와 PR 만들기는 계속했다. 토큰에 프로젝트 쓰기 권한(Projects)이 있는지 확인한 뒤 같은 버전으로 워크플로를 다시 실행하면 등록만 한다.`, '', ...lines, ''].join('\n');
  if (summaryFile) appendFileSync(summaryFile, `${text}\n`);
  for (const { step, reason } of failures) write(`::warning::프로젝트 등록 실패(${step}): ${reason}\n`);
}
