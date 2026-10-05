// 흐름 조건과 대기(`when`, `wait`, `timeout`, `else`, `stuck`)의 시간표 계산, 진단, 예산, 호환(docs/design/playback.md 이벤트 순서, 조건과 대기, 대기가 끝나는 때, 이벤트 예산).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { engineStats } from '../src/flow-events.js';
import { runCli, withFolder } from './helpers.js';

const EXAMPLES = new URL('../examples/', import.meta.url);
const V1 = new URL('./fixtures/compat/v1/', import.meta.url);
// 값 셋(숫자 둘, 낱말 하나). 선: a->b, b->a, a->c, b->c, a->db. 단계는 14번째 줄부터 붙인다.
const BASE = 'flow right\nbox a "A"\nbox b "B"\nbox c "C"\nstore db "DB"\nvalue n "수" on=a\nvalue m "수" on=b\nvalue holder "쥔 쪽" on=c from=none\na -> b\nb -> a\na -> c\nb -> c\na -> db\n';
const LINES = BASE.split('\n').length - 1;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
// 만들기가 오류로 끝나면 그 진단 목록 { code, line, message }, 아니면 빈 목록이다.
async function errorsOf(source, options) {
  try {
    await buildFigure(source, options);
    return [];
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems.map(({ code, line, message }) => ({ code, line, message }));
  }
}

// 값 줄 가운데 id와 단계가 맞는 것의 변화 [시각, 글] 목록
const changesOf = (timeline, id, si = 0) => timeline.values.find((row) => row.id === id && row.si === si).changes;
// 단계 si의 박자 구간 목록
const segsOf = (timeline, si = 0) => timeline.segs.filter((seg) => seg.si === si);
// 같은 시각에 시간표에서 이동의 도착 도형만 뽑은 목록
const targetsOf = (seg) => seg.hops.map((hop) => hop.to);

// ---- 건너뛰기(when) ----

// 근거: 계약 "when이 거짓인 이동은 점, 선 켜짐, 값, 도착 효과 없이 건너뛴다", 설계 playback.md 조건과 대기 "건너뛴 이동은 skips에 줄 번호, 시각과 함께 남는다"
test('buildFigure_when_false_move_makes_no_dot_no_lit_edge_no_value_and_no_arrival_effect_and_is_listed_in_skips', async () => {
  const { timeline } = await buildFigure(`${BASE}step "s"\n  a -> b time=1s when="n=1" set="m=5" & a -> c time=1s when="n=0" set="holder=X"\n`);
  const [seg] = timeline.segs;

  assert.deepEqual(seg.hops.map((hop) => [hop.to, hop.ms]), [['c', 1000]], '참인 이동 하나만 점이 된다');
  assert.deepEqual(timeline.skips, [{ si: 0, line: LINES + 2, node: 'a', cond: 'n=1', t: 0 }]);
  assert.deepEqual(changesOf(timeline, 'm'), [], '건너뛴 이동의 set=는 적용하지 않는다');
  assert.deepEqual(changesOf(timeline, 'holder'), [[1000, 'X']]);
  assert.equal(seg.edgesOn.length, 1, '건너뛴 선은 켜지지 않는다');
  assert.equal(seg.move, 1000);
});

// 근거: 계약 "건너뛴 이동도 박자와 단계가 사라지지 않는다", 설계 "이동이 하나도 남지 않은 박자는 점 없이 멈추는 박자로 남는다"
test('buildFigure_a_beat_whose_moves_are_all_skipped_stays_as_a_beat_without_dots_and_the_step_keeps_its_beat_count', async () => {
  const plain = await buildFigure(`${BASE}step "s"\n  a -> b time=1s\n  say "다음"\nstep "t"\n  a -> c time=1s\n`);
  const skipped = await buildFigure(`${BASE}step "s"\n  a -> b time=1s when="n=1"\n  say "다음"\nstep "t"\n  a -> c time=1s when="n=1"\n`);

  assert.equal(skipped.timeline.segs.length, plain.timeline.segs.length);
  assert.deepEqual(skipped.timeline.segs.map((s) => [s.si, s.bi]), plain.timeline.segs.map((s) => [s.si, s.bi]));
  assert.ok(skipped.timeline.segs.every((seg) => seg.hops.length === 0 && seg.move === 0 && seg.edgesOn.length === 0));
  assert.equal(skipped.timeline.skips.length, 2);
  assert.equal(skipped.timeline.steps.length, 2, '단계도 남는다');
  assert.ok(skipped.timeline.segs.every((seg) => seg.t1 > seg.t0), '점 없이 멈추는 박자도 시간이 있다');
});

// 근거: 계약 "when은 wait가 풀린 뒤 실행 직전에 한 번 평가한다", 설계 figure-syntax.md "한 줄에 wait와 when이 함께 있으면 wait가 풀린 뒤에 when을 평가한다"
test('buildFigure_when_is_evaluated_once_right_after_the_wait_is_released_and_sees_the_values_of_that_moment', async () => {
  // A가 1초에 holder를 none으로 풀고 n을 1로 올린다. B의 when은 시작할 때(n=0)는 참이지만 풀린 시각(n=1)에는 거짓이다.
  const source = `${BASE}step "s"\n  a -> c time=1s set="holder=A"\nstep "t" keep="holder"\n  a -> c time=1s set="holder=none, n=1" & b -> c time=1s wait="holder='none'" when="n=0" set="holder=B"\n`;
  const { timeline } = await buildFigure(source);
  const [beat] = segsOf(timeline, 1);

  assert.deepEqual(timeline.waits.map(({ end, t0, t1 }) => [end, t1 - t0]), [['released', 1000]]);
  assert.equal(timeline.skips.length, 1, '풀린 직후 when이 거짓이라 건너뛴다');
  assert.equal(timeline.skips[0].t, timeline.waits[0].t1);
  assert.deepEqual(beat.hops.map((hop) => hop.to), ['c'], '점은 A의 이동 하나뿐이다');
  assert.deepEqual(changesOf(timeline, 'holder', 1).map(([, text]) => text), ['none'], 'B의 set=는 적용하지 않는다');
});

