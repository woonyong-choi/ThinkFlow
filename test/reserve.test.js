// 원자 예약(`reserve=`)의 시간표 계산, 진단, 예산(docs/design/playback.md 원자 예약, docs/design/figure-syntax.md 예약).
// 새 문법이라 수정 전 코드에서는 구문 오류로 끝난다. 이 파일의 시험은 새 기능을 일부러 망가뜨려도 실패하는지로 보완한다(PR 본문의 시험 분류 (2)).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { engineStats } from '../src/flow-events.js';
import { FigureError } from '../src/source/problems.js';
import { runAtomicUpdate } from '../src/timeline-values.js';

// 값 넷: 낱말 holder, 숫자 free(가용량 1)와 spare(5), 큐 q(4칸 가운데 3칸 참). 선: a->lock, b->lock, c->lock, a->q, b->q, c->q, q->a. 단계는 BASE 다음 줄부터 붙인다.
const BASE = 'flow right\nbox a "A"\nbox b "B"\nbox c "C"\nbox lock "잠금"\nqueue q "큐" slots=4 from=3\nvalue holder "쥔 쪽" on=lock from=none\nvalue free "남은" on=lock from=1\nvalue spare "여유" on=lock from=5\na -> lock\nb -> lock\nc -> lock\na -> q\nb -> q\nc -> q\nq -> a\n';
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
    if (!(error instanceof FigureError)) throw error;
    return error.problems.map(({ code, line, message }) => ({ code, line, message }));
  }
}

// 값 줄 가운데 id와 단계가 맞는 것의 변화 [시각, 글] 목록
const changesOf = (timeline, id, si = 0) => timeline.values.find((row) => row.id === id && row.si === si).changes;
// 흐름 단계의 점마다 출발 시각(구간 시작 기준 ms)과 도착 도형
const dotsOf = (timeline, si = 0) => timeline.segs.filter((seg) => seg.si === si).flatMap((seg) => seg.hops.map((hop) => [hop.at ?? 0, hop.to, hop.line]));
const mutexTracks = (extra = '') => `  track a -> lock "요청" at=0s time=1s wait="holder='none'" reserve="holder=A"${extra}\n  track b -> lock "요청" at=0s time=1s wait="holder='none'" reserve="holder=B"\n  track c -> lock "요청" at=0s time=1s wait="holder='none'" reserve="holder=C"\n`;
const RELEASES = '  track a -> lock "풀기" at=3s time=1s when="holder=\'A\'" set="holder=none"\n  track b -> lock "풀기" at=6s time=1s when="holder=\'B\'" set="holder=none"\n';
const LOCK = `${BASE}step "s" for=12s\n${mutexTracks()}${RELEASES}`;

// ---- 같은 시각의 요청: 하나만 획득 ----

// 근거: 이슈 #138 완료 조건 "가용량 1이면 한 요청만 획득하고 나머지는 기다린다. 여러 대기자", 설계 playback.md 원자 예약 "앞 요청의 예약은 다음 요청의 조건 평가 전에 보인다"
test('buildFigure_three_requests_at_the_same_time_reserve_a_lock_of_one_for_the_first_declared_and_the_others_wait_in_order', async () => {
  const { timeline } = await buildFigure(LOCK);

  assert.deepEqual(changesOf(timeline, 'holder'), [[0, 'A'], [4000, 'B'], [7000, 'C']], '같은 시각에 풀림과 쥐기가 겹쳐도 쥔 쪽은 하나씩 바뀐다');
  assert.deepEqual(timeline.reserves.map(({ t, line, writes }) => [t, line, writes.map(({ from, to }) => `${from}>${to}`)]), [[0, LINES + 2, ['none>A']], [4000, LINES + 3, ['none>B']], [7000, LINES + 4, ['none>C']]], '예약은 늘 비어 있는 잠금에서만 일어난다');
  assert.deepEqual(timeline.waits.map(({ line, t0, t1, end }) => [line, t0, t1, end]), [[LINES + 3, 0, 4000, 'released'], [LINES + 4, 0, 7000, 'released']]);
  const requests = dotsOf(timeline).filter(([, to, line]) => to === 'lock' && line <= LINES + 4);
  assert.deepEqual(requests.map(([at]) => at), [0, 4000, 7000], 'A는 바로, B와 C는 풀린 시각에 점이 출발한다');
  assert.deepEqual(timeline.stalls, []);
});

