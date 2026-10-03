#!/usr/bin/env node
// 사용: mutoscope render|check|gallery … 명령과 결과 파일은 docs/design/playback.md 결과 파일 절이다.
// stdout에는 만든 파일 경로(또는 --json 메시지)만, stderr에는 오류와 경고만 쓴다.
import { mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFigure } from './build.js';
import { toDocument, toGallery, toHtml } from './html.js';
import { toJson } from './diagnostics.js';
import { migrateSource, previewDiff } from './migrate.js';
import { FigureError, makeDiagnostic } from './source/problems.js';
import { toSvg } from './svg.js';

const USAGE = [
  'usage:',
  '  mutoscope render <file.muto ...> [--out dir] [--html] [--static] [--strict] [--no-deprecated] [--require-data] [--require-ci] [--json]',
  '  mutoscope check <file.muto ...> [--strict] [--no-deprecated] [--require-data] [--require-ci] [--json]',
  '  mutoscope gallery <dir> [--out dir] [--title "text"] [--strict] [--no-deprecated] [--require-data] [--require-ci]',
  '  mutoscope migrate <file.muto ...> [--write] [--json]',
].join('\n');
// gallery가 받는 옵션. --html은 gallery가 늘 HTML을 쓰므로 받기만 한다(옛 호출이 깨지지 않게).
const GALLERY_FLAGS = ['html', 'strict', 'no-deprecated', 'require-data', 'require-ci'];
const FLAGS = ['--html', '--static', '--strict', '--no-deprecated', '--require-data', '--require-ci', '--json', '--write'];
// 진단 종류마다 글 출력의 머리말. 오류는 머리말이 없다.
// 판 표기 줄(`mutoscope 1`). 목록 쪽 머리에서 종류 줄을 찾을 때 건너뛴다.
const VERSION_LINE = /^\s*mutoscope\s/;
const SEVERITY_LABEL = { error: '', warning: 'warning: ', deprecated: 'deprecated: ' };

// cost: time O(a), heap O(a), stack O(1)
// vars: a = 인자 수
// basis: estimate
// 명령 인자를 읽는다. 틀리면 { error }다.
function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!['render', 'check', 'gallery', 'migrate'].includes(command)) return { error: USAGE };
  const args = { command, inputs: [], out: undefined, title: undefined, flags: new Set() };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--out' || arg === '--title') {
      const value = rest[++i];
      if (value === undefined || value.startsWith('--')) return { error: `${arg} needs a value` };
      args[arg.slice(2)] = value;
    } else if (FLAGS.includes(arg)) args.flags.add(arg.slice(2));
    else if (arg.startsWith('-')) return { error: `unknown option ${arg}\n${USAGE}` };
    else args.inputs.push(arg);
  }
  if (!args.inputs.length) return { error: USAGE };
  if (args.flags.has('write') && command !== 'migrate') return { error: `--write is only for migrate\n${USAGE}` };
  const refused = command === 'gallery' ? [...args.flags].find((flag) => !GALLERY_FLAGS.includes(flag)) : undefined;
  if (refused) return { error: `--${refused} is not for gallery\n${USAGE}` };
  return args;
}

// cost: time O(f·build), heap O(out), stack O(1), io 2f
// vars: f = 원본 수, build = 원본 하나를 만드는 비용, out = 결과 글자 수
// basis: estimate
async function main(argv) {
  const args = parseArgs(argv);
  if (args.error) {
    process.stderr.write(`${args.error}\n`);
    return 2;
  }
  if (args.command === 'gallery') return writeGallery(args);
  let failed = false;
  for (const input of args.inputs) failed = !(args.command === 'migrate' ? migrateFile(input, args) : await processFile(input, args)) || failed;
  return failed ? 1 : 0;
}

// cost: time O(build), heap O(out), stack O(1), io 3
// vars: build = 원본 하나를 만드는 비용, out = 결과 글자 수
// basis: estimate
// 원본 하나를 검사하고, render면 결과 파일을 쓴다. 오류가 있으면 아무 파일도 쓰지 않는다.
async function processFile(input, args) {
  const result = await buildInput(input, args);
  if (!result) return false;
  if (args.command !== 'check') await writeFigure(input, result, args);
  return true;
}

// cost: time O(build), heap O(out), stack O(1), io 1
// vars: build = 원본 하나를 만드는 비용, out = 결과 글자 수
// basis: estimate
// 원본 하나를 읽고 만들어 진단을 알린다. 파일은 쓰지 않는다. 오류가 있으면 undefined다.
async function buildInput(input, args) {
  const json = args.flags.has('json');
  let source;
  try {
    source = readFileSync(input, 'utf8');
  } catch (error) {
    report(input, [makeDiagnostic({ severity: 'error', line: 0, message: `cannot read the file: ${error.code ?? error.message}` }, { code: 'io' })], json);
    return undefined;
  }
  let result;
  try {
    result = await buildFigure(source, { baseDir: dirname(input), strict: args.flags.has('strict'), noDeprecated: args.flags.has('no-deprecated'), requireData: args.flags.has('require-data'), requireCi: args.flags.has('require-ci') });
  } catch (error) {
    // 원본 오류가 아닌 실패는 이 도구의 버그다. 스택 대신 한 줄로 알리고 다음 파일로 넘어간다.
    const problems = error instanceof FigureError ? error.problems : [makeDiagnostic({ severity: 'error', line: 0, message: `internal error: ${error.message}. Please report this` }, { code: 'internal' })];
    report(input, problems, json);
    return undefined;
  }
  report(input, [...result.warnings, ...result.deprecations].sort((a, b) => a.line - b.line), json);
  return result;
}