// 근거: 계약 "흐름의 출발 수 계산에는 들어간다", 설계 playback.md 조건과 대기 "흐름의 출발은 조건이 거짓이면 점을 만들지 않지만 출발 수 계산에는 들어간다"
test('buildFigure_a_track_departure_with_a_false_when_makes_no_dot_but_still_counts_as_a_departure', async () => {
  const { timeline } = await buildFigure(`${BASE}step "s" for=6s\n  track a -> b "요청" every=1s time=500ms when="n=0" set="n+1@b"\n  track b -> c "확인" at=2500ms time=500ms\n`);
  // 첫 흐름은 출발 6번. 도착으로 n이 올라 두 번째 출발부터 when이 거짓이 된다(출발 6개가 모두 센다).
  const dots = timeline.segs[0].hops.filter((hop) => hop.track === 0);

  assert.equal(dots.length + timeline.skips.length, 6);
  assert.deepEqual(timeline.skips.map((s) => s.t), [1000, 2000, 3000, 4000, 5000]);
  assert.deepEqual(dots.map((hop) => hop.at), [0]);
  assert.deepEqual(timeline.skips.map((s) => s.line), Array(5).fill(LINES + 2));
});

// ---- 대기(wait) ----

// 근거: 이슈 #119 완료 조건 "기다리던 작업이 해제 시각에 출발하고 쥔 쪽 값이 바뀐다", 설계 playback.md 조건과 대기 "참조한 값이 바뀔 때마다 다시 평가하고, 참이 되면 풀려서 그 시각에 출발한다"
test('buildFigure_a_wait_releases_at_the_arrival_that_makes_it_true_and_the_dot_leaves_then_with_the_holder_changing', async () => {
  const source = `${BASE}step "A가 쥔다"\n  a -> c time=1s set="holder=A"\nstep "B가 기다린다" keep="holder"\n  a -> c time=1s set="holder=none" & b -> c time=2s wait="holder='none'" set="holder=B"\n`;
  const { timeline } = await buildFigure(source);
  const [beat] = segsOf(timeline, 1);
  const waiter = beat.hops.find((hop) => hop.ms === 2000);

  assert.deepEqual(timeline.waits, [{ si: 1, line: LINES + 4, node: 'b', cond: "holder='none'", t0: beat.t0, t1: beat.t0 + 1000, end: 'released' }]);
  assert.equal(waiter.at, 1000, '풀린 시각(박자 시작 뒤 1초)에 출발한다');
  assert.equal(beat.move, 3000, '미룬 출발은 박자 길이에 들어간다');
  assert.deepEqual(changesOf(timeline, 'holder', 1).map(([t, text]) => [t - beat.t0, text]), [[1000, 'none'], [3000, 'B']]);
  assert.equal(timeline.values.find((row) => row.id === 'holder' && row.si === 1).initial, 'A');
  assert.equal(beat.hops.find((hop) => hop.ms === 1000).at, undefined, '기다리지 않은 점은 at이 없다');
});

// 근거: 설계 playback.md 조건과 대기 "처음 평가에서 참이라 기다리지 않은 점은 담지 않는다"
test('buildFigure_a_wait_that_is_true_at_the_first_evaluation_leaves_at_once_and_is_not_listed_in_waits', async () => {
  const { timeline } = await buildFigure(`${BASE}step "s"\n  b -> c time=1s wait="holder='none'"\n`);

  assert.deepEqual(timeline.waits, []);
  assert.equal(timeline.segs[0].hops[0].at, undefined);
  assert.equal(timeline.segs[0].move, 1000);
});

// 근거: 이슈 #119 완료 조건 "같은 시각의 대기 해제 연쇄가 선언 순서로 풀린다", 설계 playback.md 이벤트 순서 "풀린 대기의 실행: 대기 줄의 선언 순서"
test('buildFigure_waits_released_by_one_update_start_in_declaration_order_and_not_in_edge_or_node_order', async () => {
  const make = (first, second) => `${BASE}step "s"\n  a -> c time=1s set="holder=go" & ${first} time=1s wait="holder='go'" & ${second} time=2s wait="holder='go'"\n`;
  const forward = await buildFigure(make('b -> c', 'a -> db'));
  const swapped = await buildFigure(make('a -> db', 'b -> c'));
  const order = ({ timeline }) => timeline.segs[0].hops.filter((hop) => hop.at > 0).map((hop) => [hop.to, hop.at]);

  assert.deepEqual(forward.timeline.waits.map((w) => [w.node, w.end, w.t1 - w.t0]), [['b', 'released', 1000], ['a', 'released', 1000]]);
  assert.deepEqual(order(forward), [['c', 1000], ['db', 1000]], '같은 시각이면 줄 순서로 출발한다');
  assert.deepEqual(swapped.timeline.waits.map((w) => w.node), ['a', 'b'], '줄 순서를 바꾸면 해제 순서도 바뀐다');
  assert.deepEqual(order(swapped), [['db', 1000], ['c', 1000]]);
});

// 근거: 설계 playback.md 이벤트 순서 표 "순위 3 풀린 대기의 실행이 순위 4 이 시각에 출발하는 점의 실행보다 앞", 계약 "한 갱신에서 풀린 대기와 첫 평가에서 참인 출발의 순서가 설계 표를 따른다"
test('buildFigure_a_released_wait_runs_before_a_departure_that_starts_at_the_same_moment_even_if_declared_later', async () => {
  // 2초에 같은 시각 일: (1) 설정 흐름의 도착이 holder를 go로 바꿔 B(뒤에 선언)의 wait가 풀린다 (2) A(앞에 선언)의 출발이 2초에 시작한다. 둘 다 when이 거짓이라 skips의 차례가 처리 차례다.
  const source = `${BASE}step "s" for=6s\n  track a -> b at=2s time=500ms when="n=99"\n  track b -> a at=0s time=500ms wait="holder='go'" when="n=99"\n  track a -> c at=1s time=1s set="holder=go"\n`;
  const { timeline } = await buildFigure(source);

  assert.deepEqual(timeline.skips.map((s) => [s.line, s.t]), [[LINES + 3, 2000], [LINES + 2, 2000]], '풀린 대기(뒤 줄)가 같은 시각 출발(앞 줄)보다 먼저다');
  assert.deepEqual(timeline.waits.map((w) => [w.end, w.t0, w.t1]), [['released', 0, 2000]]);
});

// 근거: 설계 playback.md 이벤트 순서 표 "순위 1 on 갱신, 순위 2 set= 갱신, 같은 순위 안의 순서", 한 갱신 하나는 읽기 뒤 쓰기
test('buildFigure_in_a_conditional_step_the_on_line_updates_before_set_and_a_read_set_sees_it', async () => {
  const { timeline } = await buildFigure(`${BASE}on c n+1\nstep "s"\n  a -> c time=1s wait="n>=0" set="m:=n"\n`);

  assert.deepEqual(changesOf(timeline, 'n'), [[1000, '1']]);
  assert.deepEqual(changesOf(timeline, 'm'), [[1000, '1']], 'on 줄이 먼저 n을 올리고 읽기가 그 값을 본다');
});

