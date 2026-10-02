// 예제, 문서 그림, CS:APP 그림의 빌드 시간(이동 글 상자 계획 포함)을 재서 기준 시간(scripts/perf-baseline.json)을 넘으면 실패한다.
// 사용: node scripts/perf-chips.mjs [--write]   (npm run perf)
// 출력: 그림 수, 합계와 기준, 가장 느린 그림 다섯 개, 마지막에 `ok` 또는 넘은 항목. 넘으면 종료 코드 1.
// --write는 지금 잰 값을 기준으로 저장한다. 기계가 한가할 때, 일부러 느려지는 변경을 받아들일 때만 쓴다.
// 시간은 그림마다 PASSES번 만들어 가장 짧은 CPU 시간(user + system)이다. 첫 한 번은 글꼴 읽기와 JIT 데우기라 세지 않는다.
// 기준은 이 저장소의 CI가 아니라 로컬 기계에서 잰 값이다. 다른 기계에서는 --write로 다시 잡는다. CI에는 넣지 않는다.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFigure } from '../src/build.js';
import { toSvg } from '../src/svg.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'scripts', 'perf-baseline.json');
// 재는 그림 폴더. 예제, 문서 그림, 시험용 그림, CS:APP 그림
const SOURCE_DIRS = ['examples', 'docs/assets', 'test/fixtures', 'test/fixtures/csapp'];
const PASSES = 3;
// 기준보다 이 배수를 넘으면 실패. 기계가 바빠 생기는 흔들림(같은 코드가 1.3배 넘게 흔들렸다)은 넘기고, 첫 구현처럼 합계가 2배 넘게 늘어난 회귀는 잡는 값이다.
const TOLERANCE = 1.6;
const SLOWEST_SHOWN = 5;

// cost: time O(f), heap O(f), stack O(1), io f
// vars: f = 그림 원본 수
// basis: estimate
function sourcesOf() {
  return SOURCE_DIRS.flatMap((dir) => readdirSync(join(ROOT, dir)).filter((name) => name.endsWith('.muto')).map((name) => join(ROOT, dir, name)));
}

// cost: time O(build), heap O(out), stack O(1)
// vars: build = 그림 하나를 만드는 비용, out = 결과 글자 수
// basis: estimate
// 그림 하나를 SVG까지 만드는 데 든 CPU 시간(ms)
async function timeFigure(path) {
  const text = readFileSync(path, 'utf8');
  const before = process.cpuUsage();
  const result = await buildFigure(text, { baseDir: dirname(path) });
  await toSvg(result, { isStatic: false, name: basename(path, '.muto') });
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

const rows = await measure(sourcesOf());
const now = summarize(rows);
if (process.argv.includes('--write')) {
  writeFileSync(BASELINE, `${JSON.stringify(now, null, 2)}\n`);
  console.log(`baseline written: total ${now.totalMs} ms, worst ${now.worstMs} ms (${now.worstName})`);
} else {
  const over = report(rows, now, JSON.parse(readFileSync(BASELINE, 'utf8')));
  console.log(over.length ? over.join('\n') : 'ok');
  process.exitCode = over.length ? 1 : 0;
}
