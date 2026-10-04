// 흐름(track)과 값(value, set=, tone=): 오류 진단, 값이 도착 순서대로 바뀌는지(시간표), 갈래색 이름 집합.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { findClashes } from '../src/chip-clash.js';
import { departureCount, flowSeg } from '../src/timeline-flow.js';
import { TIME_LIMIT_MS } from '../src/source/values.js';
import { valueNames } from '../src/source/grammar.js';
import { tokens, values } from '../src/tokens.js';

const BASE = 'flow right\nbox a "A"\nbox b "B"\nbox c "C"\nvalue n "개수" on=b\nvalue copy "복사" on=c ref=n\na -> b\nb -> c\n';

// cost: time O(n), heap O(n), stack O(1), io 0
// vars: n = 원본 글자 수
// basis: estimate
// 원본의 오류 진단 목록 { code, line, message }. 오류가 없으면 빈 목록이다.
async function errorsOf(source) {
  try {
    await buildFigure(source);
    return [];
  } catch (error) {
    return error.problems;
  }
}

// 근거: 설계 figure-syntax.md 시간 흐름: 한 단계에 박자 줄과 흐름 줄을 섞으면 오류
test('buildFigure_rejects_a_step_that_mixes_beat_lines_and_track_lines_in_either_order', async () => {
  const beatFirst = await errorsOf(`${BASE}step "s" for=5s\n  a -> b\n  track a -> b -> c\n`);
  const trackFirst = await errorsOf(`${BASE}step "s" for=5s\n  track a -> b -> c\n  say "x"\n`);

  assert.deepEqual([beatFirst[0].code, beatFirst[0].line], ['syntax', 11]);
  assert.match(beatFirst[0].message, /beats .* or tracks, not both/);
  assert.match(trackFirst[0].message, /a step with tracks takes no "say" line/);
});

// 근거: 설계 figure-syntax.md 흐름 단계: for를 적지 않으면 토큰 duration.flow-step이 단계 길이이고, every가 있어도 오류가 아니다
test('buildFigure_uses_the_flow_step_token_when_for_is_omitted_and_accepts_every_without_for', async () => {
  const { timeline } = await buildFigure(`${BASE}step "s"\n  track a -> b every=2s\n`);
  const [seg] = timeline.segs;

  assert.equal(seg.t1 - seg.t0, values.duration['flow-step']);
  assert.ok(seg.hops.length > 1);
});

// 근거: 설계 figure-syntax.md 시간 흐름: 흐름의 구간은 선언된 선을 따라간다. 없으면 오류
test('buildFigure_rejects_a_track_leg_without_a_declared_edge', async () => {
  const [error] = await errorsOf(`${BASE}step "s"\n  track a -> c\n`);

  assert.deepEqual([error.code, error.line], ['syntax', 10]);
  assert.match(error.message, /no edge between "a" and "c"/);
});

// 근거: 설계 figure-syntax.md 값: 참조는 순환할 수 없고 참조 값에는 쓸 수 없으며 @도형은 경로 위 도형이다
test('buildFigure_rejects_a_reference_cycle_a_set_on_a_reference_and_an_at_off_the_path', async () => {
  const cycle = await errorsOf('flow right\nbox a "A"\nvalue x "x" on=a ref=y\nvalue y "y" on=a ref=x\n');
  const onReference = await errorsOf(`${BASE}step "s"\n  a -> b set="copy+1"\n`);
  const offPath = await errorsOf(`${BASE}step "s"\n  a -> b set="n+1@c"\n`);

  assert.match(cycle[0].message, /refers to itself through x -> y -> x/);
  assert.match(onReference[0].message, /"copy" is a reference to "n"/);
  assert.match(offPath[0].message, /@c is not on this path \(a -> b\)/);
});

// 근거: 설계 playback.md 값 변화: 식은 점이 닿는 시각 순서로 적용되고, 참조 값은 같은 시각에 같은 글로 바뀐다
test('buildFigure_changes_values_in_arrival_order_and_a_reference_changes_at_the_same_moment', async () => {
  const source = `${BASE}step "s" for=20s\n  track a -> b -> c at=0s set="n+5@b, n-2@c"\n  track a -> b at=10s set="n=9"\n`;
  const { timeline } = await buildFigure(source);
  const [n, copy] = timeline.values;

  assert.equal(n.initial, '0');
  assert.deepEqual(n.changes.map(([, text]) => text).slice(0, 3), ['5', '3', '9']);
  assert.ok(n.changes.every(([at], i, all) => i === 0 || at >= all[i - 1][0]));
  assert.deepEqual(copy.changes, n.changes);
});

