// 조건과 대기를 쓰는 단계의 시간 정밀도 계약(docs/design/playback.md 시간 정밀도, 이슈 #137). 이벤트, 점, 값 변화, 대기 해제, 시간 초과가 같은 눈금(0.00001ms)을 쓰고, 눈금으로 구별할 수 없는 시간은 `time-precision` 오류로 끝난다.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { gridPlan, inputTicks, msOfTicks, TICKS_PER_MS } from '../src/time-grid.js';
import { runCli, withFolder } from './helpers.js';
import { packetsOf } from './smil.js';

const EXAMPLES = new URL('../examples/', import.meta.url);
// 이슈 #137의 선언부. 선: a->b. 값 n은 a에 붙고 0에서 시작한다. 단계는 6번째 줄부터 붙인다.
const HEAD = 'flow right\nbox a "A"\nbox b "B"\nvalue n "N" on=a\na -> b\n';
// 값 셋과 선 다섯. 대기와 시간 초과 시험이 쓴다. 단계는 14번째 줄부터 붙인다.
const BASE = 'flow right\nbox a "A"\nbox b "B"\nbox c "C"\nstore db "DB"\nvalue n "수" on=a\nvalue m "수" on=b\nvalue holder "쥔 쪽" on=c from=none\na -> b\nb -> a\na -> c\nb -> c\na -> db\n';
// 이슈의 첫 반례와 별도 반례
const FIRST = `${HEAD}step "Tiny" for=10ms\n track a -> b time=0.000001ms when="n=0" set="n=1"\n track a -> b at=0.000002ms time=1ms when="n=1" set="n=2"\n`;
const SECOND = `${HEAD}step "Tiny" for=1ms\n track a -> b time=0.000001ms at=0.000001ms when="n=0" set="n+1"\n`;
// 눈금 하나(0.00001ms) 간격으로 이웃한 두 이동. 눈금을 지키므로 순서가 보존된다.
const ADJACENT = `${HEAD}step "Tiny" for=10ms\n track a -> b time=0.00001ms when="n=0" set="n=1"\n track a -> b at=0.00002ms time=1ms when="n=1" set="n=2"\n`;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
// 만들기가 오류로 끝나면 그 진단 { code, line, message }의 목록, 아니면 빈 목록이다.
async function problemsOf(source, options) {
  try {
    await buildFigure(source, options);
    return [];
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems.map(({ code, line, message }) => ({ code, line, message }));
  }
}

const changesOf = (timeline, id, si = 0) => timeline.values.find((row) => row.id === id && row.si === si).changes;
// 값이 눈금의 정수배 시각에만 바뀌는지 보는 데 쓴다
const isOnGrid = (ms) => Math.abs(ms * TICKS_PER_MS - Math.round(ms * TICKS_PER_MS)) < 1e-6;

// ---- 이슈의 두 반례 ----

// 근거: 이슈 #137 완료 조건 "두 반례에서 사건 순서를 보존하거나 time-precision 입력 진단으로 끝난다"
test('buildFigure_ends_the_issue_first_source_with_a_time_precision_error_on_its_first_track_line_instead_of_skipping_the_second_move', async () => {
  const problems = await problemsOf(FIRST, { strict: true });

  assert.equal(problems.length, 1);
  assert.equal(problems[0].code, 'time-precision');
  assert.equal(problems[0].line, 7);
  assert.match(problems[0].message, /^time precision is not supported: time=0\.000001ms .* multiple of 0\.00001ms$/);
});

// 근거: 이슈 #137 별도 반례(점 출발 0.000001ms, 이동 0.000001ms인데 값 갱신이 0ms)
test('buildFigure_ends_the_issue_second_source_with_a_time_precision_error_instead_of_changing_the_value_before_the_dot_arrives', async () => {
  const problems = await problemsOf(SECOND, { strict: true });

  assert.deepEqual(problems.map(({ code, line }) => [code, line]), [['time-precision', 7]]);
});

// 근거: 이슈 #137 완료 조건 "지원하지 않는 정밀도는 strict 여부와 무관하게 진단한다"
test('buildFigure_reports_the_same_time_precision_error_with_and_without_strict', async () => {
  for (const source of [FIRST, SECOND]) {
    const loose = await problemsOf(source);
    const strict = await problemsOf(source, { strict: true });

    assert.equal(loose[0].code, 'time-precision');
    assert.deepEqual(strict, loose);
  }
});

