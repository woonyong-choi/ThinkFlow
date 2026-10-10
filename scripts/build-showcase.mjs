// docs/assets/showcase의 원본(*.thinkflow)과 docs/assets/how-it-works.svg마다 라이트와 다크 SVG를 만든다. README의 <picture>가 둘 중 하나를 고른다.
// 사용: node scripts/build-showcase.mjs [--check]   --check는 쓰지 않고, 원본에서 다시 만든 결과와 다른 파일(how-it-works.svg 포함)을 알리고 있으면 1로 끝낸다.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildFigure } from '../src/build.js';
import { toSvg } from '../src/svg.js';

export const SHOWCASE_DIR = fileURLToPath(new URL('../docs/assets/showcase/', import.meta.url));
const HOW_IT_WORKS_SOURCE = fileURLToPath(new URL('../docs/assets/how-it-works.thinkflow', import.meta.url));
const HOW_IT_WORKS_SVG = HOW_IT_WORKS_SOURCE.replace(/\.thinkflow$/, '.svg');
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
// 시스템 테마를 따르는 SVG 하나를 라이트 고정과 다크 고정 SVG 둘로 나눈다.
function themedSvgs(svg) {
  const block = darkBlock(svg);
  if (!block) throw new Error('the SVG has no dark color block');
  const inner = svg.slice(block.start + DARK_OPEN.length, block.end - 1).replaceAll(DARK_ROOT, ':root');
  return { light: svg.slice(0, block.start) + svg.slice(block.end), dark: svg.slice(0, block.start) + inner + svg.slice(block.end) };
}

// cost: time O(build), heap O(out), stack O(1), io 2
// vars: build = 원본 하나를 만드는 비용, out = 결과 글자 수
// basis: estimate
// 원본 파일 하나의 SVG 글(시스템 테마를 따르는 한 벌). 오류가 있으면 던진다. strict면 경고도 던진다.
async function figureSvg(dapPath, { strict }) {
  const result = await buildFigure(readFileSync(dapPath, 'utf8'), { baseDir: dirname(dapPath), strict });
  return toSvg(result, { isStatic: false, name: basename(dapPath, '.thinkflow') });
}

// cost: time O(f·build), heap O(f·out), stack O(1), io 2f
// vars: f = 원본 수, build = 원본 하나를 만드는 비용, out = 결과 글자 수
// basis: estimate
/** 이 스크립트가 쓰는 파일 { path, text }[]: 원본마다 라이트·다크 SVG, how-it-works의 라이트·다크 SVG. howItWorks는 그 시스템 테마 SVG 글이다(`thinkflow render`가 만든다). */
async function outputs(howItWorks) {
  const files = [];
  const add = (path, svg) => {
    const { light, dark } = themedSvgs(svg);
    files.push({ path: path.replace(/\.(thinkflow|svg)$/, '-light.svg'), text: light }, { path: path.replace(/\.(thinkflow|svg)$/, '-dark.svg'), text: dark });
  };
  for (const file of readdirSync(SHOWCASE_DIR).filter((f) => f.endsWith('.thinkflow'))) add(join(SHOWCASE_DIR, file), await figureSvg(join(SHOWCASE_DIR, file), { strict: true }));
  add(HOW_IT_WORKS_SVG, howItWorks);
  return files;
}

// cost: time O(1), heap O(n), stack O(1), io 1
// vars: n = 파일 글자 수
// basis: estimate
// 디스크 파일이 이 글과 다르거나 없으면 true.
function isStale({ path, text }) {
  try {
    return readFileSync(path, 'utf8') !== text;
  } catch {
    return true;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--check')) {
    // how-it-works.svg는 `thinkflow render docs/assets/how-it-works.thinkflow`의 결과(경고를 막지 않는다)와 같아야 한다.
    const howItWorks = await figureSvg(HOW_IT_WORKS_SOURCE, { strict: false });
    const old = [{ path: HOW_IT_WORKS_SVG, text: howItWorks }, ...(await outputs(howItWorks))].filter(isStale);
    for (const { path } of old) console.error(`${path}: is out of date. Run npm run figures`);
    process.exitCode = old.length ? 1 : 0;
  } else {
    // how-it-works.svg는 `thinkflow render`가 만든 파일을 나눈다. 먼저 render를 돌려야 한다.
    for (const { path, text } of await outputs(readFileSync(HOW_IT_WORKS_SVG, 'utf8'))) writeFileSync(path, text);
  }
}
