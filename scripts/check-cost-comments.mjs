// 비용 주석(`// cost:`)이 있어야 하는데 없는 JavaScript 함수를 찾는다.
// 사용: node scripts/check-cost-comments.mjs <폴더나 파일 ...>
// 출력: `{경로}:{줄}: {함수 이름}: {이유}` 줄들과 마지막 `total {개수}`. 개수가 0이 아니면 종료 코드 1.
// 비용 주석은 시간 O(1), 할당 없음, 재귀 없음, I/O 없음인 함수만 생략할 수 있다.
// 이 검사는 그 판정을 다 할 수 없으므로, 반복, 컬렉션 순회, 재귀, I/O가 보이는 함수만 본다.
// 대상 선언: `function`, 블록 본문 화살표 함수, 클래스 메서드. 글자 판정(`\w`, `\b`)은 유니코드 글자도 낱말 글자로 본다.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

// 생성 파일 첫 줄 표시. 토큰 생성물과 일반적인 `@generated` 표시
const GENERATED_MARKS = ['생성물, 손으로 고치지 않음', '@generated'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'target', '.git', '.venv', 'venv', '__pycache__']);
const SCRIPT_EXTS = new Set(['.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx']);
const COMMENT_MARK = '//';
const USAGE = 'usage: check-cost-comments.mjs targets [targets ...]';

// 유니코드 낱말 글자와 낱말 경계. 패턴 글자의 `\w`(글자 묶음 안에서만 씀)와 `\b`를 이것으로 바꾼다.
const WORD_CHARS = String.raw`\p{L}\p{N}_`;
const WORD_BOUNDARY = `(?:(?<=[${WORD_CHARS}])(?![${WORD_CHARS}])|(?<![${WORD_CHARS}])(?=[${WORD_CHARS}]))`;