// 근거: 이슈 #137 완료 조건 "CLI 종료 코드와 파일 없음"
test('main_render_and_check_of_the_issue_sources_exit_1_with_a_time_precision_diagnostic_and_write_no_file', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'first.dap'), FIRST);
    writeFileSync(join(folder, 'second.dap'), SECOND);

    for (const flags of [[], ['--strict'], ['--html'], ['--static']]) {
      const rendered = runCli(['render', 'first.dap', 'second.dap', ...flags], folder);

      assert.equal(rendered.status, 1, rendered.stderr);
      assert.match(rendered.stderr, /^first\.dap:7: time precision is not supported: /m);
      assert.match(rendered.stderr, /^second\.dap:7: time precision is not supported: /m);
      assert.ok(!existsSync(join(folder, 'first.svg')) && !existsSync(join(folder, 'second.svg')) && !existsSync(join(folder, 'first.html')), flags.join(' '));
    }
    const checked = runCli(['check', 'first.dap', '--json'], folder);
    const [diagnostic] = checked.stdout.trim().split('\n').map((line) => JSON.parse(line));

    assert.equal(checked.status, 1);
    assert.deepEqual([diagnostic.code, diagnostic.line, diagnostic.severity], ['time-precision', 7, 'error']);
  });
});

// 근거: 이슈 #137 "받은 정밀도로 사건 순서를 보존". 눈금 하나 간격은 구별되므로 오류가 아니라 순서대로 처리한다.
test('buildFigure_keeps_the_order_of_moves_one_grid_step_apart_and_the_second_move_reads_the_first_result', async () => {
  const { timeline, warnings } = await buildFigure(ADJACENT, { strict: true });

  assert.deepEqual(warnings, []);
  assert.deepEqual(timeline.skips, []);
  assert.deepEqual(changesOf(timeline, 'n'), [[0.00001, '1'], [1.00002, '2']]);
  assert.equal(timeline.values.find((row) => row.id === 'n').periods.at(-1)[2], '2');
});

// ---- 시간표 불변 조건 ----

// 근거: 이슈 #137 완료 조건 "이벤트·점·값 변화가 같은 시간 표현을 사용하며 도착 효과가 출발보다 먼저 생기지 않는다"
test('buildFigure_every_value_change_comes_after_its_departure_and_at_the_arrival_time_of_the_dot_on_the_same_grid', async () => {
  const { timeline } = await buildFigure(ADJACENT);
  const [seg] = timeline.segs;
  const changes = changesOf(timeline, 'n');

  assert.equal(seg.hops.length, 2);
  seg.hops.forEach((hop, i) => {
    const start = seg.t0 + (hop.at ?? 0);
    const [time] = changes[i];

    assert.ok(time > start, `${i}번 이동의 값 변화(${time}ms)가 출발(${start}ms)보다 뒤다`);
    assert.equal(time, msOfTicks(Math.round((start + hop.ms) * TICKS_PER_MS)), `${i}번 이동의 값 변화는 도착 시각이다`);
    assert.ok([start, hop.ms, time].every(isOnGrid), `${i}번 이동의 시각이 모두 눈금의 정수배다`);
  });
  assert.deepEqual(seg.pulses.map(({ at }) => at), changes.map(([time]) => time), '도형의 후광도 값 변화와 같은 시각에 닿는다');
});

// 근거: 이슈 #137 완료 조건 "이벤트·점·값 변화·timeout이 같은 시간 표현을 사용"(예제 전체)
test('buildFigure_every_conditional_example_records_its_changes_waits_skips_and_hops_on_the_grid_and_each_arrival_follows_its_departure', async () => {
  let hops = 0;
  for (const file of readdirSync(EXAMPLES).filter((name) => name.endsWith('.dap'))) {
    const source = readFileSync(new URL(file, EXAMPLES), 'utf8');
    if (!/\b(when|wait)=/.test(source)) continue;
    const { timeline } = await buildFigure(source, { baseDir: 'examples' });
    const times = [
      ...timeline.values.flatMap((row) => row.changes.map(([t]) => t)),
      ...timeline.waits.flatMap((w) => [w.t0, w.t1]),
      ...timeline.skips.map((s) => s.t),
      ...timeline.segs.flatMap((seg) => seg.hops.flatMap((hop) => [hop.at ?? 0, hop.ms])),
    ];

    assert.ok(times.every(isOnGrid), `${file}: 모든 시각이 눈금의 정수배다`);
    assert.ok(timeline.waits.every((w) => w.t1 >= w.t0), `${file}: 대기는 거꾸로 끝나지 않는다`);
    hops += timeline.segs.reduce((sum, seg) => sum + seg.hops.length, 0);
  }
  assert.ok(hops > 20, '조건을 쓰는 예제의 점을 여럿 보았다');
});

