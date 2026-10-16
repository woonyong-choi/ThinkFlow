import assert from 'node:assert/strict';
import { test } from 'node:test';
import { routeLength } from '../src/route.js';
import { values } from '@woonyong-choi/design-tokens/tokens.js';
import { buildFigure, FigureError } from 'torso-diagram';

const source = (names, options, length = '3ms') => `torso
${names.map((id) => `box ${id} "${id}"`).join('\n')}
box x "X"
value n "N" on=x from=0
${names.map((id) => `${id} -> x`).join('\n')}
scene "s" for=${length}
  track ${names.join(', ')} -> x ${options}
`;
const starts = (built, track) => built.timeline.segs[0].hops.filter((hop) => hop.track === track).map((hop) => hop.at);

test('multi-source defaults keep sub-millisecond departure phases', async () => {
  for (const condition of ['', 'when="n=0"']) {
    const result = await buildFigure(source(['a', 'b'], `every=1ms time=0.1ms ${condition}`));
    assert.deepEqual(starts(result, 0), [0, 1, 2]);
    assert.deepEqual(starts(result, 1), [0.5, 1.5, 2.5]);
  }
});

test('calculated thirds use the event grid while an authored finer at is rejected', async () => {
  const options = 'every=1ms time=0.1ms';
  const raw = await buildFigure(source(['a', 'b', 'c'], options));
  assert.equal(starts(raw, 1)[0], 1 / 3);
  const gated = await buildFigure(source(['a', 'b', 'c'], `${options} when="n=0"`));
  assert.deepEqual(starts(gated, 1), [0.33333, 1.33333, 2.33333]);
  assert.deepEqual(starts(gated, 2), [0.66667, 1.66667, 2.66667]);
  await assert.rejects(buildFigure(source(['a'], `${options} at=0.333333ms when="n=0"`)), (error) => error instanceof FigureError && error.problems.some((p) => p.code === 'time-precision'));
});

test('a computed departure at the scene boundary is omitted and explicit simultaneous starts remain valid', async () => {
  const edge = await buildFigure(source(['a', 'b', 'c'], 'every=1ms time=0.1ms when="n=0"', '1.33333ms'));
  assert.deepEqual(starts(edge, 0), [0, 1]);
  assert.deepEqual(starts(edge, 1), [0.33333]);
  assert.deepEqual(starts(edge, 2), [0.66667]);
  const simultaneous = await buildFigure(source(['a', 'b'], 'every=1ms time=0.1ms when="n=0" at=0ms'));
  assert.deepEqual(starts(simultaneous, 0), [0, 1, 2]);
  assert.deepEqual(starts(simultaneous, 1), [0, 1, 2]);
});

test('default track duration includes the distance crossing an intermediate card', async () => {
  const figure = `torso
box a "A"
box b "B"
box c "C"
a -> b
b -> c
scene "S" mode=once for=30s
  track a -> b -> c`;
  const result = await buildFigure(figure);
  const hop = result.timeline.segs[0].hops[0];
  const track = result.timeline.tracks[hop.track];
  assert.ok(track.gaps.some(([from, to]) => to > from));
  const expected = routeLength(track.route) / values.spacing.figure.packet['hop-ref'] * values.duration.hop;
  assert.ok(Math.abs(hop.ms - expected) <= 1, `track duration ${hop.ms} must include its full route (${expected})`);
  const explicit = await buildFigure(`${figure} time=1s`);
  assert.equal(explicit.timeline.segs[0].hops[0].ms, 1000);
});

test('a long chain track with tens of thousands of timed marks builds without exhausting the call stack', async () => {
  const ids = Array.from({ length: 100 }, (_, i) => `n${i}`);
  const chain = `torso
${ids.map((id) => `box ${id} "${id}"`).join('\n')}
${ids.slice(1).map((id, i) => `${ids[i]} -> ${id}`).join('\n')}
scene "s" mode=static for=8s
  track ${ids.join(' -> ')} every=10ms time=1ms
`;
  const result = await buildFigure(chain);
  assert.ok(result.timeline.segs[0].pulses.length > 50000);
});
