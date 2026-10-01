// 토큰 대신 직접 적은 화면 값(하드코딩)을 찾는다.
// 사용: node scripts/check-tokens.mjs <폴더나 파일 ...> [--tokens tokens.json]
// 출력: `{경로}:{줄}: {규칙}: {찾은 글자}` 줄들과 마지막 `total {개수}`. 개수가 0이 아니면 종료 코드 1.
// - CSS 계열: 주석을 뺀 전체
// - JavaScript 계열: 모든 문자열의 색, CSS·마크업으로 보이는 문자열과 값 하나뿐인 문자열(`'12px'`)의 나머지 규칙,
//   코드의 기본 토큰 경로(`tokens.color.blue['600']`)와 스타일 객체 숫자(`{ fontWeight: 600 }`)
// - 모든 계열: 색·그림자 기본 토큰 직접 참조(`var(--color-blue-600)`), 토큰 파일 밖 테마 분기(`prefers-color-scheme`, `[data-theme`)
// 글자 판정(`\w`, `\b`)은 한글 같은 유니코드 글자도 낱말 글자로 본다.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

const CSS_EXTS = new Set(['.css', '.scss']);
const SCRIPT_EXTS = new Set(['.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx']);
// docs/는 문서 그림 산출물 자리라 이 검사 대상이 아니다.
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', 'docs']);
const TOKEN_FILES = new Set(['tokens.json', 'tokens.dark.json']);
const GENERATED_MARK = '생성물, 손으로 고치지 않음';
const ALLOW_MARK = 'tokens-allow:';
// 토큰 없이 써도 되는 값
const FREE_LENGTHS = new Set(['0', '100%', '50%', '100vh', '100vw']);
const FREE_NUMBERS = new Set(['0', '1']);
// 테마에 따라 바뀌어 의미 토큰으로만 써야 하는 타입
const THEMED_TYPES = new Set(['color', 'shadow']);
const USAGE = 'usage: check-tokens.mjs [--tokens TOKENS] targets [targets ...]';

// 유니코드 낱말 글자와 낱말 경계. 패턴 글자의 `\w`(글자 묶음 안에서만 씀)와 `\b`를 이것으로 바꾼다.
const WORD_CHARS = String.raw`\p{L}\p{N}_`;
const WORD_BOUNDARY = `(?:(?<=[${WORD_CHARS}])(?![${WORD_CHARS}])|(?<![${WORD_CHARS}])(?=[${WORD_CHARS}]))`;

