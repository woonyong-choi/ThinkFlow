// design-tokens 새 버전 감지(.github/workflows/design-tokens-update.yml)가 쓰는 판정과 글 만들기.
// 사용: node scripts/update-design-tokens.mjs detect [--tags 파일]   package.json의 태그와 최신 태그를 비교해 `key=value` 줄(current, latest, update)을 낸다.
//       node scripts/update-design-tokens.mjs body --kind pr|issue --current 태그 --latest 태그 [--issue 번호] [--test pass|fail] [--check pass|fail] [--log 파일]   PR이나 이슈 본문을 낸다.
// `detect`의 태그 목록은 GitHub API(공개 저장소)에서 받는다. `--tags`는 같은 모양의 응답 파일을 대신 읽는 시험용 입구다.
// 환경 변수: REQUESTED(알림이나 수동 실행이 알려 준 태그, 비면 최신 태그), GITHUB_TOKEN(있으면 API 호출에 쓴다)
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REPO = 'woonyong-choi/design-tokens';
const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const DEPENDENCY = '@woonyong-choi/design-tokens';
const API = `https://api.github.com/repos/${REPO}/tags?per_page=100`;
const LOG_LINES = 30;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** `v0.1.2`의 [0, 1, 2]. 이 모양이 아니면 null이다(시험판 태그 `v0.2.0-rc.1`도 null). */
export function parseVersion(tag) {
  const match = TAG.exec(String(tag));
  return match ? match.slice(1).map(Number) : null;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** a가 b보다 새 버전이면 true. 둘 다 `vX.Y.Z`여야 한다. */
export function isNewer(a, b) {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  if (!x || !y) throw new Error(`not a vX.Y.Z tag: ${x ? b : a}`);
  const at = x.findIndex((part, i) => part !== y[i]);
  return at >= 0 && x[at] > y[at];
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 알림의 version(`0.1.1`, design-tokens 릴리스가 `v` 없이 보낸다)과 수동 입력(`v0.1.1`)을 `v0.1.1`로 맞춘다. 빈 글은 그대로다. */
export function normalizeTag(version) {
  const text = String(version ?? '').trim();
  return /^\d+\.\d+\.\d+$/.test(text) ? `v${text}` : text;
}

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 태그 수
// basis: estimate
/** GitHub API 태그 응답(`[{ name }]`)에서 가장 새 `vX.Y.Z` 태그. 없으면 null이다. */
export function latestTag(tags) {
  const names = tags.map((tag) => tag.name).filter(parseVersion);
  return names.reduce((best, name) => (best === null || isNewer(name, best) ? name : best), null);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** package.json의 design-tokens 태그(`github:woonyong-choi/design-tokens#v0.1.0`의 `v0.1.0`). 이 모양이 아니면 던진다. */
export function currentTag(manifest) {
  const spec = manifest.dependencies?.[DEPENDENCY];
  const tag = /#(v\d+\.\d+\.\d+)$/.exec(spec ?? '')?.[1];
  if (!tag) throw new Error(`${DEPENDENCY} must be pinned to a vX.Y.Z tag in package.json dependencies: ${spec}`);
  return tag;
}

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 태그 수
// basis: estimate
/**
 * 올릴지 정한다. 알려 준 태그(requested, `v` 없이 와도 된다)가 있으면 그것이 목표이고 태그 목록에 있어야 한다. 없으면 최신 태그가 목표다.
 * @returns { current, latest, update } update는 목표가 지금 태그보다 새 버전일 때만 true
 */
export function decide({ manifest, tags, requested }) {
  const current = currentTag(manifest);
  const target = normalizeTag(requested);
  const latest = target || latestTag(tags);
  if (!latest || !parseVersion(latest)) throw new Error(`no vX.Y.Z tag to update to: ${latest ?? 'none found'}`);
  if (target && !tags.some((tag) => tag.name === target)) throw new Error(`tag ${target} does not exist in ${REPO}`);
  return { current, latest, update: isNewer(latest, current) };
}

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 로그 줄 수
// basis: estimate
/** PR 본문에 붙일 로그의 끝 몇 줄. */
function logTail(log) {
  return log.trimEnd().split('\n').slice(-LOG_LINES).join('\n');
}

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 로그 줄 수
// basis: estimate
/**
 * PR 본문. 시험 결과를 본문에 적는 까닭은 GITHUB_TOKEN으로 만든 PR이 다른 워크플로(ci.yml)를 실행하지 않기 때문이다.
 * @param options { current, latest, issue, results: { test, check }, log }
 */
export function prBody({ current, latest, issue, results, log }) {
  const mark = (state) => (state === 'pass' ? '통과' : state === 'fail' ? '실패' : '실행 안 함');
  const failed = Object.values(results).includes('fail');
  return [
    `Closes #${issue}`,
    '',
    `design-tokens ${current}에서 ${latest}로 올린다. \`design-tokens-update\` 워크플로가 만들었다.`,
    '',
    '## 변경',
    '',
    '- `package.json`, `package-lock.json`: design-tokens 태그',
    '- `src/tokens.css`, `src/tokens.js`, `src/tokens.json`: `npm run palette`와 `npm run tokens`로 다시 만든 값',
    '- 예제와 문서 그림: `npm run figures`로 다시 만든 SVG와 HTML',
    '',
    '## 확인',
    '',
    '| 항목 | 결과 |',
    '|---|---|',
    `| \`npm test\` | ${mark(results.test)} |`,
    `| \`npm run check\` | ${mark(results.check)} |`,
    '',
    'GITHUB_TOKEN으로 만든 PR은 `ci.yml`을 자동으로 실행하지 않아 위 시험을 워크플로의 같은 job에서 돌렸다. CI도 돌리려면 PR을 닫았다가 다시 연다.',
    ...(failed ? ['', '시험이 실패해 초안 PR로 열었다. 토큰 값이 바뀌어 대비나 결정 규칙 시험이 깨졌다면 design-tokens 쪽 변경을 먼저 확인한다.', '', '<details><summary>실패 로그 끝 부분</summary>', '', '```text', logTail(log ?? ''), '```', '', '</details>'] : []),
    '',
  ].join('\n');
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 이슈 본문. 같은 내용의 PR이 뒤따른다. */
export function issueBody({ current, latest }) {
  return [
    '## 목표',
    '',
    `design-tokens ${latest}가 나왔다. ${current}에서 올리고 토큰과 생성물을 다시 만든다.`,
    '',
    '## 완료 조건',
    '',
    `- [ ] \`package.json\`의 design-tokens 태그가 ${latest}다`,
    '- [ ] `npm run palette`, `npm run tokens`, `npm run figures`로 생성물을 다시 만들었다',
    '- [ ] `npm test`와 `npm run check`가 통과한다',
    '',
  ].join('\n');
}

// cost: time O(a), heap O(a), stack O(1)
// vars: a = 인자 수
// basis: estimate
/** `--이름 값` 쌍을 객체로. */
function parseOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i].startsWith('--') || i + 1 >= args.length) throw new Error(`bad arguments: ${args.slice(i).join(' ')}`);
    options[args[i].slice(2)] = args[i + 1];
  }
  return options;
}

