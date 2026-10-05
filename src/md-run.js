// daphnis md: 마크다운 문서의 ```dap 블록을 SVG로 만들고 블록 아래 이미지 줄을 맞춘다(docs/design/markdown.md).
// 모든 문서를 먼저 만든 다음에 쓴다. 오류가 하나라도 있으면 아무 파일도 쓰지 않고, --check는 쓰지 않고 갱신이 필요한지만 알린다.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { buildReported, report } from './build-reported.js';
import { fileHref } from './href.js';
import { findForMode, inspectFold, joinLines, layoutDocument } from './md-fold.js';
import { acquireLocks } from './md-lock.js';
import { ownerOf, ownership, realPath, svgMark } from './md-owner.js';
import { commitWrites, FILE_IO } from './md-write.js';
import { makeDiagnostic } from './source/problems.js';
import { toSvg } from './svg.js';
import { plainText } from './text.js';

const problem = (message, code = 'md') => makeDiagnostic({ severity: 'error', line: 0, message }, { code });

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 문서에 쓸 이미지 주소. 문서 폴더 기준 상대 경로, 구분자는 `/`, 이미지 문법을 깨는 글자는 퍼센트 인코딩이다.
const hrefOf = (file, svg) => fileHref(relative(dirname(file), svg).split(sep), { explicit: false });

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
// 출력 이름을 겹침 비교용 키로 바꾼다. 폴더는 실제 경로로 풀고, 파일 이름은 NFC 정규화 뒤 소문자로 낮춘다. 대소문자나 정규화만 다른 이름을 같은 파일로 치는 파일 시스템에서도 같은 결과가 나오게 항상 그렇게 비교한다.
const claimKey = (svg) => join(realPath(dirname(svg)), basename(svg)).normalize('NFC').toLowerCase();

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 블록 수
// basis: estimate
// 두 블록이 같은 SVG 파일을 쓰려는 곳(같은 이름, 같은 문서 이름, 대소문자만 다른 이름)을 오류로 알린다. 오류가 있으면 false다.
function claimTargets(file, targets, { claimed, json }) {
  let ok = true;
  for (const { block, svg } of targets) {
    const key = claimKey(svg);
    if (claimed.has(key)) {
      report(file, [{ ...problem(`${svg} is also written for ${claimed.get(key)}. Give the block a different name= (names that differ only in case or Unicode form count as the same)`), line: block.open + 1 }], json);
      ok = false;
    } else claimed.set(key, `${file}:${block.open + 1}`);
  }
  return ok;
}

// cost: time O(b), heap O(b), stack O(1), io b
// vars: b = 블록 수
// basis: estimate
// 쓸 SVG가 이미 있으면 이 문서 것인지 확인한다. 다른 문서 것이거나 표시 없는 파일, 소유를 정할 수 없는 옛 표시 파일이면 그 블록 줄에 오류를 알린다. 오류가 있으면 false다.
function checkOwners(file, targets, { owner, json }) {
  let ok = true;
  for (const { block, svg } of targets) {
    if (!existsSync(svg)) continue;
    const found = ownership(svg, owner);
    if (found.kind === 'mine') continue;
    const who = found.kind === 'other' ? `was made for another document, or its mark does not name this document (${found.text})` : 'has no daphnis md mark, so it is not a figure made by this tool';
    report(file, [{ ...problem(`${svg} already exists and ${who}. Give the block a different name=, or write this document to a different --out-dir`), line: block.open + 1 }], json);
    ok = false;
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
    const result = await buildReported(block.source, file, { flags: args.flags, baseDir: dirname(file), lineOffset: block.open + 1, budget: args.budget });
    built.push(result && { label, svg, block, result });
  }
  return built.includes(undefined) ? undefined : built;
}

// cost: time O(out), heap O(out), stack O(1)
// vars: out = SVG 글자 수
// basis: estimate
// SVG 글에 문서 표시를 넣는다(여는 태그 줄 다음 줄).
async function svgText({ result, svg }, { args, owner }) {
  const text = await toSvg(result, { isStatic: args.flags.has('static'), name: basename(svg, '.svg') });
  const cut = text.indexOf('\n') + 1;
  return `${text.slice(0, cut)}${svgMark(owner)}\n${text.slice(cut)}`;
}

