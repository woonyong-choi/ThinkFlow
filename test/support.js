// 시험이 함께 쓰는 작은 도구. 공개 진입점(buildFigure, toSvg, toHtml, 명령줄)을 부르고 결과를 DOM으로 읽는 일만 한다.
// 이 파일은 `*.test.js`가 아니라서 `npm test`가 시험으로 돌리지 않는다.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFigure, FigureError, toHtml, toSvg } from 'daphnis';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI = join(ROOT, 'src', 'cli.js');
export const EXAMPLES = join(ROOT, 'examples');

/** `daphnis 2` 머리를 붙인 원본. 본문 줄의 공통 들여쓰기는 걷어 낸다. */
export function dap(body) {
  const lines = body.replace(/^\n/, '').split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return `daphnis 2\n${lines.map((l) => l.slice(indent)).join('\n').trimEnd()}\n`;
}

/** 경고도 오류로 올려(strict) 만든다. 시험이 쓰는 원본은 경고 없이 읽혀야 한다. */
export const build = (source, options = {}) => buildFigure(source, { strict: true, ...options });

/** 읽지 못해야 하는 원본. 진단 목록 `{ severity, code, line, column, message }[]`을 돌려준다. 만들어지면 시험이 실패한다. */
export async function reject(source, options = {}) {
  try {
    await build(source, options);
  } catch (error) {
    assert.ok(error instanceof FigureError, `expected a FigureError, got ${error?.stack ?? error}`);
    return error.problems;
  }
  assert.fail('the source was built, but it must be rejected');
}

/** 원본에서 `needle`이 처음 나오는 줄 번호(1부터). 시험이 줄 번호를 손으로 세지 않게 한다. */
export function lineOf(source, needle) {
  const at = source.split('\n').findIndex((line) => line.includes(needle));
  assert.notEqual(at, -1, `no line with ${JSON.stringify(needle)}`);
  return at + 1;
}

/** 장면 하나의 멈춘 SVG를 DOM으로. 마지막 상태 하나만 담긴다. */
export async function stillDom(source, scene = 0, options) {
  return parseMarkup(await toSvg(await build(source, options), { scene, isStatic: true }));
}

// 멈춘 SVG는 숨긴 층을 속성(`opacity="0" visibility="hidden"`)으로 두고 CSS 클래스 규칙(`.fl .a1 { opacity: 1; visibility: visible }`)으로 보인다.
// 그래서 보이는지는 속성 뒤에 클래스 규칙을 덮어 읽어야 한다. 마지막 복합 선택자(태그와 클래스)만 보고, 같은 우선순위에서 뒤 규칙이 이긴다고 가정하는 작은 읽기다.
function styleRules(dom) {
  const css = descendants(dom).filter((n) => n.tag === 'style').map(textContent).join('\n');
  let flat = css;
  for (let prev = ''; prev !== flat;) { prev = flat; flat = flat.replace(/@[^{};]*\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, ''); }
  return [...flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selectors, decls]) => selectors.split(',').map((selector) => {
    const [, tag = '', classes = ''] = /([a-z]*)((?:\.[\w-]+)*)$/.exec(selector.trim()) ?? [];
    const declared = Object.fromEntries([...decls.matchAll(/(opacity|visibility|display)\s*:\s*([^;]+)/g)].map((m) => [m[1], m[2].trim()]));
    return { tag, classes: classes.split('.').filter(Boolean), declared };
  })).filter((rule) => Object.keys(rule.declared).length && (rule.tag || rule.classes.length));
}

function effective(node, rules) {
  const own = { opacity: node.attrs.opacity, visibility: node.attrs.visibility, display: node.attrs.display };
  const classes = (node.attrs.class ?? '').split(/\s+/);
  for (const rule of rules) if ((!rule.tag || rule.tag === node.tag) && rule.classes.every((c) => classes.includes(c))) Object.assign(own, rule.declared);
  return own;
}