// 근거: 이슈 #137 완료 조건 "누적 단계 시각". 앞 단계 길이의 합이 이진 오차를 가져도(0.1 + 0.2) 이벤트 순서가 변하지 않는다.
test('buildFigure_a_conditional_step_after_steps_whose_lengths_add_with_binary_error_keeps_its_event_order_and_grid_times', async () => {
  const source = `${HEAD}step "one" for=0.1ms\n track a -> b time=0.05ms\nstep "two" for=0.2ms\n track a -> b time=0.05ms\nstep "three" for=10ms\n track a -> b time=0.00001ms when="n=0" set="n=1"\n track a -> b at=0.00002ms time=1ms when="n=1" set="n=2"\n`;
  const { timeline } = await buildFigure(source);
  const seg = timeline.segs.find((s) => s.si === 2);

  assert.notEqual(seg.t0, 0.3, '앞 단계 길이의 합이 0.3이 아닌 이진 값이다');
  assert.deepEqual(changesOf(timeline, 'n', 2), [[0.30001, '1'], [1.30002, '2']]);
  assert.deepEqual(timeline.skips, []);
});

// ---- 반올림 경계 ----

// 근거: 이슈 #137 완료 조건 "반올림 경계 양쪽". 눈금의 정수배는 받고, 그 사이 값은 반올림하지 않고 거부한다.
test('buildFigure_accepts_time_and_at_on_the_grid_and_rejects_values_just_off_it_on_the_track_line', async () => {
  const track = (options) => `${HEAD}step "s" for=10ms\n track a -> b ${options} when="n=0" set="n=1"\n`;
  const accepted = ['time=0.00001ms', 'time=0.00003ms at=0.00002ms', 'time=1ms at=0.00001ms every=0.5ms', 'time=1.00001ms'];
  const rejected = ['time=0.000009ms', 'time=0.0000149ms', 'time=1ms at=0.000015ms', 'time=1.000001ms'];

  for (const options of accepted) assert.deepEqual(await problemsOf(track(options)), [], options);
  for (const options of rejected) assert.deepEqual((await problemsOf(track(options))).map(({ code, line }) => [code, line]), [['time-precision', 7]], options);
  assert.deepEqual(await problemsOf(`${HEAD}step "s" for=0.0001ms\n track a -> b time=0.00001ms every=0.00002ms when="n=0" set="n=1"\n`), [], 'every도 눈금 위면 받는다');
  assert.deepEqual((await problemsOf(`${HEAD}step "s" for=0.0001ms\n track a -> b time=0.00001ms every=0.000025ms when="n=0" set="n=1"\n`)).map(({ code, line }) => [code, line]), [['time-precision', 7]]);
});

// 근거: 이슈 #137 "받은 정밀도로 순서 보존 또는 진단". 눈금으로 구별할 수 없는 단계 길이도 단계 줄의 오류다.
test('buildFigure_rejects_a_conditional_step_length_off_the_grid_on_the_step_line_and_accepts_one_on_it', async () => {
  const step = (length) => `${HEAD}step "s" for=${length}\n track a -> b time=1ms when="n=0" set="n=1"\n`;

  assert.deepEqual(await problemsOf(step('10.00001ms')), []);
  assert.deepEqual((await problemsOf(step('10.000001ms'))).map(({ code, line }) => [code, line]), [['time-precision', 6]]);
});

// 근거: 이슈 #137 박자 단계. 조건을 쓴 박자의 이동 시간과 시간 초과도 같은 눈금이다.
test('buildFigure_rejects_a_conditional_beat_move_time_and_timeout_off_the_grid_on_the_move_line', async () => {
  const beat = (options) => `${BASE}step "s"\n  b -> c ${options} wait="holder='go'" timeout=1ms else=a\n`;
  const timeout = (text) => `${BASE}step "s"\n  b -> c time=1ms wait="holder='go'" timeout=${text} else=a\n`;
  const at = (source) => problemsOf(source).then((list) => list.map(({ code, line }) => [code, line]));

  assert.deepEqual(await at(beat('time=0.000001ms')), [['time-precision', 15]]);
  assert.deepEqual(await at(timeout('0.000001ms')), [['time-precision', 15]]);
  assert.deepEqual(await at(beat('time=0.00001ms')), []);
  assert.deepEqual(await at(timeout('0.00001ms')), []);
  assert.deepEqual(await at(`${HEAD}step "s"\n  a -> b time=0.000001ms when="n=0" set="n=1"\n`), [['time-precision', 7]]);
});