// 근거: 계약 "같은 논리 시각의 요청은 선언 순서", 설계 playback.md 시간 정밀도 "시각은 눈금의 정수 번호"
test('buildFigure_the_request_at_the_earlier_tick_wins_over_the_one_declared_first_and_the_same_tick_follows_declaration_order', async () => {
  const late = `${BASE}step "s" for=4s\n  track a -> lock at=0.00001ms time=1s wait="holder='none'" reserve="holder=A" timeout=1s\n  track b -> lock at=0s time=1s wait="holder='none'" reserve="holder=B" timeout=1s\n`;
  const same = `${BASE}step "s" for=4s\n  track a -> lock at=1s time=1s wait="holder='none'" reserve="holder=A" timeout=1s\n  track b -> lock at=1s time=1s wait="holder='none'" reserve="holder=B" timeout=1s\n`;

  assert.deepEqual(changesOf((await buildFigure(late)).timeline, 'holder'), [[0, 'B']], '눈금 하나 앞선 b가 쥔다');
  assert.deepEqual(changesOf((await buildFigure(same)).timeline, 'holder'), [[1000, 'A']], '같은 눈금이면 먼저 선언한 a가 쥔다');
});

// 근거: 이슈 #138 완료 조건 "가용량 1 동시 요청에서 하나만 획득", 이슈의 현재 동작 원본(`wait`와 `set`은 둘 다 n=0을 읽고 출발한다)
test('buildFigure_the_same_two_requests_with_reserve_start_one_dot_while_wait_and_set_still_start_both', async () => {
  const head = 'flow right\nbox a "A"\nbox b "B"\nvalue n "N" on=a\na -> b\nstep "Both"\n';
  const old = await buildFigure(`${head} a -> b time=1s wait="n=0" set="n+1@a" & a -> b time=1s wait="n=0" set="n+1@a"\n`);
  const next = await buildFigure(`${head} a -> b time=1s wait="n=0" reserve="n+1" & a -> b time=1s wait="n=0" reserve="n+1" timeout=2s\n`);

  assert.deepEqual(changesOf(old.timeline, 'n'), [[0, '1'], [0, '2']], '기존 문법은 그대로 두 이동이 모두 출발하고 n이 1, 2가 된다');
  assert.equal(old.timeline.segs[0].hops.length, 2);
  assert.deepEqual(changesOf(next.timeline, 'n'), [[0, '1']], '예약은 하나만 n을 바꾼다');
  assert.equal(next.timeline.segs[0].hops.filter((hop) => !hop.at).length, 1);
  assert.deepEqual(next.timeline.waits.map(({ end }) => end), ['timeout'], '진 쪽은 기존 규칙대로 시간 초과로 끝난다');
});

// 근거: 이슈 #138 완료 조건 "남은 큐 용량 1에서 초과 획득이 없다"
test('buildFigure_a_queue_with_one_free_slot_takes_one_of_three_producers_and_never_counts_over_its_slots', async () => {
  const source = `${BASE}step "s" for=12s\n  track a, b, c -> q "작업" at=0s time=1s wait="q<4" reserve="q+1"\n  track q -> a "꺼냄" at=3s time=1s set="q-1@q"\n  track q -> a "꺼냄" at=8s time=1s set="q-1@q"\n`;
  const { timeline } = await buildFigure(source);
  const counts = [3, ...changesOf(timeline, 'q').map(([, text]) => Number(text))];

  assert.deepEqual(timeline.reserves.map(({ t }) => t), [0, 3000, 8000], '칸이 비는 시각마다 한 작업만 들어간다');
  assert.ok(counts.every((count) => count <= 4), `큐가 칸 수를 넘지 않는다: ${counts}`);
  assert.deepEqual(timeline.waits.map(({ t1 }) => t1), [3000, 8000]);
  // 칸을 비우는 같은 시각에 넣으므로 4 -> 3 -> 4는 값 줄에서 하나의 변화(변화 없음)로 합쳐진다
  assert.deepEqual(changesOf(timeline, 'q'), [[0, '4']]);
});

