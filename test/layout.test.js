// 배치: 도형 크기와 연결점, 그룹, 줄 바꿈과 맞춤, 선 끝 자리, 배치 실패, 종류별 배치(docs/design/layout.md, figure-kinds.md).
// fuzz 회귀 재현본(무작위 시험에서 찾은 입력)은 이름에 fuzz를 적었다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test, { mock } from 'node:test';
import ELK from 'elkjs/lib/elk.bundled.js';
import { buildFigure } from '../src/build.js';
import { CANVAS } from '../src/canvas.js';
import { titleBox } from '../src/check/geometry.js';
import { CHIP_CLEAR } from '../src/chip.js';
import { placeTitles, TITLE_INSET } from '../src/layout/titles.js';
import { sizeNode, sizePill } from '../src/measure/sizes.js';
import { FigureError } from '../src/source/problems.js';
import { values } from '../src/tokens.js';
import { toSvg } from '../src/svg.js';
import { docExamples } from './helpers.js';

const EXAMPLES = new URL('../examples/', import.meta.url);
const FIXTURES = new URL('./fixtures/layout/', import.meta.url);
const COMPAT = new URL('./fixtures/compat/v1/', import.meta.url);
const fixture = (name) => readFileSync(new URL(`${name}.muto`, FIXTURES), 'utf8');
const item = (scene, id) => scene.items.find((it) => it.id === id);
const lineOf = (count, make) => Array.from({ length: count }, (_, i) => make(i)).join('\n');

// 근거: 설계 layout.md 요구사항 "배치에 넘긴 도형 크기와 그린 도형 크기가 같다"
test('layoutGraph_box_sizes_equal_measured_sizes', async () => {
  const { scene, figure } = await buildFigure('flow right\nbox a "첫 상자" "부제"\nstore b "저장소"\na -> b "쓰기"');

  for (const it of scene.items) {
    const size = sizeNode(figure.nodes.find((n) => n.id === it.id));
    assert.deepEqual([it.w, it.h], [size.w, size.h], it.id);
  }
});

// 근거: 설계 layout.md 요구사항 "그룹의 direction이 안쪽 배치에 지켜진다"
test('layoutGraph_group_direction_down_stacks_the_children', async () => {
  const { scene } = await buildFigure('flow right\nbox src "S"\ngroup g "G" direction=down {\n  box a "A"\n  box b "B"\n  a -> b\n}\nsrc -> a');
  const [a, b] = [item(scene, 'a'), item(scene, 'b')];

  assert.equal(a.x + a.w / 2, b.x + b.w / 2);
  assert.ok(b.y > a.y + a.h);
});

// 근거: 설계 layout.md 도형 연결점 "원통(store) 세로 선은 윗면 곡선 바깥 끝에 닿는다"(#5)
test('layoutGraph_store_vertical_edge_ends_on_the_cap_outline', async () => {
  const { scene } = await buildFigure('flow down\nbox a "A"\nstore s "S"\na -> s');
  const s = item(scene, 's');

  assert.equal(scene.edges[0].points.at(-1).y, s.y - s.marginTop);
});

// 근거: 설계 figure-kinds.md 요구사항 "순서 그림 메시지는 적은 순서대로 위에서 아래로 놓인다"
test('layoutSequence_messages_go_down_in_the_written_order', async () => {
  const { scene } = await buildFigure('sequence\nbox a "A"\nbox b "B"\nstep "s"\n  a -> b "1"\n  b -> a "2"\n  a -> b "3"');
  const ys = scene.edges.map((e) => e.points[0].y);

  assert.deepEqual([...ys].sort((x, y) => x - y), ys);
  assert.equal(new Set(ys).size, 3);
});

// 근거: 설계 figure-kinds.md 요구사항 "상태 그림의 start는 없거나 하나다": start가 없으면 점과 선이 없다
test('buildFigure_state_without_start_draws_no_start_dot_or_line', async () => {
  const withStart = await buildFigure('state right\nstate a "A"\nstate b "B"\nstart a\nfinal b\na -> b "go"');
  const without = await buildFigure('state right\nstate a "A"\nstate b "B"\nfinal b\na -> b "go"');

  assert.equal(withStart.scene.edges.length, 3);
  assert.equal(without.scene.edges.length, 2);
  assert.equal(without.scene.edges.filter((e) => e.isMark).length, 1);
});

