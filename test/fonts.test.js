import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as fontkit from 'fontkit';
import { createGlyphSet, embedFonts, findMissingGlyph, measure, wrap } from '../src/measure/fonts.js';

const require = createRequire(import.meta.url);

// cost: time O(f), heap O(f), stack O(1), io 1
// vars: f = 글꼴 파일 크기
// basis: estimate
/** 글꼴 파일의 글 폭(px). 테스트가 기대값을 파일에서 직접 구하려고 쓴다. */
function widthIn(file, text, size) {
  const font = fontkit.create(readFileSync(require.resolve(file)));
  return (font.layout(text).advanceWidth / font.unitsPerEm) * size;
}

/** 부동소수점 합 순서 차이만 허용한다. */
function assertNear(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
}

const INTER = '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf';
const NOTO = '@expo-google-fonts/noto-sans-kr/400Regular/NotoSansKR_400Regular.ttf';

test('measure_latin_uses_inter_width', () => {
  assertNear(measure('Hello, world', 12, 'regular'), widthIn(INTER, 'Hello, world', 12));
  assert.notEqual(measure('Hello', 12, 'semibold'), measure('Hello', 12, 'regular'));
});

test('measure_hangul_uses_noto_sans_kr_width', () => {
  assertNear(measure('요청 처리', 12, 'regular'), widthIn(NOTO, '요청', 12) + widthIn(INTER, ' ', 12) + widthIn(NOTO, '처리', 12));
});

test('measure_mixed_text_sums_runs_by_font', () => {
  const mixed = measure('API 요청', 12, 'regular');
  assertNear(mixed, widthIn(INTER, 'API ', 12) + widthIn(NOTO, '요청', 12));
});

test('measure_mono_hangul_uses_noto_sans_kr_width', () => {
  const hangul = measure('요청', 11, 'mono');
  assertNear(hangul, measure('요청', 11, 'regular'));
  assertNear(hangul, widthIn(NOTO, '요청', 11));
  const mixed = measure('app-server 요청', 11, 'mono');
  assertNear(mixed, measure('app-server ', 11, 'mono') + hangul);
  assert.equal(measure('abc', 10, 'mono'), 18);
});

test('measure_and_wrap_are_deterministic', () => {
  assert.equal(measure('app-server 요청', 11, 'mono'), measure('app-server 요청', 11, 'mono'));
  assert.deepEqual(wrap('app-server 요청 보내기', 60, { size: 11, face: 'mono' }), wrap('app-server 요청 보내기', 60, { size: 11, face: 'mono' }));
});

test('findMissingGlyph_follows_fallback_chain', () => {
  assert.equal(findMissingGlyph('요청', 'mono'), undefined);
  assert.equal(findMissingGlyph('a😀', 'mono'), '😀');
});

test('embedFonts_mono_text_with_hangul_embeds_both_faces', async () => {
  const glyphs = createGlyphSet();
  glyphs.add('ab 요청', 'mono');
  const css = await embedFonts(glyphs.used);
  assert.match(css, /font-family:FigMono/);
  assert.match(css, /font-family:FigSansKo/);
  // 한글 조각이 있으면 같은 굵기 Inter 조각에 공백이 항상 들어간다(글자는 공백뿐).
  assert.equal([...css.matchAll(/font-family:FigSans;/g)].length, 1);
  assert.equal(css, await embedFonts(glyphs.used));
});

test('tokens_mono_font_chain_falls_back_to_sans_face', async () => {
  const { values } = await import('../src/tokens.js');
  assert.match(values.font.mono, /^FigMono, FigSans, FigSansKo, /);
  assert.match(values.font.sans, /^FigSans, FigSansKo, /);
});

test('embedFonts_body_text_splits_inter_and_noto_pieces', async () => {
  const glyphs = createGlyphSet();
  glyphs.add('API 요청', 'semibold');
  const css = await embedFonts(glyphs.used);
  assert.match(css, /font-family:FigSans;font-weight:600/);
  assert.match(css, /font-family:FigSansKo;font-weight:600/);
});

