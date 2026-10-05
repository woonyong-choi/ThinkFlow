#!/usr/bin/env node
// 사용: daphnis render|check|gallery|migrate|md … 명령과 결과 파일은 docs/design/playback.md 결과 파일 절이다.
// stdout에는 만든 파일 경로(또는 --json 메시지)만, stderr에는 오류와 경고만 쓴다.
import { mkdirSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReported, report, writeOutput } from './build-reported.js';
import { toDocument, toGallery, toHtml } from './html.js';
import { migrateSource, previewDiff } from './migrate.js';
import { runMd } from './md-run.js';
import { makeDiagnostic } from './source/problems.js';
import { toSvg } from './svg.js';

const USAGE = [
  'usage:',
  '  daphnis render <file.dap ...> [--out dir] [--html] [--static] [--strict] [--no-deprecated] [--require-data] [--require-ci] [--json]',
  '  daphnis check <file.dap ...> [--strict] [--no-deprecated] [--require-data] [--require-ci] [--json]',
  '  daphnis gallery <dir> [--out dir] [--title "text"] [--strict] [--no-deprecated] [--require-data] [--require-ci]',
  '  daphnis migrate <file.dap ...> [--write] [--json]',
  '  daphnis md <file.md ...> [--check] [--out-dir dir] [--fold [--fold-title "text"] | --unfold] [--static] [--strict] [--no-deprecated] [--require-data] [--require-ci] [--json]',
].join('\n');
// gallery가 받는 옵션. --html은 gallery가 늘 HTML을 쓰므로 받기만 한다(옛 호출이 깨지지 않게).
const GALLERY_FLAGS = ['html', 'strict', 'no-deprecated', 'require-data', 'require-ci'];
const FLAGS = ['--html', '--static', '--strict', '--no-deprecated', '--require-data', '--require-ci', '--json', '--write', '--check', '--fold', '--unfold'];
// md 명령이 받지 않는 옵션과 md 명령만 받는 옵션
const MD_REFUSED = ['out', 'title', 'html', 'write'];
const MD_ONLY = ['check', 'out-dir', 'fold', 'unfold', 'fold-title'];
// 판 표기 줄(`daphnis 1`). 목록 쪽 머리에서 종류 줄을 찾을 때 건너뛴다.
const VERSION_LINE = /^\s*(?:daphnis|mutoscope)\s/;
// 원본 확장자. `.muto`는 옛 확장자라 계속 읽고 폐기 안내를 낸다.
const SOURCE_EXT = /\.dap$/;
const LEGACY_EXT = /\.muto$/;
const ANY_EXT = /\.(?:dap|muto)$/;
// gallery가 목록과 문서 미리보기로 쓰는 쪽 이름(확장자 없이)
const RESERVED_PAGES = new Set(['index', 'document']);

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// md 명령이 받지 않는 옵션을 쓰거나 다른 명령이 md 전용 옵션을 쓰면 그 오류 글이다. 없으면 undefined다.
function misplacedOption({ command, flags, ...values }) {
  const given = (name) => values[name] !== undefined || flags.has(name);
  const refused = (command === 'md' ? MD_REFUSED : MD_ONLY).find(given);
  if (refused) return `--${refused} is ${command === 'md' ? 'not for md' : 'only for md'}`;
  return undefined;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 접기 옵션을 잘못 쓴 오류 글이다. --fold와 --unfold는 함께 못 쓰고, 제목은 --fold와만 쓰며 비어 있거나 줄이 바뀌면 안 된다. 없으면 undefined다.
function foldOptionError({ flags, ...values }) {
  const title = values['fold-title'];
  if (flags.has('fold') && flags.has('unfold')) return '--fold and --unfold cannot be used together';
  if (title !== undefined && !flags.has('fold')) return '--fold-title needs --fold';
  if (title !== undefined && (title.trim() === '' || /[\r\n]/.test(title))) return '--fold-title needs one line of text';
  return undefined;
}

// cost: time O(a), heap O(a), stack O(1)
// vars: a = 인자 수
// basis: estimate
// 명령 인자를 읽는다. 틀리면 { error }다.
function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!['render', 'check', 'gallery', 'migrate', 'md'].includes(command)) return { error: USAGE };
  const args = { command, inputs: [], out: undefined, title: undefined, flags: new Set() };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--out' || arg === '--title' || arg === '--out-dir' || arg === '--fold-title') {
      const value = rest[++i];
      if (value === undefined || value.startsWith('--')) return { error: `${arg} needs a value` };
      args[arg.slice(2)] = value;
    } else if (FLAGS.includes(arg)) args.flags.add(arg.slice(2));
    else if (arg.startsWith('-')) return { error: `unknown option ${arg}\n${USAGE}` };
    else args.inputs.push(arg);
  }
  if (!args.inputs.length) return { error: USAGE };
  if (args.flags.has('write') && command !== 'migrate') return { error: `--write is only for migrate\n${USAGE}` };
  const misplaced = misplacedOption(args);
  if (misplaced) return { error: `${misplaced}\n${USAGE}` };
  const folding = foldOptionError(args);
  if (folding) return { error: `${folding}\n${USAGE}` };
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
  if (args.command === 'md') return runMd(args);
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

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
// 옛 확장자(.muto) 원본이면 새 확장자로 바꾸라는 폐기 안내를 낸다. 파일은 그대로 읽는다.
function noteLegacyExtension(input, json) {
  if (!LEGACY_EXT.test(input)) return;
  const renamed = input.replace(LEGACY_EXT, '.dap');
  report(input, [makeDiagnostic({ severity: 'deprecated', line: 0, message: `the .muto extension is now .dap. Rename the file to ${renamed}` }, { code: 'deprecated-extension' })], json);
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
  noteLegacyExtension(input, json);
  return buildReported(source, input, { flags: args.flags, baseDir: dirname(input) });
}

