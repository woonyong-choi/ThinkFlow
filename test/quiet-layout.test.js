// 세로로 쌓은 층의 quiet 선은 라벨을 선 옆에 두어 층 간격을 늘리지 않고, 가로 층은 보이는 선과 같은 자리를 쓴다(docs/design/layout.md 선 라벨).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';

const FIXTURE = readFileSync(new URL('./fixtures/quiet-label-gap.muto', import.meta.url), 'utf8');

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 도형 수
// basis: estimate
// 위 도형 아래 끝에서 아래 도형 위 끝까지 거리
async function gaps(source) {
  const { scene } = await buildFigure(source);
  const at = new Map(scene.items.map((item) => [item.id, item]));
  const gap = (upper, lower) => at.get(lower).y - at.get(upper).y - at.get(upper).h;
  return { ab: gap('a', 'b'), bc: gap('b', 'c'), cd: gap('c', 'd'), scene };
}

test('layout_quiet_edge_label_does_not_widen_the_layer_gap_beyond_visible_edges', async () => {
  const { ab, bc, cd } = await gaps(FIXTURE);

  assert.ok(cd <= Math.min(ab, bc), `quiet gap ${cd} > visible gaps ${ab}, ${bc}`);
});

test('layout_quiet_edge_in_a_stack_takes_no_more_space_than_the_same_edge_without_a_label', async () => {
  const quiet = await gaps(FIXTURE);
  const bare = await gaps(FIXTURE.replace('"L1 실패" quiet', 'quiet'));
  const visible = await gaps(FIXTURE.replace('"L1 실패" quiet', '"L1 실패"'));

  assert.equal(quiet.cd, bare.cd);
  assert.ok(quiet.cd < visible.cd, `quiet gap ${quiet.cd}, visible gap ${visible.cd}`);
  assert.ok(quiet.scene.height < visible.scene.height);
});

test('layout_quiet_edge_in_a_row_keeps_its_label_on_the_line_and_the_layer_gap', async () => {
  const row = FIXTURE.replace('flow down', 'flow right');
  const quiet = await gaps(row);
  const visible = await gaps(row.replace('"L1 실패" quiet', '"L1 실패"'));
  const at = new Map(quiet.scene.items.map((item) => [item.id, item]));
  const edge = quiet.scene.edges.find((e) => e.quiet);

  assert.ok(edge.labelAt.x > at.get('c').x + at.get('c').w && edge.labelAt.x < at.get('d').x, 'the label sits in the gap between the two boxes');
  assert.equal(quiet.scene.width, visible.scene.width);
});

test('layout_quiet_edge_gap_holds_the_pill_and_a_moving_text_without_covering_each_other', async () => {
  // 줄이면 이 그림의 그림 검사 7번(이동 글 상자가 알약을 가림) 경고가 난다. 간격을 줄이는 변경을 막는다.
  const { warnings } = await buildFigure(FIXTURE.replace('  c -> d\n', '  c -> d "블록 요청 PA 0xA1B2678"\n'), { strict: true });

  assert.deepEqual(warnings, []);
});

test('layout_quiet_edge_keeps_its_label_beside_the_line_so_the_step_that_shows_it_has_a_pill', async () => {
  const { scene } = await gaps(FIXTURE);
  const quiet = scene.edges.find((edge) => edge.quiet);
  const at = new Map(scene.items.map((item) => [item.id, item]));

  assert.ok(quiet.labelAt, 'the quiet label has a position');
  assert.ok(quiet.labelAt.y > at.get('c').y + at.get('c').h && quiet.labelAt.y < at.get('d').y, 'the label sits between the two boxes');
  assert.notEqual(quiet.labelAt.x, quiet.points[0].x, 'the label sits beside the line, not on it');
});

test('layout_visible_edge_label_still_widens_the_gap', async () => {
  const { ab } = await gaps(FIXTURE);
  const bare = await gaps(FIXTURE.replace('a -> b "VA"', 'a -> b'));

  assert.ok(ab > bare.ab);
});