// cost: time O(n), heap O(n), stack O(1), io 1
// vars: n = 응답 글자 수
// basis: estimate
/** 태그 목록. `--tags` 파일이 있으면 그 파일, 없으면 GitHub API에서 받는다. */
async function readTags(file) {
  if (file) return JSON.parse(readFileSync(file, 'utf8'));
  const headers = { Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  const response = await fetch(API, { headers });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${API}`);
  return response.json();
}

// cost: time O(n), heap O(n), stack O(1), io 3
// vars: n = 응답 글자 수
// basis: estimate
/** 명령을 실행해 stdout에 쓸 글을 돌려준다. */
async function run([command, ...args]) {
  const options = parseOptions(args);
  if (command === 'detect') {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    const result = decide({ manifest, tags: await readTags(options.tags), requested: process.env.REQUESTED ?? '' });
    return `${Object.entries(result).map(([key, value]) => `${key}=${value}`).join('\n')}\n`;
  }
  if (command === 'body') {
    const { current, latest, kind } = options;
    if (!parseVersion(current) || !parseVersion(latest)) throw new Error('--current and --latest must be vX.Y.Z tags');
    if (kind === 'issue') return issueBody({ current, latest });
    if (kind === 'pr') return prBody({ current, latest, issue: options.issue, results: { test: options.test, check: options.check }, log: options.log ? readFileSync(options.log, 'utf8') : '' });
  }
  throw new Error('usage: update-design-tokens.mjs detect [--tags file] | body --kind pr|issue --current tag --latest tag [--issue n --test pass|fail --check pass|fail --log file]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(await run(process.argv.slice(2)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
