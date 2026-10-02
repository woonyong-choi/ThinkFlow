// 토큰 정본(tokens.json, 같은 폴더에 있으면 tokens.dark.json)에서 tokens.css와 tokens.js를 만든다.
// 사용: node scripts/build-tokens.mjs <tokens.json> [--out 폴더]
// 정본 형식은 DTCG(Design Tokens Community Group) 2025.10이다. 토큰은 `$value`가 있는 객체이고, 묶음의 `$type`은 안쪽 토큰에 이어진다.
// 참조 `{color.blue.600}`는 CSS에서 `var(--color-blue-600)`로 남겨 테마를 바꾸면 따라 바뀌게 한다.
// 정본 키 순서를 그대로 지키려고 객체를 Map으로 읽는다. 일반 객체는 숫자 키(`"600"`)를 앞으로 옮긴다.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { readJson } from './lib/read-json.mjs';

const REFERENCE = /^\{([^{}]+)\}$/;
const HEADER = '생성물, 손으로 고치지 않음';
// values 객체에 단위 없는 숫자로 넣는 타입. 배치 계산에 쓴다.
const NUMERIC_TYPES = new Set(['dimension', 'number', 'fontWeight', 'duration']);
const UNITS = { dimension: 'px', duration: 'ms' };
const USAGE = 'usage: build-tokens.mjs [--out OUT] source';

/** 정본 참조 오류. 이 오류만 메시지 한 줄로 알리고 1로 끝낸다. */
class TokenError extends Error {}

// cost: time O(t·c + n), heap O(t + n), stack O(d + c), io 5
// vars: t = 토큰 수, c = 참조 사슬 길이, n = 정본 글자 수, d = 묶음 깊이
// basis: estimate
/** 정본을 읽어 생성물 두 개를 쓴다. 참조 오류가 있으면 쓰지 않고 1로 끝낸다. */
function main(argv) {
  const args = parseArgs(argv);
  const out = args.out ?? dirname(resolve(args.source));
  const tokens = flattenTokens(readJson(args.source));
  const darkPath = join(dirname(args.source), 'tokens.dark.json');
  const darkTokens = existsSync(darkPath) ? flattenTokens(readJson(darkPath)) : [];
  const table = new Map(tokens.map((token) => [pathKey(token.path), token]));
  let css;
  let js;
  try {
    checkReferences(tokens, table, 'tokens.json');
    checkReferences(darkTokens, table, 'tokens.dark.json');
    css = buildCss(basename(args.source), tokens, darkTokens);
    js = buildJs(basename(args.source), tokens, table);
  } catch (error) {
    if (!(error instanceof TokenError)) throw error;
    console.error(error.message);
    return 1;
  }
  mkdirSync(out, { recursive: true });
  for (const [name, text] of [['tokens.css', css], ['tokens.js', js]]) {
    const path = joinPath(out, name);
    writeFileSync(path, text, 'utf8');
    console.log(path);
  }
  return 0;
}

