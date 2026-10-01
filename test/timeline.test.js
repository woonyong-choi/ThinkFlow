import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';

test('buildTimeline_card_changes_at_latest_arrival_of_that_node', async () => {
  const source = 'flow right\nbox a "A"\nbox b "B"\nbox c "C"\na -> c\nb -> c\nstep "s"\n  a -> c time=1s & b -> c time=3s\n  show c "도착"';
  const { timeline } = await buildFigure(source);

  assert.equal(timeline.segs[0].cardsAt.c, 3000);
});

test('buildTimeline_source_card_changes_at_beat_start', async () => {
  const { timeline } = await buildFigure('flow right\nbox a "A"\nbox b "B"\na -> b\nstep "s"\n  a -> b\n  show a "출발"\n  show b "도착"');
  const seg = timeline.segs[0];

  assert.equal(seg.cardsAt.a, 0);
  assert.equal(seg.cardsAt.b, seg.move);
});

test('buildTimeline_show_rows_accumulate_until_clear', async () => {
  const source = 'flow right\nbox a "A"\nstep "s"\n  show a "하나"\n  wait 1s\n  show a "둘"\n  wait 1s\n  clear a';
  const { scene, timeline } = await buildFigure(source);
  const card = scene.items[0].card;

  assert.equal(card.layouts[timeline.segs[1].cards.a].rows.length, 2);
  assert.equal(timeline.segs[2].cards.a, undefined);
});

test('buildTimeline_every_beat_has_positive_length', async () => {
  const { timeline } = await buildFigure('flow right\nbox a "A"\nstep "s"\n  light a\n  show a "x"');

  for (const seg of timeline.segs) assert.ok(seg.t1 > seg.t0);
});

test('buildTimeline_revealed_series_stay_across_steps', async () => {
  const source = 'chart bar\nseries a "A"\nseries b "B"\nrow "r" a=1 b=2\nstep "1"\n  reveal a\nstep "2"\n  reveal b';
  const { timeline } = await buildFigure(source);

  assert.deepEqual(timeline.segs[1].series, ['a', 'b']);
});