// cost: time O(n), heap O(n), stack O(1), io n
// vars: n = 폴더 안 파일 수
// basis: estimate
// 이 문서가 예전에 만들었지만 지금은 안 쓰는 SVG. `{문서}-*.svg` 중 ownership이 이 문서 것으로 판정한 파일만이다. 표시는 SVG 폴더 기준 문서 경로라 다른 폴더의 같은 이름 문서가 만든 파일은 소유로 보지 않는다.
function staleSvgs({ file, outDir, owner }, keep) {
  const prefix = `${basename(file, extname(file))}-`;
  if (!existsSync(outDir)) return [];
  return readdirSync(outDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.svg') && !keep.has(join(outDir, name)))
    .map((name) => join(outDir, name))
    .filter((path) => ownership(path, owner).kind === 'mine');
}

// cost: time O(n), heap O(n), stack O(1), io 1
// vars: n = 문서 글자 수
// basis: estimate
// 문서를 읽어 { lines, ends, eol }로 쪼갠다. ends는 줄마다 원래 줄바꿈(마지막 줄은 '')이라 줄바꿈이 섞인 문서도 블록 본문은 바이트 그대로 돌아간다. 새 줄은 문서에 CRLF가 하나라도 있으면 CRLF, 아니면 LF를 쓴다. 못 읽으면 알리고 undefined다.
function readDocument(file, json) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    report(file, [problem(`cannot read the file: ${error.code ?? error.message}`, 'io')], json);
    return undefined;
  }
  const parts = text.split(/(\r?\n)/);
  return { lines: parts.filter((_, i) => i % 2 === 0), ends: [...parts.filter((_, i) => i % 2 === 1), ''], eol: text.includes('\r\n') ? '\r\n' : '\n' };
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 블록 수
// basis: estimate
// 블록 형식 오류와 옛 울타리 폐기 안내를 알린다.
function reportBlocks(file, found, json) {
  report(file, found.errors.map(({ line, message }) => ({ ...problem(message), line })), json);
  report(file, found.blocks.filter((block) => block.legacy).map((block) => ({ ...makeDiagnostic({ severity: 'deprecated', line: block.open + 1, message: 'the code block language "muto" is now "dap". Write the fence as ```dap' }, { code: 'deprecated-fence' }) })), json);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 접기 옵션이 고른 방식: 'fold', 'unfold', 옵션이 없으면 'keep'(문서의 접힘 상태를 지킨다).
const foldMode = (flags) => (flags.has('fold') ? 'fold' : flags.has('unfold') ? 'unfold' : 'keep');

// cost: time O(b·build + n), heap O(b·out), stack O(1), io 2b + n
// vars: b = 블록 수, build = 블록 하나를 만드는 비용, out = SVG 글자 수, n = 문서 줄 수
// basis: estimate
// 문서 하나가 낼 파일 { files, stale }. 읽기 오류, 블록 형식 오류, 접기 구조 오류, 만들기 오류가 있으면 알리고 undefined다.
async function planDocument(file, args, claimed) {
  const json = args.flags.has('json');
  const doc = readDocument(file, json);
  if (!doc) return undefined;
  const mode = foldMode(args.flags);
  const found = findForMode(doc.lines, mode);
  reportBlocks(file, found, json);
  const inspected = inspectFold(doc.lines, found, mode);
  report(file, inspected.errors.map(({ line, message }) => ({ ...problem(message, 'md-fold'), line })), json);
  const outDir = args['out-dir'] ?? dirname(file);
  const targets = targetsOf(file, found.blocks, outDir);
  const unique = claimTargets(file, targets, { claimed, json });
  const owner = ownerOf(file, outDir);
  const owned = checkOwners(file, targets, { owner, json });
  const broken = found.errors.length || inspected.errors.length || !unique || !owned;
  const built = broken ? undefined : await buildTargets(file, targets, args);
  if (!built) return undefined;
  const images = built.map(({ label, svg, result }) => ({ alt: plainText(result.figure.title ?? label), href: hrefOf(file, svg) }));
  const files = [];
  for (const item of built) files.push({ path: item.svg, text: await svgText(item, { args, owner }) });
  // 문서는 SVG 뒤에 쓴다. 문서가 가리키는 SVG가 먼저 놓여 있어야 중간에 멈춰도 깨진 링크가 없다.
  const text = joinLines(layoutDocument(doc, { ...inspected, fenced: found.fenced, quotes: found.quotes }, { mode, title: args['fold-title'], images }), doc.eol);
  files.push({ path: file, text, isDocument: true });
  return { files, stale: staleSvgs({ file, outDir, owner }, new Set(built.map((item) => item.svg))) };
}

// cost: time O(f), heap O(f), stack O(1), io f
// vars: f = 쓸 파일 수
// basis: estimate
// 디스크와 다른 파일만 남긴다. 같은 결과를 다시 만들면 아무것도 쓰지 않는다(멱등).
const changedFiles = (files) => files.filter(({ path, text }) => !existsSync(path) || readFileSync(path, 'utf8') !== text);

// cost: time O(f), heap O(f), stack O(1), io f
// vars: f = 문서 전체가 쓰거나 지울 파일 수
// basis: estimate
// 이번 실행의 쓰기와 삭제 계획. 문서마다 따로 정한 낡은 SVG 목록을 합친 뒤, 어느 문서든 이번에 쓰는 파일은 뺀다. 쓰는 파일과 지우는 파일이 겹치지 않는다.
function outputPlan(plans) {
  const files = plans.flatMap((plan) => plan.files);
  const written = new Set(files.map(({ path }) => path));
  const removes = [...new Set(plans.flatMap((plan) => plan.stale))].filter((path) => !written.has(path));
  const writes = changedFiles(files);
  return { writes: [...writes.filter((file) => !file.isDocument), ...writes.filter((file) => file.isDocument)], removes };
}

// cost: time O(f), heap O(f), stack O(1), io 3f
// vars: f = 문서 전체가 쓰거나 지울 파일 수
// basis: estimate
// 계획을 디스크에 적용한다. SVG와 문서를 commitWrites로 쓰고(SVG 먼저, 문서 마지막), 성공한 뒤에만 경로를 알리고 낡은 SVG를 지운다. 지우기가 실패해도 문서와 새 SVG는 일관되고 낡은 SVG만 남는다.
function applyPlan({ writes, removes }, { json, io }) {
  const result = commitWrites(writes, io);
  if (result.error) {
    report(result.path, [problem(`cannot write the file: ${result.error.code ?? result.error.message}`, 'io')], json);
    for (const path of result.unrestored) report(path, [problem('could not be restored after a failed write. Restore it from version control', 'io')], json);
    return 1;
  }
  if (!json) for (const { path } of writes) process.stdout.write(`${path}\n`);
  let status = 0;
  for (const path of removes) {
    try {
      io.unlink(path);
      if (!json) process.stdout.write(`removed ${path}\n`);
    } catch (error) {
      report(path, [problem(`cannot remove the file: ${error.code ?? error.message}`, 'io')], json);
      status = 1;
    }
  }
  return status;
}

// cost: time O(d·b·build), heap O(d·b·out), stack O(1), io d·(2b + n)
// vars: d = 문서 수, b = 문서 안 블록 수, build = 블록 하나를 만드는 비용, out = SVG 글자 수, n = 폴더 안 파일 수
// basis: estimate
/**
 * `daphnis md`를 실행한다. 종료 코드를 돌려준다: 0 정상(또는 --check에서 갱신 불필요), 1 오류(또는 --check에서 갱신 필요).
 * 오류가 있으면 아무 파일도 쓰거나 지우지 않는다. 같은 출력 폴더를 다른 프로세스가 쓰는 중이어도 1이다(진단 code md-locked). 쓰기나 삭제가 실패해도 1이다(진단 code io).
 * @param io 파일 쓰기 동작. 시험이 실패를 주입한다
 */
export async function runMd(args, io = FILE_IO) {
  const json = args.flags.has('json');
  // --check는 아무것도 쓰지 않으므로 잠그지 않는다. 쓰는 실행은 검사부터 쓰기까지 출력 폴더를 잠가 두 프로세스의 경쟁을 막는다.
  const locks = args.flags.has('check') ? { release() {} } : acquireLocks(args.inputs.map((input) => args['out-dir'] ?? dirname(input)));
  if (locks.busy) {
    report(locks.busy.path, [problem(locks.busy.message, 'md-locked')], json);
    return 1;
  }
  try {
    return await runLocked(args, io);
  } finally {
    locks.release();
  }
}

// cost: time O(d·b·build), heap O(d·b·out), stack O(1), io d·(2b + n)
// vars: d = 문서 수, b = 문서 안 블록 수, build = 블록 하나를 만드는 비용, out = SVG 글자 수, n = 폴더 안 파일 수
// basis: estimate
// 잠근 뒤의 실행: 모든 문서의 계획과 소유 검사를 끝낸 다음에만 쓴다.
async function runLocked(args, io) {
  const json = args.flags.has('json');
  const claimed = new Map();
  const plans = [];
  for (const input of args.inputs) plans.push(await planDocument(input, args, claimed));
  if (plans.includes(undefined)) return 1;
  const { writes, removes } = outputPlan(plans);
  if (args.flags.has('check')) {
    for (const { path } of writes) report(path, [problem('is out of date. Run daphnis md to update it', 'md-outdated')], json);
    for (const path of removes) report(path, [problem('is a stale figure. Run daphnis md to remove it', 'md-outdated')], json);
    return writes.length || removes.length ? 1 : 0;
  }
  return applyPlan({ writes, removes }, { json, io });
}
