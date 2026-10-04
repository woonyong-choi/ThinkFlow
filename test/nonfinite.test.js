// 그림 출력의 유한성: 어떤 예제, README 그림, 레퍼런스 그림, 호환 묶음 출력에도 NaN과 Infinity 글이 없다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
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

// 근거: 이슈 #103 완료 조건 "성공한 출력의 시간표, SVG, HTML 데이터에 NaN, Infinity, null 시각이 없다". 시간 상한 값으로 만든 그림도 시간표 숫자가 모두 유한하다
test('figure_at_the_time_limit_has_a_finite_timeline_and_no_non_finite_text_in_svg_and_html', async () => {
  const source = 'flow right\nspeed 3600000ms\nbox a "A"\nbox b "B"\na -> b\nstep "s" for=1800s\n  track a -> b time=3600000ms every=1800s\nstep "t" for=1800s\n  track a -> b time=1ms at=0s every=900s\n';
  const result = await buildFigure(source, { strict: true });
  const numbers = [];
  JSON.stringify(result.timeline, (_key, value) => (typeof value === 'number' ? (numbers.push(value), value) : value));

  assert.ok(numbers.length > 20);
  assert.ok(numbers.every(Number.isFinite));
  assert.ok(result.timeline.segs.every((seg) => Number.isFinite(seg.t0) && Number.isFinite(seg.t1)));
  for (const text of [await toSvg(result), await toSvg(result, { isStatic: true }), await toHtml(result, 'edge')]) {
    assert.doesNotMatch(withoutFonts(text), NON_FINITE);
    assert.doesNotMatch(text, /"t[01]":null/);
  }
});