// 근거: 설계 figure-syntax.md 점 색: tone의 이름 집합은 카드 태그와 같고 문법 표의 값 목록 한 곳이 정한다
test('every_tone_name_has_a_flow_color_role', () => {
  for (const name of valueNames('tone')) assert.ok(tokens.color.flow[name], `color.flow.${name}`);
});

// 근거: 설계 playback.md 이동 글: 흐름에서 글 상자가 겹치면 나중에 출발한 점의 글 상자가 숨고 겹침이 남지 않는다
test('buildFigure_hides_the_text_of_the_later_dot_in_a_flow_so_no_two_texts_overlap', async () => {
  const source = `${BASE}step "s" for=12s\n  track a -> b -> c "먼저" every=3s\n  track a -> b -> c "나중" at=0.05s every=3s\n`;
  const result = await buildFigure(source);
  const hidden = result.timeline.segs.flatMap((seg) => seg.hops).filter((hop) => hop.chipFade);

  assert.deepEqual(result.warnings, []);
  assert.deepEqual(findClashes(result.scene, result.timeline), []);
  assert.ok(hidden.length > 0 && hidden.every((hop) => hop.data[0] === '나중'));
  // 반대 사례: 숨김을 지우면 같은 시간표에서 겹침이 잡힌다(검사 7번이 이 목록으로 경고한다).
  for (const hop of hidden) delete hop.chipFade;
  assert.ok(findClashes(result.scene, result.timeline).length > 0);
});

// 근거: 설계 figure-syntax.md 값: 어떤 점이든 도형에 닿을 때 on 줄을 먼저, 이어서 점의 set을 적용한다. 같은 순간이면 on이 모두 set보다 앞이다
test('buildFigure_applies_on_lines_before_set_at_the_same_arrival_and_on_before_every_set_at_the_same_moment', async () => {
  const one = await buildFigure(`${BASE.replace('a -> b', 'on b n=5\na -> b')}step "s"\n  track a -> b set="n+1"\n`);
  const two = await buildFigure(`${BASE.replace('a -> b', 'on b n=5\na -> b')}step "s"\n  track a -> b time=1s set="n=1"\n  track a -> b time=1s set="n+1"\n`);

  assert.deepEqual(one.timeline.values[0].changes.map(([, text]) => text), ['5', '6']);
  assert.deepEqual(two.timeline.values[0].changes.map(([, text]) => text), ['5', '1', '2']);
  assert.notDeepEqual(two.timeline.values[0].changes.map(([, text]) => text), ['1', '2', '5']);
});

// 근거: 설계 figure-syntax.md 값: 참조의 참조는 같은 순간 함께 바뀌고, 참조 대상이 없으면 줄 번호가 있는 진단이다
test('buildFigure_changes_a_reference_of_a_reference_in_the_same_moment_and_reports_a_missing_target', async () => {
  const chain = 'flow right\nbox a "A"\nbox b "B"\nvalue x "x" on=a\nvalue y "y" on=a ref=x\nvalue z "z" on=b ref=y\na -> b\non b x+1\nstep "s"\n  a -> b\n';
  const { timeline } = await buildFigure(chain);
  const [x, y, z] = timeline.values;
  const missing = await errorsOf('flow right\nbox a "A"\nvalue x "x" on=a ref=y\nvalue y "y" on=a ref=z\n');

  assert.deepEqual([y.changes, z.changes], [x.changes, x.changes]);
  assert.equal(x.changes.length, 1);
  assert.match(missing[0].message, /unknown value "z"/);
  assert.equal(missing[0].code, 'syntax');
});