/** 멈춘 SVG에서 눈에 보이는 글자 요소. 불투명도 0, `visibility: hidden`, `display: none`인 글은 속성과 클래스 규칙을 함께 읽어 뺀다. */
export function visibleTexts(dom) {
  const rules = styleRules(dom);
  const out = [];
  const walk = (node, shown) => {
    const style = effective(node, rules);
    if (style.display === 'none' || Number(style.opacity ?? 1) === 0) return;
    const visible = style.visibility === undefined || style.visibility === 'inherit' ? shown : style.visibility === 'visible';
    if (node.tag === 'text' && visible && textContent(node).trim()) out.push(node);
    for (const child of node.children ?? []) if (child.tag) walk(child, visible);
  };
  walk(dom, true);
  return out;
}

/** 눈에 보이는 글을 문서 순서로. */
export const textsOf = (dom) => visibleTexts(dom).map((n) => textContent(n).trim());

/** 값 줄은 이름과 값이 같은 기준선에 놓인다. 이름 글자 오른쪽에서 가장 가까운 같은 줄의 글이 그 값이다. */
export function valueOf(dom, name) {
  const texts = visibleTexts(dom);
  const label = texts.filter((n) => textContent(n).trim() === name);
  assert.equal(label.length, 1, `expected one visible "${name}", found ${label.length} in ${JSON.stringify(texts.map((n) => textContent(n).trim()))}`);
  const [x, y] = [num(label[0], 'x'), num(label[0], 'y')];
  const row = texts.filter((n) => n !== label[0] && Math.abs(num(n, 'y') - y) < 0.5 && num(n, 'x') > x).sort((a, b) => num(a, 'x') - num(b, 'x'));
  assert.ok(row.length, `no value beside "${name}"`);
  return textContent(row[0]).trim();
}

/** 원본의 한 장면이 끝났을 때 값 줄 `이름`의 글. */
export async function finalValue(source, name, scene = 0, options) {
  return valueOf(await stillDom(source, scene, options), name);
}

// ---- 마크업 읽기 ----

const VOID = new Set(['meta', 'link', 'br', 'hr', 'img', 'input', 'source', 'area', 'base', 'col', 'wbr']);
const RAW = new Set(['script', 'style']);
const ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(text, where) {
  if (text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, '').includes('&')) throw new Error(`a bare "&" ${where}`);
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, body) => {
    if (body[0] === '#') return String.fromCodePoint(body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1)));
    if (!(body in ENTITY)) throw new Error(`unknown entity &${body}; ${where}`);
    return ENTITY[body];
  });
}

/**
 * XML(기본)이나 HTML(`html: true`)을 DOM으로 읽는다. 짝이 안 맞는 태그, 따옴표 없는 속성, 같은 속성 두 번, 모르는 엔티티, 바깥에 남은 `<`와 `&`는 던진다.
 * 돌려주는 노드는 `{ tag, attrs, children }`이고 글은 `{ text }` 노드다. HTML에서 script와 style 안은 날 글이다.
 */
