// 테스트가 같이 쓰는 도구. 문서 예시 원본 뽑기와 오류 메시지 모으기.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { parseFigure } from '../src/source/parse.js';

// 이력서 저장소(woon-resume)의 `--manta-accent` 라이트 값. 라이트 그래픽 파랑(palette.blue.550)을 계산하는 기준이라 토큰이 아니라 테스트 상수다.
export const RESUME_ACCENT = '#2b96ed';
// RESUME_ACCENT와 같은 L·C에서 색상만 h 50(주황)으로 돌린 값. 라이트 그래픽 주황(palette.orange.550)의 기준이다.
export const RESUME_ORANGE = '#dc6e22';

const DOCS = new URL('../docs/design/', import.meta.url);

// cost: time O(d), heap O(d), stack O(1), io f
// vars: d = 문서 글자 수, f = 문서 수
// basis: estimate
/** 설계 문서의 예시 원본 모두. { file, source } 목록이다. */
export function docExamples() {
  return readdirSync(DOCS)
    .filter((f) => f.endsWith('.md'))
    .flatMap((file) => [...readFileSync(new URL(file, DOCS), 'utf8').matchAll(/```text\n([\s\S]*?)```/g)].map((m) => ({ file, source: m[1] })))
    .filter(({ source }) => /^(flow|sequence|state|data|chart)\b/.test(source));
}

/** 진단 하나를 `줄: 메시지`로. 그림 검사 진단은 `[check-N]` 머리말을 붙여 어느 검사인지 보인다. */
export const formatProblem = (p) => `${p.line}: ${p.code.startsWith('check-') ? `[${p.code}] ` : ''}${p.message}`;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
/** 원본을 읽고 오류 메시지 목록을 돌려준다. 오류가 없으면 빈 목록이다. */
export function errorsOf(source) {
  try {
    parseFigure(source);
    return [];
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems.map((p) => `${p.line}: ${p.message}`);
  }
}

// cost: time O(t), heap O(t), stack O(d)
// vars: t = 토큰 수, d = 묶음 깊이
// basis: estimate
// 정본 파일의 토큰을 점 이름 경로 → 값 표로 편다.
function flatten(node, path, out) {
  if (node && typeof node === 'object' && '$value' in node) out.set(path.join('.'), node.$value);
  else if (node && typeof node === 'object') for (const [key, child] of Object.entries(node)) if (!key.startsWith('$')) flatten(child, [...path, key], out);
  return out;
}

const readTokens = (name) => JSON.parse(readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8'));
const LIGHT = flatten(readTokens('tokens.json'), [], new Map());
const DARK = new Map([...LIGHT, ...flatten(readTokens('tokens.dark.json'), [], new Map())]);

/** 라이트 정본의 토큰 값. 참조는 풀지 않는다. */
export const tokenValue = (name) => LIGHT.get(name);

// cost: time O(c), heap O(1), stack O(1)
// vars: c = 참조 사슬 길이
// basis: estimate
/** 의미 색 토큰 이름의 라이트 또는 다크 `#rrggbb`. 참조 `{...}`를 끝까지 따라간다. */
export function themeColor(theme, name) {
  const table = theme === 'dark' ? DARK : LIGHT;
  let value = table.get(`color.${name}`);
  while (typeof value === 'string' && value.startsWith('{')) value = table.get(value.slice(1, -1));
  assert.match(value ?? '', /^#[0-9a-f]{6}$/, `color.${name} (${theme})`);
  return value;
}

const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export const linearChannelsOf = (hex) => [1, 3, 5].map((i) => toLinear(Number.parseInt(hex.slice(i, i + 2), 16) / 255));

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선형 sRGB를 OKLab [L, a, b]로 바꾼다.
export function linearToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// `#rrggbb`의 OKLCH [L, C, h(도)].
export function oklchOf(hex) {
  const [L, a, b] = linearToOklab(linearChannelsOf(hex));
  return [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

const PLAYER_DIR = new URL('../src/player/', import.meta.url);

// cost: time O(f·n), heap O(f·n), stack O(1), io f
// vars: f = 브라우저 스크립트 수, n = 파일 글자 수
// basis: estimate
/** 브라우저 재생기 스크립트(src/player/ 모든 파일)를 이어 붙인 글. */
export function playerSource() {
  return readdirSync(PLAYER_DIR).filter((f) => f.endsWith('.js')).sort().map((f) => readFileSync(new URL(f, PLAYER_DIR), 'utf8')).join('\n');
}

const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
/** CLI를 실행해 { status, stdout, stderr }를 돌려준다. cwd를 주면 그 폴더에서 실행한다. */
export const runCli = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

// cost: time O(f), heap O(1), stack O(1), io 2 + f
// vars: f = 폴더 안 파일 수(지울 때)
// basis: estimate
/** 테스트마다 새 폴더를 만들어 run(folder)를 돌리고 끝나면 지운다. run이 Promise를 돌려주면 끝난 뒤에 지운다. */
export function withFolder(run) {
  const folder = mkdtempSync(join(tmpdir(), 'mutoscope-test-'));
  const cleanup = () => rmSync(folder, { recursive: true, force: true });
  try {
    const result = run(folder);
    return result instanceof Promise ? result.finally(cleanup) : (cleanup(), result);
  } catch (error) {
    cleanup();
    throw error;
  }
}
