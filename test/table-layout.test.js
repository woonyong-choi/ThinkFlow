// 열을 이은 데이터 그림이 한 줄에 안 들어가면 세로로 쌓고, 선이 줄 사이를 그림 폭만큼 가로지르지 않는다(docs/design/layout.md 연결점, 그림 크기).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { CANVAS } from '../src/canvas.js';

const CHAIN = readFileSync(new URL('./fixtures/table-chain.muto', import.meta.url), 'utf8');

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
const lengthOf = (edge) => edge.points.slice(1).reduce((total, point, i) => total + Math.abs(point.x - edge.points[i].x) + Math.abs(point.y - edge.points[i].y), 0);

test('layout_table_chain_wider_than_the_canvas_stacks_vertically_without_a_snake_edge', async () => {
  const { scene } = await buildFigure(CHAIN);
  const longest = Math.max(...scene.edges.map(lengthOf));

  assert.ok(scene.width <= CANVAS, `width ${scene.width}`);
  assert.ok(longest < CANVAS / 2, `longest edge ${longest}`);
});

test('layout_table_chain_total_edge_length_is_shorter_than_the_wrapped_layout', async () => {
  const { scene } = await buildFigure(CHAIN);
  const wrapped = await buildFigure(CHAIN.replace('data right\n', 'data right\naspect 1.6\n'));
  const total = (figure) => figure.scene.edges.reduce((sum, edge) => sum + lengthOf(edge), 0);

  assert.ok(total({ scene }) < total(wrapped) / 2, `${total({ scene })} vs ${total(wrapped)}`);
});

test('layout_table_column_edges_of_a_bracketed_stack_leave_and_enter_on_the_right_face_at_the_row', async () => {
  const { scene } = await buildFigure(CHAIN);
  const at = new Map(scene.items.map((item) => [item.id, item]));

  for (const edge of scene.edges.filter((e) => e.fromColumn)) {
    const [from, to] = [at.get(edge.from), at.get(edge.to)];
    assert.equal(Math.round(edge.points[0].x), Math.round(from.x + from.w), `${edge.from} start`);
    assert.equal(Math.round(edge.points.at(-1).x), Math.round(to.x + to.w), `${edge.to} end`);
    assert.equal(Math.round(edge.points.at(-1).y), Math.round(to.y + to.rowH * (to.columns.findIndex((c) => c.name === edge.toColumn) + 1.5)));
  }
});
