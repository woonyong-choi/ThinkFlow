// 그림 검사: 항목마다 실패하는 그림에서 그 항목의 진단을 내고, 정상 그림은 통과시킨다(docs/design/figure-check.md).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { checkFigure } from '../src/check.js';
import { DOC_END, DOC_START, renderCheckTable } from '../src/check/doc.js';
import { createProblems } from '../src/source/problems.js';
import { formatProblem } from './helpers.js';

// cost: time O(build), heap O(build), stack O(1)
// vars: build = 원본 하나를 만드는 비용
// basis: estimate
// 원본을 만들 때 나는 오류를 `줄: [코드] 메시지`로 돌려준다. 오류가 없으면 빈 목록이다.
async function problemsOf(source) {
  try {
    await buildFigure(source);
    return [];
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems.map(formatProblem);
  }
}

// cost: time O(check), heap O(m), stack O(1)
// vars: check = 그림 검사 비용, m = 진단 수
// basis: estimate
// 장면을 만든 뒤 mutate로 고쳐서 그림 검사를 다시 돌린다. 배치가 일부러 만들지 않는 어긋남을 검사가 알리는지 보려고 장면을 직접 고친다.
async function recheck(source, mutate) {
  const { figure, scene, timeline } = await buildFigure(source, { strict: true });
  mutate(scene);
  const problems = createProblems(source);
  checkFigure({ figure, scene, timeline }, problems);
  return [...problems.errors, ...problems.warnings];
}

const GROUPED = 'flow right\nbox a "A"\ngroup g "묶음" {\n  box b "B"\n}\nbox c "C"\na -> b "보냄"\nb -> c';
const NOTES = 'sequence\nbox a "호출"\nbox b "응답"\nbox c "저장"\nstep "s" "c"\n  a -> b "요청 라벨"\n  note a "메모"\n  b -> c "저장 요청"\n';
const at = (scene, id) => scene.items.find((item) => item.id === id);

const BROKEN_SCENES = [
  { code: 'check-1', source: 'flow right\nbox a "꽤 긴 도형 이름"\nbox b "B"\na -> b', mutate: (scene) => { at(scene, 'a').w = 40; }, expect: /^internal: label/ },
  { code: 'check-1', source: 'flow right\nbox a "A"\nbox b "B"\na -> b\nstep "보내기"\n  show a "카드에 들어가는 글"', mutate: (scene) => { const a = at(scene, 'a'); a.card = { ...a.card, w: 30 }; }, expect: /^internal: card text/ },
  { code: 'check-2', source: GROUPED, mutate: (scene) => { const g = scene.groups[0]; scene.edges.find((e) => e.label).labelAt = { x: g.x + 30, y: g.y + 8 }; }, expect: /title of group "g"/ },
  { code: 'check-3', source: GROUPED, mutate: (scene) => { const g = scene.groups[0]; const edge = scene.edges.find((e) => e.from === 'b'); edge.points = [{ x: g.x - 20, y: g.y + g.h / 2 }, { x: g.x + g.w + 20, y: g.y + g.h / 2 }]; edge.from = 'a'; }, expect: /group "g"/ },
  { code: 'check-4', source: 'flow right\nbox a "A"\ndecision d "확인"\nbox b "B"\na -> d\nd -> b', mutate: (scene) => { const d = at(scene, 'd'); scene.edges.find((e) => e.from === 'd').points[0] = { x: d.x + d.w, y: d.y }; }, expect: /^internal/ },
  { code: 'check-5', source: 'flow right\nbox a "A"\nbox b "B"\nbox c "C"\nbox d "D"\na -> b\nc -> d', mutate: (scene) => { scene.edges[0].points = [{ x: 0, y: 0 }, { x: 100, y: 0 }]; scene.edges[1].points = [{ x: 0, y: 4 }, { x: 100, y: 4 }]; }, expect: /./ },
  { code: 'check-6', source: GROUPED, mutate: (scene) => { const g = scene.groups[0]; Object.assign(at(scene, 'c'), { x: g.x + 2, y: g.y + 2 }); }, expect: /^internal: (node "c" overlaps group "g"|group "g" overlaps node "c")/ },
  { code: 'check-13', source: GROUPED, mutate: (scene) => { const g = scene.groups[0]; const edge = scene.edges.find((e) => e.from === 'b'); edge.points = [{ x: g.x + g.titleDx + 4, y: g.y - 10 }, { x: g.x + g.titleDx + 4, y: g.y + 20 }]; }, expect: /passes through the title of group "g"/ },
  { code: 'check-12', source: NOTES, mutate: (scene) => { const [label] = scene.edges; Object.assign(scene.notes[0], { x: label.labelAt.x - scene.notes[0].w / 2, y: label.labelAt.y - scene.notes[0].h / 2 }); }, expect: /covers the label "요청 라벨"/ },
  { code: 'check-12', source: NOTES, mutate: (scene) => { const [label] = scene.edges; Object.assign(scene.notes[0], { x: label.labelAt.x - scene.notes[0].w / 2, y: label.labelAt.y - scene.notes[0].h / 2 }); }, expect: /covers the arrow of message a -> b/ },
  { code: 'check-12', source: NOTES, mutate: (scene) => { scene.notes[0].x = -50; }, expect: /leaves the figure/ },
  { code: 'check-12', source: NOTES, severity: 'warning', mutate: (scene) => { const other = scene.lifelines.find((l) => l.id === 'c'); Object.assign(scene.notes[0], { x: other.x - 10, y: other.y1 + 1 }); }, expect: /crosses the lifeline of "c"/ },
];

