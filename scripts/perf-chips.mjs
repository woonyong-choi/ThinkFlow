// 예제, 문서 그림, CS:APP 그림의 빌드 시간(이동 글 상자 계획 포함)을 재서 기준 시간(scripts/perf-baseline.json)을 넘으면 실패한다.
// 사용: node scripts/perf-chips.mjs [--baseline 파일] [--write 새 파일]   (npm run perf)
// 출력: 그림 수, 합계와 기준, 가장 느린 그림 다섯 개, 마지막에 `ok` 또는 넘은 항목. 넘으면 종료 코드 1.
// 비교 조건: 기준 파일은 잰 그림 목록과 그림 파일마다 내용 해시(inputs), 기준 코드의 커밋 해시(codeHash), 재는 방법(이 파일)의 내용 해시(scriptHash)를 함께 적는다.
// 비교는 그 목록의 그림만 재고, 내용이 달라졌거나 없어진 그림이 있거나 재는 방법이 달라졌으면 재지 않고 실패한다(조건이 다른 합계는 코드 회귀율이 아니다). 기준에 없는 새 그림은 재지 않고 개수만 알린다.
// --write는 지금 잰 값을 새 기준 파일로 저장한다. 있는 파일은 덮어쓰지 않고, 커밋하지 않은 변경이 있으면 쓰지 않는다(적은 코드 해시가 재현되도록). 기계가 한가할 때, 일부러 느려지는 변경을 받아들일 때만 쓴다.
// 시간은 그림마다 PASSES번 만들어 가장 짧은 CPU 시간(user + system)이다. 첫 한 번은 글꼴 읽기와 JIT 데우기라 세지 않는다.
// 기준은 이 저장소의 CI가 아니라 로컬 기계에서 잰 값이다. 다른 기계에서는 --write로 새 기준을 잡는다. CI에는 넣지 않는다.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFigure } from '../src/build.js';
import { toSvg } from '../src/svg.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BASELINE = join(ROOT, 'scripts', 'perf-baseline.json');
// 재는 그림 폴더. 예제, 문서 그림, 시험용 그림, CS:APP 그림
const SOURCE_DIRS = ['examples', 'docs/assets', 'test/fixtures', 'test/fixtures/csapp'];
const PASSES = 3;
// 기준보다 이 배수를 넘으면 실패. 기계가 바빠 생기는 흔들림(같은 코드가 1.3배 넘게 흔들렸다)은 넘기고, 첫 구현처럼 합계가 2배 넘게 늘어난 회귀는 잡는 값이다.
const TOLERANCE = 1.6;
const SLOWEST_SHOWN = 5;
const SHORT_HASH = 7;

// cost: time O(f), heap O(f), stack O(1), io f
// vars: f = 그림 원본 수
// basis: estimate
function sourcesOf() {
  return SOURCE_DIRS.flatMap((dir) => readdirSync(join(ROOT, dir)).filter((name) => name.endsWith('.dap')).map((name) => join(ROOT, dir, name)));
}

// cost: time O(f·n), heap O(f), stack O(1), io f
// vars: f = 그림 수, n = 원본 글자 수
// basis: estimate
// 그림 경로(저장소 기준) → 내용 해시
function inputsOf(paths) {
  return Object.fromEntries(paths.map((path) => [path.replace(`${ROOT}/`, ''), createHash('sha256').update(readFileSync(path)).digest('hex')]));
}

// cost: time O(1), heap O(1), stack O(1), io 2
// vars: git 프로세스 둘
// basis: estimate
// cost: time O(s), heap O(s), stack O(1), io 1
// vars: s = 이 파일의 글자 수
// basis: estimate
// 재는 방법(이 파일)의 내용 해시. 반복 수, 허용 배수, 시간 재는 법이 바뀌면 달라진다.
function scriptHash() {
  return createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
}

// cost: time O(1), heap O(1), stack O(1), io 2
// vars: git 프로세스 둘
// basis: estimate
// 지금 코드의 커밋 해시와 커밋하지 않은 변경 여부
function codeState() {
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  return { hash: git('rev-parse', 'HEAD'), isDirty: git('status', '--porcelain').length > 0 };
}

// cost: time O(f·n), heap O(f), stack O(1), io f
// vars: f = 기준에 적힌 그림 수, n = 원본 글자 수
// basis: estimate
// 기준에 적힌 그림 중 내용이 달라졌거나 없어진 것. 비어 있어야 비교할 수 있다.
function changedInputs(inputs) {
  const present = Object.keys(inputs).filter((path) => existsSync(join(ROOT, path)));
  const now = inputsOf(present.map((path) => join(ROOT, path)));
  return Object.entries(inputs).filter(([path, hash]) => now[path] !== hash).map(([path]) => path);
}

// cost: time O(build), heap O(out), stack O(1)
// vars: build = 그림 하나를 만드는 비용, out = 결과 글자 수
// basis: estimate
// 그림 하나를 SVG까지 만드는 데 든 CPU 시간(ms)
async function timeFigure(path) {
  const text = readFileSync(path, 'utf8');
  const before = process.cpuUsage();
  const result = await buildFigure(text, { baseDir: dirname(path) });
  await toSvg(result, { isStatic: false, name: basename(path, '.dap') });
  const used = process.cpuUsage(before);
  return (used.user + used.system) / 1000;
}

// cost: time O(f·PASSES·build), heap O(f), stack O(1)
// vars: f = 그림 수, PASSES = 반복 수, build = 그림 하나를 만드는 비용
// basis: measured npm run perf
// 그림마다 가장 짧은 시간. 첫 한 번은 데우기다.
async function measure(paths) {
  await timeFigure(paths[0]);
  const rows = [];
  for (const path of paths) {
    const times = [];
    for (let pass = 0; pass < PASSES; pass++) times.push(await timeFigure(path));
    rows.push({ name: path.replace(`${ROOT}/`, ''), ms: Math.min(...times) });
  }
  return rows;
}

