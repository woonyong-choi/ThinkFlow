import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderScene } from '../src/render.js';
import { tokens } from '../src/tokens.js';

test('renderScene_untagged_row_does_not_take_tag_color', () => {
  const rows = [{ text: 'plain' }, { tag: 'world', text: 'tagged' }];
  const scene = { items: [{ id: 'a', kind: 'box', x: 0, y: 0, w: 180, h: 120, label: 'a', sub: [], cards: [rows] }], edges: [] };

  const svg = renderScene(scene);

  assert.ok(svg.includes(`class="tag" fill="${tokens.color.tag.blue}">WORLD`));
});

test('renderScene_meta_with_inner_dot_is_muted_whole', () => {
  const rows = [{ text: '글', meta: '2026 · 3월' }];
  const scene = { items: [{ id: 'a', kind: 'box', x: 0, y: 0, w: 180, h: 120, label: 'a', sub: [], cards: [rows] }], edges: [] };

  const svg = renderScene(scene);

  assert.ok(svg.includes('글<tspan class="muted"> · 2026 · 3월</tspan>'));
});
