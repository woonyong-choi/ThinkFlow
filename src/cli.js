#!/usr/bin/env node
// 사용: daphnis render|check|gallery|md … 명령과 결과 파일은 docs/design/playback.md 결과 파일 절이다.
// stdout에는 만든 파일 경로(또는 --json 메시지)만, stderr에는 오류와 경고만 쓴다.
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUDGET_NAMES, parseBudgetList } from './budget.js';
import { buildReported, claimOutputs, commitReported, pickScene, readReported, report } from './build-reported.js';
import { runMd } from './md-run.js';
import { makeDiagnostic } from './source/problems.js';
import { toSvg } from './svg.js';

const USAGE = [
  'usage:',
  '  daphnis render <file.dap ...> [--out dir] [--html] [--static] [--scene n|label] [--strict] [--require-data] [--require-ci] [--budget name=value ...] [--json]',
  '  daphnis check <file.dap ...> [--strict] [--require-data] [--require-ci] [--budget name=value ...] [--json]',
  '  daphnis gallery <dir> [--out dir] [--title "text"] [--strict] [--require-data] [--require-ci] [--budget name=value ...]',
  '  daphnis md <file.md ...> [--check] [--out-dir dir] [--fold [--fold-title "text"] | --unfold] [--static] [--scene n|label] [--strict] [--require-data] [--require-ci] [--budget name=value ...] [--json]',
  `budget names: ${BUDGET_NAMES.join(', ')}`,
].join('\n');
// gallery가 받는 옵션. --html은 gallery가 늘 HTML을 쓰므로 받기만 한다.
const GALLERY_FLAGS = ['html', 'strict', 'require-data', 'require-ci'];
const VALUE_OPTIONS = ['--out', '--title', '--out-dir', '--fold-title', '--scene'];
const FLAGS = ['--html', '--static', '--strict', '--require-data', '--require-ci', '--json', '--check', '--fold', '--unfold'];
// md 명령이 받지 않는 옵션과 md 명령만 받는 옵션
const MD_REFUSED = ['out', 'title', 'html'];
const MD_ONLY = ['check', 'out-dir', 'fold', 'unfold', 'fold-title'];
// 나머지 명령이 받지 않는 옵션. check는 파일을 쓰지 않으니 쓰는 옵션을 모두 거절하고, 목록 제목은 gallery만 받는다.
const OTHER_REFUSED = { check: ['out', 'html', 'static', 'scene', 'title'], render: ['title'], gallery: ['scene'] };
// 원본 확장자. `.dap` 파일만 원본으로 읽는다.
const SOURCE_EXT = /\.dap$/;
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
// 명령 인자를 읽는다. 틀리면 { error }다. 값을 받는 옵션은 비어 있거나 `--`로 시작하는 값, 같은 옵션을 두 번 쓰는 것이 오류다. 인자 `--` 뒤는 모두 파일 이름이다(`-`로 시작하는 파일도 쓸 수 있다).
function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!['render', 'check', 'gallery', 'md'].includes(command)) return { error: USAGE };
  const args = { command, inputs: [], out: undefined, title: undefined, flags: new Set() };
  const budgetItems = [];
  let isOnlyFiles = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (isOnlyFiles || !arg.startsWith('-')) {
      if (arg === '') return { error: 'a file name cannot be empty' };
      args.inputs.push(arg);
    } else if (arg === '--') isOnlyFiles = true;
    else if (arg === '--budget') {
      const value = rest[++i];
      if (!value || value.startsWith('--')) return { error: '--budget needs a value: --budget name=value' };
      budgetItems.push(value);
    } else if (VALUE_OPTIONS.includes(arg)) {
      const value = rest[++i];
      if (!value || value.startsWith('--')) return { error: `${arg} needs a value` };
      if (args[arg.slice(2)] !== undefined) return { error: `${arg} is given twice` };
      args[arg.slice(2)] = value;
    } else if (FLAGS.includes(arg)) args.flags.add(arg.slice(2));
    else return { error: `unknown option ${arg}\n${USAGE}` };
  }
  if (!args.inputs.length) return { error: USAGE };
  if (command === 'gallery' && args.inputs.length > 1) return { error: `gallery takes one folder, not ${args.inputs.length}\n${USAGE}` };
  const { budget, error } = parseBudgetList(budgetItems);
  if (error) return { error };
  args.budget = budget;
  const misplaced = misplacedOption(args);
  if (misplaced) return { error: `${misplaced}\n${USAGE}` };
  const folding = foldOptionError(args);
  if (folding) return { error: `${folding}\n${USAGE}` };
  const unaccepted = (OTHER_REFUSED[command] ?? []).find((name) => args[name] !== undefined || args.flags.has(name));
  if (unaccepted) return { error: `--${unaccepted} is not for ${command}\n${USAGE}` };
  const refused = command === 'gallery' ? [...args.flags].find((flag) => !GALLERY_FLAGS.includes(flag)) : undefined;
  if (refused) return { error: `--${refused} is not for gallery\n${USAGE}` };
  return args;
}

