// 글꼴: 글 폭 재기와 글꼴 조각 넣기(docs/design/layout.md 글 재기). 본문과 차트 숫자는 Pretendard(숫자는 tnum, 글자 간격 -0.3px), JetBrains Mono는 코드에만 쓴다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import * as fontkit from 'fontkit';
import { createGlyphSet, embedFonts, findMissingGlyph, measure, wrap } from '../src/measure/fonts.js';
import { values } from '../src/tokens.js';
import { tokenValue } from './helpers.js';

const require = createRequire(import.meta.url);

const PRETENDARD = 'pretendard/dist/public/static/Pretendard-Regular.otf';
const NOTO_LATIN = '@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf';
const NOTO_MATH = '@expo-google-fonts/noto-sans-math/400Regular/NotoSansMath_400Regular.ttf';
const MONO = 'jetbrains-mono/fonts/webfonts/JetBrainsMono-Regular.woff2';

// cost: time O(f), heap O(f), stack O(1), io 1
// vars: f = 글꼴 파일 크기
// basis: estimate
/** 글꼴 파일의 글 폭(px). 테스트가 기대값을 파일에서 직접 구하려고 쓴다. */
function widthIn(file, text, size, features = []) {
  const font = fontkit.create(readFileSync(require.resolve(file)));
  return (font.layout(text, features).advanceWidth / font.unitsPerEm) * size;
}