const FONT_KEYWORDS = String.raw`(?:inherit|initial|unset|var\()`;
const HEX_COLOR = unicodePattern(String.raw`(?<![\w&/])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b`);
const COLOR_FUNCTION = unicodePattern(String.raw`\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(`);
const FONT_FAMILY = unicodePattern(
  String.raw`font-family\s*:(?!\s*${FONT_KEYWORDS})[^;}\n]+|\bfont\s*:(?!\s*${FONT_KEYWORDS})[^;}\n]*(?:serif|monospace|system-ui)`,
);
const LENGTH = unicodePattern(String.raw`(?<![\w.#-])-?\d*\.?\d+(?:px|rem|em|ms|s|vh|vw|pt)\b`);
const UNITLESS_PROPERTY = unicodePattern(String.raw`\b(font-weight|line-height|opacity|z-index|letter-spacing)\s*:\s*(-?[\d.]+)\b`);
const UNITLESS_ATTRIBUTE = unicodePattern(
  String.raw`\b(rx|ry|stroke-width|font-size|font-weight|opacity|fill-opacity|stroke-opacity|letter-spacing)="\s*(-?[\d.]+)\s*"`,
);
const CUSTOM_PROPERTY = unicodePattern(String.raw`(--[\w-]+)\s*:\s*(?!var\()([^;}\n]+)`);
const AT_CONDITION = /@(?:media|container)[^{]*/g;
const CONDITION_VALUE = unicodePattern(String.raw`(\d+(?:\.\d+)?)(px|em|rem)\b`);
const COMMENT = /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g;
const STRING = /'(?:[^'\\\n]|\\[\s\S])*'|"(?:[^"\\\n]|\\[\s\S])*"|`(?:[^`\\]|\\[\s\S])*`/g;
// CSS 선언(`속성: 값;`)이나 마크업 속성(`이름="값"`)이 든 문자열
const LOOKS_STYLED = unicodePattern(String.raw`[\w-]+\s*:\s*[^;]+;|<[\w][^>]*=|[\w-]+="`, '');
// 값 하나뿐인 문자열: `'12px'`, `'1.5rem'`, `'200ms'`
const BARE_VALUE = /^['"`]\s*-?\d*\.?\d+(?:px|rem|em|ms|s|pt)\s*['"`]$/;
const VAR_REFERENCE = unicodePattern(String.raw`var\(\s*(--[\w-]+)`);
const THEME_BRANCH = unicodePattern(String.raw`prefers-color-scheme|\[data-theme(?![\w-])`);
const JS_TOKEN_PATH = unicodePattern(
  String.raw`\b(?:tokens|values)((?:\.[A-Za-z_$][\w$]*|\[\s*(?:['"\x60][^'"\x60]+['"\x60]|\d+)\s*\])+)`,
);
const JS_PATH_PART = unicodePattern(String.raw`\.([A-Za-z_$][\w$]*)|\[\s*['"\x60]?([^'"\x60\]\s]+)['"\x60]?\s*\]`);
const JS_COMMENT_OR_STRING = /("(?:[^"\\\n]|\\[^\n])*"|'(?:[^'\\\n]|\\[^\n])*'|`(?:[^`\\]|\\[^\n])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
// 일반 문자열. `['600']` 같은 경로 키 자리는 남긴다.
const PLAIN_STRING = /(?<!\[)\s*('(?:[^'\\\n]|\\[^\n])*'|"(?:[^"\\\n]|\\[^\n])*")/g;
// 스타일 객체: `style={{`, `style: {`, `sx: {`, `css: {`, `styles = {` 뒤 중괄호 안만 숫자를 본다.
const STYLE_OBJECT_START = unicodePattern(String.raw`\b(?:style|styles|sx|css)\s*[:=]\s*\{\{?`);
const STYLE_OBJECT_NUMBER = unicodePattern(
  String.raw`\b(fontSize|fontWeight|lineHeight|letterSpacing|opacity|zIndex|borderRadius|borderWidth|gap|rowGap|columnGap` +
    String.raw`|strokeWidth|top|right|bottom|left|(?:padding|margin|inset)(?:Top|Right|Bottom|Left|Inline|Block)?|(?:min|max)?(?:Width|Height)|width|height)` +
    String.raw`\s*:\s*(-?\d+(?:\.\d+)?)\b`,
);
const REFERENCE_IN_VALUE = /\{[\w.-]+\}/;

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

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 패턴 글자 수
// basis: estimate
/** 패턴의 `\w`를 유니코드 낱말 글자로, `\b`를 유니코드 낱말 경계로 바꾼 정규식을 만든다. */
function unicodePattern(source, flags = 'g') {
  return new RegExp(source.replaceAll(String.raw`\b`, WORD_BOUNDARY).replaceAll(String.raw`\w`, WORD_CHARS), `${flags}u`);
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

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 줄바꿈만 남기고 같은 길이의 공백으로 바꾼다. 줄 번호와 위치를 지키기 위해서다. */
function blank(text) {
  return text.replace(/[^\n]/g, ' ');
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 검사할 조각 목록. isStyled가 false면 색 규칙만 적용한다. */
function findSegments(text, ext) {
  const plain = text.replace(COMMENT, blank);
  if (CSS_EXTS.has(ext)) return [{ offset: 0, segment: plain, isStyled: true }];
  return Array.from(plain.matchAll(STRING), (m) => ({ offset: m.index, segment: m[0], isStyled: isStyledString(m[0]) }));
}

/** CSS나 마크업으로 보이거나 값 하나뿐인 문자열인지 본다. */
function isStyledString(literal) {
  return LOOKS_STYLED.test(literal) || BARE_VALUE.test(literal);
}

// cost: time O(n·k), heap O(f), stack O(1)
// vars: n = 조각 글자 수, f = 찾은 수, k = 건너뛸 구간 수
// basis: estimate
/** 조각 안 하드코딩. `{ position, rule, snippet }` 목록. 한 자리는 한 번만 보고한다. */
function findHardcoded(segment, info, isStyled) {
  const hits = (pattern, rule, pick = (m) => m[0], keep = () => true) =>
    Array.from(segment.matchAll(pattern))
      .filter(keep)
      .map((m) => ({ position: m.index, rule: typeof rule === 'function' ? rule(m) : rule, snippet: pick(m) }));
  let found = [
    ...hits(HEX_COLOR, 'hex color'),
    ...hits(COLOR_FUNCTION, 'color function'),
    ...hits(VAR_REFERENCE, 'primitive token reference', (m) => m[1], (m) => info.primitiveNames.has(m[1])),
    ...hits(THEME_BRANCH, 'theme branch outside tokens'),
  ];
  if (!isStyled) return found;
  const conditions = Array.from(segment.matchAll(AT_CONDITION))
    .filter((m) => !m[0].includes('prefers-color-scheme'))
    .map((m) => [m.index, m.index + m[0].length]);
  for (const [start, end] of conditions) found.push(...findConditionValues(segment.slice(start, end), start, info.breakpoints));
  const reported = Array.from(segment.matchAll(CUSTOM_PROPERTY))
    .filter((m) => isRawCustomValue(m[2]))
    .map((m) => [m.index, m.index + m[0].length]);
  const skip = [...conditions, ...reported];
  found = found.filter((hit) => !isInside(hit.position, reported));
  found.push(...reported.map(([start, end]) => ({ position: start, rule: 'custom property outside tokens', snippet: trimSpace(segment.slice(start, end)) })));
  found.push(...hits(FONT_FAMILY, 'font family', (m) => trimSpace(m[0]), (m) => !isInside(m.index, skip)));
  found.push(...hits(LENGTH, 'length or time', undefined, (m) => !FREE_LENGTHS.has(m[0]) && !isInside(m.index, skip)));
  for (const pattern of [UNITLESS_PROPERTY, UNITLESS_ATTRIBUTE]) {
    found.push(...hits(pattern, (m) => `${m[1]} number`, undefined, (m) => !FREE_NUMBERS.has(m[2]) && !isInside(m.index, reported)));
  }
  return found;
}

// cost: time O(n), heap O(f), stack O(1)
// vars: n = 조건 글자 수, f = 찾은 수
// basis: estimate
/** `@media`, `@container` 조건의 숫자. px가 아닌 단위와 breakpoint 토큰에 없는 px를 찾는다. */
function findConditionValues(condition, offset, breakpoints) {
  return Array.from(condition.matchAll(CONDITION_VALUE))
    .filter((m) => m[2] !== 'px' || !breakpoints.has(m[1]))
    .map((m) => ({ position: offset + m.index, rule: 'condition not breakpoint token', snippet: m[0] }));
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 값 글자 수
// basis: estimate
/** 토큰 참조만으로 만든 값이 아닌지 본다. `calc(var(--a) * 2)`의 계수 2는 허용한다. */
function isRawCustomValue(value) {
  const rest = value.replace(/var\([^()]*\)/g, '');
  return /#|['"]|\d+(?:px|rem|em|ms|s|%)/.test(rest);
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 구간 수
// basis: estimate
/** 위치가 구간 중 하나 안에 있는지 본다. */
function isInside(position, spans) {
  return spans.some(([start, end]) => start <= position && position < end);
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
/** 앞뒤 공백을 지운다. 구분 제어 문자(\x1c~\x1f)도 공백으로 본다. */
function trimSpace(text) {
  return text.replace(/^[\s\x1c-\x1f]+|[\s\x1c-\x1f]+$/g, '');
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 파일 글자 수
// basis: estimate
/** 문자열은 두고 `//`, `/* *\/` 주석만 같은 길이의 공백으로 바꾼다. 줄 번호를 지키기 위해서다. */
function stripJsComments(text) {
  return text.replace(JS_COMMENT_OR_STRING, (whole, literal) => literal || blank(whole));
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 파일 글자 수
// basis: estimate
/** JavaScript 코드의 색·그림자 기본 토큰 경로 참조와 스타일 객체 숫자. 주석은 이미 지운 글자를 받는다. */
function findScriptValues(text, info) {
  const found = [];
  // 일반 문자열 안 글자는 코드가 아니다. `['600']` 같은 경로 키와 템플릿 문자열은 남긴다.
  const codeAndTemplates = text.replace(PLAIN_STRING, blank);
  for (const m of codeAndTemplates.matchAll(JS_TOKEN_PATH)) {
    const tokenPath = Array.from(m[1].matchAll(JS_PATH_PART), (part) => part[1] || part[2] || '');
    if (info.primitivePaths.has(tokenPath.join('\u0000'))) found.push({ position: m.index, rule: 'primitive token reference', snippet: m[0] });
  }
  const code = text.replace(STRING, blank);
  for (const [start, end] of findStyleObjects(code)) {
    for (const m of code.slice(start, end).matchAll(STYLE_OBJECT_NUMBER)) {
      if (!FREE_NUMBERS.has(m[2])) found.push({ position: start + m.index, rule: `${m[1]} number`, snippet: m[0] });
    }
  }
  return found;
}

// cost: time O(n·s), heap O(s), stack O(1)
// vars: n = 코드 글자 수, s = 스타일 객체 수
// basis: estimate
/** 스타일 객체 중괄호 구간. 여는 중괄호부터 짝이 맞는 닫는 중괄호까지. */
function findStyleObjects(code) {
  const spans = [];
  for (const m of code.matchAll(STYLE_OBJECT_START)) {
    const end = m.index + m[0].length;
    let depth = 0;
    for (let position = end - 1; position < code.length; position += 1) {
      if (code[position] === '{') depth += 1;
      else if (code[position] === '}') depth -= 1;
      if (depth === 0) {
        spans.push([end, position]);
        break;
      }
    }
  }
  return spans;
}

// cost: time O(log l), heap O(1), stack O(1)
// vars: l = 줄 수
// basis: estimate
/** 글자 위치의 줄 번호(1부터). 줄 시작 위치 목록에서 이분 탐색한다. */
function findLineNumber(lineStarts, position) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (lineStarts[mid] <= position) low = mid;
    else high = mid - 1;
  }
  return low + 1;
}

// cost: time O(f), heap O(d), stack O(d), io f
// vars: f = 파일 수, d = 폴더 깊이
// basis: estimate
/** 검사할 파일 경로. 폴더는 정렬 순서로 내려가고, 한 폴더의 파일을 하위 폴더보다 먼저 낸다. */
function* iterFiles(targets) {
  for (const target of targets) {
    if (isFile(target)) {
      yield target;
      continue;
    }
    if (isDirectory(target)) yield* walkFiles(target);
  }
}

// cost: time O(f), heap O(d), stack O(d), io f
// vars: f = 폴더 아래 파일 수, d = 폴더 깊이
// basis: estimate
function* walkFiles(folder) {
  const { files, dirs } = listFolder(folder);
  for (const name of files) {
    const ext = extname(name).toLowerCase();
    if (!TOKEN_FILES.has(name) && (CSS_EXTS.has(ext) || SCRIPT_EXTS.has(ext))) yield joinPath(folder, name);
  }
  for (const name of dirs) {
    if (!SKIP_DIRS.has(name)) yield* walkFiles(joinPath(folder, name));
  }
}

// cost: time O(e log e), heap O(e), stack O(1), io 1
// vars: e = 폴더 항목 수
// basis: estimate
/** 폴더의 파일 이름과 하위 폴더 이름을 정렬해 돌려준다. */
function listFolder(folder) {
  const files = [];
  const dirs = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    (entry.isDirectory() ? dirs : files).push(entry.name);
  }
  return { files: files.sort(compareText), dirs: dirs.sort(compareText) };
}

// cost: time O(f + h), heap O(d), stack O(d), io f + h
// vars: f = 대상 아래 파일 수, h = 저장소 루트까지 상위 폴더 수, d = 폴더 깊이
// basis: estimate
/** 대상 폴더 아래, 없으면 저장소 루트(.git이 있는 폴더)까지 위로 올라가며 tokens.json을 찾는다. */
function findTokensFile(targets) {
  for (const target of targets) {
    let folder = resolve(isDirectory(target) ? target : dirname(target));
    const below = findBelow(folder);
    if (below) return below;
    for (;;) {
      const candidate = join(folder, 'tokens.json');
      if (existsSync(candidate)) return candidate;
      const parent = dirname(folder);
      if (isDirectory(join(folder, '.git')) || parent === folder) break;
      folder = parent;
    }
  }
  return null;
}

// cost: time O(f), heap O(d), stack O(d), io f
// vars: f = 폴더 아래 항목 수, d = 폴더 깊이
// basis: estimate
/** 폴더와 그 아래(건너뛰는 폴더 제외)에서 처음 만나는 tokens.json. */
function findBelow(folder) {
  if (!isDirectory(folder)) return null;
  const { files, dirs } = listFolder(folder);
  if (files.includes('tokens.json')) return join(folder, 'tokens.json');
  for (const name of dirs) {
    if (SKIP_DIRS.has(name)) continue;
    const found = findBelow(join(folder, name));
    if (found) return found;
  }
  return null;
}

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
function isFile(path) {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
function isDirectory(path) {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
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