// 근거: 설계 figure-syntax.md 값: 값은 단계가 시작할 때 from으로 돌아간다
test('buildFigure_starts_every_step_from_the_declared_value_again', async () => {
  const { timeline } = await buildFigure(`${BASE.replace('a -> b', 'on b n+1\na -> b')}step "하나"\n  a -> b\nstep "둘"\n  a -> b\n`);
  const rows = timeline.values.filter((row) => row.id === 'n');

  assert.deepEqual(rows.map((row) => [row.si, row.initial, row.changes.map(([, text]) => text)]), [[0, '0', ['1']], [1, '0', ['1']]]);
});

// 근거: 설계 figure-syntax.md 흐름 단계: 단계 끝을 넘겨 도착하는 점은 끝에서 사라지고 값은 도착한 점만 반영한다
test('buildFigure_cuts_a_dot_that_cannot_arrive_before_the_step_ends_and_ignores_its_arrival', async () => {
  const source = `${BASE.replace('a -> b', 'on b n+1\na -> b')}step "s" for=5s\n  track a -> b every=2s time=1.5s\n`;
  const { timeline } = await buildFigure(source);
  const [seg] = timeline.segs;
  const cut = seg.hops.filter((hop) => hop.cut !== undefined);
  const full = buildFigure(source.replace('time=1.5s', 'time=0.5s'));

  assert.deepEqual(seg.hops.map((hop) => hop.at), [0, 2000, 4000]);
  assert.deepEqual(cut.map((hop) => [hop.at, hop.cut]), [[4000, 1000]]);
  assert.equal(timeline.values.find((row) => row.id === 'n').changes.length, 2);
  assert.equal((await full).timeline.segs[0].hops.filter((hop) => hop.cut !== undefined).length, 0);
});

// 근거: 설계 playback.md 흐름 단계: 다른 점이 같은 선을 지나가거나 앞지를 때도 보이는 글 상자는 겹치지 않는다
test('buildFigure_keeps_the_texts_of_dots_that_overtake_each_other_on_one_edge_apart', async () => {
  const source = `${BASE}step "s" for=12s\n  track a -> b -> c "느림" time=6s every=3s\n  track a -> b -> c "빠름" time=2s at=1s every=3s\n`;
  const result = await buildFigure(source);
  const hops = result.timeline.segs[0].hops;

  assert.deepEqual(findClashes(result.scene, result.timeline), []);
  assert.ok(hops.some((hop) => hop.chipFade));
  for (const hop of hops) delete hop.chipFade;
  assert.ok(findClashes(result.scene, result.timeline).length > 0);
});

// 근거: 설계 figure-syntax.md 시간 흐름: 박자 단계와 흐름 단계는 한 그림에 함께 있어도 되고 시계는 단계를 이어 한 줄로 간다
test('buildFigure_runs_beat_steps_and_flow_steps_of_one_figure_on_one_clock', async () => {
  const source = `${BASE}step "박자"\n  a -> b\nstep "흐름" for=4s\n  track a -> b\nstep "박자 다시"\n  b -> c\n`;
  const { timeline } = await buildFigure(source);
  const [beat, flow, again] = timeline.segs;

  assert.deepEqual(timeline.segs.map((seg) => seg.si), [0, 1, 2]);
  assert.equal(flow.t0, beat.t1);
  assert.equal(again.t0, flow.t1);
  assert.equal(flow.t1 - flow.t0, 4000);
  assert.ok(flow.edgesAt && !beat.edgesAt && !again.edgesAt);
});

// 근거: 설계 figure-syntax.md 흐름: 출발지를 쉼표로 이으면 출발지마다 흐름 하나로 펼치고 출발이 every 안에서 엇갈린다. 색은 출발지 이름마다 하나씩, 브랜드 파랑(brand), 보라(purple) 순으로 받는다
test('buildFigure_expands_sources_staggers_departures_and_gives_each_source_its_own_tone', async () => {
  const source = 'flow right\nbox a "A"\nbox b "B"\nbox c "C"\na -> c\nb -> c\nstep "s" for=4s\n  track a, b -> c every=2s\n';
  const { figure } = await buildFigure(source);
  const [first, second] = figure.steps[0].tracks;

  assert.deepEqual([first.atMs, second.atMs], [0, 1000]);
  assert.notEqual(first.tone, second.tone);
  assert.deepEqual([first.tone, second.tone], ['brand', 'purple']);
});

