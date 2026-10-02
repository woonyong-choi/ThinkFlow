// 글자 크기 단계: 단계를 적게 두고 0.5px 차이 쌍을 없앤다. 설명 글은 SVG와 재생기가 같은 크기다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { values } from '../src/tokens.js';

const read = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('textScale_has_few_steps_and_no_half_pixel_pairs', () => {
  const sizes = Object.values(values.size.text);

  assert.deepEqual(sizes, [9, 11, 12, 13, 14, 15, 22]);
  assert.ok(sizes.every((a, i) => i === 0 || a - sizes[i - 1] >= 1));
});

test('textScale_step_caption_is_one_size_in_the_animated_svg_and_the_player', () => {
  const svg = read('styles/animated.css').match(/\.fl \.caption \{[^}]*font-size: var\(--size-text-(\d+)\)/)[1];
  const player = read('styles/player.css').match(/\.fl-caption \{[^}]*?font-size: var\(--size-text-(\d+)\)/s)[1];

  assert.equal(svg, player);
  assert.match(read('svg.js'), new RegExp(`const CAPTION = \\{ size: values\\.size\\.text\\['${svg}'\\]`));
});

test('textScale_figure_heading_and_paragraph_sizes_match_between_gallery_and_document', () => {
  const gallery = read('styles/gallery.css');
  const document = read('styles/document.css');

  assert.match(gallery, /h2 \{[^}]*font: var\(--weight-semibold\) var\(--size-text-15\)/);
  assert.match(document, /h2 \{[^}]*font: var\(--weight-semibold\) var\(--size-text-15\)/);
  assert.match(gallery, /\.top p \{[^}]*font-size: var\(--size-text-15\)/);
  assert.match(document, /article \{[^}]*font-size: var\(--size-text-15\)/);
});

test('textScale_no_css_uses_a_size_outside_the_tokens', () => {
  for (const name of ['figure', 'chart', 'animated', 'player', 'gallery', 'document']) {
    for (const [, step] of read(`styles/${name}.css`).matchAll(/--size-text-([\d-]+)/g)) assert.ok(`${step}` in values.size.text, `${name}.css --size-text-${step}`);
  }
});