// 근거: 설계 playback.md 이벤트 순서 "한 갱신 하나는 읽기, 쓰기 순서" — set="a:=b, b:=a"는 값을 맞바꾼다(조건을 쓴 단계에서도)
test('buildFigure_in_a_conditional_step_a_swap_set_exchanges_two_values', async () => {
  const { timeline } = await buildFigure(`${BASE}step "s"\n  a -> c time=1s set="n=3, m=9"\nstep "t" keep="n, m"\n  a -> c time=1s wait="n>=0" set="n:=m, m:=n"\n`);

  assert.deepEqual(changesOf(timeline, 'n', 1).map(([, text]) => text), ['9']);
  assert.deepEqual(changesOf(timeline, 'm', 1).map(([, text]) => text), ['3']);
});

// ---- 시간 초과(timeout, else) ----

// 근거: 이슈 #119 완료 조건 "timeout과 else가 정한 시각에 분기 이동을 출발하고, else가 없으면 점을 만들지 않는다", 설계 playback.md 대기가 끝나는 때
test('buildFigure_timeout_without_else_ends_the_wait_at_its_time_and_makes_no_dot', async () => {
  const { timeline } = await buildFigure(`${BASE}step "s"\n  b -> c time=1s wait="holder='go'" timeout=500ms & a -> db time=2s\n`);
  const [seg] = timeline.segs;

  assert.deepEqual(timeline.waits.map(({ end, t0, t1 }) => [end, t1 - t0]), [['timeout', 500]]);
  assert.deepEqual(targetsOf(seg), ['db'], '점이 하나도 생기지 않는다');
  assert.equal(seg.edgesOn.length, 1);
  assert.deepEqual(timeline.stalls, []);
});

// 근거: 계약 "timeout과 else 분기가 정한 시각에 분기 이동을 출발한다", 설계 figure-syntax.md "else 이동은 글과 tone을 이어받고 시간은 선 길이로 정하며 set, lost, when, wait, legs는 이어받지 않는다"
test('buildFigure_timeout_with_else_sends_a_branch_dot_from_the_waiting_shape_to_the_else_shape_at_the_timeout_time', async () => {
  const { timeline } = await buildFigure(`${BASE}on a n+1\nstep "s"\n  b -> c "요청" tone=purple time=1s wait="holder='go'" timeout=500ms else=a set="holder=B" lost=50%\n`);
  const [seg] = timeline.segs;
  const [branch] = seg.hops;

  assert.deepEqual(timeline.waits.map(({ end, t0, t1 }) => [end, t1 - t0]), [['timeout', 500]]);
  assert.equal(seg.hops.length, 1);
  assert.equal(branch.at, 500, '시간 초과 시각에 출발한다');
  assert.equal(branch.to, 'a');
  assert.equal(branch.tone, 'purple', '색을 이어받는다');
  assert.ok(branch.data, '글을 이어받는다');
  assert.equal(branch.cut, undefined, 'lost를 이어받지 않는다');
  assert.notEqual(branch.ms, 1000, '시간은 선 길이로 정한다(time=을 이어받지 않는다)');
  assert.deepEqual(changesOf(timeline, 'holder'), [], 'set=를 이어받지 않는다');
  assert.deepEqual(changesOf(timeline, 'n'), [[seg.t0 + 500 + branch.ms, '1']], '분기 도착에는 on 줄이 적용된다');
  assert.equal(seg.move, 500 + branch.ms);
});

// 근거: 설계 playback.md 대기가 끝나는 때 "같은 시각에 풀림과 시간 초과가 겹치면 풀림이 이긴다(참이 되면 풀린다)"
test('buildFigure_a_release_at_exactly_the_timeout_time_wins_over_the_timeout', async () => {
  const { timeline } = await buildFigure(`${BASE}step "s"\n  a -> c time=1s set="holder=go" & b -> c time=1s wait="holder='go'" timeout=1s else=a\n`);

  assert.deepEqual(timeline.waits.map(({ end }) => end), ['released']);
  assert.deepEqual(timeline.segs[0].hops.map((hop) => hop.to).sort(), ['c', 'c']);
});

// 근거: 계약 "timeout과 else 분기가 정한 시각에 분기 이동을 출발한다" — 흐름 줄(출발지마다)
test('buildFigure_a_track_departure_that_times_out_sends_a_branch_dot_from_its_source_to_the_else_shape', async () => {
  const { timeline } = await buildFigure(`${BASE}step "s" for=6s\n  track b -> c "요청" at=1s time=1s wait="holder='go'" timeout=1500ms else=a\n`);
  const hops = timeline.segs[0].hops;
  const branch = hops.find((hop) => hop.track === undefined);

  assert.deepEqual(timeline.waits.map(({ end, t0, t1 }) => [end, t0, t1 - t0]), [['timeout', timeline.segs[0].t0 + 1000, 1500]]);
  assert.equal(hops.filter((hop) => hop.track !== undefined).length, 0, '원래 경로의 점은 없다');
  assert.equal(branch.at, 2500);
  assert.equal(branch.to, 'a');
  assert.ok(Object.keys(timeline.segs[0].edgesAt).length === 1 && branch.edge in timeline.segs[0].edgesAt, '분기 선은 점이 닿을 때 켜진다');
});

// ---- 끝나지 않는 대기 ----