test('pages_use_inter_and_noto_chain_and_name_tag', async () => {
  const { toDocument, toGallery } = await import('../src/html.js');
  const figures = [{ name: 'bar', title: '막대 차트', kind: 'bar', isChart: true, href: 'bar' }];
  for (const page of [toDocument(figures, '예제'), toGallery(figures, '예제')]) {
    assert.match(page, /--font-sans: [^;]*Inter[^;]*Noto Sans KR/);
    assert.match(page, /font-family: var\(--font-sans\)/);
    assert.doesNotMatch(page, /h2 \{[^}]*font-mono/);
    assert.match(page, /<h2><code class="name">bar\.muto<\/code><span class="kind">bar<\/span><\/h2>/);
  }
});

test('pageHead_repeats_the_figure_title_only_when_the_figure_does_not_draw_one', async () => {
  const { toDocument, toGallery } = await import('../src/html.js');
  const figures = [
    { name: 'bar', title: '막대 차트', kind: 'bar', isChart: true, href: 'bar' },
    { name: 'memory', title: '기억 그래프', kind: 'flow', isChart: false, href: 'memory' },
  ];
  for (const page of [toDocument(figures, '예제'), toGallery(figures, '예제')]) {
    assert.doesNotMatch(page, /<h2>[^<]*막대 차트/);
    assert.match(page, /<h2><span class="title">기억 그래프<\/span><code class="name">memory\.muto<\/code><span class="kind">flow<\/span><\/h2>/);
  }
});

test('measure_num_face_uses_inter_tnum_digit_width', () => {
  const font = fontkit.create(readFileSync(require.resolve(INTER)));
  const tabular = font.layout('1.5k', ['tnum']).advanceWidth / font.unitsPerEm;
  assertNear(measure('1.5k', 11, 'num'), tabular * 11);
  assert.ok(measure('111', 11, 'num') > measure('111', 11, 'regular'));
  assertNear(measure('111', 11, 'num'), measure('000', 11, 'num'));
});

test('embedFonts_num_text_keeps_tnum_glyphs_in_inter_piece', async () => {
  const glyphs = createGlyphSet();
  glyphs.add('0123456789', 'num');
  const css = await embedFonts(glyphs.used);
  assert.equal(css.match(/@font-face/g).length, 1);
  const piece = Buffer.from(/base64,([^)]+)\)/.exec(css)[1], 'base64');
  const subset = fontkit.create(piece);
  assert.ok(subset.availableFeatures.includes('tnum'));
  assertNear(subset.layout('1', ['tnum']).advanceWidth, subset.layout('0', ['tnum']).advanceWidth);
});

test('measure_backtick_span_uses_mono_width_without_marks', () => {
  assertNear(measure('a `ab` b', 12, 'regular'), measure('a ', 12) + widthIn('jetbrains-mono/fonts/webfonts/JetBrainsMono-Regular.woff2', 'ab', 12) + measure(' b', 12));
  assertNear(measure('`요청`', 12, 'regular'), measure('요청', 12, 'regular'));
});

test('embedFonts_backtick_span_embeds_mono_piece_only_for_code', async () => {
  const glyphs = createGlyphSet();
  glyphs.add('plain `x`', 'regular');
  const css = await embedFonts(glyphs.used);
  assert.match(css, /font-family:FigMono/);
  assert.match(css, /font-family:FigSans;/);
});