// 근거: 버그 #4 증상 1 "사람 둘이 같은 상자로 가거나 그룹 안 원통 둘이 겹쳐 check 6 오류"
test('buildFigure_two_people_and_grouped_stores_do_not_overlap', async () => {
  const sources = [
    'flow right\nperson a "사용자"\nperson b "관리자"\nbox c "시스템"\na -> c "요청"\nb -> c "설정"',
    'flow right\nbox eng "엔진"\ngroup g "저장" {\n  store a "기록"\n  store b "캐시"\n}\neng -> a\neng -> b',
  ];

  for (const source of sources) assert.ok(await buildFigure(source, { strict: true }), source);
});

// 근거: 버그 #4 증상 2 "테이블 셋을 외래 키로 이은 data 그림에 aspect를 넣으면 elkjs에서 크래시"
test('buildFigure_data_chain_with_aspect_lays_out', async () => {
  const tables = [1, 2, 3, 4].map((i) => `table t${i} "t${i}" {\n  id bigint pk\n${i > 1 ? `  t${i - 1}_id bigint fk=t${i - 1}.id\n` : ''}}`).join('\n');

  const { scene } = await buildFigure(`data right\naspect 1.6\n${tables}`);

  assert.equal(scene.items.length, 4);
});

const WRAP_CHAIN = `flow right\naspect 1.2\n${lineOf(12, (i) => `box n${i} "단계 ${i}"`)}\ngroup g "묶음" {\n  box a "가"\n  box b "나"\n  a -> b\n}\n${lineOf(11, (i) => `n${i} -> n${i + 1}`)}\nn11 -> a`;
const BACK_EDGES = `flow right\naspect 1.6\nbox u "사용자"\nbox a "접수"\nbox b "검증"\nbox d "통과"\nbox c "저장"\nbox e "알림"\nbox f "재시도"\nbox h "보고"\nbox s "기록"\ngroup g "처리" {\n  box g1 "가"\n  box g2 "나"\n}\nu -> a\na -> b\nb -> d\nd -> c "예"\nd -> f "아니오"\nf -> b\nc -> e\nc -> s\ne -> h\nh -> g1\ng2 -> u`;

// 근거: 기능 #8 "그룹이 있는 그림에서도 aspect로 바깥 층 줄 바꿈", 설계 layout.md 그림 비율
test('buildFigure_group_chain_with_aspect_wraps_into_rows_and_passes_strict', async () => {
  const { scene } = await buildFigure(WRAP_CHAIN, { strict: true });
  const ratio = scene.width / scene.height;

  assert.ok(ratio < 3 && ratio > 1 / 3, String(ratio));
  assert.equal(scene.groups.length, 1);
  assert.ok(new Set(scene.items.map((it) => Math.round(it.y))).size > 2, 'chain did not wrap into rows');
});

// 근거: 기능 #8 "줄 바꿈에서 같은 열의 상자가 같은 간격으로 정렬된다"
test('buildFigure_group_chain_wrap_keeps_same_column_boxes_aligned_with_equal_gaps', async () => {
  const { scene } = await buildFigure(WRAP_CHAIN);
  const chain = scene.items.filter((it) => /^n\d+$/.test(it.id));
  const rows = new Map();
  for (const it of chain) rows.set(Math.round(it.y), [...(rows.get(Math.round(it.y)) ?? []), it.x].sort((a, b) => a - b));
  const gaps = [...rows.values()].map((xs) => xs.slice(1).map((x, i) => x - xs[i]).join());

  assert.equal(new Set([...rows.values()].map((xs) => xs[0])).size, 1, JSON.stringify([...rows.values()]));
  assert.equal(new Set(gaps).size, 1, JSON.stringify(gaps));
});

// 근거: 기능 #8 "되돌아가는 선과 라벨이 있는 그룹 그림도 줄 바꿈에서 모든 선을 그린다"
test('buildFigure_aspect_wrap_with_group_back_edges_and_labels_keeps_every_edge', async () => {
  const { scene } = await buildFigure(BACK_EDGES);

  assert.equal(scene.edges.length, 11);
});

// 근거: 설계 layout.md 요구사항 "같은 원본을 두 번 그리면 결과가 같다"
test('toSvg_same_source_gives_the_same_bytes', async () => {
  const sources = [docExamples()[0].source, WRAP_CHAIN, 'chart bar\nx "정확도(%)"\nseries a "A"\nrow "항목" a=3\nrow "둘째" a=5'];

  for (const source of sources) {
    const [first, second] = [await toSvg(await buildFigure(source), { name: 'w' }), await toSvg(await buildFigure(source), { name: 'w' })];

    assert.equal(first, second, source.split('\n')[0]);
  }
});