// 근거: 이슈 #119 완료 조건 "해제되지 않는 교착이 stalls와 wait-stalled로 설명된다. 대기 중인 도형과 조건, 읽은 값의 글과 마지막으로 쓴 줄이 시간표와 경고 메시지에 있다"
test('buildFigure_a_deadlock_is_listed_in_stalls_with_each_read_value_and_its_last_writer_and_warns_wait_stalled', async () => {
  const source = `${BASE}value h1 "가" on=a from=none\nvalue h2 "나" on=b from=none\nstep "쥔다"\n  a -> c time=1s set="h1=t1" & b -> c time=1s set="h2=t2"\nstep "요청" keep="h1, h2"\n  a -> c time=1s wait="h2='none'" & b -> c time=1s wait="h1='none'"\n`;
  const { timeline, warnings } = await buildFigure(source);
  const base = LINES + 2;

  assert.deepEqual(timeline.waits.map(({ node, end }) => [node, end]), [['a', 'stalled'], ['b', 'stalled']]);
  assert.deepEqual(timeline.stalls.map(({ node, cond, line }) => [node, cond, line]), [['a', "h2='none'", base + 4], ['b', "h1='none'", base + 4]]);
  const [first] = timeline.stalls;
  const claim = first.refs.find((ref) => ref.id === 'h2');

  assert.equal(claim.text, 't2');
  assert.equal(claim.line, base + 2, '마지막으로 쓴 줄은 앞 단계의 set=가 있는 줄이다');
  assert.equal(claim.at, timeline.segs[0].t0 + 1000);
  assert.equal(first.t, segsOf(timeline, 1)[0].t0, '더 처리할 이벤트가 없어 멈춘 시각이다');
  const messages = warnings.filter((w) => w.code === 'wait-stalled');

  assert.equal(messages.length, 2);
  assert.equal(messages[0].line, base + 4);
  assert.match(messages[0].message, /wait on "a -> c" can never be released: h2='none' is false because h2 is "t2" \(set by line \d+ at \d+ms\)\. Add timeout=, or mark the wait with stuck if it is intended/);
  assert.equal(segsOf(timeline, 1)[0].hops.length, 0, '점 없이 멈추는 박자로 남는다');
});

// 근거: 계약 "끝나지 않는 대기는 경고 wait-stalled(stuck이면 경고 없음)", 설계 "stuck이 있는 대기는 경고를 내지 않고 stalls에는 똑같이 남는다"
test('buildFigure_stuck_removes_the_wait_stalled_warning_and_keeps_the_stall_in_the_timeline', async () => {
  const body = (word) => `${BASE}step "s"\n  b -> c time=1s wait="holder='go'"${word}\n`;
  const plain = await buildFigure(body(''));
  const stuck = await buildFigure(body(' stuck'));

  assert.equal(plain.warnings.filter((w) => w.code === 'wait-stalled').length, 1);
  assert.equal(stuck.warnings.filter((w) => w.code === 'wait-stalled').length, 0);
  assert.deepEqual(stuck.timeline.stalls.map(({ node, cond }) => [node, cond]), plain.timeline.stalls.map(({ node, cond }) => [node, cond]));
  assert.equal(stuck.timeline.stalls[0].stuck, true);
  assert.match(plain.warnings[0].message, /h?older is "none" \(declared on line \d+\)/, '쓴 적 없는 값은 선언 줄을 알린다');
});

// 근거: 설계 playback.md 대기가 끝나는 때 표 "step-end: 거짓인 채 처리할 이벤트가 남은 상태로 단계 끝 — 점 없음, 경고 없음", "stalled: 처리할 이벤트가 하나도 없음"
test('buildFigure_a_wait_that_is_still_false_when_events_remain_at_the_step_end_ends_as_step_end_without_a_warning', async () => {
  const alone = await buildFigure(`${BASE}step "s" for=3s\n  track b -> c every=1s time=100ms wait="holder='go'"\n`);
  const busy = await buildFigure(`${BASE}step "s" for=3s\n  track b -> c every=1s time=100ms wait="holder='go'"\n  track a -> db at=2s time=2s\n`);

  assert.deepEqual(alone.timeline.waits.map(({ end }) => end), ['stalled', 'stalled', 'stalled'], '남은 이벤트가 없으면 멈춘 대기다');
  assert.equal(alone.warnings.filter((w) => w.code === 'wait-stalled').length, 1, '같은 줄의 같은 경고는 한 번이다');
  assert.deepEqual(busy.timeline.waits.map(({ end }) => end), ['step-end', 'step-end', 'step-end'], '도착이 단계 끝 뒤에 남아 있으면 단계 끝이다');
  assert.deepEqual(busy.timeline.stalls, []);
  assert.equal(busy.warnings.filter((w) => w.code === 'wait-stalled').length, 0);
  assert.ok(busy.timeline.waits.every((w) => w.t1 === busy.timeline.segs[0].t0 + 3000));
});

// ---- 검사 14번 ----

// 근거: 이슈 #119 완료 조건 "그림 검사 14번의 점 0개 오류는 when/wait가 있는 흐름에 적용하지 않는다"
test('buildFigure_check_14_does_not_report_a_flow_with_when_or_wait_that_draws_no_dot_and_still_reports_one_without', async () => {
  const track = (options) => `${BASE}step "s" for=4s\n  track a -> b at=8s ${options}\n`;
  const errorOf = async (options) => (await errorsOf(track(options))).filter((e) => e.code === 'check-14');

  assert.equal((await errorOf('')).length, 1, 'when도 wait도 lost도 없는 흐름은 오류');
  assert.equal((await errorOf('when="n=0"')).length, 0);
  assert.equal((await errorOf('wait="n=0"')).length, 0);
  const idle = await buildFigure(`${BASE}step "s" for=4s\n  track a -> b time=1s when="n=1"\n  track a -> c time=1s\n`);

  assert.equal(idle.warnings.filter((w) => w.code === 'check-14').length, 0, '점이 하나도 없는 when 흐름은 오류도 경고도 아니다');
  assert.equal(idle.timeline.skips.length, 1);
});

// ---- 진단 ----