test('wrap_splits_backtick_span_and_pairs_marks_per_line', () => {
  const lines = wrap('aa `bb cc dd` ee', measure('aa `bb`', 12), { size: 12 });
  assert.ok(lines.length > 1);
  for (const line of lines) assert.equal((line.match(/`/g) ?? []).length % 2, 0);
  assert.equal(lines.join(' ').replaceAll('`', '').replace(/\s+/g, ' '), 'aa bb cc dd ee');
});

test('findMissingGlyph_checks_backtick_span_against_mono_chain', () => {
  assert.equal(findMissingGlyph('`요청`'), undefined);
  assert.equal(findMissingGlyph('a `b😀`'), '😀');
});

test('renderRich_wraps_code_and_muted_in_tspans', async () => {
  const { renderRich } = await import('../src/text.js');
  assert.equal(renderRich('a <b>'), 'a &lt;b&gt;');
  assert.equal(renderRich('a `b` c'), 'a <tspan class="code">b</tspan> c');
  assert.equal(renderRich('a `bc`', 3), 'a <tspan class="code">b</tspan><tspan class="code muted">c</tspan>');
});

test('chart_and_label_css_use_body_font_with_tabular_numbers', async () => {
  const { readFileSync: read } = await import('node:fs');
  const chart = read(new URL('../src/styles/chart.css', import.meta.url), 'utf8');
  const figure = read(new URL('../src/styles/figure.css', import.meta.url), 'utf8');
  assert.doesNotMatch(chart, /font-mono/);
  assert.match(chart, /\.chart-value,[^}]*font-variant-numeric: tabular-nums/s);
  assert.match(figure, /\.fl \.code \{\s*font-family: var\(--font-mono\)/);
  assert.doesNotMatch(figure.match(/\.fl \.edgelabel \{[^}]*\}/)[0], /font-mono/);
});

test('embedFonts_hangul_only_text_still_embeds_a_space_glyph_in_the_same_weight_of_inter', async () => {
  const glyphs = createGlyphSet();
  glyphs.add('배송 중', 'medium');
  glyphs.add('기억 그래프', 'semibold');

  const css = await embedFonts(glyphs.used);
  const faces = [...css.matchAll(/font-family:(\w+);font-weight:(\d+);src:url\(data:font\/woff2;base64,([^)]+)\)/g)].map((m) => ({ family: m[1], weight: Number(m[2]), font: fontkit.create(Buffer.from(m[3], 'base64')) }));

  for (const weight of [500, 600]) {
    const inter = faces.find((f) => f.family === 'FigSans' && f.weight === weight);
    assert.ok(inter, `FigSans ${weight}`);
    assert.ok(inter.font.hasGlyphForCodePoint(0x20), `FigSans ${weight} has U+0020`);
  }
});

const NOTO_LATIN = '@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf';
const NOTO_MATH = '@expo-google-fonts/noto-sans-math/400Regular/NotoSansMath_400Regular.ttf';

test('measure_math_symbols_fall_back_to_the_open_font_chain_instead_of_failing', () => {
  for (const text of ['Kᵀ', 'X⁻¹', '√d', 'a × b', '∑ x', 'x ∈ S', 'f ∘ g', '≤ ≥ ≈ ∞']) {
    assert.equal(findMissingGlyph(text), undefined, text);
    assert.ok(measure(text, 12) > 0, text);
  }
});

test('measure_superscript_t_uses_noto_sans_width_and_the_composition_sign_uses_noto_sans_math', () => {
  assertNear(measure('ᵀ', 12), widthIn(NOTO_LATIN, 'ᵀ', 12));
  assertNear(measure('∘', 12), widthIn(NOTO_MATH, '∘', 12));
});

test('measure_glyph_missing_from_every_font_still_throws', () => {
  assert.equal(findMissingGlyph('😀'), '😀');
  assert.throws(() => measure('😀', 12), /no glyph/);
});

test('embedFonts_math_symbols_embed_the_symbol_and_math_families_and_keep_the_font_sans_chain', async () => {
  const { values } = await import('../src/tokens.js');
  const css = await embedFonts(new Map([['regular', 'Q Kᵀ √ ∘ ×']]));
  assert.match(css, /font-family:FigSansSym;font-weight:400/);
  assert.match(css, /font-family:FigSansMath;font-weight:400 900/);
  assert.match(values.font.sans, /^FigSans, FigSansKo, FigSansSym, FigSansMath, /);
  assert.match(values.font.mono, /^FigMono, FigSans, FigSansKo, FigSansSym, FigSansMath, /);
});