// 근거: 이슈 #138 완료 조건 "여러 대기자", 가용량이 둘인 숫자 자원
test('buildFigure_a_counter_of_two_lets_exactly_two_of_three_requests_in_and_the_third_waits_for_a_release', async () => {
  const source = `${BASE.replace('from=1', 'from=2')}step "s" for=8s\n  track a, b, c -> lock at=0s time=1s wait="free>0" reserve="free-1"\n  track a -> lock "풀기" at=4s time=1s set="free+1"\n`;
  const { timeline } = await buildFigure(source);

  assert.deepEqual(changesOf(timeline, 'free'), [[0, '0']], '둘이 들어가 0이 되고 같은 시각의 풀림과 쥐기는 합쳐져 값 줄에는 변화가 없다');
  assert.deepEqual(timeline.reserves.map(({ t, writes }) => [t, writes[0].from, writes[0].to]), [[0, '2', '1'], [0, '1', '0'], [5000, '1', '0']]);
  assert.deepEqual(timeline.waits.map(({ t1 }) => t1), [5000]);
});

// ---- 읽기와 쓰기가 한 사건 ----

// 근거: 계약 "여러 값의 예약은 모두 성공하거나 모두 적용하지 않는다", 설계 "읽기 식의 원천은 갱신을 시작하는 시점의 값"
test('buildFigure_one_reserve_updates_several_values_together_and_reads_the_values_from_before_the_update', async () => {
  const source = `${BASE}step "s"\n  a -> lock time=1s wait="holder='none' && free>0" reserve="holder=A, free-1"\nstep "t" keep="free, spare"\n  b -> lock time=1s reserve="free:=spare, spare:=free"\n`;
  const { timeline } = await buildFigure(source);

  assert.deepEqual([changesOf(timeline, 'holder'), changesOf(timeline, 'free')], [[[0, 'A']], [[0, '0']]]);
  assert.deepEqual(timeline.reserves[0].writes.map(({ id }) => id).sort(), ['free', 'holder']);
  const second = timeline.segs.find((seg) => seg.si === 1).t0;

  assert.deepEqual([changesOf(timeline, 'free', 1), changesOf(timeline, 'spare', 1)], [[[second, '5']], [[second, '0']]], '두 값을 서로 맞바꾼다');
});

// 근거: 이슈 #138 완료 조건 "여러 값 예약의 실패·타입 오류가 부분 갱신을 남기지 않는다(오류 주입과 상태 비교)"
test('runAtomicUpdate_leaves_every_value_untouched_when_one_expression_fails_and_applies_all_when_none_fails', async () => {
  const { figure } = await buildFigure(`${BASE}step "s"\n  a -> lock time=1s\n`);
  const byId = new Map(figure.values.map((v) => [v.id, v]));
  const expr = (id, op, operand) => ({ id, op, operand, line: 99 });
  const fresh = () => new Map([['holder', 'none'], ['free', '1'], ['q', '3']]);
  const written = [];
  const state = fresh();

  // holder는 낱말이라 q:=holder는 큐에 정수가 아닌 글을 넣는 오류다. 앞의 두 식은 이미 성공할 식이다.
  assert.throws(() => runAtomicUpdate([expr('free', '-', '1'), expr('holder', '=', 'A'), expr('q', ':=', 'holder')], { state, byId, onWrite: (e) => written.push(e.id) }), (error) => error instanceof FigureError && error.problems[0].code === 'value-type' && error.problems[0].line === 99);
  assert.deepEqual([...state], [...fresh()], '앞 식이 성공했어도 값은 하나도 바뀌지 않는다');
  assert.deepEqual(written, [], '쓰기 알림도 없다');
  assert.throws(() => runAtomicUpdate([expr('holder', '=', 'A'), expr('free', '+', '1'), expr('holder', '+', '1')], { state, byId }), FigureError, '낱말에 합을 하는 식');
  assert.deepEqual([...state], [...fresh()]);

  const changed = runAtomicUpdate([expr('free', '-', '1'), expr('holder', '=', 'A'), expr('q', '+', '1')], { state, byId, onWrite: (e) => written.push(e.id) });

  assert.deepEqual([...state], [['holder', 'A'], ['free', '0'], ['q', '4']]);
  assert.deepEqual([changed, written], [['free', 'holder', 'q'], ['free', 'holder', 'q']]);
});