// 각 패턴의 이름 그룹은 `name`
const DECLARATIONS = [
  unicodePattern(String.raw`^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*(?<name>[\w]+)\s*\(`),
  unicodePattern(
    String.raw`^\s*(?:export\s+)?(?:const|let|var)\s+(?<name>[\w]+)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:\([^)]*\)|[\w]+)\s*(?::[^=]+)?=>\s*\{`,
  ),
  unicodePattern(
    String.raw`^\s*(?:(?:static|async|get|set|public|private|protected|readonly)\s+|\*\s*)*(?<name>#?[\w]+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[\w]+)\s*=>\s*\{`,
  ),
  unicodePattern(
    String.raw`^\s*(?:(?:static|async|get|set|public|private|protected)\s+|\*\s*)*(?<name>#?(?!(?:if|for|while|switch|catch|return|function)\b)[\w]+)\s*\([^)]*\)\s*(?::[^{]+)?\{`,
  ),
];
// 문서 주석·애노테이션 줄. 비용 주석은 이 줄들보다 위에 둔다.
const DOC_OR_ATTRIBUTE = /^\s*(?:@|#\[|\/\/\/|\/\/!|\/\*\*|\*|\*\/)/;
const STRING = /"""[\s\S]*?"""|'''[\s\S]*?'''|'(?:[^'\\\n]|\\[^\n])*'|"(?:[^"\\\n]|\\[^\n])*"|`(?:[^`\\]|\\[^\n])*`/g;
const LINE_STRING = /'(?:[^'\\]|\\[^\n])*'|"(?:[^"\\]|\\[^\n])*"|`(?:[^`\\]|\\[^\n])*`/g;
const LOOP = unicodePattern(
  String.raw`\b(?:for|while)\b|\.(?:map|filter|reduce|forEach|some|every|find|findIndex|flatMap|sort|join|includes|indexOf)\(|\.\.\.[\w]|Object\.(?:keys|values|entries|fromEntries)\(`,
  '',
);
// `.exec(`는 정규식 메서드라 제외한다(앞에 점이 없는 호출만 프로세스 실행으로 본다).
const IO = unicodePattern(
  String.raw`\bfetch\(|(?<![.\w])(?:readFile|writeFile|readdir|mkdir|rm|spawn|exec|execFile)(?:Sync)?\(|\bconsole\.|\bawait\b`,
  '',
);
// 식 본문 선언: 닫는 괄호 뒤 `=`(`=>`, `==` 제외)
const EXPRESSION_BODY = /\)\s*(?::[^={]+)?=(?![=>])/;

// cost: time O(N), heap O(r), stack O(d), io f
// vars: N = 전체 줄 수, r = 찾은 수, f = 파일 수, d = 폴더 깊이
// basis: estimate
/** 찾은 함수를 출력한다. 하나라도 있으면 1로 끝낸다. */
function main(argv) {
  const targets = parseArgs(argv);
  const results = [];
  for (const path of iterFiles(targets)) results.push(...checkFile(path));
  for (const { path, line, name, reason } of results) console.log(`${path}:${line}: ${name}: ${reason}`);
  console.log(`total ${results.length}`);
  return results.length ? 1 : 0;
}

// cost: time O(a), heap O(a), stack O(1)
// vars: a = 인자 수
// basis: estimate
/** 대상 목록을 읽는다. 형식이 틀리면 사용법을 알리고 2로 끝낸다. */
function parseArgs(argv) {
  const unknown = argv.find((arg) => arg.startsWith('-') && arg !== '-');
  if (unknown) exitWithUsage(`unrecognized arguments: ${unknown}`);
  if (!argv.length) exitWithUsage('the following arguments are required: targets');
  return argv;
}

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
function exitWithUsage(message) {
  console.error(`${USAGE}\ncheck-cost-comments.mjs: error: ${message}`);
  process.exit(2);
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 패턴 글자 수
// basis: estimate
/** 패턴의 `\w`를 유니코드 낱말 글자로, `\b`를 유니코드 낱말 경계로 바꾼 정규식을 만든다. */
function unicodePattern(source, flags = '') {
  return new RegExp(source.replaceAll(String.raw`\b`, WORD_BOUNDARY).replaceAll(String.raw`\w`, WORD_CHARS), `${flags}u`);
}

// cost: time O(n·b), heap O(n), stack O(1), io 1
// vars: n = 파일 줄 수, b = 함수 본문 줄 수
// basis: estimate
/** 파일 하나에서 비용 주석이 빠진 함수를 찾는다. */
function checkFile(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  if (GENERATED_MARKS.some((mark) => lines[0].includes(mark))) return [];
  const findings = [];
  lines.forEach((line, index) => {
    const match = DECLARATIONS.map((pattern) => pattern.exec(line)).find(Boolean);
    if (!match) return;
    const name = match.groups.name.replace(/^#+/, '');
    const placement = findCostPlacement(lines, index);
    if (placement === 'below') {
      findings.push({ path, line: index + 1, name, reason: 'cost comment below doc comment or attribute' });
      return;
    }
    const reason = findCostReason(name, findBody(lines, index));
    if (reason && placement === 'missing') findings.push({ path, line: index + 1, name, reason });
  });
  return findings;
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 함수 본문 줄 수
// basis: estimate
/** 선언 다음 본문 줄. 식 본문은 들여쓰기로, 블록 본문은 중괄호 짝으로 끝을 찾는다. */
function findBody(lines, start) {
  const first = stripStrings(lines[start]);
  const expression = EXPRESSION_BODY.exec(first);
  if (expression) {
    // 식 본문은 `=` 뒤와, 선언보다 깊게 들여 쓴 다음 줄들이다.
    const indent = indentOf(lines[start]);
    const body = [first.slice(expression.index + expression[0].length)];
    for (const line of lines.slice(start + 1)) {
      if (!line.trim() || indentOf(line) <= indent) break;
      body.push(line);
    }
    return body;
  }
  let depth = 0;
  let hasOpened = false;
  const body = [];
  for (let line of lines.slice(start)) {
    let code = stripStrings(line);
    if (!hasOpened && code.includes('{')) {
      // 여는 괄호 앞(선언부)은 본문이 아니다. 한 줄 함수도 괄호 뒤만 본다.
      if (line.includes('{')) line = line.slice(line.indexOf('{') + 1);
      code = code.slice(code.indexOf('{') + 1);
      depth = 1;
      hasOpened = true;
    } else if (!hasOpened) {
      if (code.trimEnd().endsWith(';')) return [];
      continue;
    }
    depth += countChar(code, '{') - countChar(code, '}');
    body.push(line);
    if (depth <= 0) break;
  }
  return body;
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 줄 글자 수
// basis: estimate
function indentOf(line) {
  return line.length - line.trimStart().length;
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 글자 수
// basis: estimate
function countChar(text, char) {
  let count = 0;
  for (const c of text) if (c === char) count += 1;
  return count;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 줄 글자 수
// basis: estimate
/** 중괄호를 셀 때 문자열과 줄 주석 안의 괄호를 빼려고 지운다. */
function stripStrings(line) {
  return line.replace(LINE_STRING, "''").split(COMMENT_MARK)[0];
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 함수 본문 글자 수
// basis: estimate
/** 비용 주석이 필요한 이유. 반복·순회, 재귀, I/O 중 처음 보인 것, 없으면 null. */
function findCostReason(name, body) {
  const text = body
    .join('\n')
    .replace(STRING, "''")
    .split('\n')
    .map((line) => line.split(COMMENT_MARK)[0])
    .join('\n');
  if (LOOP.test(text)) return 'loop or iteration without cost comment';
  if (unicodePattern(String.raw`\b${escapeRegExp(name)}\s*\(`).test(text)) return 'recursion without cost comment';
  if (IO.test(text)) return 'io without cost comment';
  return null;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 선언 위 주석·문서 주석 줄 수
// basis: estimate
/**
 * 선언 위 `// cost:` 줄의 자리. `above`(맞는 자리), `below`(문서 주석·애노테이션 아래), `missing`.
 * 선언에서 위로 문서 주석·애노테이션·주석 줄을 따라 올라간다.
 */
function findCostPlacement(lines, index) {
  for (let position = index - 1; position >= 0; position -= 1) {
    const line = lines[position];
    const stripped = line.trim();
    if (stripped.startsWith(`${COMMENT_MARK} cost:`)) return hasDocAbove(lines, position) ? 'below' : 'above';
    if (!stripped) return 'missing';
    if (!DOC_OR_ATTRIBUTE.test(line) && !stripped.startsWith(COMMENT_MARK)) return 'missing';
  }
  return 'missing';
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 비용 주석 위 주석 줄 수
// basis: estimate
/** `cost:` 줄 위로 이어지는 주석 묶음에 문서 주석·애노테이션이 있는지 본다. 있으면 자리가 틀렸다. */
function hasDocAbove(lines, costIndex) {
  for (let position = costIndex - 1; position >= 0; position -= 1) {
    const line = lines[position];
    const stripped = line.trim();
    if (!stripped) return false;
    if (DOC_OR_ATTRIBUTE.test(line)) return true;
    if (!stripped.startsWith(COMMENT_MARK)) return false;
  }
  return false;
}

// cost: time O(f), heap O(d), stack O(d), io f
// vars: f = 파일 수, d = 폴더 깊이
// basis: estimate
/** 검사할 파일 경로. 폴더는 정렬 순서로 내려가고, 한 폴더의 파일을 하위 폴더보다 먼저 낸다. */
function* iterFiles(targets) {
  for (const target of targets) {
    const stat = statSync(target, { throwIfNoEntry: false });
    if (stat?.isFile()) {
      if (SCRIPT_EXTS.has(extname(target).toLowerCase())) yield target;
      continue;
    }
    if (stat?.isDirectory()) yield* walkFiles(target);
  }
}

// cost: time O(f), heap O(d), stack O(d), io f
// vars: f = 폴더 아래 파일 수, d = 폴더 깊이
// basis: estimate
function* walkFiles(folder) {
  const files = [];
  const dirs = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) (entry.isDirectory() ? dirs : files).push(entry.name);
  for (const name of files.sort(compareText)) {
    if (SCRIPT_EXTS.has(extname(name).toLowerCase())) yield joinPath(folder, name);
  }
  for (const name of dirs.sort(compareText)) {
    if (!SKIP_DIRS.has(name)) yield* walkFiles(joinPath(folder, name));
  }
}

// cost: time O(g), heap O(g), stack O(1)
// vars: g = 경로 글자 수
// basis: estimate
/** 폴더와 이름을 잇는다. 사용자가 준 폴더 표기(`./src`)를 그대로 남긴다. */
function joinPath(folder, name) {
  return folder.endsWith('/') ? `${folder}${name}` : `${folder}/${name}`;
}

// cost: time O(g), heap O(1), stack O(1)
// vars: g = 글자 수
// basis: estimate
/** 코드 포인트 순서 비교. */
function compareText(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

process.exitCode = main(process.argv.slice(2));