export function parseMarkup(text, { html = false } = {}) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  let i = 0;
  const fail = (message) => { throw new Error(`${message} at ${i}: ${JSON.stringify(text.slice(i, i + 60))}`); };
  const top = () => stack.at(-1);
  while (i < text.length) {
    if (text[i] !== '<') {
      const end = text.indexOf('<', i) === -1 ? text.length : text.indexOf('<', i);
      const raw = text.slice(i, end);
      if (!html && raw.includes('>') && /]]>/.test(raw)) fail('"]]>" in text');
      top().children.push({ text: decode(raw, `at ${i}`) });
      i = end;
    } else if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end === -1) fail('unclosed comment');
      if (text.slice(i + 4, end).includes('--')) fail('"--" inside a comment');
      i = end + 3;
    } else if (text.startsWith('<![CDATA[', i)) {
      const end = text.indexOf(']]>', i);
      if (end === -1) fail('unclosed CDATA');
      top().children.push({ text: text.slice(i + 9, end) });
      i = end + 3;
    } else if (text.startsWith('<!', i) || text.startsWith('<?', i)) {
      const end = text.indexOf('>', i);
      if (end === -1) fail('unclosed declaration');
      i = end + 1;
    } else if (text.startsWith('</', i)) {
      const match = /^<\/([A-Za-z][\w:-]*)\s*>/.exec(text.slice(i));
      if (!match) fail('bad closing tag');
      const open = stack.pop();
      if (open.tag !== match[1]) fail(`closing </${match[1]}> but <${open.tag}> is open`);
      i += match[0].length;
    } else {
      const match = /^<([A-Za-z][\w:-]*)((?:\s+[^\s=/>"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/.exec(text.slice(i));
      if (!match) fail('bad tag');
      const node = { tag: match[1], attrs: {}, children: [] };
      for (const attr of match[2].matchAll(/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)) {
        if (attr[1] in node.attrs) fail(`duplicate attribute ${attr[1]}`);
        if (!html && attr[2] === undefined && attr[3] === undefined) fail(`attribute ${attr[1]} has no value`);
        const value = attr[2] ?? attr[3] ?? '';
        if (!html && value.includes('<')) fail(`"<" in attribute ${attr[1]}`);
        node.attrs[attr[1]] = decode(value, `in attribute ${attr[1]}`);
      }
      top().children.push(node);
      i += match[0].length;
      if (match[3] || (html && VOID.has(node.tag))) continue;
      if (html && RAW.has(node.tag)) {
        const end = text.toLowerCase().indexOf(`</${node.tag}`, i);
        if (end === -1) fail(`unclosed <${node.tag}>`);
        node.children.push({ text: text.slice(i, end) });
        i = end + text.slice(end).indexOf('>') + 1;
        continue;
      }
      stack.push(node);
    }
  }
  if (stack.length !== 1) throw new Error(`<${top().tag}> is never closed`);
  const elements = root.children.filter((c) => c.tag);
  if (!html && elements.length !== 1) throw new Error(`an XML document has one root element, found ${elements.length}`);
  return html ? root : elements[0];
}

export const textContent = (node) => (node.text !== undefined ? node.text : node.children.map(textContent).join(''));

/** 노드 자신을 뺀 모든 후손 요소. */
export function descendants(node) {
  return (node.children ?? []).flatMap((child) => (child.tag ? [child, ...descendants(child)] : []));
}

export const findAll = (node, test) => descendants(node).filter(test);
export const findOne = (node, test, what = 'element') => {
  const found = findAll(node, test);
  assert.equal(found.length, 1, `expected exactly one ${what}, found ${found.length}`);
  return found[0];
};

/** HTML 재생기가 문서 폭 판으로 놓는 보기 방식들을 판 순서대로. 좁은 화면용 템플릿은 세지 않는다. */
export async function panelStrategies(source, options) {
  const html = parseMarkup(await toHtml(await build(source, options), 'x'), { html: true });
  const canvas = findOne(html, (n) => /\bfl-canvas\b/.test(n.attrs.class ?? ''), 'canvas');
  return findAll(canvas, (n) => n.tag === 'section' && n.attrs['data-strategy']).map((n) => n.attrs['data-strategy']);
}

/** 숫자 속성. 없거나 숫자가 아니면 시험이 실패한다. */
export function num(node, name) {
  const value = Number(node.attrs[name]);
  assert.ok(Number.isFinite(value), `<${node.tag}> ${name}="${node.attrs[name]}" is not a finite number`);
  return value;
}

// ---- 파일과 명령줄 ----

/** 임시 작업 폴더를 만들고 `files`({ 상대경로: 글 })를 쓴다. 시험이 끝나면 지운다. */
export function workspace(t, files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'daphnis-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

/** 폴더 안 모든 파일의 { 상대경로: sha256 }. 두 시점을 견주어 "아무것도 바뀌지 않았다"를 증명한다. */
export function snapshot(dir) {
  const out = {};
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isSymbolicLink()) out[relative(dir, path)] = `link:${readlinkSync(path)}`;
      else if (entry.isDirectory()) {
        out[`${relative(dir, path)}/`] = 'dir';
        walk(path);
      } else out[relative(dir, path)] = createHash('sha256').update(readFileSync(path)).digest('hex');
    }
  };
  walk(dir);
  return out;
}

export const read = (...parts) => readFileSync(join(...parts), 'utf8');

/** `daphnis` 명령을 새 프로세스로 돌린다. */
export function cli(args, { cwd = ROOT, input } = {}) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', input });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

export { toHtml, toSvg };