// 근거: 이슈 #137 완료 조건 "조건을 쓰지 않는 원본은 그대로"
test('buildFigure_keeps_building_sub_grid_times_in_sources_without_conditions_as_before', async () => {
  const flow = await buildFigure(`${HEAD}step "s" for=1ms\n track a -> b time=0.000001ms at=0.0000013ms\n`);
  const beat = await buildFigure(`${HEAD}step "s"\n  a -> b time=0.000001ms\n`);

  assert.equal(flow.timeline.segs[0].hops[0].ms, 0.000001);
  assert.equal(beat.timeline.segs[0].hops[0].ms, 0.000001);
});

// ---- 새 함수를 직접 부르는 경계 ----

// 근거: 계약 "입력 시간은 눈금의 정수배"(src/time-grid.js)
test('inputTicks_returns_the_grid_number_for_multiples_of_the_grid_and_throws_time_precision_on_the_line_for_anything_between', () => {
  assert.equal(inputTicks(0, { line: 3, key: 'at' }), 0);
  assert.equal(inputTicks(0.00001, { line: 3, key: 'at' }), 1);
  assert.equal(inputTicks(0.3, { line: 3, key: 'at' }), 30000, '0.1ms + 0.2ms 같은 이진 오차는 눈금 위로 본다');
  assert.equal(inputTicks(0.1 + 0.2, { line: 3, key: 'at' }), 30000);
  assert.equal(inputTicks(3_600_000, { line: 3, key: 'at' }), 3.6e11);
  for (const ms of [0.000001, 0.000004, 0.000005, 0.000015, 0.0000101, 1.000001]) {
    assert.throws(() => inputTicks(ms, { line: 3, key: 'every' }), (error) => error.problems[0].code === 'time-precision' && error.problems[0].line === 3 && /every=/.test(error.problems[0].message), String(ms));
  }
});

// 근거: 계약 "계산한 이동 시간은 가장 가까운 눈금으로 올리고, 눈금보다 짧거나 두 도형의 시각이 합쳐지면 오류"
test('gridPlan_rounds_a_derived_move_time_to_the_nearest_grid_step_and_rejects_one_shorter_than_half_a_step_on_both_sides_of_the_boundary', () => {
  const plan = (ms) => ({ ms, nodes: ['a', 'b'], fracs: [0, 1] });

  assert.deepEqual(gridPlan(plan(0.0000051), { line: 4 }).arrivals, [0, 1]);
  assert.equal(gridPlan(plan(123.456789), { line: 4 }).ms, 123.45679);
  assert.deepEqual(gridPlan(plan(123.456789), { line: 4 }).arrivals, [0, 12345679]);
  assert.throws(() => gridPlan(plan(0.0000049), { line: 4 }), (error) => error.problems[0].code === 'time-precision' && error.problems[0].line === 4);
  assert.throws(() => gridPlan(plan(0), { line: 4 }), (error) => error.problems[0].code === 'time-precision');
});

// 근거: 계약 "도형 순서가 시각 순서와 같다. 서로 다른 시각에 닿는 두 도형이 같은 눈금이 되면 오류"
test('gridPlan_gives_strictly_increasing_arrival_numbers_per_node_and_rejects_a_path_whose_nodes_collapse_onto_one_step', () => {
  const plan = (ms) => ({ ms, nodes: ['a', 'b', 'c'], fracs: [0, 0.5, 1] });
  const { arrivals } = gridPlan(plan(1), { line: 4 });

  assert.ok(arrivals.every((tick, k) => k === 0 || tick > arrivals[k - 1]));
  assert.equal(arrivals.at(-1), 100000);
  assert.throws(() => gridPlan(plan(0.00001), { line: 4 }), (error) => error.problems[0].code === 'time-precision' && /a and b|b and c/.test(error.problems[0].message));
});

// ---- 대기 해제와 시간 초과가 이웃한 경우 ----

