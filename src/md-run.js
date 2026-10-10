// daphnis md: 마크다운 문서의 ```dap 블록을 SVG로 만들고 블록 아래 이미지 줄을 맞춘다(docs/design/markdown.md).
// 모든 문서를 먼저 만든 다음에 쓴다. 오류가 하나라도 있으면 아무 파일도 쓰지 않고, --check는 쓰지 않고 갱신이 필요한지만 알린다.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, sep } from 'node:path';
import { buildReported, claimOutputs, commitReported, pickScene, problem, readReported, report } from './build-reported.js';
import { fileHref } from './href.js';
import { findForMode, inspectFold, joinLines, layoutDocument } from './md-fold.js';
import { acquireLocks } from './md-lock.js';
import { ownerOf, ownership, realPath, svgMark } from './md-owner.js';
import { outputKey } from './md-write.js';
import { toSvg } from './svg.js';
import { plainText } from './text.js';

// cost: time O(d), heap O(n), stack O(d), io d
// vars: d = 경로 깊이, n = 경로 글자 수
// basis: estimate
/**
 * 문서에 쓸 이미지 주소. 실제 문서 폴더 기준 상대 경로, 구분자는 `/`, 이미지 문법을 깨는 글자는 퍼센트 인코딩이다.
 * 문서와 그림 폴더는 심볼릭 링크를 푼 실제 위치로 재므로(소유 판정과 같다) 링크 폴더로 열어도 링크가 실제 문서에서 풀린다.
 * 상대 경로가 없는 위치(Windows에서 다른 드라이브)면 undefined다.
 */