// 근거: 설계 figure-check.md 요구사항 "검사 항목마다 실패하는 원본에서 그 항목 메시지를 낸다"(1, 2, 3, 4, 5, 6, 12, 13번)
test('checkFigure_each_item_reports_its_code_for_a_scene_that_breaks_it', async () => {
  for (const { code, source, mutate, expect, severity = 'error' } of BROKEN_SCENES) {
    const found = (await recheck(source, mutate)).filter((d) => d.code === code);

    assert.ok(found.some((d) => d.severity === severity && expect.test(d.message)), `${code} ${expect}: ${found.map((d) => d.message).join(' | ')}`);
  }
});

// 근거: 설계 figure-check.md 요구사항 "검사 항목마다 실패하는 원본에서 그 항목 메시지를 낸다"(7번, 이동 글이 그림 높이를 넘음)
test('buildFigure_moving_text_taller_than_a_short_figure_is_a_check_7_error', async () => {
  const source = 'flow right\nbox a "A"\nbox b "B"\nbox c "C"\na -> b\nb -> c\nstep "보내기"\n  a -> b "세 줄로 나뉘는 긴 이동 글이라서 점 위에 두면 그림 위쪽 경계를 넘고 점 아래로 내려도 아래쪽 경계를 넘는다"';

  const messages = await problemsOf(source);

  assert.ok(messages.some((m) => m.startsWith('8: [check-7]')), messages.join('\n'));
});

const NARROW_FLOW = (text, tail = '') => `flow right\nbox a "A"\nbox b "B"\nbox c "C"\n${tail ? 'box d "D"\n' : ''}a -> b\nb -> c\n${tail}step "s" for=6s\n  track a -> b -> c "${text}" time=4s`;
// cost: time O(s), heap O(1), stack O(1)
// vars: s = 도형 수
// basis: estimate
// 가로로 이웃한 도형 사이 빈 폭 { 'a-b': px, ... }
function gapsOf({ scene }) {
  const at = (id) => scene.items.find((it) => it.id === id);
  return Object.fromEntries([['a', 'b'], ['b', 'c'], ['c', 'd']].map(([from, to]) => [`${from}-${to}`, Math.round(at(to).x - at(from).x - at(from).w)]));
}

