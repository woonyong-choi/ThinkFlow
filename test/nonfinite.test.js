// 그림 출력의 유한성: 어떤 예제, README 그림, 레퍼런스 그림, 호환 묶음 출력에도 NaN과 Infinity 글이 없다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildFigure } from '../src/build.js';
import { toSvg } from '../src/svg.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const COMPAT = new URL('./fixtures/compat/v1/', import.meta.url);
const NON_FINITE = /NaN|Infinity/;
// 글꼴 조각은 base64 글이라 우연히 NaN이 들어갈 수 있다. 검사에서 뺀다.
const withoutFonts = (text) => text.replace(/base64,[A-Za-z0-9+/=]+/g, 'base64,');

// cost: time O(f), heap O(f), stack O(1), io f
// vars: f = 폴더의 파일 수
// basis: estimate
// 폴더의 SVG와 HTML 파일 경로(ROOT 기준).
const outputsIn = (dir) => readdirSync(join(ROOT, dir)).filter((f) => /\.(svg|html)$/.test(f)).map((f) => join(dir, f));

// 근거: 이슈 #97 "글 상자 숨김 불투명도 키에 NaN": 커밋한 예제, README 그림, 레퍼런스 그림 어디에도 NaN과 Infinity가 없다
test('committed_figure_outputs_contain_no_NaN_or_Infinity', () => {
  const files = [...outputsIn('examples/out'), ...outputsIn('docs/assets'), ...outputsIn('docs/assets/showcase'), ...outputsIn('docs/reference')];

  assert.ok(files.length > 50, `파일 ${files.length}개`);
  for (const file of files) assert.doesNotMatch(withoutFonts(readFileSync(join(ROOT, file), 'utf8')), NON_FINITE, file);
});

// 근거: 이슈 #97: 예제 원본을 지금 코드로 다시 만든 SVG에도 NaN과 Infinity가 없다
test('rebuilt_example_and_compat_svgs_contain_no_NaN_or_Infinity', async () => {
  const sources = [
    ...readdirSync(join(ROOT, 'examples')).filter((f) => f.endsWith('.dap')).map((f) => join(ROOT, 'examples', f)),
    ...readdirSync(COMPAT).filter((f) => f.endsWith('.dap')).map((f) => fileURLToPath(new URL(f, COMPAT))),
  ];

  for (const path of sources) {
    const result = await buildFigure(readFileSync(path, 'utf8'), { baseDir: join(path, '..') });

    assert.doesNotMatch(withoutFonts(await toSvg(result)), NON_FINITE, path);
    assert.doesNotMatch(withoutFonts(await toSvg(result, { isStatic: true })), NON_FINITE, path);
  }
});