// 근거: 이슈 #138 완료 조건 "실패·타입 오류가 부분 갱신을 남기지 않는다", 설계 "오류가 있으면 결과 파일을 쓰지 않음"
test('buildFigure_a_reserve_that_fails_at_run_time_ends_the_build_with_a_value_type_error_at_its_line_and_builds_no_timeline', async () => {
  const source = `${BASE}step "s"\n  a -> lock time=1s reserve="free-1, q:=holder"\n`;
  const found = await errorsOf(source);

  assert.deepEqual(found.map(({ code, line }) => [code, line]), [['value-type', LINES + 2]]);
  assert.match(found[0].message, /"q" is a queue and counts filled slots in whole numbers, but "holder" holds "none"/);
  const before = engineStats.steps;
  assert.deepEqual(await errorsOf(`${BASE}step "s"\n  a -> lock time=1s reserve="free-1, q:=free"\n`), [], '같은 모양의 식이 정수를 읽으면 통과한다');
  assert.equal(engineStats.steps, before + 1);
});

// ---- 조건이 거짓이거나 시간이 지났을 때 ----

// 근거: 계약 "timeout, when=false는 예약 부작용이 없다", 설계 playback.md 원자 예약 "시간 초과 분기와 건너뛴 이동은 예약하지 않는다"
test('buildFigure_a_timed_out_wait_and_a_false_when_reserve_nothing_and_the_else_branch_carries_no_reservation', async () => {
  const source = `${BASE}step "s" for=8s\n  track a -> lock at=0s time=1s set="holder=A"\n  track b -> lock at=2s time=1s wait="holder='none'" reserve="free-1" timeout=1s else=q\n  track c -> lock at=5s time=1s when="free=0" reserve="free-1"\n`;
  const { timeline } = await buildFigure(source);

  assert.deepEqual(timeline.reserves, [], '시간 초과도 건너뜀도 예약하지 않는다');
  assert.deepEqual(changesOf(timeline, 'free'), []);
  assert.deepEqual(timeline.waits.map(({ end }) => end), ['timeout']);
  assert.deepEqual(timeline.skips.map(({ line, cond }) => [line, cond]), [[LINES + 4, 'free=0']]);
  assert.deepEqual(dotsOf(timeline).map(([at, to]) => [at, to]), [[0, 'lock'], [3000, 'q']], 'a의 점과 시간 초과 분기 점만 있고 b의 요청 점과 건너뛴 c의 점은 없다');
});

// 근거: 계약 "조건이 거짓이면 예약 부작용 없이 기존 대기·시간 초과 규칙", 대기가 풀려도 when이 거짓이면 예약하지 않는다
test('buildFigure_a_wait_released_into_a_false_when_ends_released_but_reserves_nothing', async () => {
  const source = `${BASE}step "s" for=6s\n  track a -> lock at=0s time=1s set="free=5"\n  track b -> lock at=0s time=1s wait="free=5" when="free=0" reserve="holder=B"\n`;
  const { timeline } = await buildFigure(source);

  assert.deepEqual(timeline.waits.map(({ end, t1 }) => [end, t1]), [['released', 1000]]);
  assert.deepEqual(timeline.reserves, []);
  assert.deepEqual(timeline.skips.map(({ t }) => t), [1000]);
  assert.deepEqual(changesOf(timeline, 'holder'), []);
});

// 근거: 계약 "lost와 예약 해제의 관계를 명시한다, 렌더러가 임의로 반환하지 않는다", 설계 playback.md 원자 예약 "예약은 출발 때 잡고, 사라져도 자동으로 돌려주지 않는다"
test('buildFigure_a_lost_dot_keeps_the_reservation_it_took_at_departure_until_a_model_event_releases_it', async () => {
  const source = `${BASE}step "s" for=12s\n  track a -> lock at=0s time=1s lost=50% wait="holder='none'" reserve="holder=A"\n  track b -> lock at=1s time=1s wait="holder='none'" reserve="holder=B" timeout=2s\n  track a -> lock "풀기" at=8s time=1s set="holder=none"\n  track c -> lock at=2s time=1s wait="holder='none'" reserve="holder=C"\n`;
  const { timeline } = await buildFigure(source);

  assert.deepEqual(changesOf(timeline, 'holder'), [[0, 'A'], [9000, 'C']], '사라진 요청의 예약은 풀기 전까지 남고, 풀리면 다음 대기자가 쥔다');
  assert.deepEqual(timeline.waits.map(({ line, end }) => [line, end]), [[LINES + 3, 'timeout'], [LINES + 5, 'released']]);
  const [lostDot] = timeline.segs[0].hops.filter((hop) => hop.line === LINES + 2);
  assert.ok(lostDot.cut > 0 && lostDot.cut < lostDot.ms, '점은 경로 중간에서 사라진다');
});

