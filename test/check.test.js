import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { checkFigure } from '../src/check.js';
import { createProblems } from '../src/source/problems.js';

// cost: time O(build), heap O(build), stack O(1)
// vars: build = 원본 하나를 만드는 비용
// basis: estimate
async function problemsOf(source) {
  try {
    await buildFigure(source);
    return [];
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems.map((p) => `${p.line}: ${p.message}`);
  }
}

// cost: time O(check), heap O(m), stack O(1)
// vars: check = 그림 검사 비용, m = 메시지 수
// basis: estimate
function recheck({ figure, scene, timeline }) {
  const problems = createProblems();
  checkFigure(figure, scene, timeline, problems);
  return problems.errors.map((p) => `${p.line}: ${p.message}`);
}

test('checkFigure_moving_text_wider_than_figure_is_check_7_error', async () => {
  const source = 'flow down\nbox a "A"\nbox b "B"\na -> b\nstep "보내기"\n  a -> b "이동 글이 그림 폭보다 넓어서 어느 쪽으로 밀어도 그림 밖으로 나간다"';

  const messages = await problemsOf(source);

  assert.ok(messages.some((m) => m.startsWith('6: [check 7]')), messages.join('\n'));
});

test('checkFigure_moving_text_near_left_edge_is_pushed_inside', async () => {
  const source = 'flow right\nbox a "A"\nbox b "B"\nbox c "C"\nbox d "D"\na -> b\nb -> c\nc -> d\nstep "보내기"\n  a -> b "왼쪽 끝에서 출발"';

  const messages = await problemsOf(source);

  assert.deepEqual(messages, []);
});

test('checkFigure_label_wider_than_node_is_check_1_internal_error', async () => {
  const result = await buildFigure('flow right\nbox a "꽤 긴 도형 이름"\nbox b "B"\na -> b');
  const a = result.scene.items.find((it) => it.id === 'a');
  a.w = 40;

  const messages = recheck(result);

  assert.ok(messages.some((m) => m.startsWith('2: [check 1] internal: label')), messages.join('\n'));
});

test('checkFigure_card_text_wider_than_card_is_check_1_internal_error', async () => {
  const result = await buildFigure('flow right\nbox a "A"\nbox b "B"\na -> b\nstep "보내기"\n  show a "카드에 들어가는 글"');
  const a = result.scene.items.find((it) => it.id === 'a');
  a.card = { ...a.card, w: 30 };

  const messages = recheck(result);

  assert.ok(messages.some((m) => m.startsWith('2: [check 1] internal: card text')), messages.join('\n'));
});

test('toSvg_moving_text_near_side_edge_is_pushed_inside', async () => {
  const { toSvg } = await import('../src/svg.js');
  const source = 'flow down\nbox a "A"\nbox b "B"\nbox c "C"\nbox d "D"\nbox e "E"\na -> b\na -> c\na -> d\na -> e\nstep "보내기"\n  a -> b "왼쪽 아래 도형으로 가는 두 줄짜리 이동 글은 옆으로 밀린다"';

  const svg = await toSvg(await buildFigure(source), {});

  assert.match(svg, /<animateTransform attributeName="transform" type="translate"[^>]*values="[1-9][\d.]* 0;/);
});

const GROUPED = 'flow right\nbox a "A"\ngroup g "묶음" {\n  box b "B"\n}\nbox c "C"\na -> b "보냄"\nb -> c';

test('checkFigure_edge_through_unrelated_group_is_check_3_error', async () => {
  const result = await buildFigure(GROUPED);
  const g = result.scene.groups[0];
  const edge = result.scene.edges.find((e) => e.from === 'b');
  edge.points = [{ x: g.x - 20, y: g.y + g.h / 2 }, { x: g.x + g.w + 20, y: g.y + g.h / 2 }];
  edge.from = 'a';

  const messages = recheck(result);

  assert.ok(messages.some((m) => m.includes('[check 3]') && m.includes('group "g"')), messages.join('\n'));
});

test('checkFigure_node_inside_unrelated_group_is_check_6_internal_error', async () => {
  const result = await buildFigure(GROUPED);
  const g = result.scene.groups[0];
  const c = result.scene.items.find((it) => it.id === 'c');
  Object.assign(c, { x: g.x + 2, y: g.y + 2 });

  const messages = recheck(result);

  assert.ok(messages.some((m) => m.includes('[check 6] internal: node "c" overlaps group "g"') || m.includes('[check 6] internal: group "g" overlaps node "c"')), messages.join('\n'));
});

test('checkFigure_edge_label_on_group_title_is_check_2_error', async () => {
  const result = await buildFigure(GROUPED);
  const g = result.scene.groups[0];
  const edge = result.scene.edges.find((e) => e.label);
  edge.labelAt = { x: g.x + 30, y: g.y + 8 };

  const messages = recheck(result);

  assert.ok(messages.some((m) => m.includes('[check 2]') && m.includes('title of group "g"')), messages.join('\n'));
});

test('checkFigure_decision_edge_off_vertex_is_check_4_internal_error', async () => {
  const result = await buildFigure('flow right\nbox a "A"\ndecision d "확인"\nbox b "B"\na -> d\nd -> b');
  const d = result.scene.items.find((it) => it.id === 'd');
  const edge = result.scene.edges.find((e) => e.from === 'd');
  edge.points[0] = { x: d.x + d.w, y: d.y };

  const messages = recheck(result);

  assert.ok(messages.some((m) => m.includes('[check 4] internal')), messages.join('\n'));
});