// 근거: 설계 figure-syntax.md 머리 표 "title: SVG <title>, 없으면 파일 이름"(#5)
test('toSvg_title_falls_back_to_the_file_name', async () => {
  const svg = await toSvg(await buildFigure('flow right\nbox a "A"'), { isStatic: true, name: 'context' });

  assert.match(svg, /<title>context<\/title>/);
});

// 근거: 설계 layout.md 요구사항 "선이 그룹 제목 글을 가로지르지 않는다"
test('buildFigure_group_title_steps_aside_so_no_edge_crosses_it', async () => {
  const { scene } = await buildFigure(fixture('group-title-edge'), { strict: true });

  assert.ok(scene.groups[0].titleDx > TITLE_INSET, '이 원본은 제목이 비켜야 하는 그림이다');
  for (const g of scene.groups) {
    const box = titleBox(g);
    for (const e of scene.edges) {
      e.points.slice(1).forEach((p, i) => {
        const a = e.points[i];
        const hit = Math.min(a.x, p.x) < box.x + box.w && box.x < Math.max(a.x, p.x) && Math.min(a.y, p.y) < box.y + box.h && box.y < Math.max(a.y, p.y);
        assert.ok(!hit, `edge ${e.from} -> ${e.to} crosses the title of group ${g.id}`);
      });
    }
  }
});

// 선 x가 그룹 x + 제목 거리 - 비킴 간격과 부동소수점 반올림 때문에 한 칸 어긋나는 값. 옮겨도 선분과 겹쳐 보여 되풀이하던 입력이다.
const ROUNDING_GROUP = { x: 102.33333333333333, y: 292, w: 285, label: '그룹1' };
const ROUNDING_EDGE = { points: [{ x: 126.33333333333333, y: 130 }, { x: 126.33333333333333, y: 472 }] };

// 근거: 설계 layout.md 요구사항 "선이 그룹 제목 글을 가로지르지 않는다" 중 옮기는 반복이 멈춘다. 버그: fuzz 무한 반복
test('placeTitles_fuzz_segment_at_the_rounding_edge_ends_and_keeps_the_title_clear', () => {
  placeTitles([ROUNDING_GROUP], [ROUNDING_EDGE]);

  assert.ok(Number.isFinite(ROUNDING_GROUP.titleDx));
  assert.ok(ROUNDING_GROUP.titleDx >= TITLE_INSET);
});

// 근거: 설계 layout.md 요구사항 "선이 그룹 제목 글을 가로지르지 않는다". 버그: fuzz가 멈추던 원본 재현
test('buildFigure_fuzz_group_title_float_stall_fixture_finishes', async () => {
  const { scene } = await buildFigure(fixture('group-title-float-stall'), { strict: true });

  assert.equal(scene.groups.length, 2);
});

// 근거: 설계 layout.md 요구사항 "이름 root가 배치 내부 이름과 부딪히지 않는다"
test('buildFigure_nodes_and_groups_named_root_are_laid_out_like_any_other_name', async () => {
  const node = await buildFigure('flow right\nbox root "루트"\nbox leaf "잎"\nroot -> leaf "내려감"\nstep "s"\n  root -> leaf\n', { strict: true });
  const inGroup = await buildFigure('flow down\ngroup tree "계층" {\n  external root "루트 서버" "."\n  external tld "TLD 서버" ".com"\n}\nbox resolver "리졸버"\nresolver -> root "질의"\nresolver -> tld "질의"\n', { strict: true });
  const group = await buildFigure('flow right\ngroup root "그룹" {\n  box a "A"\n  box b "B"\n}\na -> b\n', { strict: true });

  assert.deepEqual(node.scene.items.map((it) => it.id), ['root', 'leaf']);
  assert.ok(node.scene.items[0].x < node.scene.items[1].x);
  assert.deepEqual([inGroup.scene.groups.length, inGroup.scene.edges.length], [1, 2]);
  assert.equal(group.scene.groups[0].id, 'root');
  assert.ok(group.scene.items.every((it) => it.parent === 'root'));
});

const goesUp = (e) => e.points.at(-1).y < e.points[0].y - 1;
const buildStrict = (name) => buildFigure(fixture(name), { strict: true });

// 근거: 설계 layout.md 요구사항 "순환에서 되돌아가는 선만 위로 간다"
test('buildFigure_cycle_through_groups_sends_back_only_the_edge_declared_last_in_the_cycle', async () => {
  const { scene } = await buildStrict('event-loop');
  const upward = scene.edges.filter(goesUp).map((e) => `${e.from} -> ${e.to}`).sort();

  assert.ok(item(scene, 'caller').y < item(scene, 'queue').y, '먼저 적은 호출 코드가 위에 있다');
  assert.deepEqual(upward, ['os -> queue', 'result -> caller']);
});