// cost: time O(out), heap O(out), stack O(1), io 3
// vars: out = 결과 글자 수
// basis: estimate
// 만든 그림의 SVG(--html이면 HTML도)를 쓴다.
async function writeFigure(input, result, args) {
  const json = args.flags.has('json');
  const name = basename(input).replace(/\.muto$/, '');
  const folder = args.out ?? dirname(input);
  mkdirSync(folder, { recursive: true });
  writeOutput(join(folder, `${name}.svg`), await toSvg(result, { isStatic: args.flags.has('static'), name }), json);
  if (args.flags.has('html')) writeOutput(join(folder, `${name}.html`), await toHtml(result, name), json);
}

// cost: time O(n + s), heap O(n), stack O(1), io 2
// vars: n = 원본 글자 수, s = 문장 수
// basis: estimate
// 원본 하나의 옛 형식을 고친다. 기본은 바뀔 줄을 미리 보여 주기만 하고, --write일 때만 파일을 쓴다.
// 원본에 오류가 있거나 고친 글에 진단이 남으면 아무것도 쓰지 않고 그 진단을 알린다.
function migrateFile(input, args) {
  const json = args.flags.has('json');
  let source;
  try {
    source = readFileSync(input, 'utf8');
  } catch (error) {
    report(input, [makeDiagnostic({ severity: 'error', line: 0, message: `cannot read the file: ${error.code ?? error.message}` }, { code: 'io' })], json);
    return false;
  }
  const result = migrateSource(source);
  if (result.errors) {
    report(input, result.errors, json);
    return false;
  }
  const diff = previewDiff(source, result.text, input);
  if (!args.flags.has('write')) {
    if (diff) process.stdout.write(`${diff}\n`);
    return true;
  }
  if (diff) writeOutput(input, result.text, json);
  return true;
}

// cost: time O(f·build), heap O(f·out), stack O(1), io 3f + 2
// vars: f = 폴더 안 원본 수, build = 원본 하나를 만드는 비용, out = 그림 하나의 결과 글자 수
// basis: estimate
// 폴더 안 원본마다 SVG와 HTML을 쓰고 목록 쪽 index.html과 문서 미리보기 document.html을 쓴다.
// 원본이 하나도 없거나 하나라도 오류면 전체가 실패라서 아무 파일도 쓰지 않는다(전부 만든 다음에 쓰려고 결과를 모아 둔다).
async function writeGallery(args) {
  const folder = args.inputs[0];
  const out = args.out ?? join(folder, 'out');
  let names;
  try {
    names = readdirSync(folder);
  } catch (error) {
    process.stderr.write(`${folder}: cannot read the folder: ${error.code ?? error.message}\n`);
    return 1;
  }
  const files = names.filter((f) => f.endsWith('.muto')).sort();
  if (!files.length) {
    process.stderr.write(`${folder}: no .muto files\n`);
    return 1;
  }
  const galleryArgs = { ...args, command: 'render', out, flags: new Set([...args.flags, 'html']) };
  const built = [];
  for (const file of files) built.push({ file, input: join(folder, file), result: await buildInput(join(folder, file), galleryArgs) });
  if (built.some(({ result }) => !result)) return 1;
  const figures = [];
  for (const { file, input, result } of built) {
    await writeFigure(input, result, galleryArgs);
    figures.push({ name: file.replace(/\.muto$/, ''), ...describe(readFileSync(input, 'utf8')), href: relative(out, join(out, file.replace(/\.muto$/, ''))) });
  }
  const heading = args.title ?? basename(folder);
  writeOutput(join(out, 'index.html'), toGallery(figures, heading), false);
  writeOutput(join(out, 'document.html'), toDocument(figures, heading), false);
  return 0;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
// 목록 쪽 머리에 쓸 값. title은 원본의 title 줄(없으면 첫 주석 줄), kind는 첫 줄의 종류(`flow`, `chart bar`면 `bar`), isChart는 그림 안에 제목이 그려지는 차트인지다.
function describe(source) {
  const title = /^title "(.*)"$/m.exec(source)?.[1] ?? /^#\s*(.+)$/m.exec(source)?.[1] ?? '';
  const [first, second] = source.split('\n').find((line) => line.trim() && !line.startsWith('#') && !VERSION_LINE.test(line))?.trim().split(/\s+/) ?? [];
  const isChart = first === 'chart';
  return { title, kind: isChart ? second : first, isChart };
}

// cost: time O(m), heap O(m), stack O(1), io m
// vars: m = 메시지 수
// basis: estimate
// 진단(오류, 경고, 폐기). 기본은 `파일:줄: 메시지`, --json이면 진단마다 `toJson`(src/diagnostics.js)이 정한 한 줄을 stdout에 쓴다.
function report(file, diagnostics, json) {
  for (const d of diagnostics) {
    if (json) process.stdout.write(`${JSON.stringify(toJson(file, d))}\n`);
    // 줄 번호가 없는 문제(파일 읽기, 도구 버그)는 줄 0이고, 글로는 `파일: 메시지`로 쓴다.
    else process.stderr.write(`${file}${d.line ? `:${d.line}` : ''}: ${SEVERITY_LABEL[d.severity]}${d.message}\n`);
  }
}

// cost: time O(n), heap O(1), stack O(1), io 2
// vars: n = 쓸 글자 수
// basis: estimate
function writeOutput(path, text, json) {
  writeFileSync(path, text);
  if (!json) process.stdout.write(`${path}\n`);
}

// npm이 만든 실행 파일은 심볼릭 링크라서, 실제 경로끼리 비교해야 직접 실행을 알아본다.
const isEntry = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isEntry) process.exitCode = await main(process.argv.slice(2));