// cost: time O(a), heap O(1), stack O(1)
// vars: a = 인자 수
// basis: estimate
/** `source`와 `--out`을 읽는다. 형식이 틀리면 사용법을 알리고 2로 끝낸다. */
function parseArgs(argv) {
  const positional = [];
  let out = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out' && i + 1 < argv.length) {
      out = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--out=')) {
      out = arg.slice('--out='.length);
    } else if (arg.startsWith('-') && arg !== '-') {
      exitWithUsage(`unrecognized arguments: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length !== 1) exitWithUsage(positional.length ? `unrecognized arguments: ${positional.slice(1).join(' ')}` : 'the following arguments are required: source');
  return { source: positional[0], out };
}

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
function exitWithUsage(message) {
  console.error(`${USAGE}\nbuild-tokens.mjs: error: ${message}`);
  process.exit(2);
}

// cost: time O(t), heap O(t), stack O(d), alloc t
// vars: t = 토큰 수, d = 묶음 깊이
// basis: estimate
/** 정본을 `{ path, value, type }` 목록으로 편다. */
function flattenTokens(node, path = [], inheritedType = null) {
  const tokens = [];
  const groupType = node.has('$type') ? node.get('$type') : inheritedType;
  for (const [key, child] of node) {
    if (key.startsWith('$') || !(child instanceof Map)) continue;
    const childPath = [...path, key];
    if (child.has('$value')) {
      tokens.push({ path: childPath, value: child.get('$value'), type: child.has('$type') ? child.get('$type') : groupType });
    } else {
      tokens.push(...flattenTokens(child, childPath, groupType));
    }
  }
  return tokens;
}

// cost: time O(g), heap O(g), stack O(1)
// vars: g = 경로 길이
// basis: estimate
function pathKey(path) {
  return JSON.stringify(path);
}

// cost: time O(g), heap O(g), stack O(1)
// vars: g = 경로 길이
// basis: estimate
/** 토큰 경로를 CSS 사용자 정의 속성 이름으로 바꾼다. */
function toCssName(path) {
  return `--${path.join('-')}`;
}

// cost: time O(g), heap O(g), stack O(1)
// vars: g = 참조 글자 수
// basis: estimate
/** `{a.b}` 참조면 경로, 아니면 null. */
function parseReference(value) {
  const match = typeof value === 'string' ? REFERENCE.exec(value) : null;
  return match ? match[1].split('.') : null;
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 합성 값의 부분 수(글꼴 목록, 곡선 점)
// basis: estimate
/** 토큰 값을 CSS 값으로 바꾼다. 참조는 `var()`, 숫자는 타입에 맞는 단위를 붙인다. */
function toCssValue(value, tokenType) {
  const reference = parseReference(value);
  if (reference) return `var(${toCssName(reference)})`;
  if (value instanceof Map && value.has('unit') && value.has('value')) return `${value.get('value')}${value.get('unit')}`;
  if (typeof value === 'number') return `${value}${UNITS[tokenType] ?? ''}`;
  if (Array.isArray(value) && tokenType === 'fontFamily') return value.map((name) => (name.includes(' ') ? `'${name}'` : name)).join(', ');
  if (Array.isArray(value) && tokenType === 'cubicBezier') return `cubic-bezier(${value.join(', ')})`;
  if (typeof value === 'string') return value;
  throw new TokenError(`unsupported token value: ${JSON.stringify(value instanceof Map ? Object.fromEntries(value) : value)}`);
}

// cost: time O(c), heap O(c), stack O(c)
// vars: c = 참조 사슬 길이
// basis: estimate
/** 참조를 끝까지 따라가 실제 값과 타입을 얻는다. 없는 토큰을 참조하거나 참조가 돌면 TokenError. */
function resolveToken(path, table, seen = []) {
  if (seen.some((p) => pathKey(p) === pathKey(path))) {
    throw new TokenError(`token reference cycle: ${[...seen, path].map((p) => p.join('.')).join(' -> ')}`);
  }
  const { value, type } = table.get(pathKey(path));
  const target = parseReference(value);
  if (!target) return { value, type };
  if (!table.has(pathKey(target))) throw new TokenError(`unknown token reference: ${path.join('.')} -> ${target.join('.')}`);
  return resolveToken(target, table, [...seen, path]);
}

// cost: time O(t·c²), heap O(t), stack O(c)
// vars: t = 토큰 수, c = 참조 사슬 길이
// basis: estimate
/** 모든 토큰의 참조가 정본 안에 있는지 확인한다. 없는 토큰 참조, 도는 참조, 정본에 없는 다크 토큰이면 TokenError. */
function checkReferences(tokens, table, source) {
  for (const { path, value } of tokens) {
    if (!table.has(pathKey(path))) throw new TokenError(`${source} has a token missing from tokens.json: ${path.join('.')}`);
    const target = parseReference(value);
    if (target && !table.has(pathKey(target))) throw new TokenError(`unknown token reference in ${source}: ${path.join('.')} -> ${target.join('.')}`);
    resolveToken(path, table);
  }
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 토큰 수
// basis: estimate
/** `:root` 토큰과 다크 모드 덮어쓰기 CSS를 만든다. */
function buildCss(source, tokens, darkTokens) {
  const lines = [`/* ${source}: ${HEADER} */`, ':root {'];
  lines.push(...tokens.map(({ path, value, type }) => `  ${toCssName(path)}: ${toCssValue(value, type)};`));
  lines.push('}');
  if (darkTokens.length) {
    const body = darkTokens.map(({ path, value, type }) => `${toCssName(path)}: ${toCssValue(value, type)};`);
    lines.push('@media (prefers-color-scheme: dark) {', "  :root:not([data-theme='light']) {");
    lines.push(...body.map((line) => `    ${line}`));
    lines.push('  }', '}', "[data-theme='dark'] {");
    lines.push(...body.map((line) => `  ${line}`));
    lines.push('}');
  }
  return `${lines.join('\n')}\n`;
}

// cost: time O(t·c² + t·g), heap O(t), stack O(c + g)
// vars: t = 토큰 수, c = 참조 사슬 길이, g = 묶음 깊이
// basis: estimate
/** 토큰 참조 객체(`var(--…)`)와 계산용 값 객체를 담은 ES 모듈을 만든다. */
function buildJs(source, tokens, table) {
  const refs = new Map();
  const values = new Map();
  for (const { path } of tokens) {
    const { value, type } = resolveToken(path, table);
    setPath(refs, path, `var(${toCssName(path)})`);
    setPath(values, path, NUMERIC_TYPES.has(type) ? toNumber(value) : toCssValue(value, type));
  }
  return (
    `// ${source}: ${HEADER}\n` +
    'function freeze(node) {\n' +
    "  if (typeof node !== 'object') return node;\n" +
    '  return Object.freeze(Object.fromEntries(Object.entries(node).map(([key, value]) => [key, freeze(value)])));\n' +
    '}\n\n' +
    '/** CSS에 넣을 토큰 참조. 값은 `var(--…)` 문자열이다. */\n' +
    `export const tokens = freeze(${toJson(refs)});\n\n` +
    '/** 배치 계산에 쓸 밝은 테마의 실제 값. 크기는 px 숫자, 시간은 ms 숫자다. */\n' +
    `export const values = freeze(${toJson(values)});\n`
  );
}