// 근거: 설계 layout.md 요구사항 "한 줄이 넓으면 방향을 돌려 폭 안에 든다"
test('buildFigure_flow_right_wider_than_the_canvas_turns_down_instead_of_shrinking_the_text', async () => {
  const { scene, warnings } = await buildStrict('event-loop-right');

  assert.ok(scene.width <= CANVAS, `폭 ${scene.width}`);
  assert.deepEqual(warnings, []);
  assert.ok(item(scene, 'caller').y < item(scene, 'result').y, '위에서 아래로 흐른다');
});

// 근거: 설계 layout.md 요구사항 "순환에서 되돌아가는 선만 위로 가고, 한 줄이 넓으면 방향을 돌려 폭 안에 든다"(상태 그림)
test('buildFigure_state_cycle_that_does_not_fit_turns_down_and_keeps_the_return_edge_short', async () => {
  const { scene, warnings } = await buildStrict('task-lifecycle');
  const back = scene.edges.find((e) => e.from === 'awaiting' && e.to === 'running');
  const span = Math.abs(item(scene, 'awaiting').y - item(scene, 'running').y);
  const length = back.points.slice(1).reduce((sum, p, i) => sum + Math.abs(p.x - back.points[i].x) + Math.abs(p.y - back.points[i].y), 0);

  assert.ok(scene.width <= CANVAS);
  assert.deepEqual(warnings, []);
  assert.ok(length < span + CANVAS / 4, `되돌아가는 선 길이 ${length}`);
});

// 근거: 설계 layout.md 그림 크기 "aspect를 적지 않았을 때만 방향을 돌리는 맞춤을 한다. 들어가는 그림은 방향을 그대로 둔다"
test('buildFigure_declared_direction_stays_when_the_figure_fits_or_aspect_is_written', async () => {
  const fits = await buildFigure(readFileSync(new URL('memory.muto', EXAMPLES), 'utf8'), { strict: true });
  const withAspect = await buildFigure(fixture('event-loop-right').replace('flow right', 'flow right\naspect 1.6'));

  assert.ok(item(fits.scene, 'user').x < item(fits.scene, 'answer').x, 'flow right 그대로');
  assert.ok(withAspect.scene.width > CANVAS, `폭 ${withAspect.scene.width}`);
});

const CROWD = values.space['2-5'];
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

// cost: time O(e), heap O(e), stack O(1)
// vars: e = 선 수
// basis: estimate
// 도형마다 닿는 선 끝 점과 그 점의 선
function endsOf(scene) {
  return scene.edges.filter((edge) => !edge.isMark && edge.points.length > 1).flatMap((e) => [{ id: e.from, point: e.points[0], edge: e }, { id: e.to, point: e.points.at(-1), edge: e }]);
}

// 근거: 설계 layout.md 요구사항 "같은 도형의 같은 면에 닿는 선 끝이 space.2-5보다 붙지 않는다". 버그: fuzz 재현
test('buildFigure_fuzz_ends_of_in_and_out_edges_on_one_side_of_a_shape_keep_the_crowd_gap', async () => {
  const { scene } = await buildFigure(CROWDED, { strict: true });
  const ends = endsOf(scene);
  const tooClose = ends.flatMap((a, i) => ends.slice(i + 1).filter((b) => {
    if (a.id !== b.id || a.edge === b.edge || !item(scene, a.id)) return false;
    const gap = Math.abs(a.point.y - b.point.y);
    return Math.abs(a.point.x - b.point.x) < 0.5 && gap > 0.5 && gap < CROWD;
  }));

  assert.deepEqual(tooClose.map((pair) => pair.id), []);
});

// 근거: 설계 layout.md 요구사항 "곧은 구간 가운데 점이 없다"
test('buildFigure_paths_have_no_middle_point_on_a_straight_run', async () => {
  for (const name of ['memory', 'saturn', 'orders', 'order-state']) {
    const { scene } = await buildFigure(readFileSync(new URL(`${name}.muto`, EXAMPLES), 'utf8'));
    for (const e of scene.edges.filter((edge) => edge.points.length > 2)) {
      e.points.slice(1, -1).forEach((p, i) => {
        const [a, c] = [e.points[i], e.points[i + 2]];
        const isStraight = (Math.abs(a.y - p.y) < 0.5 && Math.abs(p.y - c.y) < 0.5 && (p.x - a.x) * (c.x - p.x) > 0) || (Math.abs(a.x - p.x) < 0.5 && Math.abs(p.x - c.x) < 0.5 && (p.y - a.y) * (c.y - p.y) > 0);
        assert.ok(!isStraight, `${name} ${e.from} -> ${e.to} point ${i + 1}`);
      });
    }
  }
});

