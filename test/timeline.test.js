import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { buildFigure } from '../src/build.js';
import { flattenRoute, routeLength } from '../src/route.js';
import { values } from '../src/tokens.js';

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
  const source = 'chart bar\nseries a "A" role=main\nseries b "B" role=compare\nrow "r" a=1 b=2\nstep "1"\n  reveal a\nstep "2"\n  reveal b';
  const { timeline } = await buildFigure(source);

  assert.deepEqual(timeline.segs[1].series, ['a', 'b']);
});

// time=이 붙은 이동은 길이와 무관한 절대 시간이라 길이 비례를 보는 원본에서는 뺀다.
const HOP_SOURCE = readFileSync(new URL('../examples/saturn.muto', import.meta.url), 'utf8').replace(/ time=\S+/g, '');

// cost: time O(b·h), heap O(b·h), stack O(1)
// vars: b = 박자 수, h = 박자의 이동 수
// basis: estimate
// 이동이 지나는 선의 길이와 시간 쌍. 모든 박자의 이동을 모은다.
function hopPairs({ scene, timeline }) {
  return timeline.segs.flatMap((seg) => seg.hops.map((h) => ({ length: routeLength(flattenRoute(scene.edges[h.edge].points)), ms: h.ms })));
}

test('buildTimeline_hop_time_is_proportional_to_edge_length_above_min', async () => {
  const pairs = hopPairs(await buildFigure(HOP_SOURCE));
  const free = pairs.filter(({ ms }) => ms > values.duration['hop-min']);

  assert.ok(new Set(free.map((p) => Math.round(p.length))).size > 1);
  for (const { length, ms } of free) assert.ok(Math.abs(ms - (length / values.size['hop-ref']) * values.duration.hop) <= 1);
});

test('buildTimeline_hop_time_has_min_but_no_max', async () => {
  const pairs = hopPairs(await buildFigure(HOP_SOURCE));

  for (const { ms } of pairs) assert.ok(ms >= values.duration['hop-min']);
});

test('buildTimeline_speed_header_scales_every_hop_time', async () => {
  const base = hopPairs(await buildFigure(HOP_SOURCE));
  const fast = hopPairs(await buildFigure(HOP_SOURCE.replace('title', `speed ${values.duration.hop * 2}ms\ntitle`)));

  base.forEach((p, i) => assert.ok(Math.abs(fast[i].ms - p.ms * 2) <= 1));
});

test('buildTimeline_hop_time_option_is_absolute_regardless_of_length', async () => {
  const source = 'flow right\nbox a "A"\nbox b "B"\nbox c "C"\na -> b\nb -> c\nstep "s"\n  a -> b time=900ms\n  b -> c time=900ms';
  const { timeline } = await buildFigure(source);

  assert.deepEqual(
    timeline.segs.map((s) => s.move),
    [900, 900],
  );
});

test('buildTimeline_hop_times_are_deterministic', async () => {
  assert.deepEqual(hopPairs(await buildFigure(HOP_SOURCE)), hopPairs(await buildFigure(HOP_SOURCE)));
});

test('buildTimeline_beat_length_follows_longest_hop', async () => {
  const { timeline } = await buildFigure(HOP_SOURCE);

  for (const seg of timeline.segs) assert.equal(seg.move, Math.max(0, ...seg.hops.map((h) => h.ms)));
});