// 근거: 계약 "없는 값과 조건 문법 오류는 syntax, 숫자와 낱말 비교는 value-type", 설계 figure-syntax.md 조건과 대기 "timeout, else, stuck을 wait 없이 쓰거나 else를 timeout 없이 쓰면 오류다"
test('buildFigure_reports_condition_syntax_errors_with_the_line_and_the_runtime_type_error_as_value_type', async () => {
  const cases = [
    { name: 'unknown_value', body: 'a -> b when="nn=1"', code: 'syntax', message: /unknown value "nn"\. Did you mean "n"\?/ },
    { name: 'broken_condition', body: 'a -> b when="n=1 &&"', code: 'syntax', message: /is not a condition: expected a value name/ },
    { name: 'javascript', body: 'a -> b when="process.exit()"', code: 'syntax', message: /is not a condition/ },
    { name: 'ordered_word', body: "a -> b when=\"holder<'x'\"", code: 'syntax', message: /< compares numbers/ },
    { name: 'two_literals', body: 'a -> b when="1=1"', code: 'syntax', message: /needs a value name on at least one side/ },
    { name: 'too_long', body: `a -> b when="${'n=1 || '.repeat(30)}n=1"`, code: 'syntax', message: /at most 200 characters/ },
    { name: 'timeout_without_wait', body: 'a -> b timeout=1s', code: 'syntax', message: /timeout goes with wait/ },
    { name: 'stuck_without_wait', body: 'a -> b stuck', code: 'syntax', message: /stuck goes with wait/ },
    { name: 'else_without_timeout', body: 'a -> b wait="n=1" else=c', code: 'syntax', message: /else is where a wait goes when timeout passes/ },
    { name: 'else_unknown_node', body: 'a -> b wait="n=1" timeout=1s else=zz', code: 'syntax', message: /unknown node "zz"/ },
    { name: 'else_without_an_edge', body: 'a -> b wait="n=1" timeout=1s else=db2', code: 'syntax', message: /unknown node "db2"/ },
    { name: 'bad_timeout', body: 'a -> b wait="n=1" timeout=soon', code: 'syntax', message: /timeout is a positive time/ },
    { name: 'twice', body: 'a -> b when="n=1" when="n=2"', code: 'syntax', message: /"when" is written twice/ },
    { name: 'type_at_run_time', body: "a -> b when=\"n='x'\"", code: 'value-type', message: /"n" holds 0, but 'x' is a word/ },
    { name: 'word_against_number', body: 'a -> b wait="holder=1"', code: 'value-type', message: /"holder" holds the word "none", but 1 is a number/ },
  ];

  for (const { name, body, code, message } of cases) {
    const found = await errorsOf(`${BASE}step "s"\n  ${body}\n`);

    assert.ok(found.length >= 1, name);
    assert.equal(found[0].code, code, name);
    assert.equal(found[0].line, LINES + 2, name);
    assert.match(found[0].message, message, name);
  }
});

// 근거: 설계 figure-syntax.md 조건과 대기 "구조 그림(flow)의 박자 이동과 흐름에서만 쓴다"
test('buildFigure_conditions_belong_to_flow_figures_only', async () => {
  for (const kind of ['sequence', 'state', 'data']) {
    const source = {
      sequence: 'sequence\nperson a "A"\nperson b "B"\nstep "s"\n  a -> b "x" when="n=1"\n',
      state: 'state\nstate a "A"\nstate b "B"\nstep "s"\n  a -> b when="n=1"\n',
      data: 'data\ntable a {\n  id int pk\n}\ntable b {\n  id int pk\n}\nstep "s"\n  a -> b when="n=1"\n',
    }[kind];
    const found = await errorsOf(source);

    assert.ok(found.some((e) => /belongs to flow figures only/.test(e.message)), kind);
  }
});

// ---- 시간 상한 ----

// 근거: 이슈 #119 완료 조건 "대기로 단계 길이나 전체 시간이 1시간 상한을 넘으면 time-limit으로 끝난다", 설계 playback.md 대기가 끝나는 때 "대기가 단계를 넘지 않으므로 시간 상한도 그대로 적용된다"
test('buildFigure_a_wait_that_pushes_a_step_over_one_hour_ends_with_time_limit_and_a_shorter_one_passes', async () => {
  const make = (timeout) => `${BASE}step "s"\n  b -> c time=1s wait="holder='go'" timeout=${timeout} else=a\n`;

  assert.deepEqual(await errorsOf(make('1000s')), []);
  const over = await errorsOf(make('3599s'));

  assert.equal(over.length, 1);
  assert.equal(over[0].code, 'time-limit');
  assert.equal(over[0].line, LINES + 2);
  // 값 하나의 상한은 그대로다: 1시간은 통과하고 1ms 넘으면 time-limit
  assert.equal((await errorsOf(make('3600001ms')))[0].code, 'time-limit');
});

// 근거: 계약 "대기로 단계 길이나 전체 시간이 1시간 상한을 넘으면 time-limit" — 상한 경계: 대기가 만든 박자 길이가 정확히 1시간이면 통과하고 1ms 넘으면 오류
test('buildFigure_the_time_limit_boundary_holds_for_a_beat_stretched_by_a_wait', async () => {
  const probe = await buildFigure(`${BASE}step "s"\n  b -> c time=1s wait="holder='go'" timeout=1000s else=a\n`);
  const [seg] = probe.timeline.segs;
  const fixed = seg.t1 - seg.t0 - 1_000_000;
  const edge = (timeout) => `${BASE}step "s"\n  b -> c time=1s wait="holder='go'" timeout=${timeout}ms else=a\n`;

  assert.deepEqual(await errorsOf(edge(3_600_000 - fixed)), [], '박자 길이가 정확히 1시간');
  const over = await errorsOf(edge(3_600_000 - fixed + 1));

  assert.equal(over[0].code, 'time-limit');
  assert.equal(over[0].line, LINES + 2);
});

// ---- 이벤트 예산 ----

// 한 흐름 줄에서 출발 6개, 대기가 모두 평가·해제되는 원본
const BUSY = `${BASE}step "s" for=6s\n  track b -> c at=0s every=1s time=100ms wait="holder='go'"\n  track a -> c at=500ms time=100ms set="holder=go"\n`;

// 근거: 이슈 #119 완료 조건 "작은 events, chain을 주입한 시험", 설계 playback.md 이벤트 예산 "동적 이벤트는 추가하기 직전에 검사한다. 메시지는 예산 이름, 한도, 넘은 시점의 줄과 시각, 조정 방법을 알린다"
test('buildFigure_stops_a_dynamic_event_chain_with_budget_exceeded_when_the_events_budget_is_small_and_passes_when_it_is_raised', async () => {
  const baseline = (await buildFigure(BUSY)).timeline.events;
  const counted = 6 * 3 + 3;

  assert.ok(baseline > counted, '평가와 해제 같은 동적 이벤트가 문장으로 센 수보다 많다');
  for (let events = counted; events < baseline; events++) {
    const found = await errorsOf(BUSY, { budget: { events } });

    assert.equal(found.length, 1, `events=${events}`);
    assert.equal(found[0].code, 'budget-exceeded');
    assert.match(found[0].message, new RegExp(`passes the budget events=${events} at \\d+ms, counting events \\(`), '넘은 시각을 알린다');
    assert.match(found[0].message, new RegExp(`--budget events=${events * 2}`));
    assert.ok(found[0].line > LINES + 1, '넘은 이벤트를 만든 줄이다');
  }
  assert.deepEqual(await errorsOf(BUSY, { budget: { events: baseline } }), [], '올린 예산으로 같은 입력이 통과한다');
  assert.equal((await buildFigure(BUSY, { budget: { events: baseline } })).timeline.events, baseline);
});

