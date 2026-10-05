// docs/assets/showcase의 원본(*.dap)과 docs/assets/how-it-works.svg마다 라이트와 다크 SVG를 만든다. README의 <picture>가 둘 중 하나를 고른다.
// 사용: node scripts/build-showcase.mjs
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildFigure } from '../src/build.js';
import { toSvg } from '../src/svg.js';

export const SHOWCASE_DIR = fileURLToPath(new URL('../docs/assets/showcase/', import.meta.url));
export const HOW_IT_WORKS_SVG = fileURLToPath(new URL('../docs/assets/how-it-works.svg', import.meta.url));
const DARK_OPEN = '@media (prefers-color-scheme: dark) {';
const DARK_ROOT = ":root:not([data-theme='light'])";

// cost: time O(n), heap O(n), stack O(1)
// vars: n = SVG 글자 수
// basis: estimate
// 다크 미디어 블록의 시작과 끝(닫는 중괄호 다음) 위치다. 블록이 없으면 undefined다.
function darkBlock(svg) {
  const start = svg.indexOf(DARK_OPEN);
  if (start < 0) return undefined;
  let depth = 0;
  for (let i = start + DARK_OPEN.length - 1; i < svg.length; i++) {
    if (svg[i] === '{') depth++;
    else if (svg[i] === '}' && --depth === 0) return { start, end: i + 1 };
  }
  return undefined;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = SVG 글자 수
// basis: estimate
/** 시스템 테마를 따르는 SVG 하나를 라이트 고정과 다크 고정 SVG 둘로 나눈다. */
export function themedSvgs(svg) {
  const block = darkBlock(svg);
  if (!block) throw new Error('the SVG has no dark color block');
  const inner = svg.slice(block.start + DARK_OPEN.length, block.end - 1).replaceAll(DARK_ROOT, ':root');
  return { light: svg.slice(0, block.start) + svg.slice(block.end), dark: svg.slice(0, block.start) + inner + svg.slice(block.end) };
}

// cost: time O(build), heap O(out), stack O(1), io 2
// vars: build = 원본 하나를 만드는 비용, out = 결과 글자 수
// basis: estimate
/** 원본 파일 하나의 라이트·다크 SVG 글이다. 오류가 있으면 던진다. */
export async function showcaseSvgs(dapPath) {
  const result = await buildFigure(readFileSync(dapPath, 'utf8'), { baseDir: SHOWCASE_DIR, strict: true });
  return themedSvgs(await toSvg(result, { isStatic: false, name: basename(dapPath, '.dap') }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const file of readdirSync(SHOWCASE_DIR).filter((f) => f.endsWith('.dap'))) {
    const { light, dark } = await showcaseSvgs(join(SHOWCASE_DIR, file));
    writeFileSync(join(SHOWCASE_DIR, file.replace(/\.dap$/, '-light.svg')), light);
    writeFileSync(join(SHOWCASE_DIR, file.replace(/\.dap$/, '-dark.svg')), dark);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // how-it-works.svg는 `daphnis render`가 만든 시스템 테마 SVG이므로 그 결과를 나눈다. 먼저 render를 돌려야 한다.
  const { light, dark } = themedSvgs(readFileSync(HOW_IT_WORKS_SVG, 'utf8'));
  writeFileSync(HOW_IT_WORKS_SVG.replace(/\.svg$/, '-light.svg'), light);
  writeFileSync(HOW_IT_WORKS_SVG.replace(/\.svg$/, '-dark.svg'), dark);
}