// 근거: 설계 figure-syntax.md 값: 공백이 든 낱말과 경로에 두 번 나오는 @도형은 오류다. `=` 뒤는 언제나 글자다
test('buildFigure_rejects_a_word_with_spaces_and_an_ambiguous_at_and_reads_equals_as_text', async () => {
  const space = await errorsOf(`${BASE}step "s"\n  a -> b set="n=a b"\n`);
  const twice = await errorsOf(`${BASE.replace('b -> c', 'b -> a')}step "s"\n  track a -> b -> a set="n+1@a"\n`);
  const text = await buildFigure(`${BASE}step "s"\n  a -> b set="n=copy"\n`);

  assert.match(space[0].message, /without spaces/);
  assert.match(twice[0].message, /@a is ambiguous/);
  assert.deepEqual(text.timeline.values[0].changes.map(([, v]) => v), ['copy']);
});

const HUGE_EVERY = `flow right\nbox a "A"\nbox b "B"\na -> b\nstep "Load" for=12s\n  track a -> b time=1s every=0.000001ms\n`;

// 근거: 이슈 #81, 설계 playback.md 흐름 단계: 출발 수는 배열을 만들기 전에 계산해 상한을 넘으면 그리기를 막는 오류로 끝낸다
test('buildFigure_rejects_a_track_with_billions_of_departures_with_an_error_before_allocating_them', async () => {
  const started = performance.now();
  const problems = await errorsOf(HUGE_EVERY);

  assert.equal(problems.length, 1);
  assert.deepEqual([problems[0].severity, problems[0].code, problems[0].line], ['error', 'check-14', 6]);
  assert.match(problems[0].message, /12000000000 dots/);
  assert.ok(performance.now() - started < 3000, '할당 없이 빠르게 끝난다');
});

// 근거: 이슈 #81 완료 조건 "작은 상한을 주입한 시험에서 상한 초과 입력을 배열 생성 전에 거부한다"
test('flowSeg_counts_departures_from_for_and_every_and_refuses_over_the_injected_limit_before_listing_them', () => {
  const scene = { edges: [{ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }] };
  const track = { path: ['a', 'b'], source: 'a', legs: [{ edge: 0 }], atMs: 0, everyMs: 1000, timeMs: 500, sets: [], line: 3 };
  const step = { forMs: 10000, tracks: [track], label: 's' };
  const run = () => ({ figure: { steps: [step] }, speed: 600, t: 0, tracks: [], values: [], seriesIds: [], hasReveal: false });
  const deps = (dotsLimit) => ({ scene, cards: { starts: new Map() }, chips: () => [], dotsLimit });

  assert.doesNotThrow(() => flowSeg({ step, si: 0 }, run(), deps(10)));
  assert.throws(() => flowSeg({ step, si: 0 }, run(), deps(9)), (error) => error.problems[0].line === 3 && /10 dots, over the limit of 9/.test(error.problems[0].message));
});

// 근거: 설계 figure-syntax.md 값 바꾸기 식: 차트 숫자(charts.md 값 범위)와 같이 유한하지 않거나 절댓값이 1e15 이상인 식 숫자는 줄 오류다
test('buildFigure_set_step_that_overflows_to_infinity_or_passes_1e15_is_a_line_error', async () => {
  const nines = '9'.repeat(310);
  for (const operand of [`n+${nines}`, `n-${nines}`, `n+1${'0'.repeat(15)}`]) {
    const errors = await errorsOf(`${BASE}step "s"\n  a -> b "go" set="${operand}"\n`);

    assert.deepEqual(errors.map((e) => e.line), [10], operand);
    assert.match(errors[0].message, /values must be under 1e15/, operand);
  }
  const { timeline } = await buildFigure(`${BASE}step "s"\n  a -> b "go" set="n+999999"\n`);

  assert.equal(JSON.stringify(timeline).includes('Infinity'), false);
});