// cost: time O(out), heap O(out), stack O(1), io 3
// vars: out = 결과 글자 수
// basis: estimate
// 만든 그림의 SVG(--html이면 HTML도)를 쓴다. args.page가 있으면 HTML 파일 이름(확장자 없이)이다.
async function writeFigure(input, result, args) {
  const json = args.flags.has('json');
  const name = basename(input).replace(ANY_EXT, '');
  const folder = args.out ?? dirname(input);
  mkdirSync(folder, { recursive: true });
  writeOutput(join(folder, `${name}.svg`), await toSvg(result, { isStatic: args.flags.has('static'), name }), json);
  if (args.flags.has('html')) writeOutput(join(folder, `${args.page ?? name}.html`), await toHtml(result, name), json);
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
  noteLegacyExtension(input, json);
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

// cost: time O(n log n), heap O(n), stack O(1)
// vars: n = 폴더 안 파일 수
// basis: estimate
// 폴더 안 원본 파일 이름. 이름이 같은 .dap와 .muto가 같이 있으면 .dap만 쓴다.
function sourceFiles(names) {
  const current = new Set(names.filter((f) => SOURCE_EXT.test(f)).map((f) => f.replace(SOURCE_EXT, '')));
  return names.filter((f) => SOURCE_EXT.test(f) || (LEGACY_EXT.test(f) && !current.has(f.replace(LEGACY_EXT, '')))).sort();
}

// cost: time O(f), heap O(f), stack O(1)
// vars: f = 폴더 안 원본 수
// basis: estimate
// 갤러리가 쓰는 재생 화면 이름. 원본 이름이 목록 쪽(index)이나 문서 미리보기(document)와 같으면(대소문자 무시, 대소문자를 가리지 않는 파일 시스템에서 같은 파일) `{이름}-player`다. 예약 파일 이름은 그대로 둔다.
const playerPage = (name) => (RESERVED_PAGES.has(name.toLowerCase()) ? `${name}-player` : name);

// cost: time O(f), heap O(f), stack O(1)
// vars: f = 폴더 안 원본 수
// basis: estimate
// 쓸 파일 이름이 겹치는 곳을 찾아 알리고 겹침이 있으면 false다(대소문자 무시). 예약 파일 둘도 이미 이름을 가진 것으로 센다.
function claimOutputs(names) {
  const claimed = new Map([...RESERVED_PAGES].map((page) => [`${page}.html`, `the gallery ${page} page`]));
  let ok = true;
  for (const name of names) {
    for (const file of [`${name}.svg`, `${playerPage(name)}.html`]) {
      const key = file.toLowerCase();
      if (claimed.has(key)) {
        process.stderr.write(`${file} would be written twice: for ${name} and for ${claimed.get(key)}. Rename one of the sources\n`);
        ok = false;
      } else claimed.set(key, name);
    }
  }
  return ok;
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
  const files = sourceFiles(names);
  if (!files.length) {
    process.stderr.write(`${folder}: no .dap files\n`);
    return 1;
  }
  if (!claimOutputs(files.map((file) => file.replace(ANY_EXT, '')))) return 1;
  const galleryArgs = { ...args, command: 'render', out, flags: new Set([...args.flags, 'html']) };
  const built = [];
  for (const file of files) built.push({ file, input: join(folder, file), result: await buildInput(join(folder, file), galleryArgs) });
  if (built.some(({ result }) => !result)) return 1;
  const figures = [];
  for (const { file, input, result } of built) {
    const name = file.replace(ANY_EXT, '');
    await writeFigure(input, result, { ...galleryArgs, page: playerPage(name) });
    figures.push({ name, ext: file.slice(name.length), ...describe(readFileSync(input, 'utf8')), href: relative(out, join(out, name)), page: playerPage(name) });
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

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
// 옛 명령 이름(`mutoscope`)으로 실행했으면 stderr에 폐기 안내를 쓴다. stdout과 종료 코드는 건드리지 않는다.
function noteLegacyCommand(invoked) {
  if (basename(invoked).replace(/\.js$/, '') === 'mutoscope') process.stderr.write('deprecated: the "mutoscope" command is now "daphnis". Use "daphnis" with the same arguments\n');
}

// npm이 만든 실행 파일은 심볼릭 링크라서, 실제 경로끼리 비교해야 직접 실행을 알아본다.
const isEntry = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isEntry) noteLegacyCommand(process.argv[1]);
if (isEntry) process.exitCode = await main(process.argv.slice(2));