// cost: time O(f·build), heap O(f·out), stack O(1), io 4f
// vars: f = 원본 수, build = 원본 하나를 만드는 비용, out = 결과 글자 수
// basis: estimate
// render는 쓸 파일 이름이 겹치는지 먼저 보고, 원본마다 만든 결과를 모아 한 번에 쓴다. 오류가 있는 원본은 파일을 쓰지 않고 다른 원본의 결과는 쓴다.
async function main(argv) {
  const args = parseArgs(argv);
  if (args.error) {
    process.stderr.write(`${args.error}\n`);
    return 2;
  }
  if (args.command === 'gallery') return writeGallery(args);
  if (args.command === 'md') return runMd(args);
  if (args.command === 'render' && !claimOutputs(renderOutputs(args), { json: args.flags.has('json') })) return 1;
  let failed = false;
  const writes = [];
  for (const input of args.inputs) {
    const result = await buildInput(input, args);
    const files = result && args.command === 'render' ? await figureFiles(input, result, args) : undefined;
    if (!result || (args.command === 'render' && !files)) failed = true;
    writes.push(...(files ?? []));
  }
  const isWritten = commitReported(writes, { json: args.flags.has('json') });
  return failed || !isWritten ? 1 : 0;
}

// cost: time O(f), heap O(f), stack O(1)
// vars: f = 원본 수
// basis: estimate
// render가 쓸 파일 { path, owner }. 확장자가 틀린 원본은 읽지 않으므로 빼고(그 오류는 만들 때 알린다), 장면 고르기는 보지 않는다.
function renderOutputs({ inputs, out, flags }) {
  return inputs.filter((input) => SOURCE_EXT.test(input)).flatMap((input) => {
    const name = basename(input).replace(SOURCE_EXT, '');
    const folder = out ?? dirname(input);
    const files = [`${name}.svg`, ...(flags.has('html') ? [`${name}.html`] : [])];
    return files.map((file) => ({ path: join(folder, file), owner: input }));
  });
}

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
// 원본 확장자가 .dap가 아니면 오류로 알린다. 파일은 읽지 않고 아무것도 쓰지 않는다.
function unsupportedExtension(input, json) {
  if (SOURCE_EXT.test(input)) return false;
  report(input, [makeDiagnostic({ severity: 'error', line: 1, message: 'only .dap files are read' }, { code: 'unsupported-extension', column: 1 })], json);
  return true;
}

// cost: time O(build), heap O(out), stack O(1), io 1
// vars: build = 원본 하나를 만드는 비용, out = 결과 글자 수
// basis: estimate
// 원본 하나를 읽고 만들어 진단을 알린다. 파일은 쓰지 않는다. 오류가 있으면 undefined다.
async function buildInput(input, args) {
  const json = args.flags.has('json');
  if (unsupportedExtension(input, json)) return undefined;
  const source = readReported(input, json);
  if (source === undefined) return undefined;
  return buildReported(source, input, { flags: args.flags, baseDir: dirname(input), budget: args.budget });
}