/** 부동소수점 합 순서 차이만 허용한다. */
function assertNear(actual, expected, label = '') {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label} ${actual} != ${expected}`);
}

// 글자 사이 간격: 본문과 숫자는 글자마다 토큰 값(-0.3px)을 더하고 고정폭은 더하지 않는다.
const track = (text) => [...text].length * values.tracking.text;

const WIDTHS = [
  { label: '라틴은 Pretendard에 글자 간격을 더한다', text: 'Hello, world', face: 'regular', expected: () => widthIn(PRETENDARD, 'Hello, world', 12) + track('Hello, world') },
  { label: '한글도 Pretendard 하나로 잰다', text: '요청 처리', face: 'regular', expected: () => widthIn(PRETENDARD, '요청 처리', 12) + track('요청 처리') },
  { label: '고정폭 안의 한글은 Pretendard이고 간격을 더하지 않는다', text: '요청', face: 'mono', expected: () => widthIn(PRETENDARD, '요청', 12) },
  { label: '고정폭 라틴은 글자당 0.6em이고 간격을 더하지 않는다', text: 'abc', face: 'mono', expected: () => 3 * 12 * 0.6 },
  { label: '차트 숫자는 Pretendard tnum', text: '1.5k', face: 'num', expected: () => widthIn(PRETENDARD, '1.5k', 12, ['tnum']) + track('1.5k') },
  { label: '백틱 구간은 이름이 무엇이든 고정폭이고 백틱은 재지 않는다', text: 'a `ab` b', face: 'regular', expected: () => widthIn(PRETENDARD, 'a ', 12) + track('a ') + widthIn(MONO, 'ab', 12) + widthIn(PRETENDARD, ' b', 12) + track(' b') },
  { label: '위 첨자 T는 Noto Sans', text: 'ᵀ', face: 'regular', expected: () => widthIn(NOTO_LATIN, 'ᵀ', 12) + track('ᵀ') },
  { label: '합성 기호는 Noto Sans Math', text: '∘', face: 'regular', expected: () => widthIn(NOTO_MATH, '∘', 12) + track('∘') },
];

// 근거: 설계 layout.md 요구사항 "그린 글 폭이 잰 글 폭과 같다"(글 폭 = 구간별 글꼴 파일의 폭 합, 글꼴 순서 Pretendard, Noto Sans, Noto Sans Math, 글자 간격 포함)
test('measure_width_equals_the_sum_of_the_font_file_widths_of_each_run', () => {
  for (const { label, text, face, expected } of WIDTHS) assertNear(measure(text, 12, face), expected(), label);
  assert.notEqual(measure('Hello', 12, 'semibold'), measure('Hello', 12, 'regular'));
  assert.ok(measure('111', 11, 'num') > measure('111', 11, 'regular'));
  assertNear(measure('111', 11, 'num'), measure('000', 11, 'num'), 'tnum digits share one width');
  for (const text of ['Kᵀ', 'X⁻¹', '√d', 'a × b', '∑ x', 'x ∈ S', 'f ∘ g', '≤ ≥ ≈ ∞']) assert.ok(measure(text, 12) > 0, text);
});

// 근거: 설계 layout.md "글꼴 없는 글자 검사도 구간별 글꼴을 따른다", 글꼴 어디에도 없는 글자는 오류
test('findMissingGlyph_follows_the_fallback_chain_and_a_glyph_in_no_font_still_throws', () => {
  assert.equal(findMissingGlyph('요청', 'mono'), undefined);
  assert.equal(findMissingGlyph('a😀', 'mono'), '😀');
  assert.equal(findMissingGlyph('`요청`'), undefined);
  assert.equal(findMissingGlyph('a `b😀`'), '😀');
  for (const text of ['Kᵀ', 'X⁻¹', '√d', 'a × b', '∑ x', 'x ∈ S', 'f ∘ g', '≤ ≥ ≈ ∞']) assert.equal(findMissingGlyph(text), undefined, text);
  assert.throws(() => measure('😀', 12), /no glyph/);
});

const EMBEDS = [
  { label: '고정폭 글 안의 한글은 FigMono와 FigSans를 모두 넣는다', text: 'ab 요청', face: 'mono', families: [/font-family:FigMono/, /font-family:FigSans;/] },
  { label: '한글과 라틴은 같은 굵기의 FigSans 조각 하나다', text: 'API 요청', face: 'semibold', families: [/font-family:FigSans;font-weight:600/] },
  { label: '백틱 구간만 고정폭 조각을 쓴다', text: 'plain `x`', face: 'regular', families: [/font-family:FigMono/, /font-family:FigSans;/] },
  { label: '수학 기호는 Noto Sans(FigSansSym)와 Noto Sans Math(FigSansMath) 조각을 넣는다', text: 'Q Kᵀ √ ∘ ×', face: 'regular', families: [/font-family:FigSansSym;font-weight:400/, /font-family:FigSansMath;font-weight:400 900/] },
];

// 근거: 설계 layout.md 글 재기 "그림에 넣는 글꼴 조각은 글자가 필요로 하는 글꼴마다 하나씩이고, 이름은 토큰 font 사슬과 같다"
test('embedFonts_embeds_a_piece_for_every_family_the_text_needs', async () => {
  for (const { label, text, face, families } of EMBEDS) {
    const glyphs = createGlyphSet();
    glyphs.add(text, face);
    const css = await embedFonts(glyphs.used);

    for (const family of families) assert.match(css, family, label);
  }
});

// 근거: 설계 layout.md 글 재기 "글꼴 조각은 tnum 대체 글리프를 포함해 자른다. 그래서 보는 쪽이 tabular-nums로 그린 폭과 잰 폭이 같다"
test('embedFonts_num_text_keeps_the_tnum_glyphs_in_one_pretendard_piece', async () => {
  const glyphs = createGlyphSet();
  glyphs.add('0123456789', 'num');

  const css = await embedFonts(glyphs.used);
  const subset = fontkit.create(Buffer.from(/base64,([^)]+)\)/.exec(css)[1], 'base64'));

  assert.equal(css.match(/@font-face/g).length, 1);
  assert.ok(subset.availableFeatures.includes('tnum'));
  assertNear(subset.layout('1', ['tnum']).advanceWidth, subset.layout('0', ['tnum']).advanceWidth);
});

// 근거: 설계 layout.md 글 재기 "토큰 font.figure-sans 사슬(Pretendard, 기호, 수학)과 font.figure-mono 사슬은 넣은 조각 이름과 같은 순서다"
test('tokens_font_chains_list_every_embedded_family_in_order', () => {
  assert.match(values.font['figure-sans'], /^FigSans, FigSansSym, FigSansMath, /);
  assert.match(values.font['figure-mono'], /^FigMono, FigSans, FigSansSym, FigSansMath, /);
});

// 근거: 계약 design-tokens 연결: 내장 글꼴 사슬의 뒷부분(대체 글꼴)은 design-tokens의 font.sans, font.mono와 같다. mono는 FigMono가 대신하는 JetBrains Mono 이름만 뺀다
test('tokens_font_chains_end_with_the_design_tokens_chains', () => {
  const common = (name) => tokenValue(`font.${name}`);
  const chain = (name) => tokenValue(`font.figure-${name}`);
  assert.deepEqual(chain('sans').slice(-common('sans').length), common('sans'));
  assert.deepEqual(chain('mono').slice(-common('mono').filter((family) => family !== 'JetBrains Mono').length), common('mono').filter((family) => family !== 'JetBrains Mono'));
});

// 근거: 계약 figure-syntax.md 글 안 백틱, 설계 layout.md "구간이 줄 사이에 걸치면 줄마다 구간을 닫고 다시 열어 각 줄이 짝이 맞는 글이 된다"
test('wrap_splits_a_backtick_span_and_pairs_the_marks_per_line', () => {
  const lines = wrap('aa `bb cc dd` ee', measure('aa `bb`', 12), { size: 12 });

  assert.ok(lines.length > 1);
  for (const line of lines) assert.equal((line.match(/`/g) ?? []).length % 2, 0);
  assert.equal(lines.join(' ').replaceAll('`', '').replace(/\s+/g, ' '), 'aa bb cc dd ee');
});