// 근거: 설계 layout.md 요구사항 "올바른 무작위 구조 그림이 그림 검사 오류가 되지 않는다". 버그: fuzz 재현(5번 나란한 구간)
test('buildFigure_fuzz_two_close_parallel_runs_make_the_safe_layout_run_and_pass_check_5', async () => {
  const { warnings } = await buildFigure(PARALLEL);

  assert.deepEqual(warnings.filter((w) => w.code === 'check-5'), []);
});

const FAILING_SOURCE = ['flow right', 'group g "그룹" direction=down {', '  box a "A"', '  box b "B"', '}', 'a -> b "앞"', 'b -> a "되돌림"', ''].join('\n');
// 줄 바꿈(aspect)이 선을 도형 위로 지나가게 하던 원본. 안전 배치로 그리고 aspect를 무시했다고 경고한다.
const WRAPPED_ACROSS_SHAPE = ['flow right', 'aspect 1', 'box n0 "n0"', 'store n1 "n1"', 'box n2 "n2"', 'box n3 "n3"', 'group g0 "그룹0" direction=right {', '  box n4 "n4"', '  external n5 "n5"', '  store n6 "n6"', '}', 'n1 -> n5', 'n4 -> n6', 'n3 -> n6 "l3"', 'n6 -> n5', 'n0 -> n6 "l5"', 'n3 -> n2', 'n3 -> n0 "l8"', 'n2 -> n5 "l9"', ''].join('\n');

// 근거: 설계 layout.md 요구사항 "배치 실패가 줄 번호 있는 오류가 되고 안전 배치로 다시 그린다"
test('buildFigure_layout_that_always_throws_becomes_an_error_diagnostic_with_a_line_number', async () => {
  const layout = ELK.prototype.layout;
  const stub = mock.method(ELK.prototype, 'layout', async () => {
    throw new TypeError("Cannot read properties of undefined (reading 'x')");
  });
  try {
    await assert.rejects(buildFigure(FAILING_SOURCE), (error) => {
      assert.ok(error instanceof FigureError);
      assert.deepEqual([error.problems[0].severity, error.problems[0].code, error.problems[0].line], ['error', 'layout', 1]);
      assert.match(error.problems[0].message, /Cannot read properties/);
      return true;
    });
    assert.equal(stub.mock.callCount(), 2, '안전 배치로 한 번 더 시도한다');
  } finally {
    stub.mock.restore();
    assert.equal(ELK.prototype.layout, layout);
  }
});

// 근거: 설계 layout.md 요구사항 "배치 실패가 줄 번호 있는 오류가 되고 안전 배치로 다시 그린다"(첫 시도만 실패)
test('buildFigure_layout_that_fails_once_is_retried_with_the_safe_layout_and_draws', async () => {
  const layout = ELK.prototype.layout;
  let calls = 0;
  const stub = mock.method(ELK.prototype, 'layout', function failFirst(graph) {
    calls += 1;
    if (calls === 1) throw new Error('first attempt failed');
    return layout.call(this, graph);
  });
  try {
    const { scene } = await buildFigure(FAILING_SOURCE);

    assert.equal(scene.edges.length, 2);
  } finally {
    stub.mock.restore();
  }
});

// 근거: 설계 layout.md 배치 실패 "경로가 없는 선이 있으면 그 선의 줄을 알린다"
test('buildFigure_edge_without_a_route_is_reported_at_the_edge_line', async () => {
  const layout = ELK.prototype.layout;
  const stub = mock.method(ELK.prototype, 'layout', async function dropRoutes(graph) {
    const laid = await layout.call(this, graph);
    for (const child of laid.children ?? []) for (const e of child.edges ?? []) delete e.sections;
    for (const e of laid.edges ?? []) delete e.sections;
    return laid;
  });
  try {
    await assert.rejects(buildFigure(FAILING_SOURCE), (error) => {
      assert.deepEqual([error.problems[0].code, error.problems[0].line], ['layout', 6]);
      assert.match(error.problems[0].message, /no route for edge a -> b/);
      return true;
    });
  } finally {
    stub.mock.restore();
  }
});

// 근거: 설계 layout.md 배치 실패 "줄 바꿈 없이 한 번 더 배치". 버그: fuzz 재현(줄 바꿈이 선을 도형 위로 지나감)
test('buildFigure_fuzz_wrapped_layout_that_crosses_a_shape_falls_back_and_warns_about_aspect', async () => {
  const { warnings, scene } = await buildFigure(WRAPPED_ACROSS_SHAPE);

  assert.ok(warnings.some((w) => /ignored "aspect"/.test(w.message)), warnings.map((w) => w.message).join('\n'));
  assert.equal(scene.edges.length, 8);
});

