// daphnis md: 마크다운 문서의 ```dap 블록을 SVG로 만들고 블록 아래 이미지 줄을 맞춘다(docs/design/markdown.md).
// 모든 문서를 먼저 만든 다음에 쓴다. 오류가 하나라도 있으면 아무 파일도 쓰지 않고, --check는 쓰지 않고 갱신이 필요한지만 알린다.
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { buildReported, report, writeOutput } from './build-reported.js';
import { applyImages, findBlocks } from './md.js';
import { makeDiagnostic } from './source/problems.js';
import { toSvg } from './svg.js';
import { plainText } from './text.js';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 이 문서에서 만든 SVG라는 표시. 이름이 바뀌어 안 쓰는 SVG를 찾아 지울 때 문서 이름까지 맞는 파일만 지운다.
const svgMark = (file) => `<!-- daphnis md ${basename(file)} -->`;
// 옛 이름의 표시. 옛 표시가 든 SVG도 이 문서가 만든 것으로 보고 안 쓰게 되면 지운다.
const legacySvgMark = (file) => `<!-- mutoscope md ${basename(file)} -->`;
const problem = (message, code = 'md') => makeDiagnostic({ severity: 'error', line: 0, message }, { code });

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 문서에 쓸 이미지 주소. 문서 폴더 기준 상대 경로, 구분자는 `/`, 이미지 문법을 깨는 글자는 퍼센트 인코딩이다.
const hrefOf = (file, svg) => relative(dirname(file), svg).split(sep).map((part) => encodeURIComponent(part).replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)).join('/');

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 블록 수
// basis: estimate
// 블록마다 SVG 경로를 정한다. 이름이 있으면 `{문서}-{이름}.svg`, 없으면 이름 없는 블록의 순번(1부터)이다.
function targetsOf(file, blocks, outDir) {
  const base = basename(file, extname(file));
  let unnamed = 0;
  return blocks.map((block) => ({ block, label: block.name ?? `${base} figure ${++unnamed}`, svg: join(outDir, `${base}-${block.name ?? unnamed}.svg`) }));
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 블록 수
// basis: estimate
// 두 블록이 같은 SVG 파일을 쓰려는 곳(같은 이름, 같은 문서 이름)을 오류로 알린다. 오류가 있으면 false다.
function claimTargets(file, targets, { claimed, json }) {
  let ok = true;
  for (const { block, svg } of targets) {
    if (claimed.has(svg)) {
      report(file, [{ ...problem(`${svg} is also written for ${claimed.get(svg)}. Give the block a different name=`), line: block.open + 1 }], json);
      ok = false;
    } else claimed.set(svg, `${file}:${block.open + 1}`);
  }
  return ok;
}

// cost: time O(b·build), heap O(b·out), stack O(1), io b
// vars: b = 블록 수, build = 블록 하나를 만드는 비용, out = SVG 글자 수
// basis: estimate
// 블록마다 만든다. 하나라도 오류면 undefined다(모든 블록의 오류를 모아 알리려고 끝까지 만든다).
async function buildTargets(file, targets, args) {
  const built = [];
  for (const { block, label, svg } of targets) {
    const result = await buildReported(block.source, file, { flags: args.flags, baseDir: dirname(file), lineOffset: block.open + 1 });
    built.push(result && { label, svg, block, result });
  }
  return built.includes(undefined) ? undefined : built;
}

// cost: time O(out), heap O(out), stack O(1)
// vars: out = SVG 글자 수
// basis: estimate
// SVG 글에 문서 표시를 넣는다(여는 태그 줄 다음 줄).
async function svgText(file, { result, svg }, args) {
  const text = await toSvg(result, { isStatic: args.flags.has('static'), name: basename(svg, '.svg') });
  const cut = text.indexOf('\n') + 1;
  return `${text.slice(0, cut)}${svgMark(file)}\n${text.slice(cut)}`;
}

// cost: time O(n), heap O(n), stack O(1), io n
// vars: n = 폴더 안 파일 수
// basis: estimate
// 이 문서가 예전에 만들었지만 지금은 안 쓰는 SVG. `{문서}-*.svg` 중 이 문서의 표시가 든 파일만이다.
function staleSvgs(file, outDir, keep) {
  const prefix = `${basename(file, extname(file))}-`;
  if (!existsSync(outDir)) return [];
  return readdirSync(outDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.svg') && !keep.has(join(outDir, name)))
    .map((name) => join(outDir, name))
    .filter((path) => {
      const text = readFileSync(path, 'utf8');
      return text.includes(svgMark(file)) || text.includes(legacySvgMark(file));
    });
}

// cost: time O(b·build + n), heap O(b·out), stack O(1), io 2b + n
// vars: b = 블록 수, build = 블록 하나를 만드는 비용, out = SVG 글자 수, n = 문서 줄 수
// basis: estimate
// 문서 하나가 낼 파일 { files, stale }. 읽기 오류, 블록 형식 오류, 만들기 오류가 있으면 알리고 undefined다.
async function planDocument(file, args, claimed) {
  const json = args.flags.has('json');
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    report(file, [problem(`cannot read the file: ${error.code ?? error.message}`, 'io')], json);
    return undefined;
  }
  // 줄바꿈이 CRLF인 문서는 CRLF로 다시 쓴다.
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const found = findBlocks(lines);
  report(file, found.errors.map(({ line, message }) => ({ ...problem(message), line })), json);
  report(file, found.blocks.filter((block) => block.legacy).map((block) => ({ ...makeDiagnostic({ severity: 'deprecated', line: block.open + 1, message: 'the code block language "muto" is now "dap". Write the fence as ```dap' }, { code: 'deprecated-fence' }) })), json);
  const outDir = args['out-dir'] ?? dirname(file);
  const targets = targetsOf(file, found.blocks, outDir);
  const unique = claimTargets(file, targets, { claimed, json });
  const built = found.errors.length || !unique ? undefined : await buildTargets(file, targets, args);
  if (!built) return undefined;
  const images = built.map(({ label, svg, result }) => ({ alt: plainText(result.figure.title ?? label), href: hrefOf(file, svg) }));
  const files = [{ path: file, text: applyImages(lines, found, images).join(eol) }];
  for (const item of built) files.push({ path: item.svg, text: await svgText(file, item, args) });
  return { files, stale: staleSvgs(file, outDir, new Set(built.map((item) => item.svg))) };
}

// cost: time O(f), heap O(f), stack O(1), io f
// vars: f = 쓸 파일 수
// basis: estimate
// 디스크와 다른 파일만 남긴다. 같은 결과를 다시 만들면 아무것도 쓰지 않는다(멱등).
const changedFiles = (files) => files.filter(({ path, text }) => !existsSync(path) || readFileSync(path, 'utf8') !== text);

// cost: time O(d·b·build), heap O(d·b·out), stack O(1), io d·(2b + n)
// vars: d = 문서 수, b = 문서 안 블록 수, build = 블록 하나를 만드는 비용, out = SVG 글자 수, n = 폴더 안 파일 수
// basis: estimate
/**
 * `daphnis md`를 실행한다. 종료 코드를 돌려준다: 0 정상(또는 --check에서 갱신 불필요), 1 오류(또는 --check에서 갱신 필요).
 * 오류가 있으면 아무 파일도 쓰거나 지우지 않는다.
 */
export async function runMd(args) {
  const json = args.flags.has('json');
  const claimed = new Map();
  const plans = [];
  for (const input of args.inputs) plans.push(await planDocument(input, args, claimed));
  if (plans.includes(undefined)) return 1;
  const writes = changedFiles(plans.flatMap((plan) => plan.files));
  const removes = plans.flatMap((plan) => plan.stale);
  if (args.flags.has('check')) {
    for (const { path } of writes) report(path, [problem('is out of date. Run daphnis md to update it', 'md-outdated')], json);
    for (const path of removes) report(path, [problem('is a stale figure. Run daphnis md to remove it', 'md-outdated')], json);
    return writes.length || removes.length ? 1 : 0;
  }
  for (const { path, text } of writes) {
    mkdirSync(dirname(path), { recursive: true });
    writeOutput(path, text, json);
  }
  for (const path of removes) {
    unlinkSync(path);
    if (!json) process.stdout.write(`removed ${path}\n`);
  }
  return 0;
}