// cost: time O(f), heap O(1), stack O(1)
// vars: f = 그림 수
// basis: estimate
function summarize(rows) {
  const worst = rows.reduce((a, b) => (b.ms > a.ms ? b : a));
  return { figures: rows.length, totalMs: Math.round(rows.reduce((sum, row) => sum + row.ms, 0)), worstMs: Math.round(worst.ms), worstName: worst.name };
}

// cost: time O(f log f), heap O(f), stack O(1)
// vars: f = 그림 수
// basis: estimate
function report(rows, now, baseline) {
  for (const row of [...rows].sort((a, b) => b.ms - a.ms).slice(0, SLOWEST_SHOWN)) console.log(`${row.ms.toFixed(0).padStart(6)} ms  ${row.name}`);
  console.log(`figures ${now.figures}, total ${now.totalMs} ms (baseline ${baseline.totalMs}), worst ${now.worstMs} ms (baseline ${baseline.worstMs}) ${now.worstName}`);
  const over = [];
  if (now.totalMs > baseline.totalMs * TOLERANCE) over.push(`total ${now.totalMs} ms is over ${(baseline.totalMs * TOLERANCE).toFixed(0)} ms`);
  if (now.worstMs > baseline.worstMs * TOLERANCE) over.push(`worst figure ${now.worstMs} ms is over ${(baseline.worstMs * TOLERANCE).toFixed(0)} ms`);
  return over;
}

// cost: time O(f·n), heap O(f), stack O(1), io f + 1
// vars: f = 기준에 적힌 그림 수, n = 원본 글자 수
// basis: estimate
// 이 기준과 지금이 같은 조건이 아닌 까닭. 같은 조건이면 undefined다.
function mismatchOf(baseline) {
  if (!baseline.inputs || !baseline.codeHash || !baseline.scriptHash) return 'the baseline has no inputs, codeHash, or scriptHash';
  if (baseline.scriptHash !== scriptHash()) return 'the baseline was measured by other measuring code (scripts/perf-chips.mjs differs)';
  const changed = changedInputs(baseline.inputs);
  return changed.length ? `the baseline inputs differ from the current files: ${changed.join(', ')}` : undefined;
}

// cost: time O(f·PASSES·build), heap O(f), stack O(1), io f
// vars: f = 기준에 적힌 그림 수, PASSES = 반복 수, build = 그림 하나를 만드는 비용
// basis: measured npm run perf
// 기준에 적힌 그림과 같은 목록으로 재서 비교한다. 입력이 다르면 재지 않고 실패한다. 종료 코드를 돌려준다.
async function runCompare(path) {
  const baseline = JSON.parse(readFileSync(path, 'utf8'));
  const problem = mismatchOf(baseline);
  if (problem) {
    console.log(`cannot compare: ${problem}\nWrite a new baseline in a new file with --write <file> and compare with --baseline <file>`);
    return 1;
  }
  const names = Object.keys(baseline.inputs);
  const rows = await measure(names.map((name) => join(ROOT, name)));
  const { hash, isDirty } = codeState();
  console.log(`same ${names.length} inputs as the baseline (${sourcesOf().length - names.length} newer figures not measured). baseline code ${baseline.codeHash.slice(0, SHORT_HASH)}, current code ${hash.slice(0, SHORT_HASH)}${isDirty ? ' + uncommitted changes' : ''}`);
  const over = report(rows, summarize(rows), baseline);
  console.log(over.length ? over.join('\n') : 'ok');
  return over.length ? 1 : 0;
}

// cost: time O(f·PASSES·build), heap O(f), stack O(1), io f + 1
// vars: f = 그림 수, PASSES = 반복 수, build = 그림 하나를 만드는 비용
// basis: measured npm run perf
// 지금 잰 값을 새 기준 파일로 쓴다. 있는 파일은 덮어쓰지 않고, 커밋하지 않은 변경이 있으면 쓰지 않는다. 종료 코드를 돌려준다.
async function runWrite(path) {
  const { hash, isDirty } = codeState();
  if (existsSync(path)) return refuse(`${path} already exists and is not overwritten. Write to a new file name`);
  if (isDirty) return refuse('uncommitted changes. Commit first so the recorded code hash reproduces the measurement');
  const paths = sourcesOf();
  const now = summarize(await measure(paths));
  writeFileSync(path, `${JSON.stringify({ ...now, codeHash: hash, scriptHash: scriptHash(), inputs: inputsOf(paths) }, null, 2)}\n`);
  console.log(`baseline written to ${path}: total ${now.totalMs} ms, worst ${now.worstMs} ms (${now.worstName}), code ${hash.slice(0, SHORT_HASH)}`);
  return 0;
}

// cost: time O(1), heap O(1), stack O(1), io 1
// vars: 메시지 한 줄
// basis: estimate
function refuse(message) {
  console.log(`not written: ${message}`);
  return 1;
}

// cost: time O(a), heap O(1), stack O(1)
// vars: a = 인자 수
// basis: estimate
// `--이름 값`의 값. 없으면 undefined, 값이 비면 빈 글.
function optionValue(name) {
  const at = process.argv.indexOf(name);
  return at < 0 ? undefined : (process.argv[at + 1] ?? '');
}

const writePath = optionValue('--write');
if (writePath === '') {
  console.log('--write needs a new file name');
  process.exitCode = 1;
} else {
  process.exitCode = writePath === undefined ? await runCompare(optionValue('--baseline') ?? DEFAULT_BASELINE) : await runWrite(writePath);
}