// 근거: 설계 figure-check.md 7번과 layout.md 이동 글 간격: 선 틈이 글 상자보다 좁아 흐름 글 상자가 이름을 가려 숨는 그림은(#55, #94) 그 흐름이 지나는 선의 간격만 늘려 다시 배치해 경고 없이 글이 보이고, 지나지 않는 선의 간격은 그대로다
test('buildFigure_flow_chip_wider_than_the_gap_widens_only_the_edges_it_passes_and_keeps_the_text', async () => {
  const plain = gapsOf(await buildFigure(NARROW_FLOW('x', 'c -> d\n').replace('"x" ', '')));
  const result = await buildFigure(NARROW_FLOW('hello chip text', 'c -> d\n'));
  const gaps = gapsOf(result);

  assert.deepEqual(result.warnings.filter((w) => w.code === 'check-7'), []);
  assert.ok(gaps['a-b'] > plain['a-b'] && gaps['b-c'] > plain['b-c'], JSON.stringify({ gaps, plain }));
  assert.equal(gaps['c-d'], plain['c-d']);
  assert.deepEqual(result.timeline.segs[0].hops.map((hop) => hop.data), [['hello chip text']]);
});

// 근거: 설계 figure-check.md 7번: 간격을 늘려도(토큰 `scale.chip-room-tries`번) 글 상자가 들어갈 자리가 없으면 경고를 남기고 글은 지우지 않으며 strict가 실패한다
test('buildFigure_flow_chip_that_no_gap_can_hold_keeps_its_text_and_stays_a_check_7_warning', async () => {
  const source = NARROW_FLOW('a very long moving text that wraps over several lines to cover names');
  const { warnings, timeline } = await buildFigure(source);
  const found = warnings.filter((w) => w.code === 'check-7').map(formatProblem);

  assert.equal(found.length, 1, found.join('\n'));
  assert.match(found[0], /^8: \[check-7\] moving text ".*" is hidden for .*% of the time it is on screen because it would cover "[ABC]"/);
  assert.equal(timeline.segs[0].hops[0].data.length > 0, true);
  await assert.rejects(buildFigure(source, { strict: true }), (error) => error.problems.some((p) => p.code === 'check-7'));
});

// 근거: 버그 #4 증상 3 "세로 그림에서 그림 폭보다 넓은 이동 글이 check 7로 막힘"
test('buildFigure_narrow_figure_widens_for_the_moving_text', async () => {
  const { scene } = await buildFigure('flow down\nbox a "가"\nbox b "나"\na -> b\nstep "s"\n  a -> b "민지는 3월에 토스로 옮겼고 결제팀을 맡았다"');

  assert.ok(scene.width > 200, String(scene.width));
});

// 근거: 설계 figure-check.md 요구사항(1번, 차트), 버그 68ec356 "히트맵 열 이름과 산점도 점 이름도 검사 1번"
test('buildFigure_chart_item_name_wider_than_the_label_column_is_a_check_1_error', async () => {
  const source = 'chart bar\nseries a "A"\nrow "아주 긴 항목 이름이 이름 칸을 넘어서 막대와 겹치는 경우를 만든다" a=3\nrow "b" a=1';

  const errors = await problemsOf(source);

  assert.ok(errors.some((e) => e.startsWith('3: [check-1] item name')), errors.join('\n'));
});

// 근거: 버그 #4 증상 4 "히트맵 열 이름이 한글 넉 자 이상이면 check 1로 막힘"
test('buildFigure_heatmap_column_with_a_long_name_fits_its_cell', async () => {
  const errors = await problemsOf('chart heatmap\ncell "정답" "통과" 10\ncell "정답" "판단 보류" 1\ncell "오답" "통과" 3\ncell "오답" "판단 보류" 4');

  assert.deepEqual(errors, []);
});