const BODY = values.size['person-body'];
const GAP = values.border.edge + values.space['0-5'];

// 근거: 기능 #12 "사람 한 면의 선 n개는 연결점 간격이 선 굵기와 틈의 합 이상이 되도록 몸통을 (n+1) x 간격까지만 늘린다"
test('buildFigure_person_body_grows_only_as_much_as_its_lines_need', async () => {
  for (const n of [2, 4, 6, 8, 12]) {
    const targets = lineOf(n, (i) => `box a${i + 1} "A${i + 1}"`);
    const edges = lineOf(n, (i) => `user -> a${i + 1}`);
    const { scene } = await buildFigure(`flow right\nperson user "사용자"\n${targets}\n${edges}`, { strict: true });
    const user = item(scene, 'user');
    const starts = scene.edges.filter((e) => e.points[0].x === user.x + user.w).map((e) => e.points[0].y).sort((a, b) => a - b);

    assert.equal(user.h, Math.max(BODY, (n + 1) * GAP), `lines ${n}`);
    assert.equal(starts.length, n);
    for (let i = 1; i < n; i++) assert.ok(starts[i] - starts[i - 1] >= GAP - 1e-6, `lines ${n}: ${starts[i] - starts[i - 1]} < ${GAP}`);
  }
});

const CHAIN = readFileSync(new URL('./fixtures/table-chain.muto', import.meta.url), 'utf8');

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 경로 점 수
// basis: estimate
const lengthOf = (edge) => edge.points.slice(1).reduce((total, point, i) => total + Math.abs(point.x - edge.points[i].x) + Math.abs(point.y - edge.points[i].y), 0);

// 근거: 설계 layout.md 요구사항 "폭을 넘는 열 선 사슬이 세로로 쌓이고 선 길이 합이 줄 바꿈의 절반 아래"
test('buildFigure_table_chain_wider_than_the_canvas_stacks_vertically_without_a_snake_edge', async () => {
  const { scene } = await buildFigure(CHAIN);
  const wrapped = await buildFigure(CHAIN.replace('data right\n', 'data right\naspect 1.6\n'));
  const total = (figure) => figure.scene.edges.reduce((sum, edge) => sum + lengthOf(edge), 0);

  assert.ok(scene.width <= CANVAS, `width ${scene.width}`);
  assert.ok(Math.max(...scene.edges.map(lengthOf)) < CANVAS / 2);
  assert.ok(total({ scene }) < total(wrapped) / 2, `${total({ scene })} vs ${total(wrapped)}`);
});

// 근거: 설계 layout.md 요구사항 "세로 그림의 열 선이 오른쪽 면 열 높이에 닿는다", 설계 figure-kinds.md "외래 키 선은 두 열의 행 높이에 붙는다"
test('buildFigure_table_column_edges_of_a_stack_leave_and_enter_on_the_right_face_at_the_row', async () => {
  const { scene } = await buildFigure(CHAIN);

  for (const edge of scene.edges.filter((e) => e.fromColumn)) {
    const [from, to] = [item(scene, edge.from), item(scene, edge.to)];
    assert.equal(Math.round(edge.points[0].x), Math.round(from.x + from.w), `${edge.from} start`);
    assert.equal(Math.round(edge.points.at(-1).x), Math.round(to.x + to.w), `${edge.to} end`);
    assert.equal(Math.round(edge.points.at(-1).y), Math.round(to.y + to.rowH * (to.columns.findIndex((c) => c.name === edge.toColumn) + 1.5)));
  }
});

const QUIET = readFileSync(new URL('./fixtures/quiet-label-gap.muto', import.meta.url), 'utf8');

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 도형 수
// basis: estimate
// 위 도형 아래 끝에서 아래 도형 위 끝까지 거리
async function gaps(source) {
  const { scene } = await buildFigure(source);
  const gap = (upper, lower) => item(scene, lower).y - item(scene, upper).y - item(scene, upper).h;
  return { ab: gap('a', 'b'), bc: gap('b', 'c'), cd: gap('c', 'd'), scene };
}