// cost: time O(out), heap O(out), stack O(1)
// vars: out = 결과 글자 수
// basis: estimate
// 만든 그림이 쓸 파일 { path, text }[]: SVG(--html이면 HTML도). args.page가 있으면 HTML 파일 이름(확장자 없이)이다. 파일은 쓰지 않는다. 장면을 잘못 골랐으면 알리고 undefined다.
async function figureFiles(input, result, args) {
  const scene = pickScene(result, args.scene, { file: input, json: args.flags.has('json') });
  if (scene === undefined) return undefined;
  const name = basename(input).replace(SOURCE_EXT, '');
  const folder = args.out ?? dirname(input);
  const files = [{ path: join(folder, `${name}.svg`), text: await toSvg(result, { scene, isStatic: args.flags.has('static'), name }) }];
  if (args.flags.has('html')) files.push({ path: join(folder, `${args.page ?? name}.html`), text: await (await import('./html.js')).toHtml(result, name) });
  return files;
}

// cost: time O(n log n), heap O(n), stack O(1)
// vars: n = 폴더 안 파일 수
// basis: estimate
// 폴더 안 원본 파일 이름(.dap)
function sourceFiles(names) {
  return names.filter((f) => SOURCE_EXT.test(f)).sort();
}

// cost: time O(f), heap O(f), stack O(1)
// vars: f = 폴더 안 원본 수
// basis: estimate
// 갤러리가 쓰는 재생 화면 이름. 원본 이름이 목록 쪽(index)이나 문서 미리보기(document)와 같으면(대소문자 무시, 대소문자를 가리지 않는 파일 시스템에서 같은 파일) `{이름}-player`다. 예약 파일 이름은 그대로 둔다.
const playerPage = (name) => (RESERVED_PAGES.has(name.toLowerCase()) ? `${name}-player` : name);

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
  const outputs = files.map((file) => file.replace(SOURCE_EXT, '')).flatMap((name) => [`${name}.svg`, `${playerPage(name)}.html`].map((file) => ({ path: join(out, file), shown: file, owner: name })));
  const claimed = new Map();
  claimOutputs([...RESERVED_PAGES].map((page) => ({ path: join(out, `${page}.html`), owner: `the gallery ${page} page` })), { json: false, claimed });
  if (!claimOutputs(outputs, { json: false, claimed })) return 1;
  const galleryArgs = { ...args, command: 'render', out, flags: new Set([...args.flags, 'html']) };
  const built = [];
  for (const file of files) built.push({ file, input: join(folder, file), result: await buildInput(join(folder, file), galleryArgs) });
  if (built.some(({ result }) => !result)) return 1;
  const figures = [];
  const writes = [];
  for (const { file, input, result } of built) {
    const name = file.replace(SOURCE_EXT, '');
    const written = await figureFiles(input, result, { ...galleryArgs, page: playerPage(name) });
    if (!written) return 1;
    writes.push(...written);
    figures.push({ name, ext: file.slice(name.length), ...describe(result.figure, readFileSync(input, 'utf8')), href: relative(out, join(out, name)), page: playerPage(name) });
  }
  const { toDocument, toGallery } = await import('./html.js');
  const heading = args.title ?? basename(folder);
  writes.push({ path: join(out, 'index.html'), text: toGallery(figures, heading) }, { path: join(out, 'document.html'), text: toDocument(figures, heading) });
  return commitReported(writes, { json: false }) ? 0 : 1;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
// 제목과 종류는 빌드한 문법 해석 결과를 쓴다. 종류는 보기 방식을 이은 글(`graph+sequence+plot`)이고 차트 보기만 있으면 isChart다. 제목을 생략한 원본의 첫 주석만 목록용 설명으로 읽는다.
function describe(figure, source) {
  const title = figure.title ?? /^[\t ]*#\s*(.+)$/m.exec(source)?.[1] ?? '';
  const strategies = [...new Set(figure.views.map((v) => v.strategy))];
  return { title, kind: strategies.join('+'), isChart: strategies.length === 1 && strategies[0] === 'plot' };
}

// npm이 만든 실행 파일은 심볼릭 링크라서, 실제 경로끼리 비교해야 직접 실행을 알아본다.
const isEntry = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isEntry) process.exitCode = await main(process.argv.slice(2));
