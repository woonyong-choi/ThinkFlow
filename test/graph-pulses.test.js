import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure } from 'thinkflow';

const changed = async (before, after) => {
  const result = await buildFigure(`thinkflow
box a "A" {
  graph ${before}
}
scene "s"
  wait 1s
  wait 1s
  clear a
  show a graph ${after}
`);
  return result.timeline.pulses.filter((pulse) => pulse.key === 'row:a:0' && pulse.at > 0);
};

test('card graph name, relation and lit changes have a row pulse at their actual change time', async () => {
  for (const [before, after] of [
    ['"A -> B"', '"X -> Y"'],
    ['"A; B"', '"A -> B"'],
    ['"A -> B" lit="A"', '"A -> B" lit="B"'],
  ]) assert.deepEqual(await changed(before, after), [{ key: 'row:a:0', at: 1000, si: 0 }], `${before} -> ${after}`);
});

test('clearing and restoring the same visible graph at one instant has no pulse', async () => {
  assert.deepEqual(await changed('"A -> B"', '"A -> B"'), []);
  assert.deepEqual(await changed('"A -> B" lit="A, B"', '"A -> B" lit="B, A"'), []);
});