// 근거: 계약 "같은 시각에 풀림과 시간 초과가 겹치면 풀림이 이긴다"를 눈금 하나 앞뒤에서도 지킨다
test('buildFigure_wait_release_wins_at_the_same_grid_step_as_the_timeout_and_loses_when_the_timeout_is_one_step_earlier', async () => {
  // cost: time O(h), heap O(h), stack O(1)
  // vars: h = 이동 수
  // basis: estimate
  // 시간 초과를 정한 원본의 대기 끝 { end, t1 }과 이동 { 도착 도형, 출발 뒤 ms } 목록
  const run = async (timeout) => {
    const { timeline } = await buildFigure(`${BASE}step "s"\n  a -> c time=0.00002ms set="holder=go" & b -> c time=1ms wait="holder='go'" timeout=${timeout} else=a\n`);
    const [wait] = timeline.waits;
    const hops = timeline.segs[0].hops;
    return { end: wait.end, t1: wait.t1, hops: hops.map((hop) => [hop.to, hop.at ?? 0]) };
  };

  assert.deepEqual(await run('0.00003ms'), { end: 'released', t1: 0.00002, hops: [['c', 0], ['c', 0.00002]] }, '풀림이 한 눈금 먼저');
  assert.deepEqual(await run('0.00002ms'), { end: 'released', t1: 0.00002, hops: [['c', 0], ['c', 0.00002]] }, '같은 눈금이면 풀림이 이긴다');
  assert.deepEqual(await run('0.00001ms'), { end: 'timeout', t1: 0.00001, hops: [['c', 0], ['a', 0.00001]] }, '시간 초과가 한 눈금 먼저면 else 점이 출발한다');
});

// 근거: 계약 "흐름 단계에서도 풀림과 시간 초과가 이웃하면 같은 규칙", 대기가 흐름의 출발 시각에서 시작한다
test('buildFigure_flow_wait_released_one_grid_step_before_the_timeout_departs_at_the_release_and_makes_no_else_dot', async () => {
  const source = `${BASE}step "s" for=10ms\n track a -> c time=0.00002ms set="holder=go"\n track b -> c at=0.00001ms time=1ms wait="holder='go'" timeout=0.00002ms else=a\n`;
  const { timeline } = await buildFigure(source);
  const [wait] = timeline.waits;

  assert.deepEqual([wait.end, wait.t0, wait.t1], ['released', 0.00001, 0.00002]);
  assert.deepEqual(timeline.segs[0].hops.map((hop) => [hop.to, hop.at]), [['c', 0], ['c', 0.00002]]);
});

// ---- SVG와 HTML이 같은 시각을 쓴다 ----

// 근거: 이슈 #137 완료 조건 "SVG·HTML 시각 일치". 시간표가 정한 눈금 시각을 움직이는 SVG(SMIL)와 HTML 재생기 데이터가 그대로 읽는다.
test('toSvg_and_toHtml_read_the_grid_times_of_the_timeline_for_an_event_chain_that_starts_one_grid_step_after_an_arrival', async () => {
  const source = `${HEAD}step "chain" for=2s\n track a -> b time=1s when="n=0" set="n=1"\n track a -> b at=1.00001s time=500ms when="n=1" set="n=2"\n`;
  const result = await buildFigure(source, { strict: true });
  const { timeline } = result;
  const html = await toHtml(result, 'chain');
  const data = JSON.parse(html.match(/figurePlay\(document\.querySelector\('\.fl-figure'\), (\{[\s\S]*\})\);\n<\/script>/)[1].replace(/\\u003c/g, '<'));
  const packets = packetsOf(await toSvg(result, { name: 'chain' }));
  const [seg] = timeline.segs;

  assert.deepEqual(changesOf(timeline, 'n'), [[1000, '1'], [1500.01, '2']]);
  assert.deepEqual(data.segs[0].hops.map((hop) => [hop.at, hop.ms]), seg.hops.map((hop) => [hop.at ?? 0, hop.ms]), 'HTML 재생기 데이터의 출발과 이동 시간이 시간표와 같다');
  assert.deepEqual(data.values[0].periods, timeline.values[0].periods, 'HTML 재생기 데이터의 값이 보이는 구간이 시간표와 같다');
  assert.deepEqual(data.values[0].periods.map(([from]) => from), [0, 1000, 1500.01]);
  assert.equal(packets.length, 2);
  packets.forEach(({ opacity }, i) => {
    const shownAt = opacity.times[opacity.values.indexOf(1)] * timeline.total;
    assert.ok(Math.abs(shownAt - (seg.hops[i].at ?? 0)) <= 2, `${i}번 점이 SMIL에서 ${shownAt.toFixed(1)}ms에 보이고 시간표 출발은 ${seg.hops[i].at ?? 0}ms다`);
  });
});