// 근거: 이슈 #97 "글 상자 숨김 불투명도 키에 NaN": 시작 시각이 없는 동시 이동도 숨김 키가 모두 유한하고, 겹침 없이 한 박자에 같이 출발하면 나중 점의 글 상자가 처음부터 숨는다
test('planClashes_keeps_every_fade_key_finite_and_hides_the_later_simultaneous_chip_from_its_start', async () => {
  const source = readFileSync(new URL('./fixtures/layout/event-loop.dap', import.meta.url), 'utf8');
  const result = await buildFigure(source, { strict: true });
  const hidden = result.timeline.segs.flatMap((seg) => seg.hops).filter((hop) => hop.chipFade);

  assert.equal(hidden.length, 1);
  assert.ok(hidden[0].chipFade.flat().every(Number.isFinite));
  assert.deepEqual(hidden[0].chipFade[0], [0, 0]);
  assert.deepEqual(findClashes(result.scene, result.timeline), []);
});

const READ_LIMIT = 100000;
const SCENE = { edges: [{ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }] };

// cost: time O(1), heap O(1), stack O(1), io 0
// basis: estimate
// every를 읽는 횟수에 상한을 둔 흐름. 출발 시각을 끝없이 만드는 옛 구현은 상한에 닿아 시험이 실패하고, 메모리를 쓰지 않는다.
function guardedTrack(fields) {
  let reads = 0;
  const track = { path: ['a', 'b'], source: 'a', legs: [{ edge: 0 }], timeMs: 1, sets: [], line: 6, ...fields };
  Object.defineProperty(track, 'everyMs', { get: () => (++reads > READ_LIMIT ? assert.fail('every read without end') : fields.everyMs) });
  return { track, reads: () => reads };
}

// 흐름 단계 하나를 flowSeg로 만든다. 점 수 상한은 풀어 둔다.
function makeFlow(track, forMs) {
  const step = { forMs, tracks: [track], label: 's', line: 5 };
  const run = { figure: { steps: [step] }, speed: 600, t: 0, tracks: [], values: [], seriesIds: [], hasReveal: false };
  return flowSeg({ step, si: 0 }, run, { scene: SCENE, cards: { starts: new Map() }, chips: () => [], dotsLimit: Infinity });
}

const FLOW_HEAD = 'flow right\nbox a "A"\nbox b "B"\na -> b\n';
// 시간 값 하나가 상한을 넘는 줄 하나씩. 줄 번호는 FLOW_HEAD 다음 줄부터다.
const OVER_LIMIT_LINES = {
  for: `${FLOW_HEAD}step "s" for=3600001ms\n  track a -> b time=1s\n`,
  time: `${FLOW_HEAD}step "s" for=3s\n  track a -> b time=3600001ms\n`,
  at: `${FLOW_HEAD}step "s" for=3s\n  track a -> b time=1s at=3600001ms\n`,
  every: `${FLOW_HEAD}step "s" for=3s\n  track a -> b time=1s every=3600001ms\n`,
  wait: `${FLOW_HEAD}step "s"\n  a -> b\n  wait 3600.001s\n`,
  speed: `flow right\nspeed 3600001ms\nbox a "A"\nbox b "B"\na -> b\nstep "s"\n  a -> b\n`,
};

// 근거: 이슈 #103 완료 조건 "출발 배열을 만들기 전에 진단으로 끝나거나 사전 개수만큼만 만든다". 상한 검사를 거치지 않고 flowSeg에 직접 넘긴 `at + every === at` 입력은 every를 읽는 횟수에 상한을 둔 채로 오류로 끝난다
test('flowSeg_stops_with_a_time_precision_error_when_departures_do_not_advance_and_never_loops_on_every', { timeout: 10000 }, () => {
  const { track, reads } = guardedTrack({ atMs: 1e20, everyMs: 100 });

  assert.throws(() => makeFlow(track, 1e20 + 16384), (error) => error.problems?.[0].code === 'time-precision' && error.problems[0].line === 6);
  assert.ok(reads() < 1000, `every를 ${reads()}번 읽었다`);
});

// 근거: 이슈 #103 완료 조건 "실제로 만든 출발 수가 departureCount와 같다". 부동소수 합 0.1을 열 번 더하면 1을 넘지 못해 수정 전에는 11개였다
test('buildFigure_makes_exactly_departureCount_departures_for_a_fractional_every', async () => {
  const cases = [['1ms', '0.1ms'], ['10ms', '0.1ms'], ['12.1ms', '0.1ms'], ['3s', '700ms']];
  for (const [length, every] of cases) {
    const { figure, timeline } = await buildFigure(`${FLOW_HEAD}step "s" for=${length}\n  track a -> b time=1ms every=${every}\n`);
    const [seg] = timeline.segs;

    assert.equal(seg.hops.length, departureCount(figure.steps[0].tracks[0], seg.t1 - seg.t0), `${length} ${every}`);
    assert.equal(new Set(seg.hops.map((hop) => hop.at)).size, seg.hops.length, `${length} ${every}: 출발 시각이 모두 다르다`);
  }
});