// 대기 셋이 한 갱신으로 한 시각에 풀리는 원본
const HERD = `${BASE}step "s"\n  a -> c time=1s set="holder=go" & b -> c time=1s wait="holder='go'" & a -> db time=1s wait="holder='go'" & b -> a time=1s wait="holder='go'"\n`;

// 근거: 설계 playback.md 이벤트 예산 "한 시각의 이벤트도 같은 방식으로 chain에 센다"
test('buildFigure_chain_budget_counts_the_events_of_one_moment_and_ends_with_budget_exceeded', async () => {
  let lowest = 1;
  while ((await errorsOf(HERD, { budget: { chain: lowest } })).length) lowest++;
  const over = await errorsOf(HERD, { budget: { chain: lowest - 1 } });

  assert.ok(lowest > 3, '한 시각의 일이 여럿이다');
  assert.equal(over.length, 1);
  assert.equal(over[0].code, 'budget-exceeded');
  assert.match(over[0].message, new RegExp(`passes the budget chain=${lowest - 1} at \\d+ms, counting events at one moment`));
  assert.deepEqual(await errorsOf(HERD, { budget: { chain: 1_000_000 } }), []);
  assert.deepEqual(await errorsOf(HERD), [], '기본 한도 안이다');
});

// 근거: 설계 playback.md 이벤트 예산 "문장과 every로 개수가 정해지는 이벤트는 시간표를 만들기 전에 합계를 세어 막는다. 합계는 출발 수에 경로의 도형 수를 더한 값을 곱해 구하고 when으로 건너뛰는 출발도 센다"
test('buildFigure_counts_departures_before_building_the_timeline_and_refuses_over_the_events_budget', async () => {
  // 출발 6개 x (1 + 도형 2) = 18, 박자 이동 하나는 3. 한도가 18이면 통과하고 17이면 시간표를 만들기 전에 막는다.
  const source = `${BASE}step "s" for=6s\n  track a -> b every=1s time=100ms when="n=1"\nstep "t"\n  a -> c time=1s when="n=1"\n`;
  const total = 6 * 3 + 3;

  assert.deepEqual(await errorsOf(source, { budget: { events: total } }), []);
  const found = await errorsOf(source, { budget: { events: total - 1 } });

  assert.equal(found.length, 1);
  assert.equal(found[0].code, 'budget-exceeded');
  assert.equal(found[0].line, LINES + 4, '합계가 처음 한도를 넘는 줄에 붙는다');
  assert.match(found[0].message, new RegExp(`needs ${total} events \\(.*\\) counted from its departures, over the budget events=${total - 1}`));
  assert.match(found[0].message, new RegExp(`--budget events=${total}`));
  // 사전 검사는 시간표를 만들기 전에 막으므로 배치도 하지 않는다: 천억 번 출발도 빨리 끝난다
  const started = Date.now();
  const huge = await errorsOf(`${BASE}step "s" for=3600s\n  track a -> b every=0.001ms time=100ms when="n=1"\n`);

  assert.equal(huge[0].code, 'budget-exceeded');
  assert.ok(Date.now() - started < 5000, '제한 시간 안에 끝난다');
});

// 근거: 이슈 #119 완료 조건 "끝없는 연쇄와 과도한 생성은 제한된 시험 안에서 budget-exceeded로 끝나고, 불완전한 출력 파일을 남기지 않는다. 작은 events, chain을 주입한 시험의 종료 코드, 제한 시간, 파일 없음"
test('main_render_with_a_small_events_or_chain_budget_exits_with_budget_exceeded_and_writes_no_file', async () => {
  await withFolder(async (folder) => {
    const outDir = join(folder, 'out');
    const cases = [['busy', BUSY, 'events=3'], ['busy', BUSY, 'events=22'], ['herd', HERD, 'chain=2']];

    for (const [name, source, budget] of cases) {
      const file = join(folder, `${name}.dap`);
      writeFileSync(file, source);
      const started = Date.now();

      for (const command of [['render', file, '--out', outDir, '--html'], ['check', file], ['render', file, '--out', outDir, '--static']]) {
        const result = runCli([...command, '--budget', budget, '--json']);
        const lines = result.stdout.trim().split('\n').map((line) => JSON.parse(line));

        assert.equal(result.status, 1, `${command[0]} ${budget}`);
        assert.ok(lines.some((d) => d.code === 'budget-exceeded' && d.severity === 'error'), budget);
        assert.equal(existsSync(outDir), false, `${budget}: 결과 폴더도 파일도 없다`);
      }
      assert.ok(Date.now() - started < 30_000, '제한 시간 안에 끝난다');
    }
    const file = join(folder, 'busy.dap');
    const ok = runCli(['render', file, '--out', outDir, '--budget', 'events=23', '--budget', 'chain=5000']);

    assert.equal(ok.status, 0, ok.stderr);
    assert.ok(existsSync(join(outDir, 'busy.svg')), '예산을 올리면 같은 입력이 통과한다');
    assert.match(runCli(['render', file, '--budget', 'speed=3']).stderr, /unknown budget "speed"\. Names: .*events, chain/);
    assert.equal(runCli(['render', file, '--budget', 'events=0']).status, 2, '틀린 값은 사용법 오류다');
  });
});

// 근거: 이슈 #119 완료 조건 "예산 기본값을 정하고 --budget으로 조정된다"(이름이 공통 예산 모듈에 있고 기본값이 정해져 있다)
test('BUDGETS_has_the_event_budgets_with_the_measured_defaults', async () => {
  const { BUDGETS, BUDGET_NAMES, resolveBudget } = await import('../src/budget.js');

  assert.ok(BUDGET_NAMES.includes('events') && BUDGET_NAMES.includes('chain'));
  assert.deepEqual([BUDGETS.events.limit, BUDGETS.chain.limit], [300_000, 5_000]);
  assert.equal(resolveBudget({ events: 7 }).events, 7);
  assert.equal(resolveBudget().chain, 5_000);
});

// ---- 예제 네 가지 ----

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
const exampleOf = (name) => readFileSync(new URL(`${name}.dap`, EXAMPLES), 'utf8');

