#!/usr/bin/env node
// 사용: d2-flow <그림.d2 ...> [--out 폴더] [--layout elk|dagre] [--html-only | --svg-only] [--gallery]
// stdout에는 만든 파일 경로만, stderr에는 오류만 쓴다.
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChart, toChartHtml, toChartSvg } from './chart.js';
import { closeD2, compileD2 } from './d2.js';
import { parseFlow } from './flow.js';
import { toGallery, toHtml } from './html.js';
import { resolveFlow } from './resolve.js';
import { buildSizeOverrides, buildTimeline, layoutScene } from './scene.js';
import { toAnimatedSvg } from './svg.js';

const USAGE = '사용: d2-flow <그림.d2 ...> [--out 폴더] [--layout elk|dagre] [--html-only | --svg-only] [--gallery]';
const LAYOUTS = ['elk', 'dagre'];

// cost: time O(n + s² + d2·2), heap O(n + s + c), stack O(1), io 2
// vars: n = 원본 글자 수, s = 도형 수, c = 선 수, d2 = D2.js 한 번의 해석과 배치 시간
// basis: estimate
/**
 * D2 원본 하나를 장면과 시간표로 만든다. D2로 한 번 배치해 이름을 잇고, 크기를 고쳐 한 번 더 배치한다.
 * 두 번째 배치가 실패하면 첫 배치를 쓴다.
 * @throws FlowError 흐름 줄 오류, Error D2 문법 오류
 */
export async function build(source, { layout = 'elk' } = {}) {
  const parsed = parseFlow(source);
  const first = await compileD2(source, { layout });
  const flow = resolveFlow(parsed, first);
  const extra = buildSizeOverrides(first, flow);
  const diagram = extra ? await compileD2(`${source}\n${extra}\n`, { layout }).catch(() => first) : first;
  const scene = layoutScene(diagram, flow, { edges: parsed.edges });
  return { scene, tl: buildTimeline(flow, scene) };
}

// cost: time O(a), heap O(a), stack O(1)
// vars: a = 인자 수
// basis: estimate
// 명령 인자를 읽는다. 틀리면 { error }를 돌려준다.
function parseArgs(argv) {
  const args = { inputs: [], layout: 'elk', out: undefined, kinds: ['html', 'svg'], hasGallery: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out' || arg === '--layout') {
      const value = argv[++i];
      if (!value || value.startsWith('-')) return { error: `${arg} 뒤에 값이 없다` };
      if (arg === '--layout' && !LAYOUTS.includes(value)) return { error: `--layout은 elk나 dagre다: ${value}` };
      if (arg === '--out') args.out = value;
      else args.layout = value;
    } else if (arg === '--html-only') {
      args.kinds = ['html'];
    } else if (arg === '--svg-only') {
      args.kinds = ['svg'];
    } else if (arg === '--gallery') {
      args.hasGallery = true;
    } else if (arg.startsWith('-')) {
      return { error: `모르는 옵션: ${arg}` };
    } else {
      args.inputs.push(arg);
    }
  }
  if (!args.inputs.length) return { error: USAGE };
  return args;
}

// cost: time O(f·build), heap O(f·out), stack O(1), io 1 + 3f
// vars: f = 원본 수, build = build() 한 번의 비용, out = 만든 파일 글자 수
// basis: estimate
async function main(argv) {
  const args = parseArgs(argv);
  if (args.error) return reportFailure(args.error);
  const built = [];
  try {
    for (const input of args.inputs) {
      const figure = await convert(input, args);
      if (figure.error) return reportFailure(figure.error);
      built.push(figure);
    }
    if (args.hasGallery && args.kinds.includes('html')) writeGallery(built, args.out ?? dirname(args.inputs[0]));
    return 0;
  } finally {
    await closeD2();
  }
}

// cost: time O(n + d2), heap O(out), stack O(1), io 3
// vars: n = 원본 글자 수, d2 = D2.js 해석과 배치 시간, out = 만든 파일 글자 수
// basis: estimate
// 원본 하나를 HTML과 SVG로 바꿔 쓴다.
async function convert(input, { out, layout, kinds }) {
  const name = basename(input, '.d2');
  const folder = out ?? dirname(input);
  try {
    const source = readFileSync(input, 'utf8');
    // `#@ chart`가 있는 원본은 D2 없이 차트만 그린다.
    const chart = parseChart(source);
    const pages = chart
      ? { html: () => toChartHtml(chart, name), svg: () => toChartSvg(chart) }
      : await buildPages(source, name, layout);
    mkdirSync(folder, { recursive: true });
    if (kinds.includes('html')) writeOutput(join(folder, `${name}.html`), pages.html());
    if (kinds.includes('svg')) writeOutput(join(folder, `${name}.svg`), pages.svg());
    return { name, folder, title: readDescription(source) ?? name };
  } catch (error) {
    return { error: `${input}: ${error.message}` };
  }
}

// cost: time O(f), heap O(f), stack O(1), io 1
// vars: f = 그림 수
// basis: estimate
// 목록 쪽은 home 폴더에 둔다. 다른 폴더의 그림은 home에서 본 상대 경로로 잇는다.
function writeGallery(figures, home) {
  const linked = figures.map((f) => ({ ...f, href: join(relative(home, f.folder), f.name) }));
  writeOutput(join(home, 'index.html'), toGallery(linked));
}

// cost: time O(n + d2), heap O(s + c), stack O(1)
// vars: n = 원본 글자 수, d2 = D2.js 해석과 배치 시간, s = 도형 수, c = 선 수
// basis: estimate
// 흐름 그림의 HTML과 SVG를 만드는 함수 둘. 쓰지 않는 쪽은 만들지 않는다.
async function buildPages(source, name, layout) {
  const { scene, tl } = await build(source, { layout });
  return { html: () => toHtml({ title: name, scene, tl }), svg: () => toAnimatedSvg(scene, tl) };
}

// `#@`가 아닌 첫 주석 줄을 그림 설명으로 쓴다.
function readDescription(source) {
  return /^#(?!@)\s*(.+)$/m.exec(source)?.[1].trim();
}

// cost: time O(n), heap O(1), stack O(1), io 2
// vars: n = 쓸 글자 수
// basis: estimate
function writeOutput(path, text) {
  writeFileSync(path, text);
  console.log(path);
}

// cost: time O(n), heap O(1), stack O(1), io 1
// vars: n = 메시지 글자 수
// basis: estimate
function reportFailure(message) {
  console.error(message);
  return 1;
}

// npm이 만든 실행 파일은 심볼릭 링크라서, 실제 경로끼리 비교해야 직접 실행을 알아본다.
const isEntry = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isEntry) process.exitCode = await main(process.argv.slice(2));