// 근거: 계약 "예약 해제는 명시적인 모델 사건", 출발 때 풀리는 해제(reserve)와 닿을 때 풀리는 해제(set)의 시각이 다르다
test('buildFigure_a_release_by_reserve_frees_at_the_departure_and_a_release_by_set_frees_at_the_arrival_and_both_wake_the_waiter_at_that_time', async () => {
  const wake = async (release) => (await buildFigure(`${BASE}step "s" for=8s\n  track a -> lock at=0s time=1s wait="holder='none'" reserve="holder=A"\n  track b -> lock at=0s time=1s wait="holder='none'" reserve="holder=B"\n  track a -> lock "풀기" at=3s time=1s ${release}\n`)).timeline;
  const byReserve = await wake('when="holder=\'A\'" reserve="holder=none"');
  const bySet = await wake('when="holder=\'A\'" set="holder=none"');

  assert.deepEqual(changesOf(byReserve, 'holder'), [[0, 'A'], [3000, 'B']]);
  assert.deepEqual(changesOf(bySet, 'holder'), [[0, 'A'], [4000, 'B']]);
  assert.deepEqual(byReserve.waits.map(({ t1 }) => t1), [3000]);
  assert.deepEqual(bySet.waits.map(({ t1 }) => t1), [4000]);
  assert.deepEqual(byReserve.reserves.map(({ t, line }) => [t, line]), [[0, LINES + 2], [3000, LINES + 4], [3000, LINES + 3]], '해제도 예약 기록에 남고 같은 시각에 대기자가 이어서 쥔다');
});

// 근거: 계약 "앞 요청의 예약 갱신은 다음 요청의 조건 평가 전에 보인다", 예약이 바꾼 값을 읽는 이른 대기도 같은 시각에 다시 평가된다
test('buildFigure_a_reserve_that_changes_a_value_wakes_an_earlier_wait_on_it_at_the_same_time', async () => {
  const source = `${BASE}step "s" for=4s\n  track a -> lock at=0s time=1s wait="holder='go'" timeout=3s\n  track b -> lock at=1s time=1s reserve="holder=go"\n`;
  const { timeline } = await buildFigure(source);

  assert.deepEqual(timeline.waits.map(({ end, t1 }) => [end, t1]), [['released', 1000]]);
  assert.deepEqual(dotsOf(timeline).map(([at]) => at).sort((x, y) => x - y), [1000, 1000]);
});

// ---- 단계, 이동 줄, keep ----

// 근거: 이슈 #138 완료 조건 "일반 잠금 원본", 박자 단계의 이동(a -> b)도 같은 규칙
test('buildFigure_moves_of_a_beat_reserve_in_declaration_order_and_the_reserved_value_is_kept_into_the_next_step', async () => {
  const source = `${BASE}step "s"\n  a -> lock time=1s wait="holder='none'" reserve="holder=A" timeout=1s & b -> lock time=1s wait="holder='none'" reserve="holder=B" timeout=1s\nstep "t" keep="holder"\n  c -> lock time=1s when="holder='A'" reserve="free-1"\n`;
  const { timeline } = await buildFigure(source);

  assert.deepEqual(changesOf(timeline, 'holder'), [[0, 'A']]);
  assert.deepEqual(timeline.waits.map(({ end }) => end), ['timeout']);
  assert.equal(timeline.values.find((row) => row.id === 'holder' && row.si === 1).initial, 'A', 'keep한 예약 값이 다음 단계로 이어진다');
  assert.deepEqual(changesOf(timeline, 'free', 1).map(([, text]) => text), ['0']);
});