// 근거: 이슈 #119 완료 조건 "잠금 획득·해제 예제가 공통 기능만으로 표현된다. 기다리던 작업이 해제 시각에 출발하고 쥔 쪽 값이 바뀐다"
test('buildFigure_the_lock_example_releases_the_waiting_dot_at_the_release_time_and_the_holder_changes', async () => {
  const { timeline, warnings } = await buildFigure(exampleOf('mutex-wait'), { baseDir: 'examples' });
  const [wait] = timeline.waits;
  const holder = changesOf(timeline, 'holder', 1);
  const waiter = timeline.segs.flatMap((seg) => seg.hops.map((hop) => ({ seg, hop }))).find(({ seg, hop }) => seg.si === 1 && hop.at > 0);

  assert.equal(timeline.waits.length, 1);
  assert.equal(wait.end, 'released');
  assert.deepEqual(changesOf(timeline, 'holder', 0).map(([, text]) => text), ['A'], 'A가 잠금을 쥔다');
  assert.deepEqual(holder.map(([, text]) => text), ['none', 'B'], 'A가 풀고 B가 쥔다');
  assert.equal(timeline.values.find((row) => row.id === 'holder' && row.si === 1).initial, 'A', '둘째 단계는 A가 쥔 채 시작한다');
  assert.equal(holder[0][0], wait.t1, '풀린 시각에 값이 바뀐다');
  assert.equal(waiter.seg.t0 + waiter.hop.at, wait.t1, '기다리던 점이 그 시각에 출발한다');
  assert.equal(holder[1][0], wait.t1 + waiter.hop.ms, 'B의 점이 닿으면 쥔 쪽이 B가 된다');
  assert.equal(timeline.skips.length + timeline.stalls.length + warnings.length, 0);
});

// 근거: 이슈 #119 완료 조건 "해제되지 않는 교착 예제가 stalls와 wait-stalled(stuck이 없을 때)로 설명된다"
test('buildFigure_the_deadlock_example_explains_both_waits_in_stalls_and_warns_only_without_stuck', async () => {
  const source = exampleOf('deadlock-wait');
  const withStuck = await buildFigure(source, { baseDir: 'examples' });
  const without = await buildFigure(source.replaceAll(' stuck', ''), { baseDir: 'examples' });

  assert.deepEqual(withStuck.timeline.waits.map(({ node, end }) => [node, end]), [['t1', 'stalled'], ['t2', 'stalled']]);
  assert.deepEqual(withStuck.timeline.stalls.map(({ node, cond, refs }) => [node, cond, refs.map(({ id, text }) => `${id}=${text}`)]), [['t1', "h2='none'", ['h2=t2']], ['t2', "h1='none'", ['h1=t1']]]);
  assert.ok(withStuck.timeline.stalls.every(({ refs }) => refs.every(({ line }) => line > 0)));
  assert.equal(withStuck.warnings.length, 0, 'stuck이면 경고 없음');
  assert.deepEqual(without.warnings.map((w) => w.code), ['wait-stalled', 'wait-stalled']);
  assert.match(without.warnings[0].message, /wait on "t1 -> l2" can never be released: h2='none' is false because h2 is "t2" \(set by line \d+ at \d+ms\)/);
  assert.match(without.warnings[1].message, /wait on "t2 -> l1" can never be released: h1='none' is false because h1 is "t1"/);
  assert.deepEqual(without.timeline.stalls.map(({ stuck, ...rest }) => rest), withStuck.timeline.stalls.map(({ stuck, ...rest }) => rest), 'stuck 유무와 관계없이 stalls는 같다');
  assert.ok(withStuck.timeline.segs.filter((seg) => seg.si === 1).every((seg) => seg.hops.length === 0), '점 없이 멈추는 박자');
});

// 근거: 이슈 #119 완료 조건 "큐 역압 예제가 공통 기능만으로 표현된다. 큐가 가득 차면 생산이 기다리고 소비로 빈 칸이 생기면 풀린다"
test('buildFigure_the_back_pressure_example_waits_while_the_queue_is_full_and_releases_when_a_slot_empties', async () => {
  const { timeline, warnings } = await buildFigure(exampleOf('queue-wait'), { baseDir: 'examples' });
  const queue = (si) => changesOf(timeline, 'q', si).map(([t, text]) => [t, Number(text)]);
  const pops = queue(0).filter(([, count], i, all) => i > 0 && count < all[i - 1][1]).map(([t]) => t);
  const released = timeline.waits.filter((wait) => wait.end === 'released' && wait.si === 0);
  const timedOut = timeline.waits.filter((wait) => wait.end === 'timeout' && wait.si === 0);

  assert.ok(released.length >= 3 && timedOut.length >= 3);
  assert.deepEqual(released.map((wait) => wait.t1), pops.filter((t) => released.some((wait) => wait.t1 === t)), '빈 칸이 생긴 시각에 풀린다');
  assert.ok(released.every((wait) => wait.t1 > wait.t0 || pops.includes(wait.t1)));
  assert.ok(timedOut.every((wait) => wait.t1 - wait.t0 === 900), '오래 기다린 점은 시간 초과로 끝난다');
  assert.ok([...queue(0), ...queue(1)].every(([, count]) => count >= 0 && count <= 4), '큐가 칸 수를 넘지 않는다');
  assert.ok(Math.max(...queue(0).map(([, count]) => count)) >= 3, '큐가 찬다');
  assert.equal(changesOf(timeline, 'dropped', 0).length, timeline.segs[0].pulses.filter(({ id }) => id === 'dlq').length, '버린 수는 분기 점이 버려지는 도형에 닿을 때마다 오른다');
  assert.deepEqual(timeline.waits.filter((wait) => wait.si === 1 && wait.end !== 'released'), [], '소비가 빨라지면 시간 초과가 없다');
  assert.equal(warnings.length, 0, 'check-14 큐 경고도 없다');
  const branchDots = timeline.segs[0].hops.filter((hop) => hop.track === undefined);

  assert.equal(branchDots.length, timedOut.length);
  assert.ok(branchDots.every((hop) => hop.to === 'dlq'));
});

