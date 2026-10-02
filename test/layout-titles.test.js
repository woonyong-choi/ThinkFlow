import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { placeTitles, TITLE_INSET } from '../src/layout/titles.js';

// 선 x가 그룹 x + 제목 거리 - 비킴 간격과 부동소수점 반올림 때문에 한 칸 어긋나는 값. 옮겨도 선분과 겹쳐 보여 되풀이하던 입력이다.
const ROUNDING_GROUP = { x: 102.33333333333333, y: 292, w: 285, label: '그룹1' };
const ROUNDING_EDGE = { points: [{ x: 126.33333333333333, y: 130 }, { x: 126.33333333333333, y: 472 }] };

test('placeTitles_segment_at_the_rounding_edge_ends_and_keeps_the_title_clear', () => {
  placeTitles([ROUNDING_GROUP], [ROUNDING_EDGE]);

  assert.ok(Number.isFinite(ROUNDING_GROUP.titleDx));
  assert.ok(ROUNDING_GROUP.titleDx >= TITLE_INSET);
});

test('buildFigure_group_title_fixture_that_stalled_the_fuzz_finishes', async () => {
  const source = readFileSync(new URL('./fixtures/layout/group-title-float-stall.muto', import.meta.url), 'utf8');

  const { scene } = await buildFigure(source, { strict: true });

  assert.equal(scene.groups.length, 2);
});
