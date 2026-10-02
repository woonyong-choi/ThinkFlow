// 수치 기준(code-style)을 넘는 파일과 함수를 찾는다. 파일 300줄, 함수 40줄, 매개변수 3개.
// 사용: node scripts/check-size.mjs <폴더나 파일 ...>
// 출력: `{경로}:{줄}: {이름}: {이유}` 줄들과 마지막 `total {개수}`. 개수가 0이 아니면 종료 코드 1.
// 함수는 `function`, 블록 본문 화살표 함수, 클래스 메서드를 줄 시작 모양으로 찾고 중괄호 짝으로 끝을 찾는다. 생성 파일(첫 줄 표시)은 보지 않는다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const FILE_MAX = 300;
const FUNCTION_MAX = 40;
const PARAMS_MAX = 3;
const GENERATED_MARKS = ['생성물, 손으로 고치지 않음', '@generated'];
const SCRIPT_EXTS = new Set(['.js', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'out']);
const NOT_METHODS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function']);
const STRING = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|\/(?![/*])(?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+\/[a-z]*/g;
// 선언 모양: 이름과 매개변수 목록을 `name`, `params`로 잡는다. isArrow인 선언은 본문이 식이면 줄 수를 세지 않는다.
const DECLARATIONS = [
  { pattern: /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*(?<name>\w+)\s*\((?<params>[^)]*)\)/u },
  { pattern: /^\s*(?:export\s+)?(?:const|let|var)\s+(?<name>\w+)\s*=\s*(?:async\s+)?\((?<params>[^)]*)\)\s*=>/u, isArrow: true },
  { pattern: /^\s*(?:(?:static|async|get|set)\s+)*(?<name>#?\w+)\s*\((?<params>[^)]*)\)\s*\{/u },
];

// cost: time O(f·n), heap O(n), stack O(d), io f
// vars: f = 파일 수, n = 파일 줄 수, d = 폴더 깊이
// basis: estimate
function main(targets) {
  const findings = [];
  for (const path of targets.flatMap(listFiles)) findings.push(...checkFile(path));
  for (const { path, line, name, reason } of findings) console.log(`${path}:${line}: ${name}: ${reason}`);
  console.log(`total ${findings.length}`);
  return findings.length ? 1 : 0;
}

// cost: time O(f), heap O(f), stack O(d), io f
// vars: f = 파일 수, d = 폴더 깊이
// basis: estimate
function listFiles(target) {
  const stat = statSync(target);
  if (stat.isFile()) return SCRIPT_EXTS.has(extname(target)) ? [target] : [];
  return readdirSync(target).sort().flatMap((name) => (SKIP_DIRS.has(name) ? [] : listFiles(join(target, name))));
}

// cost: time O(n·b), heap O(n), stack O(1), io 1
// vars: n = 파일 줄 수, b = 함수 본문 줄 수
// basis: estimate
function checkFile(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  if (GENERATED_MARKS.some((mark) => lines[0].includes(mark))) return [];
  const findings = [];
  if (lines.length > FILE_MAX) findings.push({ path, line: 1, name: '(file)', reason: `${lines.length} lines, over ${FILE_MAX}` });
  lines.forEach((line, index) => {
    const found = DECLARATIONS.map(({ pattern, isArrow }) => ({ match: pattern.exec(line), isArrow })).find(({ match }) => match);
    if (!found || NOT_METHODS.has(found.match.groups.name)) return;
    const { name, params } = found.match.groups;
    const size = found.isArrow && !line.slice(line.indexOf('=>')).includes('{') ? 0 : bodyLines(lines, index);
    if (size > FUNCTION_MAX) findings.push({ path, line: index + 1, name, reason: `${size} lines, over ${FUNCTION_MAX}` });
    const count = params.trim() ? params.replace(/\{[^}]*\}|\[[^\]]*\]/g, 'x').split(',').length : 0;
    if (count > PARAMS_MAX) findings.push({ path, line: index + 1, name, reason: `${count} parameters, over ${PARAMS_MAX}` });
  });
  return findings;
}

// cost: time O(b), heap O(1), stack O(1)
// vars: b = 함수 본문 줄 수
// basis: estimate
// 선언 줄부터 중괄호 짝이 닫히는 줄까지의 줄 수. 문자열과 정규식, 줄 주석 안의 괄호는 세지 않는다.
function bodyLines(lines, start) {
  let depth = 0;
  let hasOpened = false;
  for (let i = start; i < lines.length; i++) {
    const code = lines[i].replace(STRING, "''").split('//')[0];
    for (const c of code) {
      if (c === '{') {
        depth++;
        hasOpened = true;
      } else if (c === '}') depth--;
    }
    if (hasOpened && depth <= 0) return i - start + 1;
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
