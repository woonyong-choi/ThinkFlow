// 글 상자 계획의 격자 색인: 닿는 사각형을 빠뜨리지 않고 번호 순서로 돌려준다(docs/design/playback.md 이동 글).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gridOf } from '../src/chip-grid.js';

const RECT_COUNT = 60;
const BOX_COUNT = 200;
const FIGURE_SIZE = 900;
const LCG_MUL = 1664525;
const LCG_ADD = 1013904223;
const LCG_MOD = 4294967296;

function randomRects(count, seed) {
  let state = seed;
  const next = (max) => Math.floor(((state = (state * LCG_MUL + LCG_ADD) % LCG_MOD) / LCG_MOD) * max);
  return Array.from({ length: count }, () => ({ x: next(FIGURE_SIZE) - 50, y: next(FIGURE_SIZE) - 50, w: 1 + next(200), h: 1 + next(80) }));
}

function overlapped(a, b) {
  return Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);
}

test('gridOf_near_lists_every_overlapping_rect_once_in_ascending_order', () => {
  const rects = randomRects(RECT_COUNT, 1);
  const grid = gridOf(rects);

  for (const box of randomRects(BOX_COUNT, 2)) {
    const near = grid.near(box);
    const expected = rects.flatMap((rect, i) => (overlapped(box, rect) ? [i] : []));

    assert.deepEqual([...new Set(near)], near, '번호가 겹치지 않는다');
    assert.deepEqual([...near].sort((a, b) => a - b), near, '번호가 오름차순이다');
    assert.ok(expected.every((i) => near.includes(i)), `겹치는 사각형 ${expected} 가 ${near} 에 모두 있다`);
  }
});

test('gridOf_some_matches_a_scan_of_all_rects', () => {
  const rects = randomRects(RECT_COUNT, 3);
  const grid = gridOf(rects);

  for (const box of randomRects(BOX_COUNT, 4)) {
    assert.equal(grid.some(box, (i) => overlapped(box, rects[i])), rects.some((rect) => overlapped(box, rect)));
  }
});

test('gridOf_near_is_empty_for_a_box_far_from_every_rect', () => {
  const grid = gridOf([{ x: 0, y: 0, w: 50, h: 20 }]);

  assert.deepEqual(grid.near({ x: 5000, y: 5000, w: 100, h: 20 }), []);
});
