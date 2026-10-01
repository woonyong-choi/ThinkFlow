import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { bodyHeight } from '../src/measure/sizes.js';
import { values } from '../src/tokens.js';

const BODY = values.size['person-body'];
const GAP = values.border.edge + values.space['0-5'];

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 선 수
// basis: estimate
function source(n) {
  const targets = Array.from({ length: n }, (_, i) => `box a${i + 1} "A${i + 1}"`).join('\n');
  const lines = Array.from({ length: n }, (_, i) => `user -> a${i + 1}`).join('\n');
  return `flow right\nperson user "사용자"\n${targets}\n${lines}`;
}

for (const n of [2, 4, 6]) {
  test(`layoutGraph_person_with_${n}_lines_keeps_body_height`, async () => {
    const { scene } = await buildFigure(source(n), { strict: true });

    assert.equal(scene.items.find((it) => it.id === 'user').h, BODY);
  });
}

for (const n of [8, 12]) {
  test(`layoutGraph_person_with_${n}_lines_grows_body_to_need`, async () => {
    const { scene } = await buildFigure(source(n), { strict: true });
    const user = scene.items.find((it) => it.id === 'user');
    const starts = scene.edges.filter((e) => e.points[0].x === user.x + user.w).map((e) => e.points[0].y).sort((a, b) => a - b);

    assert.equal(user.h, (n + 1) * GAP);
    assert.ok(user.h > BODY);
    assert.equal(starts.length, n);
    for (let i = 1; i < n; i++) assert.ok(starts[i] - starts[i - 1] >= GAP - 1e-6, `${starts[i] - starts[i - 1]} < ${GAP}`);
  });
}

test('bodyHeight_takes_the_larger_face_and_never_shrinks', () => {
  assert.equal(bodyHeight(0), BODY);
  assert.equal(bodyHeight(11), 12 * GAP);
});