// 근거: 설계 playback.md 시간 정밀도, 같은 입력은 같은 이벤트 순서와 결과
test('buildFigure_builds_the_same_timeline_twice_from_the_same_reserve_source', async () => {
  const [first, second] = await Promise.all([buildFigure(LOCK), buildFigure(LOCK)]);

  assert.equal(JSON.stringify(first.timeline), JSON.stringify(second.timeline));
});

// ---- 진단 ----

// 근거: 설계 figure-syntax.md 예약 "reserve는 구조 그림의 이동과 흐름에서만, @도형 없이, 선언한 값만"
test('buildFigure_reports_reserve_written_outside_a_flow_with_an_at_node_with_unknown_values_or_with_a_bad_expression', async () => {
  const flow = (line) => `${BASE}step "s"\n  ${line}\n`;
  const found = async (line) => (await errorsOf(flow(line))).map(({ code, line: at, message }) => [code, at, message]);

  assert.match((await found('a -> lock time=1s reserve="free-1@lock"'))[0][2], /a reserve applies when the dot departs, so it takes no @node/);
  assert.match((await found('a -> lock time=1s reserve="nope+1"'))[0][2], /unknown value "nope"/i);
  assert.match((await found('a -> lock time=1s reserve="holder+1"'))[0][2], /does a sum, but "holder" holds a word/);
  assert.match((await found('a -> lock time=1s reserve="q+0.5"'))[0][2], /"q" is a queue, so it counts filled slots in whole numbers/);
  assert.match((await found('a -> lock time=1s reserve="free:=nope"'))[0][2], /unknown value "nope"/i);
  assert.equal((await found('track a -> lock reserve=""'))[0][0], 'syntax');
  const sequence = await errorsOf('sequence\nbox a "A"\nbox b "B"\nstep "s"\n  a -> b reserve="n+1"\n');
  assert.match(sequence[0].message, /reserve belongs to flow figures only/);
  assert.equal(sequence[0].line, 5);
});

// ---- 예산 ----

// 근거: 이슈 #138 완료 조건 "이벤트 예산과 시간 눈금 계약 적용", 설계 playback.md 이벤트 예산
test('buildFigure_counts_the_reserve_in_the_event_budget_and_refuses_a_huge_reserve_flow_before_building', async () => {
  const source = `${BASE}step "s" for=6s\n  track a -> lock every=1s time=100ms wait="free>0" reserve="free-1" timeout=100ms\n`;
  const needed = 6 * 4;

  assert.deepEqual(await errorsOf(source), []);
  assert.deepEqual(await errorsOf(source, { budget: { events: needed } }), [], '출발 하나는 출발, 도형 둘의 도착, 예약 하나다');
  const found = await errorsOf(source, { budget: { events: needed - 1 } });

  assert.equal(found[0].code, 'budget-exceeded');
  assert.match(found[0].message, new RegExp(`needs ${needed} events`));
  const started = Date.now();
  const huge = await errorsOf(`${BASE}step "s" for=3600s\n  track a -> lock every=0.001ms time=100ms wait="free>0" reserve="free-1"\n`);

  assert.equal(huge[0].code, 'budget-exceeded');
  assert.ok(Date.now() - started < 5000, '제한 시간 안에 끝난다');
});

// 근거: 설계 playback.md 이벤트 예산 "같은 시각의 연쇄도 chain에 센다", 예약이 대기를 깨우는 연쇄도 예산이 끊는다
test('buildFigure_ends_a_same_time_reserve_chain_with_budget_exceeded_when_the_chain_budget_is_small', async () => {
  const waiters = Array.from({ length: 40 }, () => '  track a -> lock at=0s time=1s wait="holder=\'go\'" timeout=5s\n').join('');
  const source = `${BASE}step "s" for=4s\n${waiters}  track b -> lock at=1s time=1s reserve="holder=go"\n`;
  const found = await errorsOf(source, { budget: { chain: 20 } });

  assert.equal(found[0].code, 'budget-exceeded');
  assert.match(found[0].message, /passes the budget chain=20 at \d+ms/);
  assert.deepEqual(await errorsOf(source), []);
});