// 근거: 설계 layout.md 요구사항 "세로 층의 quiet 선은 층 간격을 늘리지 않는다(라벨 없는 선과 같다)", 버그 #20 "숨은 선 때문에 층 사이가 벌어짐"
test('buildFigure_quiet_edge_label_does_not_widen_the_layer_gap_but_a_visible_label_does', async () => {
  const quiet = await gaps(QUIET);
  const bare = await gaps(QUIET.replace('"L1 실패" quiet', 'quiet'));
  const visible = await gaps(QUIET.replace('"L1 실패" quiet', '"L1 실패"'));
  const noVisibleLabel = await gaps(QUIET.replace('a -> b "VA"', 'a -> b'));

  assert.equal(quiet.cd, bare.cd);
  assert.ok(quiet.cd <= Math.min(quiet.ab, quiet.bc), `quiet gap ${quiet.cd} > visible gaps ${quiet.ab}, ${quiet.bc}`);
  assert.ok(quiet.cd < visible.cd && quiet.scene.height < visible.scene.height);
  assert.ok(quiet.ab > noVisibleLabel.ab, '보이는 선 라벨은 간격을 넓힌다');
});

// 근거: 설계 layout.md 요구사항 "세로 층의 quiet 선은 라벨이 선 옆에 있다", 버그 #20
test('buildFigure_quiet_edge_label_sits_beside_the_line_between_the_two_boxes', async () => {
  const { scene } = await gaps(QUIET);
  const quiet = scene.edges.find((edge) => edge.quiet);

  assert.ok(quiet.labelAt.y > item(scene, 'c').y + item(scene, 'c').h && quiet.labelAt.y < item(scene, 'd').y, 'the label sits between the two boxes');
  assert.notEqual(quiet.labelAt.x, quiet.points[0].x, 'the label sits beside the line, not on it');
});

// 근거: 설계 layout.md 요구사항 "가로 층의 quiet 선은 보이는 선과 같은 폭이다"
test('buildFigure_quiet_edge_in_a_row_keeps_its_label_on_the_line_and_the_figure_width', async () => {
  const row = QUIET.replace('flow down', 'flow right');
  const quiet = await gaps(row);
  const visible = await gaps(row.replace('"L1 실패" quiet', '"L1 실패"'));
  const edge = quiet.scene.edges.find((e) => e.quiet);

  assert.ok(edge.labelAt.x > item(quiet.scene, 'c').x + item(quiet.scene, 'c').w && edge.labelAt.x < item(quiet.scene, 'd').x, 'the label sits in the gap between the two boxes');
  assert.equal(quiet.scene.width, visible.scene.width);
});

// 근거: 설계 layout.md 요구사항 "그 간격에서 이동 글 상자가 알약을 가리지 않는다", 버그 #20
test('buildFigure_quiet_edge_gap_holds_the_pill_and_a_moving_text_without_covering_each_other', async () => {
  const { warnings } = await buildFigure(QUIET.replace('  c -> d\n', '  c -> d "블록 요청 PA 0xA1B2678"\n'), { strict: true });

  assert.deepEqual(warnings, []);
});

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// cost: time O(n·e·p), heap O(n), stack O(1)
// vars: n = 메모 수, e = 같은 행 선 수, p = 경로 점 수
// basis: estimate
// 메모 상자와, 같은 행 화살표(선 두께 포함)와 라벨 알약이 닿는 쌍. 간격은 CHIP_CLEAR를 지킨다.
function collisions(scene) {
  const hits = [];
  for (const note of scene.notes) {
    const padded = { x: note.x - CHIP_CLEAR, y: note.y - CHIP_CLEAR, w: note.w + CHIP_CLEAR * 2, h: note.h + CHIP_CLEAR * 2 };
    for (const edge of scene.edges.filter((e) => e.index === note.m)) {
      const pill = sizePill(edge.label);
      if (overlaps(padded, { x: edge.labelAt.x - pill.w / 2, y: edge.labelAt.y - pill.h / 2, w: pill.w, h: pill.h })) hits.push(`${note.text} / label ${edge.label}`);
      const xs = edge.points.map((p) => p.x);
      const ys = edge.points.map((p) => p.y);
      if (overlaps(padded, { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) })) hits.push(`${note.text} / arrow ${edge.from} -> ${edge.to}`);
    }
  }
  return hits;
}

const sequenceSources = () =>
  [EXAMPLES, FIXTURES, COMPAT].flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.muto')).map((f) => ({ file: f, source: readFileSync(new URL(f, dir), 'utf8') }))).filter(({ source }) => /^sequence\b/m.test(source.replace(/^mutoscope.*\n/, '')));

