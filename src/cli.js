#!/usr/bin/env node
// 사용: mutoscope render|check|gallery … 명령과 결과 파일은 docs/design/playback.md 결과 파일 절이다.
// stdout에는 만든 파일 경로(또는 --json 메시지)만, stderr에는 오류와 경고만 쓴다.
import { mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFigure } from './build.js';
import { toGallery, toHtml } from './html.js';
import { FigureError } from './source/problems.js';
import { toSvg } from './svg.js';

const USAGE = [
  'usage:',
  '  mutoscope render <file.muto ...> [--out dir] [--html] [--static] [--strict] [--require-data] [--require-ci] [--json]',
  '  mutoscope check <file.muto ...> [--strict] [--require-data] [--require-ci] [--json]',
  '  mutoscope gallery <dir> [--out dir] [--title "text"]',
].join('\n');
const FLAGS = ['--html', '--static', '--strict', '--require-data', '--require-ci', '--json'];

// cost: time O(a), heap O(a), stack O(1)
// vars: a = 인자 수
// basis: estimate
// 명령 인자를 읽는다. 틀리면 { error }다.
function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!['render', 'check', 'gallery'].includes(command)) return { error: USAGE };
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
  for (const input of args.inputs) failed = !(await processFile(input, args)) || failed;
  return failed ? 1 : 0;
}

// cost: time O(build), heap O(out), stack O(1), io 3
// vars: build = 원본 하나를 만드는 비용, out = 결과 글자 수
// basis: estimate
// 원본 하나를 검사하고, render면 결과 파일을 쓴다. 오류가 있으면 아무 파일도 쓰지 않는다.
async function processFile(input, args) {
  const json = args.flags.has('json');
  let result;
  try {
    const source = readFileSync(input, 'utf8');
    result = await buildFigure(source, { baseDir: dirname(input), strict: args.flags.has('strict'), requireData: args.flags.has('require-data'), requireCi: args.flags.has('require-ci') });
  } catch (error) {
    if (!(error instanceof FigureError)) throw error;
    report(input, error.problems, json);
    return false;
  }
  report(input, result.warnings, json);
  if (args.command === 'check') return true;
  const name = basename(input).replace(/\.muto$/, '');
  const folder = args.out ?? dirname(input);
  mkdirSync(folder, { recursive: true });
  writeOutput(join(folder, `${name}.svg`), await toSvg(result, { isStatic: args.flags.has('static') }), json);
  if (args.flags.has('html')) writeOutput(join(folder, `${name}.html`), await toHtml(result, name), json);
  return true;
}

// cost: time O(f·build), heap O(f), stack O(1), io 3f + 1
// vars: f = 폴더 안 원본 수, build = 원본 하나를 만드는 비용
// basis: estimate
// 폴더 안 원본마다 SVG와 HTML을 쓰고 목록 쪽 index.html을 쓴다.
async function writeGallery(args) {
  const folder = args.inputs[0];
  const out = args.out ?? join(folder, 'out');
  const files = readdirSync(folder).filter((f) => f.endsWith('.muto')).sort();
  const figures = [];
  let failed = false;
  for (const file of files) {
    const input = join(folder, file);
    const ok = await processFile(input, { ...args, command: 'render', out, flags: new Set(['html']) });
    failed = !ok || failed;
    if (ok) figures.push({ name: file.replace(/\.muto$/, ''), title: describe(readFileSync(input, 'utf8')), href: relative(out, join(out, file.replace(/\.muto$/, ''))) });
  }
  writeOutput(join(out, 'index.html'), toGallery(figures, args.title ?? basename(folder)), false);
  return failed ? 1 : 0;
}

// 원본의 title 줄, 없으면 첫 주석 줄을 목록 쪽 설명으로 쓴다.
function describe(source) {
  return /^title "(.*)"$/m.exec(source)?.[1] ?? /^#\s*(.+)$/m.exec(source)?.[1] ?? '';
}

// cost: time O(m), heap O(m), stack O(1), io m
// vars: m = 메시지 수
// basis: estimate
// 오류와 경고. 기본은 `파일:줄: 메시지`, --json이면 메시지마다 JSON 한 줄을 stdout에 쓴다.
function report(file, problems, json) {
  for (const p of problems) {
    const check = /^\[check (\d+)\] /.exec(p.message);
    const message = check ? p.message.slice(check[0].length) : p.message;
    // 함께 문제를 일으킨 줄은 메시지 안 "(line N)"에 있다(docs/design/figure-check.md 메시지).
    const lines = [p.line, ...[...message.matchAll(/\(line (\d+)\)/g)].map((m) => Number(m[1]))];
    if (json) process.stdout.write(`${JSON.stringify({ file, line: p.line, lines, check: check ? Number(check[1]) : 'syntax', level: p.level, message })}\n`);
    else process.stderr.write(`${file}:${p.line}: ${p.level === 'warning' ? 'warning: ' : ''}${message}\n`);
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