function hrefOf(file, svg) {
  const path = relative(dirname(realPath(file)), join(realPath(dirname(svg)), basename(svg)));
  return isAbsolute(path) ? undefined : fileHref(path.split(sep), { explicit: false });
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 블록 수
// basis: estimate
// 블록마다 SVG 경로를 정한다. 이름이 있으면 `{문서}-{이름}.svg`, 없으면 이름 없는 블록의 순번(1부터)이다.
function targetsOf(file, blocks, outDir) {
  const base = basename(file, extname(file));
  let unnamed = 0;
  return blocks.map((block) => ({ block, label: block.name ?? `${base} figure ${++unnamed}`, svg: join(outDir, `${base}-${block.name ?? unnamed}.svg`) }));
}

// 같은 파일을 쓰려는 겹침을 풀 방법. 이름은 대소문자나 유니코드 정규화만 달라도 같은 파일로 센다.
const SVG_HINT = 'Give the block a different name= (names that differ only in case or Unicode form count as the same)';
const DOCUMENT_HINT = 'Give each document once; a symbolic link and the file it points to are the same document';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 쓸 파일 하나의 출력 등록 항목. 겹침 진단은 문서 줄(line이 0이면 문서 자체)에 붙는다.
const claim = (site, path, hint) => ({ path, owner: site.line ? `${site.file}:${site.line}` : site.file, hint, site });

// cost: time O(b), heap O(b), stack O(1), io b
// vars: b = 블록 수
// basis: estimate
// 쓸 SVG가 이미 있으면 이 문서 것인지 확인한다. 다른 문서 것이거나 `daphnis md v2` 표시가 없는 파일이면 그 블록 줄에 오류를 알린다. 오류가 있으면 false다.
function checkOwners(file, targets, { owner, json }) {
  let ok = true;
  for (const { block, svg } of targets) {
    if (!existsSync(svg)) continue;
    const found = ownership(svg, owner);
    if (found.kind === 'mine') continue;
    const who = found.kind === 'other' ? `was made for another document, or its mark does not name this document (${found.text})` : 'has no daphnis md v2 mark, so it is not a figure made by this tool';
    report(file, [{ ...problem(`${svg} already exists and ${who}. Give the block a different name=, or write this document to a different --out-dir`, 'md'), line: block.open + 1 }], json);
    ok = false;
  }
  return ok;
}

// cost: time O(b·d), heap O(b), stack O(1), io b·d
// vars: b = 블록 수, d = 경로 깊이
// basis: estimate
// 블록마다 문서에 쓸 이미지 주소. 상대 경로로 이을 수 없는 위치(다른 드라이브)가 있으면 그 블록 줄에 오류를 알리고 undefined다.
function linksOf(file, targets, json) {
  const hrefs = targets.map(({ svg }) => hrefOf(file, svg));
  targets.forEach(({ block, svg }, k) => {
    if (hrefs[k] !== undefined) return;
    report(file, [{ ...problem(`${svg} cannot be linked from this document with a relative path because they are on different drives. Write this document to an --out-dir on the same drive`, 'md'), line: block.open + 1 }], json);
  });
  return hrefs.includes(undefined) ? undefined : hrefs;
}

// cost: time O(b·build), heap O(b·out), stack O(1), io b
// vars: b = 블록 수, build = 블록 하나를 만드는 비용, out = SVG 글자 수
// basis: estimate
// 블록마다 만든다. 하나라도 오류면 undefined다(모든 블록의 오류를 모아 알리려고 끝까지 만든다).
async function buildTargets(file, targets, args) {
  const built = [];
  for (const { block, label, svg } of targets) {
    const result = await buildReported(block.source, file, { flags: args.flags, baseDir: dirname(file), lineOffset: block.open + 1, budget: args.budget });
    const scene = result ? pickScene(result, args.scene, { file, json: args.flags.has('json'), line: block.open + 1 }) : undefined;
    built.push(scene === undefined ? undefined : { label, svg, block, result, scene });
  }
  return built.includes(undefined) ? undefined : built;
}

// cost: time O(out), heap O(out), stack O(1)
// vars: out = SVG 글자 수
// basis: estimate
// SVG 글에 문서 표시를 넣는다(여는 태그 줄 다음 줄).
async function svgText({ result, svg, scene }, { args, owner }) {
  const text = await toSvg(result, { scene, isStatic: args.flags.has('static'), name: basename(svg, '.svg') });
  const cut = text.indexOf('\n') + 1;
  return `${text.slice(0, cut)}${svgMark(owner)}\n${text.slice(cut)}`;
}

// cost: time O(n), heap O(n), stack O(1), io n
// vars: n = 폴더 안 파일 수
// basis: estimate
// 이 문서가 예전에 만들었지만 지금은 안 쓰는 SVG. `{문서}-*.svg` 중 ownership이 이 문서 것으로 판정한 파일만이다. 표시는 SVG 폴더 기준 문서 경로라 다른 폴더의 같은 이름 문서가 만든 파일은 소유로 보지 않는다.
// keep은 이번에 쓰는 SVG의 outputKey 집합이다. 쓰기 겹침 판정과 같은 키로 비교하므로, 대소문자나 정규화만 달라진 이름이 가리키는 같은 파일을 낡은 파일로 보지 않는다.
function staleSvgs({ file, outDir, owner }, keep) {
  const prefix = `${basename(file, extname(file))}-`;
  if (!existsSync(outDir)) return [];
  return readdirSync(outDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.svg') && !keep.has(outputKey(join(outDir, name))))
    .map((name) => join(outDir, name))
    .filter((path) => ownership(path, owner).kind === 'mine');
}

// cost: time O(n), heap O(n), stack O(1), io 1
// vars: n = 문서 글자 수
// basis: estimate
// 문서를 읽어 { lines, ends, eol }로 쪼갠다. ends는 줄마다 원래 줄바꿈(마지막 줄은 '')이라 줄바꿈이 섞인 문서도 블록 본문은 바이트 그대로 돌아간다. 새 줄은 문서에 CRLF가 하나라도 있으면 CRLF, 아니면 LF를 쓴다. 못 읽으면 알리고 undefined다.
function readDocument(file, json) {
  const text = readReported(file, json);
  if (text === undefined) return undefined;
  const parts = text.split(/(\r?\n)/);
  return { lines: parts.filter((_, i) => i % 2 === 0), ends: [...parts.filter((_, i) => i % 2 === 1), ''], eol: text.includes('\r\n') ? '\r\n' : '\n' };
}

// cost: time O(b), heap O(b), stack O(1)
// vars: b = 블록 수
// basis: estimate
// 블록 형식 오류를 알린다.
function reportBlocks(file, found, json) {
  report(file, found.errors.map(({ line, message, code }) => ({ ...problem(message, code ?? 'md'), line })), json);
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
  const entries = [claim({ file, line: 0 }, file, DOCUMENT_HINT), ...targets.map(({ block, svg }) => claim({ file, line: block.open + 1 }, svg, SVG_HINT))];
  const unique = claimOutputs(entries, { claimed, json });
  const owner = ownerOf(file, outDir);
  const owned = checkOwners(file, targets, { owner, json });
  const hrefs = linksOf(file, targets, json);
  const broken = found.errors.length || inspected.errors.length || !unique || !owned || !hrefs;
  const built = broken ? undefined : await buildTargets(file, targets, args);
  if (!built) return undefined;
  const images = built.map(({ label, result }, k) => ({ alt: plainText(result.figure.title ?? label), href: hrefs[k] }));
  const files = [];
  for (const item of built) files.push({ path: item.svg, text: await svgText(item, { args, owner }) });
  // 문서는 SVG 뒤에 쓴다. 문서가 가리키는 SVG가 먼저 놓여 있어야 중간에 멈춰도 깨진 링크가 없다.
  const text = joinLines(layoutDocument(doc, { ...inspected, raw: found.raw, quotes: found.quotes }, { mode, title: args['fold-title'], images }), doc.eol);
  files.push({ path: file, text, isDocument: true });
  return { files, stale: staleSvgs({ file, outDir, owner }, new Set(built.map((item) => outputKey(item.svg)))) };
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
  const written = new Set(files.map(({ path }) => outputKey(path)));
  const removes = [...new Set(plans.flatMap((plan) => plan.stale))].filter((path) => !written.has(outputKey(path)));
  const writes = changedFiles(files);
  return { writes: [...writes.filter((file) => !file.isDocument), ...writes.filter((file) => file.isDocument)], removes };
}

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
// --out-dir로 쓸 수 있는지 본다. 이미 있는 파일이거나 경로 중간이 파일이면 쓰기 전에 한 줄로 알리고 false다. 없는 폴더는 쓸 때 만든다.
function checkOutDir(dir, json) {
  if (dir === undefined) return true;
  let reason;
  try {
    reason = statSync(dir).isDirectory() ? undefined : 'it is not a folder';
  } catch (error) {
    reason = error.code === 'ENOENT' ? undefined : error.code;
  }
  if (reason) report(dir, [problem(`cannot be used as --out-dir: ${reason}`, 'io')], json);
  return !reason;
}

// cost: time O(d·b·build), heap O(d·b·out), stack O(1), io d·(2b + n)
// vars: d = 문서 수, b = 문서 안 블록 수, build = 블록 하나를 만드는 비용, out = SVG 글자 수, n = 폴더 안 파일 수
// basis: estimate
/**
 * `daphnis md`를 실행한다. 종료 코드를 돌려준다: 0 정상(또는 --check에서 갱신 불필요), 1 오류(또는 --check에서 갱신 필요).
 * 오류가 있으면 아무 파일도 쓰거나 지우지 않는다. 같은 출력 폴더를 다른 프로세스가 쓰는 중이어도 1이다(진단 code md-locked). 쓰기나 삭제가 실패해도 1이다(진단 code io).
 */
export async function runMd(args) {
  const json = args.flags.has('json');
  if (!checkOutDir(args['out-dir'], json)) return 1;
  // --check는 아무것도 쓰지 않으므로 잠그지 않는다. 쓰는 실행은 검사부터 쓰기까지 출력 폴더를 잠가 두 프로세스의 경쟁을 막는다.
  const locks = args.flags.has('check') ? { release() {} } : acquireLocks(args.inputs.map((input) => args['out-dir'] ?? dirname(input)));
  if (locks.busy) {
    report(locks.busy.path, [problem(locks.busy.message, 'md-locked')], json);
    return 1;
  }
  try {
    return await runLocked(args);
  } finally {
    locks.release();
  }
}

// cost: time O(d·b·build), heap O(d·b·out), stack O(1), io d·(2b + n)
// vars: d = 문서 수, b = 문서 안 블록 수, build = 블록 하나를 만드는 비용, out = SVG 글자 수, n = 폴더 안 파일 수
// basis: estimate
// 잠근 뒤의 실행: 모든 문서의 계획과 소유 검사를 끝낸 다음에만 쓴다.
async function runLocked(args) {
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
  // SVG와 문서를 쓰고(SVG 먼저, 문서 마지막) 성공한 뒤에만 낡은 SVG를 지운다. 지우기가 실패해도 문서와 새 SVG는 일관되고 낡은 SVG만 남는다.
  return commitReported(writes, { json, removes }) ? 0 : 1;
}