const NOTE_CASES = [
  { name: '보내는 쪽 메모는 라벨 위에 쌓인다', source: ['sequence', 'box a "호출"', 'box b "응답"', 'step "s" "c"', '  a -> b "긴 요청 라벨이 있는 메시지"', '  note a "보내는 쪽 메모가 화살표 위를 지나간다"', ''].join('\n'), expect: (scene) => assert.ok(scene.notes[0].y + scene.notes[0].h < scene.edges[0].labelAt.y, '메모가 라벨 위에 있다') },
  { name: '받는 쪽 메모는 화살표와 한 행에 놓인다', source: ['sequence', 'box a "호출"', 'box b "응답"', 'step "s" "c"', '  a -> b "요청"', '  note b "받는 쪽 메모"', ''].join('\n'), expect: (scene) => assert.ok(scene.notes[0].y < scene.edges[0].points[0].y, '메모와 화살표가 같은 행에 놓인다') },
  { name: '첫 참여자의 자기 호출 메모는 그림 안에 든다', source: ['sequence', 'box a "A"', 'box b "B"', 'step "s"', '  a -> a "자기 호출"', '  note a "왼쪽 첫 참여자의 아주 긴 메모가 왼쪽으로 삐져나가는지 본다 이 글은 길다"', '  a -> b "요청"', ''].join('\n'), expect: (scene) => assert.ok(scene.notes[0].x >= 0) },
];

// 근거: 설계 layout.md 요구사항 "메모가 같은 행 화살표와 라벨을 가리지 않는다"
test('buildFigure_every_sequence_source_keeps_notes_clear_of_the_same_row_arrow_and_label', async () => {
  const sources = [...sequenceSources(), ...NOTE_CASES.map(({ name, source }) => ({ file: name, source }))];

  assert.ok(sources.length >= 5, `순서 그림 ${sources.length}개`);
  for (const { file, source } of sources) {
    const { scene } = await buildFigure(source, { strict: true });

    assert.deepEqual(collisions(scene), [], file);
    NOTE_CASES.find((c) => c.name === file)?.expect(scene);
  }
});

const STATE_SOURCE = ['state right', 'state a "A"', 'state b "B"', 'state c "C"', 'start a', 'final c', 'a -> b "go"', 'b -> c "end"', 'step "s"', '  a -> b', '  b -> c', ''].join('\n');

// cost: time O(b·h), heap O(b), stack O(1)
// vars: b = 박자 수, h = 박자의 이동 수
// basis: estimate
// 박자마다 이동 줄의 양 끝과 그 이동이 밝히는 선(edgesOn)의 장면 선 끝이 같은지 보고, 어긋난 곳의 설명을 모은다.
function mismatches({ figure, scene, timeline }) {
  const found = [];
  const beats = figure.steps.flatMap((step) => step.beats).filter((beat) => beat.hops.length);
  let k = 0;
  for (const seg of timeline.segs) {
    if (!seg.hops.length) continue;
    const beat = beats[k++];
    beat.hops.forEach((hop, h) => {
      const edge = scene.edges[seg.hops[h].edge];
      const ends = new Set([edge.from, edge.to]);
      if (!ends.has(hop.from) || !ends.has(hop.to)) found.push(`step ${seg.si} beat ${seg.bi}: ${hop.from} -> ${hop.to} lights ${edge.from} -> ${edge.to}`);
      if (!seg.edgesOn.includes(seg.hops[h].edge)) found.push(`step ${seg.si} beat ${seg.bi}: edge ${seg.hops[h].edge} is not on`);
    });
  }
  return found;
}

// 근거: 설계 layout.md 요구사항 "상태 그림이 밝히는 선이 이동 줄과 같다"와 선 번호 절 "처음 점과 끝 겹원 선은 원본의 선 뒤에 놓인다"(하이라이트 밀림 버그)
test('buildFigure_state_figures_light_the_edges_their_move_lines_name', async () => {
  const built = await buildFigure(STATE_SOURCE, { strict: true });
  let checked = 0;
  for (const dir of [EXAMPLES, COMPAT, FIXTURES]) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.muto'))) {
      const source = readFileSync(new URL(file, dir), 'utf8');
      if (!/^state\b/m.test(source.replace(/^mutoscope.*\n/, ''))) continue;
      assert.deepEqual(mismatches(await buildFigure(source, { baseDir: dir.pathname })), [], file);
      checked += 1;
    }
  }

  assert.deepEqual(mismatches(built), []);
  assert.deepEqual(built.timeline.segs.map((seg) => seg.edgesOn), [[0], [0, 1]]);
  assert.deepEqual(built.scene.edges.map((e) => `${e.from}>${e.to}`), ['a>b', 'b>c', '__start>a', 'c>__final0']);
  assert.ok(checked >= 3, `상태 그림 ${checked}개`);
});