/** 크기와 시간을 단위 없는 숫자로 바꾼다. `{ value, unit }` 객체는 value만 남긴다. */
function toNumber(value) {
  if (value instanceof Map && value.has('value')) return value.get('value');
  if (typeof value === 'number') return value;
  throw new TokenError(`unsupported numeric token value: ${JSON.stringify(value)}`);
}

// cost: time O(g), heap O(g), stack O(1), alloc g
// vars: g = 경로 길이
// basis: estimate
/** 중첩 Map의 경로 자리에 값을 둔다. */
function setPath(tree, path, value) {
  let node = tree;
  for (const key of path.slice(0, -1)) {
    if (!node.has(key)) node.set(key, new Map());
    node = node.get(key);
  }
  node.set(path.at(-1), value);
}

// cost: time O(s), heap O(s), stack O(d)
// vars: s = 결과 글자 수, d = 중첩 깊이
// basis: estimate
/** 중첩 Map을 키 순서대로 두 칸 들여 쓴 JSON 글자로 만든다. */
function toJson(node, indent = '') {
  if (!(node instanceof Map)) return JSON.stringify(node);
  if (node.size === 0) return '{}';
  const inner = `${indent}  `;
  const entries = [...node].map(([key, value]) => `${inner}${JSON.stringify(key)}: ${toJson(value, inner)}`);
  return `{\n${entries.join(',\n')}\n${indent}}`;
}

// cost: time O(g), heap O(g), stack O(1)
// vars: g = 경로 글자 수
// basis: estimate
/** 폴더와 파일 이름을 잇는다. 사용자가 준 폴더 표기(`./src`)를 그대로 남긴다. */
function joinPath(folder, name) {
  if (!folder) return name;
  return folder.endsWith('/') ? `${folder}${name}` : `${folder}/${name}`;
}

process.exitCode = main(process.argv.slice(2));