// 근거: 이슈 #103 완료 조건 경계 "상한 정확히 같은 값은 통과, 넘는 값은 진단(시간 하나)". 설계 figure-syntax.md 시간 값
test('buildFigure_accepts_every_time_value_at_the_limit_and_rejects_one_millisecond_over', async () => {
  const atLimit = `flow right\nspeed ${TIME_LIMIT_MS}ms\nbox a "A"\nbox b "B"\na -> b\nstep "s" for=3600s\n  track a -> b time=${TIME_LIMIT_MS}ms at=0s every=3600s\n`;
  const { timeline } = await buildFigure(atLimit);

  assert.equal(timeline.segs[0].t1 - timeline.segs[0].t0, TIME_LIMIT_MS);
  for (const [key, source] of Object.entries(OVER_LIMIT_LINES)) {
    const problems = await errorsOf(source);

    assert.deepEqual(problems.map((p) => p.code), ['time-limit'], key);
    assert.match(problems[0].message, new RegExp(`^${key} is over the limit of 1h \\(3600000ms\\)`), key);
  }
});

// 근거: 이슈 #103 완료 조건 경계 "누적 둘이 상한 정확히 같으면 통과, 넘으면 마지막에 더한 줄의 진단". 박자 단계와 흐름 단계 모두
test('buildFigure_accepts_a_total_at_the_limit_and_rejects_the_line_that_pushes_it_over', async () => {
  const flowStep = (ms, line) => `step "s${line}" for=${ms}ms\n  track a -> b time=1ms\n`;
  const exact = await buildFigure(FLOW_HEAD + flowStep(1800000, 1) + flowStep(1800000, 2));
  const over = await errorsOf(FLOW_HEAD + flowStep(1800000, 1) + flowStep(1800001, 2));
  const beats = await errorsOf(`${FLOW_HEAD}step "s"\n  a -> b time=2400s\n  a -> b time=2400s\n`);

  assert.equal(exact.timeline.total, TIME_LIMIT_MS);
  assert.deepEqual(over.map((p) => [p.code, p.line]), [['time-limit', 7]]);
  assert.deepEqual(beats.map((p) => [p.code, p.line]), [['time-limit', 7]]);
});

// 근거: 이슈 #103 완료 조건 "정밀도 원본은 사전 개수가 400대이고 at + every === at이다. 내부 오류가 아니라 6번 줄의 시간 정밀도 입력 진단". every 읽기 횟수에 상한을 둔다(원본 그대로의 CLI 시험은 cli.test.js)
test('flowSeg_reports_a_time_precision_diagnostic_on_the_track_line_when_every_is_lost_next_to_at', { timeout: 10000 }, () => {
  const { track, reads } = guardedTrack({ atMs: 3599999, everyMs: 0.000000000001 });

  assert.throws(() => makeFlow(track, 3599999.0000000005), (error) => {
    const [problem] = error.problems;
    return error.problems.length === 1 && problem.severity === 'error' && problem.code === 'time-precision' && problem.line === 6 && /^time precision is not supported: .* Raise every= or lower at=$/.test(problem.message);
  });
  assert.ok(reads() < 1000, `every를 ${reads()}번 읽었다`);
});

// 근거: 이슈 #103 완료 조건 "잘림 원본은 출발 7개를 만든다. 마지막 출발은 0.06ms이고, 길이 0인 잘림 구간을 만들지 않는다". ceil(0.07 / 0.01)은 8이다
test('flowSeg_makes_seven_departures_for_a_step_of_0_07ms_every_0_01ms_and_no_zero_length_cut', { timeout: 10000 }, () => {
  const { track } = guardedTrack({ atMs: 0, everyMs: 0.01 });
  const { hops } = makeFlow(track, 0.07).segs[0];

  assert.equal(hops.length, 7);
  assert.equal(hops.at(-1).at, 0.06);
  assert.ok(hops.every((hop) => hop.cut === undefined || hop.cut > 0));
});

