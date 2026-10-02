// 선 끝 자리: 같은 도형의 같은 면에서 나가는 선과 들어오는 선의 끝이 붙지 않고, 곧게 이어지는 가운데 점이 없다(docs/design/layout.md 연결점).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildFigure } from '../src/build.js';
import { values } from '../src/tokens.js';

const CROWD = values.space['2-5'];
const EXAMPLES = ['memory', 'saturn', 'orders', 'order-state'];
// 무작위 시험에서 들어오는 선과 되돌아 나가는 선의 끝이 3px 간격으로 붙던 그림
const CROWDED = `flow right
group g0 "그룹0" direction=right {
  external n0 "n0"
  box n1 "n1"
  external n2 "n2"
}
group g1 "그룹1" direction=right {
  person n3 "n3"
  store n4 "n4"
  person n5 "n5"
  box n6 "n6"
}
person n7 "n7"
n4 -> n5 "l0"
n3 -> n2
n7 -> n4
n1 -> n4 "l4"
n7 -> n3 "l5"
n2 -> n0
n2 -> n7 "l7"
n0 -> n2
`;

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 선 수
// basis: estimate
// 도형마다 닿는 선 끝 점과 그 점의 선 번호
function endsOf(scene) {
  const ends = [];
  for (const e of scene.edges.filter((edge) => !edge.isMark && edge.points.length > 1)) {
    ends.push({ id: e.from, point: e.points[0], edge: e });
    ends.push({ id: e.to, point: e.points.at(-1), edge: e });
  }
  return ends;
}

test('layoutGraph_ends_of_in_and_out_edges_on_the_same_side_of_a_shape_keep_the_crowd_gap', async () => {
  const { scene } = await buildFigure(CROWDED, { strict: true });
  const ends = endsOf(scene);
  const items = new Map(scene.items.map((it) => [it.id, it]));
  const tooClose = ends.flatMap((a, i) => ends.slice(i + 1).filter((b) => {
    if (a.id !== b.id || a.edge === b.edge || !items.has(a.id)) return false;
    const isSameColumn = Math.abs(a.point.x - b.point.x) < 0.5;
    return isSameColumn && Math.abs(a.point.y - b.point.y) > 0.5 && Math.abs(a.point.y - b.point.y) < CROWD;
  }));

  assert.deepEqual(tooClose.map((pair) => pair.id), []);
});

test('layoutGraph_paths_have_no_middle_point_on_a_straight_run', async () => {
  for (const name of EXAMPLES) {
    const { scene } = await buildFigure(readFileSync(new URL(`../examples/${name}.muto`, import.meta.url), 'utf8'));
    for (const e of scene.edges.filter((edge) => edge.points.length > 2)) {
      e.points.slice(1, -1).forEach((p, i) => {
        const [a, c] = [e.points[i], e.points[i + 2]];
        const isStraight = (Math.abs(a.y - p.y) < 0.5 && Math.abs(p.y - c.y) < 0.5 && (p.x - a.x) * (c.x - p.x) > 0) || (Math.abs(a.x - p.x) < 0.5 && Math.abs(p.x - c.x) < 0.5 && (p.y - a.y) * (c.y - p.y) > 0);
        assert.ok(!isStraight, `${name} ${e.from} -> ${e.to} point ${i + 1}`);
      });
    }
  }
});

// 무작위 시험에서 상자 선 끝의 줄과 원통 연결점의 줄이 2px 간격으로 20px 겹치던 그림. 안전 배치로 다시 그려 통과한다.
const PARALLEL = `flow right
group g0 "그룹0" direction=right {
  box n0 "n0"
  box n1 "n1"
  box n2 "n2"
}
group g1 "그룹1" direction=right {
  box n3 "n3"
  box n4 "n4"
  store n5 "n5"
}
n3 -> n1
n2 -> n4
n2 -> n3 "l3"
n3 -> n4
n1 -> n4 "l5"
n1 -> n5
n0 -> n4 "l7"
`;

test('buildFigure_two_close_parallel_runs_make_the_safe_layout_run_and_pass_check_5', async () => {
  const { warnings } = await buildFigure(PARALLEL);

  assert.deepEqual(warnings.filter((w) => w.code === 'check-5'), []);
});
