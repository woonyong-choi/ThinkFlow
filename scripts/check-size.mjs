// 수치 기준(code-style)을 넘는 파일과 함수를 찾는다. 파일 300줄, 함수 40줄, 매개변수 3개.
// 사용: node scripts/check-size.mjs [--advisory] <폴더나 파일 ...>
// 출력: `{경로}:{줄}: {이름}: {이유}` 줄들과 마지막 `total {개수}`. 개수가 0이 아니면 종료 코드 1.
// `--advisory`는 찾은 항목을 같은 모양으로 알리되 항목 때문에는 실패하지 않는다(종료 코드 0). 사용법 오류와 없는 대상은 두 방식 모두 종료 코드 2다.
// 함수는 `function`, 블록 본문 화살표 함수, 클래스 메서드를 줄 시작 모양으로 찾고 중괄호 짝으로 끝을 찾는다. 생성 파일(첫 줄 표시)은 보지 않는다.
// 이 수치는 읽기 어려운 곳을 가리키는 힌트이지 설계나 정확성의 증거가 아니다. 줄 시작 정규식으로 찾으므로 여러 줄 매개변수 목록,
// 기본값 안의 괄호, 블록 주석 안의 중괄호, 여러 줄 템플릿 글자를 바르게 읽지 못한다. 항목을 없애려고 일관된 코드를 쪼개지 않는다.
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { iterFiles } from '../src/vendor/theme/ui/build/lib/walk-files.mjs';

const USAGE = 'usage: check-size.mjs [--advisory] targets [targets ...]';
const FILE_MAX = 300;
const FUNCTION_MAX = 40;
const PARAMS_MAX = 3;
const GENERATED_MARKS = ['생성물, 손으로 고치지 않음', '@generated'];
const SCRIPT_EXTS = new Set(['.js', '.mjs', '.cjs']);
// 이 검사가 보는 파일: `.js`, `.mjs`, `.cjs`. 건너뛰는 폴더는 설치물과 빌드 결과(`out`) 폴더다.
const SOURCES = { wants: (name) => SCRIPT_EXTS.has(extname(name).toLowerCase()), skipDirs: new Set(['node_modules', '.git', 'out']) };
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
function main(argv) {
  const { targets, isAdvisory } = parseArgs(argv);
  const findings = [];
  for (const path of iterFiles(targets, SOURCES)) findings.push(...checkFile(path));
  for (const { path, line, name, reason } of findings) console.log(`${path}:${line}: ${name}: ${reason}`);
  console.log(`total ${findings.length}`);
  return findings.length && !isAdvisory ? 1 : 0;
}

// cost: time O(a), heap O(a), stack O(1), io a
// vars: a = 인자 수
// basis: estimate
// 대상 목록과 `--advisory`를 읽는다. 형식이 틀리거나 없는 대상이면 사용법을 알리고 2로 끝낸다.
function parseArgs(argv) {
  const unknown = argv.find((arg) => arg.startsWith('-') && arg !== '-' && arg !== '--advisory');
  const targets = argv.filter((arg) => arg !== '--advisory');
  const missing = targets.find((target) => !existsSync(target));
  const problem = unknown ? `unrecognized arguments: ${unknown}` : !targets.length ? 'the following arguments are required: targets' : missing && `no such file or directory: ${missing}`;
  if (problem) {
    console.error(`${USAGE}\ncheck-size.mjs: error: ${problem}`);
    process.exit(2);
  }
  return { targets, isAdvisory: argv.includes('--advisory') };
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