// 근거: 이슈 #103 완료 조건 "모든 흐름에서 검증한 개수와 실제 개수가 같고, 출발 시각은 유한하고 엄격히 늘며 단계 길이보다 작다". 분수 간격과 경계 길이를 섞은 입력 전부
test('flowSeg_invariants_count_equals_made_and_starts_are_finite_strictly_increasing_and_inside_the_step', { timeout: 20000 }, () => {
  let checked = 0;
  for (const atMs of [0, 0.1, 0.3, 1.1, 7, 1000]) {
    for (const everyMs of [undefined, 0.01, 0.1, 0.3, 0.7, 1.3, 3.3, 100]) {
      for (const forMs of [0.07, 1, 2.5, 10, 12.1]) {
        const { track } = guardedTrack({ atMs, everyMs });
        const starts = makeFlow(track, forMs).segs[0].hops.map((hop) => hop.at);

        assert.equal(starts.length, departureCount(track, forMs), `at=${atMs} every=${everyMs} for=${forMs}`);
        assert.ok(starts.every((at, i) => Number.isFinite(at) && at < forMs && (i === 0 || at > starts[i - 1])), `at=${atMs} every=${everyMs} for=${forMs}`);
        checked++;
      }
    }
  }
  assert.equal(checked, 6 * 8 * 5);
});

const DWELL = values.duration;

// 근거: 이슈 #103 완료 조건 "정확히 1시간인 이동에 자동 체류 시간이 더해져 단계나 전체 시간이 상한을 넘으면 입력 진단". 이동 1시간에 박자 멈춤(duration.dwell)과 단계 끝 멈춤(duration.step-end)이 더해진다
test('buildFigure_rejects_a_move_of_exactly_one_hour_because_the_automatic_hold_pushes_the_step_over', async () => {
  const exact = await errorsOf(`${FLOW_HEAD}step "s"\n  a -> b time=3600s\n`);
  const fits = await buildFigure(`${FLOW_HEAD}step "s"\n  a -> b time=${TIME_LIMIT_MS - DWELL.dwell - DWELL['step-end']}ms\n`);
  const over = await errorsOf(`${FLOW_HEAD}step "s"\n  a -> b time=${TIME_LIMIT_MS - DWELL.dwell - DWELL['step-end'] + 1}ms\n`);

  assert.deepEqual(exact.map((p) => [p.code, p.line]), [['time-limit', 6]]);
  assert.equal(fits.timeline.total, TIME_LIMIT_MS);
  assert.deepEqual(over.map((p) => [p.code, p.line]), [['time-limit', 6]]);
});

// 근거: 이슈 #103 완료 조건 "거리로 정한 이동 시간, 대기, 설명 체류를 합쳐 상한을 넘는 경우도 입력 진단". 각각은 상한 안이다. 자동 체류의 합은 대기 1초 그림의 전체 시간에서 잰다
test('buildFigure_rejects_distance_based_moves_waits_and_caption_holds_that_add_up_over_the_limit', async () => {
  const withWait = (ms, say = '') => `${FLOW_HEAD}step "s"\n  a -> b time=1s\n  wait ${ms}ms\n${say ? `  say "${say}"\n` : ''}`;
  const hold = (await buildFigure(withWait(1000))).timeline.total - 2000;
  const slow = await errorsOf(`flow right\nspeed 3600s\nbox a "A"\nbox b "B"\na -> b\nstep "s"\n  a -> b\n`);
  const fits = await buildFigure(withWait(TIME_LIMIT_MS - hold - 1000));
  const waits = await errorsOf(withWait(TIME_LIMIT_MS - hold - 1000 + 1));
  const said = await errorsOf(withWait(TIME_LIMIT_MS - hold - 1000, '가'.repeat(100)));

  assert.deepEqual(slow.map((p) => [p.code, p.line]), [['time-limit', 7]]);
  assert.equal(fits.timeline.total, TIME_LIMIT_MS);
  assert.deepEqual(waits.map((p) => [p.code, p.line]), [['time-limit', 7]]);
  assert.deepEqual(said.map((p) => p.code), ['time-limit']);
});