// 근거: 이슈 #119 완료 조건 "실패 횟수에 따른 회로 차단 예제가 공통 기능만으로 표현된다. 실패 횟수가 기준에 닿으면 요청이 차단되고 상태 값이 바뀐다"
test('buildFigure_the_circuit_breaker_example_blocks_requests_once_the_failure_count_reaches_three_and_the_mode_changes', async () => {
  const { timeline, warnings } = await buildFigure(exampleOf('circuit-breaker'), { baseDir: 'examples' });
  const fails = changesOf(timeline, 'fails', 0);
  const mode = changesOf(timeline, 'mode', 0);
  const requestLine = timeline.skips.find((skip) => skip.cond === "mode='closed'").line;
  const blocked = timeline.skips.filter((skip) => skip.line === requestLine && skip.si === 0).map((skip) => skip.t);
  const toService = (seg) => seg.hops.filter((hop) => hop.to === 'svc');
  const passed = toService(timeline.segs[0]).map((hop) => hop.at);

  assert.deepEqual(fails.map(([, text]) => text), ['1', '2', '3'], '실패가 쌓인다');
  assert.deepEqual(mode.map(([, text]) => text), ['open'], '기준에 닿으면 상태가 바뀐다');
  assert.ok(mode[0][0] >= fails[2][0], '상태는 실패가 기준에 닿은 뒤에 바뀐다');
  assert.ok(passed.every((at) => at <= 4000) && passed.length === 3, '열리기 전 요청 셋만 서비스로 간다');
  assert.ok(blocked.length >= 3 && blocked.every((t) => t - timeline.segs[0].t0 > 5000), '열린 뒤 요청은 건너뛰어 서비스에 닿지 않는다');
  assert.equal(fails.length, 3, '건너뛴 요청은 실패 횟수를 올리지 않는다');
  assert.deepEqual(changesOf(timeline, 'mode', 1).map(([, text]) => text), ['closed'], '복구 확인이 상태를 닫는다');
  assert.deepEqual(changesOf(timeline, 'fails', 1).map(([, text]) => text), ['0']);
  assert.equal(toService(timeline.segs[1]).length, 3, '닫힌 뒤 요청이 다시 지나간다');
  assert.equal(warnings.length, 0);
});

// ---- 같은 입력, 같은 결과 ----

// 근거: 이슈 #119 완료 조건 "같은 입력은 같은 이벤트 순서와 결과를 만든다"
test('buildFigure_builds_the_same_timeline_every_time_for_every_conditional_example', async () => {
  const names = readdirSync(EXAMPLES).filter((name) => ['mutex-wait', 'deadlock-wait', 'queue-wait', 'circuit-breaker'].some((stem) => name === `${stem}.dap`));

  assert.equal(names.length, 4);
  for (const name of names) {
    const source = readFileSync(new URL(name, EXAMPLES), 'utf8');
    const [first, second] = await Promise.all([buildFigure(source, { baseDir: 'examples' }), buildFigure(source, { baseDir: 'examples' })]);

    assert.deepEqual(first.timeline, second.timeline, name);
    assert.ok(first.timeline.events > 0, name);
  }
});

// ---- 새 기능을 쓰지 않는 원본 ----

// 근거: 이슈 #119 완료 조건 "조건과 대기를 쓰지 않는 원본의 값, 시간표, 출력이 바뀌지 않고 이벤트 처리 함수가 호출되지 않는다"
test('buildFigure_does_not_start_the_event_engine_for_sources_without_when_or_wait_and_adds_no_condition_fields', async () => {
  const before = engineStats.steps;
  const sources = [
    ...readdirSync(EXAMPLES).filter((name) => name.endsWith('.dap') && !['mutex-wait', 'deadlock-wait', 'queue-wait', 'circuit-breaker'].includes(name.slice(0, -4))).map((name) => readFileSync(new URL(name, EXAMPLES), 'utf8')),
    ...readdirSync(V1).filter((name) => name.endsWith('.dap') && name !== 'all-when-wait.dap').map((name) => readFileSync(new URL(name, V1), 'utf8')),
  ];

  assert.ok(sources.length > 60);
  for (const source of sources) {
    const { timeline } = await buildFigure(source, { baseDir: 'test/fixtures/compat/v1' }).catch(() => ({ timeline: { segs: [] } }));
    const text = JSON.stringify(timeline);

    for (const key of ['waits', 'skips', 'stalls', 'events']) assert.ok(!(key in timeline), key);
    assert.ok(!/"at":/.test(JSON.stringify(timeline.segs.filter((seg) => !seg.pulses))), '박자 이동에 at이 없다');
    assert.ok(!text.includes('"stuck"'));
  }
  assert.equal(engineStats.steps, before, '이벤트 처리 함수가 한 번도 불리지 않았다');
});

// 근거: 설계 playback.md 기존 원본과의 호환 "한 원본 안에서도 쓰지 않은 단계의 결과는 바뀌지 않는다"
test('buildFigure_a_step_without_conditions_keeps_its_result_when_another_step_of_the_figure_uses_them', async () => {
  const plain = `${BASE}on c n+1\nstep "하나"\n  a -> c time=1s set="holder=A"\nstep "둘" keep="holder"\n  a -> c time=1s\n`;
  const mixed = `${plain}step "셋"\n  b -> c time=1s wait="holder='go'" timeout=1s\n`;
  const [one, two] = await Promise.all([buildFigure(plain), buildFigure(mixed)]);
  const before = engineStats.steps;

  assert.deepEqual(two.timeline.segs.slice(0, one.timeline.segs.length), one.timeline.segs);
  assert.deepEqual(two.timeline.values.filter((row) => row.si < 2), one.timeline.values);
  assert.equal(engineStats.steps, before, '이미 만든 시간표에서 다시 부르지 않는다');
  assert.deepEqual(two.timeline.waits.map(({ end }) => end), ['timeout']);
});

// 근거: 이슈 #119 완료 조건 "대기가 많은 원본이 글 상자 계획 메모리 한도를 넘지 않는다(힙을 제한한 실행)"
test('main_check_builds_a_figure_with_hundreds_of_waiting_dots_and_moving_text_inside_a_small_heap', async () => {
  await withFolder(async (folder) => {
    const file = join(folder, 'herd.dap');
    writeFileSync(file, 'flow right\ntitle "herd"\nbox src "S"\nbox sink "K"\nbox prod "P"\nbox q "Q"\nvalue go "문" on=sink from=no\nvalue n "수" on=q\non q n+1\nsrc -> sink\nprod -> q\nstep "s" for=2s\n  track prod -> q "작업" at=0s every=2.63ms time=100ms wait="go=\'yes\'" when="n>=0"\n  track src -> sink at=1.97s time=10ms set="go=yes"\n');
    const entry = new URL('../src/cli.js', import.meta.url).pathname;
    const result = spawnSync(process.execPath, ['--max-old-space-size=256', entry, 'check', file], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr.slice(0, 400));
  });
});
