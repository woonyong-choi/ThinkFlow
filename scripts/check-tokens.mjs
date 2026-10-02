// 토큰 대신 직접 적은 화면 값(하드코딩)을 찾는다.
// 사용: node scripts/check-tokens.mjs <폴더나 파일 ...> [--tokens tokens.json]
// 출력: `{경로}:{줄}: {규칙}: {찾은 글자}` 줄들과 마지막 `total {개수}`. 개수가 0이 아니면 종료 코드 1.
// - CSS 계열: 주석을 뺀 전체
// - JavaScript 계열: 모든 문자열의 색, CSS·마크업으로 보이는 문자열과 값 하나뿐인 문자열(`'12px'`)의 나머지 규칙,
//   코드의 기본 토큰 경로(`tokens.color.blue['600']`)와 스타일 객체 숫자(`{ fontWeight: 600 }`)
// - 모든 계열: 색·그림자 기본 토큰 직접 참조(`var(--color-blue-600)`), 토큰 파일 밖 테마 분기(`prefers-color-scheme`, `[data-theme`)
// 글자 판정(`\w`, `\b`)은 한글 같은 유니코드 글자도 낱말 글자로 본다.
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { findHardcoded, findLineNumber, findScriptValues, findSegments, stripJsComments } from './lib/find-hardcoded.mjs';
import { compareText, findTokensFile, iterFiles } from './lib/walk-files.mjs';
import { ALLOW_MARK, GENERATED_MARK, REFERENCE_IN_VALUE, SCRIPT_EXTS, THEMED_TYPES } from './lib/tokens-patterns.mjs';

const USAGE = 'usage: check-tokens.mjs [--tokens TOKENS] targets [targets ...]';

// cost: time O(N + r log r), heap O(r), stack O(d), io f
// vars: N = 전체 글자 수, r = 찾은 수, f = 파일 수, d = 폴더 깊이
// basis: estimate
/** 찾은 하드코딩을 출력한다. 하나라도 있으면 1로 끝낸다. */
function main(argv) {
  const args = parseArgs(argv);
  const tokensPath = args.tokens ?? findTokensFile(args.targets);
  if (!tokensPath) {
    console.error('tokens.json not found: every @media and @container number is reported, primitive references are not checked');
  }
  const info = loadTokenInfo(tokensPath);
  const results = [];
  for (const path of iterFiles(args.targets)) results.push(...checkFile(path, info));
  results.sort((a, b) => compareText(a.path, b.path) || a.line - b.line);
  for (const { path, line, rule, snippet } of results) console.log(`${path}:${line}: ${rule}: ${snippet}`);
  console.log(`total ${results.length}`);
  return results.length ? 1 : 0;
}

// cost: time O(a), heap O(a), stack O(1)
// vars: a = 인자 수
// basis: estimate
/** 대상 목록과 `--tokens`를 읽는다. 형식이 틀리면 사용법을 알리고 2로 끝낸다. */
function parseArgs(argv) {
  const targets = [];
  let tokens = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--tokens' && i + 1 < argv.length) {
      tokens = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--tokens=')) {
      tokens = arg.slice('--tokens='.length);
    } else if (arg.startsWith('-') && arg !== '-') {
      exitWithUsage(`unrecognized arguments: ${arg}`);
    } else {
      targets.push(arg);
    }
  }
  if (!targets.length) exitWithUsage('the following arguments are required: targets');
  return { targets, tokens };
}

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
function exitWithUsage(message) {
  console.error(`${USAGE}\ncheck-tokens.mjs: error: ${message}`);
  process.exit(2);
}


// cost: time O(t), heap O(t), stack O(1), io 1
// vars: t = 토큰 수
// basis: estimate
/**
 * 정본에서 breakpoint 숫자와 테마 기본 토큰을 읽는다.
 * 테마 기본 토큰: 값이 다른 토큰 참조가 아니고 타입이 색이나 그림자인 토큰. 코드는 이 토큰 대신 의미 토큰을 쓴다.
 */
function loadTokenInfo(path) {
  const info = { breakpoints: new Set(), primitiveNames: new Set(), primitivePaths: new Set() };
  if (!path) return info;
  const root = JSON.parse(readFileSync(path, 'utf8'));
  const stack = [{ prefix: [], node: root, groupType: root.$type ?? null }];
  while (stack.length) {
    const { prefix, node, groupType } = stack.pop();
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith('$') || !isObject(child)) continue;
      const tokenPath = [...prefix, key];
      const tokenType = '$type' in child ? child.$type : groupType;
      if (!('$value' in child)) {
        stack.push({ prefix: tokenPath, node: child, groupType: tokenType });
        continue;
      }
      const value = child.$value;
      if (tokenPath[0] === 'breakpoint') {
        const raw = isObject(value) ? value.value : value;
        info.breakpoints.add(String(raw).replace(/px$/, ''));
      }
      const isReference = REFERENCE_IN_VALUE.test(JSON.stringify(value));
      if (!isReference && THEMED_TYPES.has(tokenType)) {
        info.primitiveNames.add(`--${tokenPath.join('-')}`);
        info.primitivePaths.add(tokenPath.join('\u0000'));
      }
    }
  }
  return info;
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// cost: time O(n + f log l), heap O(n), stack O(1), io 1
// vars: n = 파일 글자 수, f = 찾은 수, l = 줄 수
// basis: estimate
/** 파일 하나의 하드코딩. 생성물과 `tokens-allow:` 줄은 건너뛴다. */
function checkFile(path, info) {
  const ext = extname(path).toLowerCase();
  let text = readFileSync(path, 'utf8');
  if (text.split('\n', 1)[0].includes(GENERATED_MARK)) return [];
  const lines = text.split('\n');
  const lineStarts = [0];
  for (const line of lines.slice(0, -1)) lineStarts.push(lineStarts.at(-1) + line.length + 1);
  if (SCRIPT_EXTS.has(ext)) text = stripJsComments(text);
  const found = [];
  for (const { offset, segment, isStyled } of findSegments(text, ext)) {
    for (const hit of findHardcoded(segment, info, isStyled)) found.push({ ...hit, position: offset + hit.position });
  }
  if (SCRIPT_EXTS.has(ext)) found.push(...findScriptValues(text, info));
  const results = [];
  for (const { position, rule, snippet } of found) {
    const line = findLineNumber(lineStarts, position);
    if (!lines[line - 1].includes(ALLOW_MARK)) results.push({ path, line, rule, snippet: Array.from(snippet).slice(0, 80).join('') });
  }
  return results;
}

process.exitCode = main(process.argv.slice(2));
