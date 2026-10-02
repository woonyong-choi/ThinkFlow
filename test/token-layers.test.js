// 색 토큰의 두 층. 원색(color.palette)은 토큰 정본 안에서만 쓰고, 코드와 CSS는 역할 토큰만 쓴다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const SRC = new URL('../src/', import.meta.url);
const GENERATED_OR_SOURCE = new Set(['tokens.js', 'tokens.css', 'tokens.json', 'tokens.dark.json']);
const PALETTE_REFERENCE = /palette/;
const HEX_VALUE = /^#[0-9a-f]{6}$/;

// cost: time O(f), heap O(f), stack O(1), io f
// vars: f = src 아래 파일 수
// basis: estimate
// src 아래 코드와 CSS 파일. 토큰 정본과 생성물은 뺀다.
function codeFiles() {
  return readdirSync(SRC, { recursive: true })
    .filter((name) => /\.(js|css)$/.test(name) && !GENERATED_OR_SOURCE.has(name))
    .map((name) => ({ name, text: readFileSync(new URL(name, SRC), 'utf8') }));
}

// cost: time O(t), heap O(t), stack O(d)
// vars: t = 토큰 수, d = 묶음 깊이
// basis: estimate
// 정본의 토큰을 [점 이름 경로, 값] 목록으로 편다.
function listTokens(node, path = []) {
  if (node && typeof node === 'object' && '$value' in node) return [[path.join('.'), node.$value]];
  return Object.entries(node).flatMap(([key, child]) => (key.startsWith('$') || typeof child !== 'object' ? [] : listTokens(child, [...path, key])));
}

test('sourceFiles_never_reference_the_palette_layer', () => {
  const hits = codeFiles().filter(({ text }) => PALETTE_REFERENCE.test(text)).map(({ name }) => name);

  assert.deepEqual(hits, []);
});

test('tokensJson_color_literals_live_only_under_palette', () => {
  const colors = listTokens(JSON.parse(readFileSync(new URL('tokens.json', SRC), 'utf8')).color);
  const literals = colors.filter(([, value]) => HEX_VALUE.test(value)).map(([name]) => name);

  assert.ok(literals.length > 0);
  assert.deepEqual(literals.filter((name) => !name.startsWith('palette.')), []);
});

test('tokensDarkJson_overrides_reference_the_palette_or_other_roles_never_a_literal', () => {
  const overrides = listTokens(JSON.parse(readFileSync(new URL('tokens.dark.json', SRC), 'utf8')).color);

  assert.deepEqual(overrides.filter(([, value]) => HEX_VALUE.test(value)), []);
});

test('tokensJson_color_roles_are_grouped_as_state_ui_data_and_tag_without_the_old_flat_names', () => {
  const color = JSON.parse(readFileSync(new URL('tokens.json', SRC), 'utf8')).color;
  const oldNames = ['accent', 'accent-strong', 'accent-fill', 'on-accent', 'control-on', 'series-1', 'series-2', 'heat-low', 'heat-high', 'heat-ink', 'heat-ink-on', 'grid', 'tone'];

  for (const group of ['state', 'ui', 'data', 'tag']) assert.ok(color[group], group);
  assert.deepEqual(oldNames.filter((name) => name in color), []);
});