const FAN_OUT = 'flow right\nperson user "사용자"\nbox a1 "A1"\nbox a2 "A2"\nbox a3 "A3"\nbox a4 "A4"\nuser -> a1\nuser -> a2\nuser -> a3\nuser -> a4';
const FAN_IN = 'flow right\nbox a1 "A1"\nbox a2 "A2"\nbox a3 "A3"\nbox a4 "A4"\nbox sink "합류"\na1 -> sink\na2 -> sink\na3 -> sink\na4 -> sink';

// 근거: 버그 #6 "같은 도형에서 함께 나가거나 들어오는 선 쌍은 5번(나란한 구간) 검사에서 뺀다"
test('buildFigure_edges_fanning_out_of_or_into_one_shape_pass_check_5', async () => {
  assert.deepEqual(await problemsOf(FAN_OUT), []);
  assert.deepEqual(await problemsOf(FAN_IN), []);
});

const CHAIN = (count, line) => Array.from({ length: count }, (_, i) => line(i)).join('\n');
const TALL_GROUP = `flow down\ngroup g "G" {\n${CHAIN(30, (i) => `  box n${i} "N${i}"`)}\n${CHAIN(29, (i) => `  n${i} -> n${i + 1}`)}\n}`;
const NARROW_TALL_GROUP = `flow down\ngroup g "G" {\n${CHAIN(16, (i) => `  box n${i} "N${i}"`)}\n${CHAIN(15, (i) => `  n${i} -> n${i + 1}`)}\n}`;
const WIDE_WITH_ASPECT = `flow right\naspect 20\n${CHAIN(16, (i) => `box n${i} "N${i}"`)}\ngroup g "G" {\n  box a "A"\n}\n${CHAIN(15, (i) => `n${i} -> n${i + 1}`)}\nn15 -> a`;

// 근거: 설계 figure-check.md 9번 "비율"과 메시지의 고치는 방법(그룹 방향, aspect), 버그 #4
test('buildFigure_check_9_aspect_warning_suggests_what_the_source_can_change', async () => {
  const tall = await buildFigure(TALL_GROUP);
  const narrow = await buildFigure(NARROW_TALL_GROUP);
  const wide = await buildFigure(WIDE_WITH_ASPECT);
  const small = await buildFigure('flow right\nbox a "요청"\nbox b "응답"\na -> b "보냄"', { strict: true });

  assert.ok(tall.warnings.some((w) => w.message.includes('Set direction=right on group "g"')), JSON.stringify(tall.warnings));
  assert.ok(wide.warnings.some((w) => w.message.includes('Use a smaller aspect than 20')), JSON.stringify(wide.warnings));
  assert.ok(narrow.scene.width / narrow.scene.height < 1 / 3, '내용 비율은 1/3보다 작다');
  assert.deepEqual(narrow.warnings.filter((w) => w.code === 'check-9'), [], '캔버스 폭으로 보이는 모양으로 판정한다');
  assert.deepEqual(small.warnings, []);
});

// 근거: 설계 figure-check.md 10번 "문서 폭에서 읽힘"
test('buildFigure_content_still_wider_than_the_canvas_after_shrinking_warns_check_10', async () => {
  const participants = Array.from({ length: 9 }, (_, i) => `box p${i} "참여자 ${i}"`).join('\n');
  const messages = Array.from({ length: 8 }, (_, i) => `  p${i} -> p${i + 1} "메시지 ${i}"`).join('\n');

  const { warnings } = await buildFigure(`sequence\n${participants}\nstep "전달"\n${messages}`);

  assert.ok(warnings.some((w) => w.code === 'check-10'), JSON.stringify(warnings));
});

// 근거: 설계 figure-check.md "검사 항목" 표는 항목 목록에서 만든다
test('checkItems_figure_check_doc_table_equals_the_table_made_from_the_list', () => {
  const doc = readFileSync(new URL('../docs/design/figure-check.md', import.meta.url), 'utf8');
  const written = doc.slice(doc.indexOf(DOC_START) + DOC_START.length, doc.indexOf(DOC_END)).trim();

  assert.equal(written, renderCheckTable(), 'run npm run checkdoc to rewrite the table in docs/design/figure-check.md');
});
