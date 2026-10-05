// 사라짐(lost), 단계별 도형 상태(status), 구간별 이동 시간(legs): 문법과 진단, 시간표, 움직이는 SVG와 재생기의 일치(docs/design/playback.md 사라짐, 단계별 도형 상태, 구간별 이동 시간).
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright-core';
import { buildFigure } from '../src/build.js';
import { checkLabels } from '../src/check/overlap.js';
import { contrast } from '../src/contrast.js';
import { positionAt, timeAtPosition } from '../src/easing.js';
import { toHtml } from '../src/html.js';
import { PLAN_MAX_MS } from '../src/chip-plan.js';
import { toSvg } from '../src/svg.js';
import { parseFigure } from '../src/source/parse.js';
import { litIds } from '../src/timeline.js';
import { values } from '../src/tokens.js';
import { discreteAt, packetsOf, pathFractionAt } from './smil.js';
import { themeColor, withFolder } from './helpers.js';

const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((path) => path && existsSync(path));
const PROBE_MS = 25;
// 움직이는 SVG는 이동 곡선과 구간 꺾은선을 잰 지점으로 선형으로 잇는다. 길이 비율이 이 값 안이면 같은 자리다.
const POSITION_TOLERANCE = 0.003;
const EDGE_GUARD_MS = 1.5;

const BASE = 'flow right\nbox a "A"\nbox b "B"\nbox c "C"\nvalue nb "nb" on=b from=0\nvalue nc "nc" on=c from=0\na -> b\nb -> c\n';
const TRACK = (options) => `${BASE}step "s" for=12s\n  track a -> b -> c "요청" ${options}\n`;
const SET = 'set="nb+1@b, nc+1@c"';
const FOUR = 'flow right\nbox a "A"\nbox b "B"\nbox c "C"\nbox d "D"\na -> b\nb -> c\nc -> d\n';

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
// 원본을 읽고 진단 `{ code, line, message }` 목록을 돌려준다. 오류가 없으면 빈 목록이다.
function problemsOf(source) {
  try {
    parseFigure(source);
    return [];
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems.map(({ code, line, message }) => ({ code, line, message }));
  }
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
// 만들기(배치 뒤 시간표 포함)가 오류로 끝나면 그 진단 목록, 아니면 undefined.
async function buildProblems(source) {
  try {
    await buildFigure(source);
    return undefined;
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems.map(({ code, line }) => ({ code, line }));
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 첫 흐름이 지나는 길에서 도형 b에 닿는 길이 비율과, 선 하나와 이음 구간 끝의 길이 비율
const arrivalsOf = ({ timeline }) => ({ b: timeline.tracks[0].gaps[0][0], afterJoin: timeline.tracks[0].gaps[0][1] });

describe('lost, status, legs: diagnostics', () => {
  // 근거: 이슈 #120 계약 "범위 밖이거나 `%`가 없으면 `syntax` 오류", 설계 figure-syntax.md 사라짐과 구간 시간
  test('parseFigure_lost_accepts_0_to_100_percent_and_rejects_a_missing_percent_sign_or_a_value_out_of_range', () => {
    for (const lost of ['0%', '60%', '62.5%', '100%']) assert.deepEqual(problemsOf(TRACK(`time=4s lost=${lost}`)), [], lost);
    for (const lost of ['60', '100.5%', '101%', '-5%', 'abc%', '"60%"']) {
      const [problem, ...rest] = problemsOf(TRACK(`time=4s lost=${lost}`));

      assert.equal(rest.length, 0, lost);
      assert.deepEqual([problem.code, problem.line], ['syntax', 10], lost);
    }
  });

  // 근거: 설계 figure-syntax.md "구조 그림에서만 쓴다"
  test('parseFigure_lost_and_status_belong_to_flow_figures_only', () => {
    const sequence = 'sequence\nperson u "U"\nbox s "S"\nstep "s"\n  u -> s "x" lost=50%';
    const state = 'state right\nstate a "A"\nstate b "B"\na -> b "go"\nstep "s" status="a=ok"\n  a -> b';

    assert.match(problemsOf(sequence)[0].message, /lost belongs to flow figures only/);
    assert.match(problemsOf(state)[0].message, /status belongs to flow figures only/);
  });

  // 근거: 설계 figure-syntax.md 구간 시간 "항목 수는 경로의 선 수와 같고 둘 이상", 박자 이동은 `legs`를 쓸 수 없다
  test('parseFigure_legs_needs_one_entry_per_line_and_at_least_two_lines', () => {
    assert.equal(problemsOf(TRACK('legs="1s"'))[0].code, 'syntax');
    assert.equal(problemsOf(TRACK('legs="1s, 2s, 3s"'))[0].code, 'syntax');
    assert.match(problemsOf(`${BASE}step "s"\n  track a -> b "x" legs="1s, 1s"`)[0].message, /two or more lines/);
    assert.equal(problemsOf(`${BASE}step "s"\n  a -> b time=1s legs="1s"`)[0].code, 'syntax');
    for (const entry of ['0s', '-1s', '1x', '', '2']) assert.equal(problemsOf(TRACK(`legs="1s, ${entry}"`))[0].code, 'syntax', entry);
  });

  // 근거: 이슈 #120 완료 조건 "합계 초과와 양의 길이에 0 이하 시간이 배정되는 입력은 줄 번호가 있는 `leg-time`", 경계 입력
  test('parseFigure_legs_sum_against_time_reports_leg_time_on_the_track_line_at_the_boundaries', () => {
    const codeOf = (options) => problemsOf(TRACK(options)).map((p) => [p.code, p.line]);

    assert.deepEqual(codeOf('time=4s legs="1s, -"'), []);
    assert.deepEqual(codeOf('time=4s legs="1s, 3s"'), []);
    assert.deepEqual(codeOf('time=4s legs="3999ms, -"'), []);
    assert.deepEqual(codeOf('time=4s legs="4s, -"'), [['leg-time', 10]]);
    assert.deepEqual(codeOf('time=4s legs="5s, -"'), [['leg-time', 10]]);
    assert.deepEqual(codeOf('time=4s legs="1s, 4s"'), [['leg-time', 10]]);
    assert.deepEqual(codeOf('time=4s legs="1s, 2s"'), [['leg-time', 10]]);
    assert.deepEqual(codeOf('time=1.1s legs="0.5s, 0.6s"'), []);
    assert.deepEqual(codeOf('legs="1s, 2s"'), []);
    assert.deepEqual(codeOf('legs="-, -"'), []);
  });

  // 근거: 이슈 #120 완료 조건 "1시간을 넘는 항목이나 합은 `time-limit`", 설계 playback.md 시간 상한(정확히 같은 값은 통과)
  test('parseFigure_legs_entries_and_their_sum_over_one_hour_report_time_limit', () => {
    const codeOf = (options) => problemsOf(TRACK(options)).map((p) => p.code);

    assert.deepEqual(codeOf('legs="3600s, -"'), []);
    assert.deepEqual(codeOf('legs="3600.001s, -"'), ['time-limit']);
    assert.deepEqual(codeOf('legs="1800s, 1800s"'), []);
    assert.deepEqual(codeOf('legs="1800s, 1800.001s"'), ['time-limit']);
    assert.deepEqual(codeOf('legs="2000s, 2000s" time=3000s'), ['time-limit']);
  });

  // 근거: 이슈 #120 완료 조건 "`-` 구간 거리 기반 합이 1시간을 넘으면 `time-limit`", 설계 playback.md 시간 상한
  test('buildFigure_legs_distance_times_over_one_hour_end_with_time_limit_on_the_track_line', async () => {
    const slow = `${FOUR.replace('flow right', 'flow right\nspeed 3000s')}step "s" for=20s\n  track a -> b -> c -> d legs="-, -, -"\n`;

    assert.deepEqual(await buildProblems(slow), [{ code: 'time-limit', line: 11 }]);
  });

  // 근거: 이슈 #120 계약 "그 단계에서만 적용", 설계 figure-syntax.md 단계별 도형 상태의 오류 목록
  test('parseFigure_status_rejects_unknown_kinds_duplicates_unknown_names_and_non_shape_targets', () => {
    const grid = 'flow right\nbox a "A"\ngrid g "G" cols=1 {\n  item x "X"\n}\ngroup grp "G2" {\n  box c "C"\n}\na -> c\nstep "s" status=';
    const messages = (status) => problemsOf(`${BASE}step "s" status=${status}\n  a -> b`).map((p) => p.message);

    assert.deepEqual(messages('"a=ok, b=warn, c=fail"'), []);
    assert.match(messages('"a=bad"')[0], /status kind is one of ok, warn, fail, wait/);
    assert.match(messages('"a=ok, a=fail"')[0], /twice/);
    assert.match(messages('"zz=ok"')[0], /unknown node "zz"/);
    assert.match(messages('"a"')[0], /write status as/);
    assert.match(messages('"nb=ok"')[0], /takes no status/);
    assert.match(problemsOf(`${grid}"grp=ok, g=ok"\n  a -> c`).map((p) => p.message).join('\n'), /a group takes no status/);
  });
});

describe('lost: boundaries in the timetable', () => {
  // cost: time O(1), heap O(1), stack O(1)
  // basis: estimate
  // 흐름의 lost 값마다 { cut, pulses, nb, nc, edgesAt, ms }
  async function lostRun(percent) {
    const result = await buildFigure(TRACK(`time=4s ${SET} ${percent === undefined ? '' : `lost=${percent}%`}`));
    const [seg] = result.timeline.segs;
    const rows = Object.fromEntries(result.timeline.values.map((row) => [row.id, row.changes.length]));

    return { result, cut: seg.hops[0].cut, ms: seg.hops[0].ms, pulses: seg.pulses.map((p) => p.id), edges: Object.keys(seg.edgesAt).map(Number), ...rows };
  }

  // 근거: 이슈 #120 완료 조건 "`0%`, `100%`, 도형에 닿는 비율과 같은 값, 그 바로 앞뒤 값에서 통과한 도형의 효과만 적용되고 같은 시각의 도착 효과는 적용되지 않는다" (`cut`, `values`, `pulses`)
  test('buildTimeline_lost_applies_only_the_shapes_passed_before_the_dot_is_lost_at_every_boundary', async () => {
    const none = await lostRun(undefined);
    const { b, afterJoin } = arrivalsOf(none.result);
    const percentOf = (fraction) => `${fraction * 100}`;

    assert.deepEqual([none.pulses, none.nb, none.nc, none.cut], [['b', 'c'], 1, 1, undefined]);
    const zero = await lostRun(0);
    assert.deepEqual([zero.cut, zero.pulses, zero.nb, zero.nc, zero.edges], [0, [], 0, 0, []]);
    const before = await lostRun(percentOf(b - 0.0001));
    assert.deepEqual([before.pulses, before.nb, before.nc, before.edges], [[], 0, 0, [0]]);
    const equal = await lostRun(percentOf(b));
    assert.deepEqual([equal.pulses, equal.nb, equal.nc, equal.edges], [[], 0, 0, [0]], '도형에 닿는 비율과 같으면 같은 시각의 도착 효과도 적용하지 않는다');
    const after = await lostRun(percentOf(b + 0.0001));
    assert.deepEqual([after.pulses, after.nb, after.nc, after.edges], [['b'], 1, 0, [0]]);
    const beforeEdge = await lostRun(percentOf(afterJoin - 0.0001));
    assert.deepEqual(beforeEdge.edges, [0], '도형 안 구간 안에서 사라지면 다음 선에는 들어서지 못한다');
    const afterEdge = await lostRun(percentOf(afterJoin + 0.0001));
    assert.deepEqual(afterEdge.edges, [0, 1]);
    const full = await lostRun(100);
    assert.deepEqual([full.pulses, full.nb, full.nc, full.cut === full.ms], [['b'], 1, 0, true], '100%는 끝 도형에 닿는 지점에서 사라지고 그 도형의 효과는 없다');
  });

  // 근거: 설계 playback.md 사라짐 "사라지는 시각은 길이 비율을 이동 곡선과 구간 시간으로 거꾸로 푼 시각"
  test('buildTimeline_lost_cut_is_the_time_the_dot_reaches_that_length_on_the_move_curve', async () => {
    const { result, cut, ms } = await lostRun(37.5);

    assert.ok(Math.abs(positionAt(cut / ms) - 0.375) < 1e-6);
    assert.ok(Math.abs(cut / ms - timeAtPosition(0.375)) < 1e-12);
    assert.equal(result.timeline.segs[0].hops[0].cut, cut);
  });

  // 근거: 설계 playback.md 사라짐 "단계 끝에서 잘린 점과 같은 규칙", 단계 끝 잘림과 사라짐 중 먼저인 쪽
  test('buildTimeline_lost_cut_is_the_earlier_of_the_step_end_and_the_lost_position', async () => {
    const short = await buildFigure(`${BASE}step "s" for=1000ms\n  track a -> b -> c time=4s lost=100%\n`);
    const early = await buildFigure(`${BASE}step "s" for=9000ms\n  track a -> b -> c time=4s lost=10%\n`);
    const [shortHop] = short.timeline.segs[0].hops;
    const [earlyHop] = early.timeline.segs[0].hops;

    assert.equal(shortHop.cut, 1000);
    assert.ok(earlyHop.cut < 1000);
  });

  const BEAT = 'flow right\nbox a "A"\nbox b "B"\nvalue n "n" on=b from=0\na -> b\nstep "s"\n  a -> b time=1s set="n+1"';
  // 값 카드가 도형을 켜지 않게 값이 없는 같은 그림
  const PLAIN = 'flow right\nbox a "A"\nbox b "B"\na -> b\nstep "s"\n  a -> b time=1s';

  // 근거: 이슈 #120 완료 조건 "사라진 점의 도착 효과 취소가 값 변화, 후광, 선 켜짐, 박자의 카드 도착 규칙에 반영된다" (박자: 값 줄과 카드 변경 시각)
  test('buildTimeline_lost_beat_move_cancels_the_value_change_and_the_card_arrival_and_keeps_the_end_shape_unlit', async () => {
    const kept = await buildFigure(`${BEAT}\n  show b "도착"`);
    const lost = await buildFigure(`${BEAT} lost=50%\n  show b "도착"`);
    const zero = await buildFigure(`${PLAIN} lost=0%`);
    const half = await buildFigure(`${PLAIN} lost=50%`);
    const full = await buildFigure(`${PLAIN} lost=100%`);
    const fullValue = await buildFigure(`${BEAT} lost=100%`);
    const unlitOf = (r) => [...litIds(r.timeline.segs[0], r.scene.edges)].sort();

    assert.deepEqual([kept.timeline.values[0].changes.length, kept.timeline.segs[0].cardsAt.b], [1, 1000]);
    assert.deepEqual([lost.timeline.values[0].changes.length, lost.timeline.segs[0].cardsAt.b], [0, 0], '사라진 이동은 도착 규칙에서 빠져 카드가 박자 시작에 바뀐다');
    assert.deepEqual([unlitOf(zero), zero.timeline.segs[0].edgesOn], [[], []], '0%는 아무것도 켜지 않는다');
    assert.deepEqual([unlitOf(half), half.timeline.segs[0].edgesOn, half.timeline.segs[0].edgesLost], [['a'], [0], [0]], '선과 출발 도형은 켜지고 끝 도형은 켜지지 않는다');
    assert.deepEqual([unlitOf(full), fullValue.timeline.values[0].changes.length, full.timeline.segs[0].hops[0].cut], [['a'], 0, 1000]);
    assert.equal(half.timeline.segs[0].move, half.timeline.segs[0].hops[0].cut);
  });

  // 근거: 설계 playback.md 사라짐 "같은 단계에서 사라지지 않는 이동이 같은 선을 지나면 선 전체가 켜진다"
  test('buildTimeline_a_later_full_move_on_the_same_edge_lights_both_ends_after_a_lost_one', async () => {
    const result = await buildFigure(`${PLAIN} lost=50%\n  a -> b time=1s`);
    const [first, second] = result.timeline.segs;

    assert.deepEqual([first.edgesLost, [...litIds(first, result.scene.edges)]], [[0], ['a']]);
    assert.deepEqual([second.edgesLost, [...litIds(second, result.scene.edges)].sort()], [undefined, ['a', 'b']]);
  });

  // 근거: 이슈 #120 완료 조건 "`lost`가 있는 흐름에서 점이 하나도 그려지지 않아도 그림 검사 14번 오류가 나지 않고, 없는 흐름은 지금처럼 오류다"
  test('buildFigure_check_14_does_not_report_a_lost_flow_without_dots_and_still_reports_one_without_lost', async () => {
    const late = (extra) => `${BASE}step "s" for=1s\n  track a -> b -> c time=4s at=5s ${extra}\n`;

    assert.deepEqual(await buildProblems(late('')), [{ code: 'check-14', line: 10 }]);
    assert.equal(await buildProblems(late('lost=50%')), undefined);
  });
});

describe('legs: leg times in the timetable', () => {
  // cost: time O(1), heap O(1), stack O(1)
  // basis: estimate
  // 세 선 흐름에서 구간 길이 비율과 구간 시간. pace의 꼭짓점에서 읽는다.
  async function legRun(options) {
    const result = await buildFigure(`${FOUR}step "s" for=20s\n  track a -> b -> c -> d ${options}\n`);
    const [hop] = result.timeline.segs[0].hops;
    const lengths = [hop.pace[1][1], hop.pace[2][1] - hop.pace[1][1], 1 - hop.pace[2][1]];
    const times = [hop.pace[1][0], hop.pace[2][0] - hop.pace[1][0], 1 - hop.pace[2][0]].map((share) => share * hop.ms);

    return { hop, lengths, times, result };
  }

  // 근거: 이슈 #120 완료 조건 "구간 시간 합계가 직접 지정, 나머지 배분, 거리 기반 순서로 정해진다" (`hops[].ms`, `pace`)
  test('buildTimeline_legs_direct_times_come_first_and_the_rest_of_time_is_shared_by_length', async () => {
    const direct = await legRun('legs="1s, 2s, 3s"');
    const shared = await legRun('time=6s legs="-, 1s, -"');
    const weight = shared.lengths[0] + shared.lengths[2];

    assert.equal(direct.hop.ms, 6000);
    assert.deepEqual(direct.times.map(Math.round), [1000, 2000, 3000]);
    assert.equal(shared.hop.ms, 6000);
    assert.ok(Math.abs(shared.times[1] - 1000) < 0.5);
    assert.ok(Math.abs(shared.times[0] - (5000 * shared.lengths[0]) / weight) < 0.5);
    assert.ok(Math.abs(shared.times[2] - (5000 * shared.lengths[2]) / weight) < 0.5);
    assert.ok(Math.abs(shared.times.reduce((sum, t) => sum + t, 0) - 6000) < 0.5);
    assert.deepEqual([direct.hop.pace.at(0), direct.hop.pace.at(-1)], [[0, 0], [1, 1]]);
  });

  // 근거: 설계 playback.md 구간별 이동 시간 3번 "time=이 없으면 `-` 구간은 거리 기반 시간이고 T는 합이다"
  test('buildTimeline_legs_without_time_use_the_distance_based_time_and_a_pace_close_to_the_identity', async () => {
    const { hop, lengths, times } = await legRun('legs="-, -, -"');

    assert.equal(hop.ms, Math.round(times.reduce((sum, t) => sum + t, 0)));
    lengths.forEach((length, i) => assert.ok(Math.abs(times[i] / hop.ms - length) < 0.02, `구간 ${i}: 시간 비율 ${times[i] / hop.ms}, 길이 비율 ${length}`));
  });

  // 근거: 설계 playback.md "점이 도형에 닿는 시각은 이동 곡선과 `pace`를 거꾸로 풀어 구하고, 값 변화 순서도 이 시각을 쓴다"
  test('buildTimeline_legs_arrival_times_and_value_changes_follow_the_pace_inverse', async () => {
    const source = `${FOUR}value nb "nb" on=b from=0\nvalue nc "nc" on=c from=0\nstep "s" for=20s\n  track a -> b -> c -> d time=8s legs="500ms, -, -" set="nb+1@b, nc+1@c"\n`;
    const result = await buildFigure(source);
    const [seg] = result.timeline.segs;
    const [hop] = seg.hops;
    const fraction = (id) => result.timeline.tracks[0].gaps[id][0];
    const expected = (id) => seg.t0 + hop.at + timeAtPosition(fraction(id), hop.pace) * hop.ms;
    const rows = Object.fromEntries(result.timeline.values.map((row) => [row.id, row.changes[0][0]]));

    assert.ok(Math.abs(rows.nb - expected(0)) < 1e-6);
    assert.ok(Math.abs(rows.nc - expected(1)) < 1e-6);
    assert.deepEqual(seg.pulses.map((p) => p.id), ['b', 'c', 'd']);
    assert.ok(seg.pulses[0].at < seg.pulses[1].at && seg.pulses[1].at < seg.pulses[2].at);
  });

  // 근거: 이슈 #120 완료 조건 "`legs`가 있어도 글 상자 계획 메모리가 이동 시간 20초(`PLAN_MAX_MS`) 상한에서 멈추고 기존 예제의 글 상자 위치가 바뀌지 않는다" (긴 이동 메모리 시험)
  test('buildTimeline_legs_chip_plan_stops_at_the_plan_limit_however_long_the_move_is', async () => {
    const plan = async (seconds) => (await buildFigure(`${FOUR}step "s" for=3600s\n  track a -> b -> c -> d "요청" legs="${seconds}s, ${seconds}s, ${seconds}s"\n`)).timeline.segs[0].hops[0].chipPath;
    const longPath = await plan(1100);
    const shortPath = await plan(1);
    const limit = Math.ceil(PLAN_MAX_MS / 33) + 2;

    assert.ok(longPath.length <= limit, `계획 지점 ${longPath.length}개`);
    assert.ok(shortPath.length <= limit);
    assert.equal(longPath.at(-1)[0], 1);
  });

  // 근거: 이슈 #120 "재생기 배속은 재생 시계에만 걸린다", 같은 입력은 같은 결과
  test('buildTimeline_legs_and_lost_make_the_same_timeline_for_the_same_source', async () => {
    const source = `${FOUR}value nb "nb" on=b from=0\nstep "s" for=9s status="b=ok"\n  track a -> b -> c -> d "x" legs="1s, -, 2s" time=5s lost=80% set="nb+1@b"\n`;
    const [one, two] = [await buildFigure(source), await buildFigure(source)];

    assert.deepEqual(one.timeline, two.timeline);
  });
});

describe('status: pills by step', () => {
  const SOURCE = `${BASE}step "하나" status="a=ok, b=warn"\n  a -> b time=1s\n  say "둘째 박자"\nstep "둘" for=3s\n  track a -> b -> c time=2s\nstep "셋" for=3s status="c=fail"\n  track a -> b -> c time=2s\nstep "넷"\n  a -> b time=1s\n`;

  // 근거: 이슈 #120 완료 조건 "단계 상태가 그 단계에서만 보이고 다음 단계는 선언 상태로 돌아간다" (`segs[].status`)
  test('buildTimeline_status_is_on_every_segment_of_its_step_only', async () => {
    const { timeline } = await buildFigure(SOURCE);
    const bySi = (si) => timeline.segs.filter((s) => s.si === si).map((s) => s.status);

    assert.deepEqual(bySi(0), [[{ node: 'a', kind: 'ok' }, { node: 'b', kind: 'warn' }], [{ node: 'a', kind: 'ok' }, { node: 'b', kind: 'warn' }]]);
    assert.deepEqual(bySi(1), [undefined]);
    assert.deepEqual(bySi(2), [[{ node: 'c', kind: 'fail' }]]);
    assert.deepEqual(bySi(3), [undefined]);
  });

  // 근거: 설계 playback.md 호환 "새 기능을 쓰지 않는 원본은 시간표와 출력이 같다": 새 필드는 쓴 구간에만 있다
  test('buildTimeline_a_figure_without_the_new_words_has_no_status_pace_cut_or_lost_fields', async () => {
    const { timeline } = await buildFigure(`${BASE}step "s"\n  a -> b time=1s\nstep "t" for=3s\n  track a -> b -> c time=2s\n`);
    const text = JSON.stringify(timeline);

    for (const word of ['status', 'pace', 'edgesLost']) assert.ok(!text.includes(`"${word}"`), word);
    assert.ok(!/"cut"/.test(text));
  });

  // 근거: 설계 playback.md 호환 "결과 파일의 재생기 스크립트와 스타일도 같다": 쓰지 않는 그림의 HTML과 SVG에는 상태, pace 재생기 코드와 스타일이 없다
  test('toHtml_and_toSvg_add_status_and_pace_code_only_to_figures_that_use_them', async () => {
    const plain = await buildFigure(`${BASE}step "s"\n  a -> b time=1s\n`);
    const used = await buildFigure(`${BASE}step "s" status="a=ok"\n  track a -> b -> c legs="1s, 1s"\n`);

    for (const marker of ['paceLength', '.fl-status', 'status-text']) assert.ok(!(await toHtml(plain, 'p')).includes(marker), marker);
    assert.ok(!(await toSvg(plain)).includes('status-text'));
    for (const marker of ['paceLength', '.fl-status', 'status-text']) assert.ok((await toHtml(used, 'u')).includes(marker), marker);
    assert.ok((await toSvg(used)).includes('status-text'));
    assert.ok(!(await toSvg(used, { isStatic: true })).includes('fl-status'));
  });

  // cost: time O(k), heap O(k), stack O(1)
  // vars: k = 키 수
  // basis: estimate
  // 상태 알약마다 { key: 도형 번호-종류, times, values }. 움직이는 SVG의 이산 불투명도 SMIL이다.
  function statusPillsOf(svg) {
    return [...svg.matchAll(/<g class="fl-status" data-st="([^"]+)" opacity="0">[\s\S]*?<animate attributeName="opacity" [^>]*keyTimes="([^"]*)" values="([^"]*)"\/><\/g>/g)].map(([, key, times, values]) => ({ key, times: times.split(';').map(Number), values: values.split(';').map(Number) }));
  }

  // 근거: 이슈 #120 완료 조건 "알약 표시를 25ms 간격으로 비교한다" (SMIL 값을 풀어 시간표 status와 비교)
  test('toSvg_status_pills_are_on_exactly_while_the_timeline_status_has_them_at_every_25ms', async () => {
    const result = await buildFigure(SOURCE);
    const { segs, total } = result.timeline;
    const pills = statusPillsOf(await toSvg(result));
    const index = new Map(result.scene.items.map((it, i) => [it.id, i]));

    assert.deepEqual(pills.map((p) => p.key).sort(), [`${index.get('a')}-ok`, `${index.get('b')}-warn`, `${index.get('c')}-fail`].sort());
    for (let t = 0; t < total; t += PROBE_MS) {
      const seg = segs.find((s) => t >= s.t0 && t < s.t1);
      if (segs.some((s) => Math.abs(t - s.t0) < EDGE_GUARD_MS)) continue;
      for (const pill of pills) {
        const expected = seg.status?.some(({ node, kind }) => `${index.get(node)}-${kind}` === pill.key) ? 1 : 0;

        assert.equal(discreteAt(pill, t / total), expected, `${pill.key} t=${t}ms`);
      }
    }
  });

  // 근거: 이슈 #120 완료 조건 "알약에 글자와 기호가 있어 색 없이도 구분된다" (알약 구조)
  test('toSvg_every_status_kind_draws_its_letters_and_a_symbol_next_to_the_colored_border', async () => {
    const kinds = { ok: 'OK', warn: 'WARN', fail: 'FAIL', wait: 'WAIT' };
    const symbols = {};
    for (const [kind, text] of Object.entries(kinds)) {
      const svg = await toSvg(await buildFigure(`${BASE}step "s" status="a=${kind}"\n  a -> b time=1s\n`));
      const pill = svg.match(/<g class="fl-status"[\s\S]*?<\/g>/)[0];

      assert.match(pill, new RegExp(`class="status-text">${text}</text>`));
      assert.match(pill, /<rect [^>]*stroke="var\(--color-/);
      symbols[kind] = pill.match(/<(path|circle)[\s\S]*?\/>/g).join('');
      assert.ok(symbols[kind].length > 0);
    }
    assert.equal(new Set(Object.values(symbols).map((s) => s.replace(/(stroke|fill)="[^"]*"/g, ''))).size, 4, '기호 모양이 종류마다 다르다');
  });

  // 근거: 이슈 #120 "라이트·다크 대비 3 이상", 설계 figure-syntax.md 단계별 도형 상태(기호와 테두리 그래픽 대비 3, 글자 fg 4.5)
  test('contrast_status_pill_borders_and_symbols_reach_3_on_the_shape_face_the_figure_ground_and_group_faces_and_text_reaches_4_5', () => {
    const roles = ['state.success', 'state.warning', 'state.error', 'outline'];
    for (const theme of ['light', 'dark']) {
      for (const role of roles) {
        for (const ground of ['node', 'bg', 'group-1', 'group-2', 'group-3']) {
          const ratio = contrast(themeColor(theme, role), themeColor(theme, ground));

          assert.ok(ratio >= 3, `${theme} ${role} on ${ground}: ${ratio.toFixed(2)}`);
        }
      }
      assert.ok(contrast(themeColor(theme, 'fg'), themeColor(theme, 'node')) >= 4.5, theme);
    }
  });

  // 근거: 이슈 #120 완료 조건 "알약이 도형 이름과 선 라벨을 가리지 않는다" (구조 시험, 그림 검사 2번). 겹치는 장면을 직접 짜서 판정 함수에 넘긴다.
  test('checkLabels_status_pill_over_an_edge_label_a_name_or_another_node_is_a_check_2_error_on_the_step_line', () => {
    const pill = { x: 100, y: 100, w: 56, h: 18, name: 'WARN', node: 'a' };
    const figure = { steps: [{ line: 7, status: [{ node: 'a', kind: 'warn' }] }] };
    const run = ({ pills = [], boxes = [], items = [] }) => {
      const errors = [];
      checkLabels({ pills, titles: [], boxes, family: { hint: 'x' }, statuses: [pill], figure, scene: { items, groups: [] } }, { error: (line, message) => errors.push([line, message]) });
      return errors;
    };
    const edge = { label: '선 라벨', no: undefined, line: 3 };
    const name = { x: 90, center: 112, width: 40, text: 'A', style: { size: 13, face: 'medium', line: 18 }, shape: 'box', labelLines: ['A'], subLines: [], w: 100, h: 46, y: 90 };

    assert.deepEqual(run({}), []);
    assert.match(run({ pills: [{ x: 120, y: 104, w: 40, h: 18, edge }] })[0][1], /overlaps edge label "선 라벨"/);
    assert.match(run({ boxes: [{ x: 120, y: 90, w: 80, h: 40, id: 'b', line: 4 }] })[0][1], /overlaps node "b"/);
    assert.deepEqual(run({ boxes: [{ x: 100, y: 100, w: 80, h: 40, id: 'a', line: 2 }] }), [], '자기 도형은 걸쳐 있어도 된다');
    assert.match(run({ items: [{ ...name, id: 'a', x: 70, y: 90 }] })[0][1], /covers the text "A"/);
    assert.deepEqual(run({ pills: [{ x: 120, y: 104, w: 40, h: 18, edge }] }).map(([line]) => line), [7]);
  });

  // 근거: 설계 figure-syntax.md "알약은 도형 오른쪽 위 모서리에 걸쳐 그려서 도형 크기와 배치를 바꾸지 않는다"
  test('buildFigure_status_does_not_change_the_scene_layout', async () => {
    const without = await buildFigure(`${BASE}step "s"\n  a -> b time=1s\n`);
    const withStatus = await buildFigure(`${BASE}step "s" status="a=ok, b=wait, c=fail"\n  a -> b time=1s\n`);

    assert.deepEqual(withStatus.scene.items.map(({ x, y, w, h }) => [x, y, w, h]), without.scene.items.map(({ x, y, w, h }) => [x, y, w, h]));
    assert.deepEqual([withStatus.scene.width, withStatus.scene.height], [without.scene.width, without.scene.height]);
  });
});

describe('SVG motion: lost and legs', () => {
  const SOURCE = `${FOUR}value nb "nb" on=b from=0\nstep "s" for=9s\n  track a -> b -> c -> d "요청" time=6s legs="500ms, -, 3s" lost=85% set="nb+1@b"\n  track a -> b -> c -> d "응답" at=1s time=4s legs="-, 2s, -"\nstep "t"\n  a -> b "한 번" lost=60% time=1s\n  a -> b "끝" lost=0%\n`;

  // 근거: 이슈 #120 완료 조건 "점 위치와 사라지는 시각, 도착 시각을 25ms 간격으로 비교한다" (SMIL 값을 풀어 시간표와 비교)
  test('toSvg_dots_follow_the_pace_and_vanish_at_the_cut_time_at_every_25ms', async () => {
    const result = await buildFigure(SOURCE);
    const svg = await toSvg(result);
    const { segs, total } = result.timeline;
    const hops = segs.flatMap((seg) => seg.hops.map((hop) => ({ seg, hop })));
    const packets = packetsOf(svg);

    assert.equal(packets.length, hops.length);
    packets.forEach(({ opacity, motion }, k) => {
      const { seg, hop } = hops[k];
      const start = seg.t0 + (hop.at ?? 0);
      const shownEnd = start + (hop.cut ?? hop.ms);
      assert.equal(motion.splines, undefined, `점 ${k}: pace나 cut이 있는 이동은 선형 키다`);
      for (let t = 0; t < total; t += PROBE_MS) {
        const u = Math.min(1, Math.max(0, (Math.min(t, shownEnd) - start) / hop.ms));
        const actual = pathFractionAt(motion, t / total);

        assert.ok(Math.abs(actual - positionAt(u, hop.pace)) < POSITION_TOLERANCE, `점 ${k} t=${t}ms: 길이 비율 ${actual.toFixed(4)}, 기대 ${positionAt(u, hop.pace).toFixed(4)}`);
        const position = positionAt(Math.min(1, Math.max(0, (t - start) / hop.ms)), hop.pace);
        const isInside = (hop.gaps ?? []).some(([from, to]) => position > from && position < to);
        const isNearEdge = [start, shownEnd, ...(hop.gaps ?? []).flatMap(([from, to]) => [start + timeAtPosition(from, hop.pace) * hop.ms, start + timeAtPosition(to, hop.pace) * hop.ms])].some((edge) => Math.abs(t - edge) < EDGE_GUARD_MS);
        if (!isNearEdge) assert.equal(discreteAt(opacity, t / total), t >= start && t < shownEnd && !isInside ? 1 : 0, `점 ${k} t=${t}ms: 보임`);
      }
    });
  });

  // 근거: 설계 playback.md 사라짐 "`lost=0%`는 점이 출발 지점에서 사라져 아무것도 통과하지 않는다": 0%인 점은 한 바퀴 내내 보이지 않는다
  test('toSvg_a_dot_lost_at_0_percent_is_never_shown', async () => {
    const result = await buildFigure(SOURCE);
    const svg = await toSvg(result);
    const hops = result.timeline.segs.flatMap((seg) => seg.hops);
    const k = hops.findIndex((hop) => hop.cut === 0);
    const { opacity } = packetsOf(svg)[k];

    assert.ok(k >= 0);
    assert.ok(opacity.values.every((value) => value === 0));
  });

  // 근거: 설계 playback.md 구간별 이동 시간 "글 상자 계획은 진행 비율로 담기므로 pace가 있어도 같은 계획", 움직이는 SVG와 재생기가 같은 글 상자 키를 읽는다
  test('toSvg_chip_slide_keys_of_a_paced_dot_end_inside_its_visible_window', async () => {
    const result = await buildFigure(SOURCE);
    const svg = await toSvg(result);
    const hops = result.timeline.segs.flatMap((seg) => seg.hops);
    const packets = packetsOf(svg);

    hops.forEach((hop, k) => {
      if (!hop.pace || hop.cut === 0 || !packets[k].slide.times) return;
      const keys = packets[k].slide.times;

      assert.ok(keys.every((time, i) => i === 0 || time >= keys[i - 1]));
    });
  });
});

describe('player: lost, legs and status in Chrome', { skip: CHROME ? false : 'Chrome이 없다' }, () => {
  const SOURCE = `${FOUR}value nb "nb" on=b from=0\nstep "s" for=9s status="a=ok, b=warn"\n  track a -> b -> c -> d "요청" time=6s legs="500ms, -, 3s" lost=85% set="nb+1@b"\nstep "t" status="c=fail"\n  a -> b "한 번" lost=60% time=1s\n  a -> b "끝" time=1s\nstep "u"\n  a -> b time=1s\n`;
  let browser;
  before(async () => {
    browser = await chromium.launch({ executablePath: CHROME });
  });
  after(async () => {
    await browser.close();
  });

  // cost: time O(page), heap O(page), stack O(1), io page
  // vars: page = 페이지 하나를 여는 비용
  // basis: estimate
  // 재생기를 열고 body(page, { result, html })를 돌린다. 시계는 가짜 시계다.
  function withPlayer(source, body) {
    return withFolder(async (folder) => {
      const result = await buildFigure(source);
      const html = await toHtml(result, 'lost');
      writeFileSync(join(folder, 'page.html'), html);
      const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.clock.install({ time: 0 });
      await page.goto(`file://${join(folder, 'page.html')}`);
      await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
      await body(page, { result, html });
      assert.deepEqual(errors, []);
      await page.close();
    });
  }

  // 재생기 데이터(figurePlay의 둘째 인자)를 HTML에서 읽는다.
  const dataOf = (html) => JSON.parse(html.match(/figurePlay\(document\.querySelector\('\.fl-figure'\), (\{[\s\S]*\})\);\n<\/script>/)[1].replace(/\\u003c/g, '<'));

  // 근거: 이슈 #120 완료 조건 "사라짐 위치, 단계 상태 복원, 구간 시간 합계가 움직이는 SVG와 HTML 재생기에서 일치한다. 점 위치와 사라지는 시각을 25ms 간격으로 비교한다"
  test('player_dot_position_and_vanish_time_match_the_timeline_at_every_25ms', async () => {
    await withPlayer(SOURCE, async (page, { result, html }) => {
      const data = dataOf(html);
      const [seg] = result.timeline.segs;
      const [hop] = seg.hops;
      const probes = Array.from({ length: Math.ceil(seg.t1 / PROBE_MS) }, (_, i) => i * PROBE_MS);
      const expected = probes.map((t) => ({ t, fraction: positionAt(Math.min(1, Math.max(0, t / hop.ms)), hop.pace), isShown: t < hop.cut }));
      const measured = await page.evaluate(
        ({ data: playerData, probes: list, hopData }) => {
          const root = document.querySelector('.fl-figure');
          const stage = createStage(root, playerData);
          const packet = createPacket(hopData, stage);
          const dot = [...stage.packetLayer.querySelectorAll('.fl-packet')].at(-1);
          const path = document.querySelector('#tp-0');
          const length = path.getTotalLength();
          return list.map(({ t, fraction }) => {
            packet.move(t);
            const point = path.getPointAtLength(length * fraction);
            const [, x, y] = /translate\(([-\d.e]+) ([-\d.e]+)\)/.exec(dot.getAttribute('transform'));
            return { dx: Number(x) - point.x, dy: Number(y) - point.y, opacity: Number(dot.style.opacity) };
          });
        },
        { data, probes: expected, hopData: data.segs[0].hops[0] },
      );

      assert.ok(hop.pace && hop.cut > 0);
      measured.forEach((m, i) => {
        const { t, isShown } = expected[i];
        const inside = hop.gaps.some(([from, to]) => expected[i].fraction > from && expected[i].fraction < to);
        assert.ok(Math.hypot(m.dx, m.dy) < 0.01, `t=${t}ms: 점이 시간표 위치에서 ${Math.hypot(m.dx, m.dy).toFixed(3)}px 떨어졌다`);
        // 사라지기 직전 cut-fade 동안은 서서히 흐려져 보임 여부를 가르지 않는다.
        if (Math.abs(t - hop.cut) > values.duration['cut-fade'] && !inside) assert.equal(m.opacity > 0.5, isShown, `t=${t}ms: 보임`);
      });
    });
  });

  // 근거: 이슈 #120 완료 조건 "pause, rate, restart와 단계 직접 선택이 ... 단계 상태를 바꾸지 않는다" (재생기를 가짜 시계로 돌려 조작 뒤 상태 비교)
  test('player_status_pills_follow_the_step_through_pause_rate_restart_and_direct_selection', async () => {
    await withPlayer(SOURCE, async (page, { result }) => {
      const { segs, total } = result.timeline;
      const index = new Map(result.scene.items.map((it, i) => [it.id, i]));
      const keysAt = (si) => (segs.find((s) => s.si === si).status ?? []).map(({ node, kind }) => `${index.get(node)}-${kind}`).sort();
      const shown = () => page.evaluate(() => [...document.querySelectorAll('.fl-status')].filter((el) => el.getAttribute('opacity') === '1').map((el) => el.dataset.st).sort());
      const tabs = page.locator('.fl-tabs button');

      await page.clock.runFor(100);
      assert.deepEqual(await shown(), keysAt(0));
      await tabs.nth(1).click();
      await page.clock.runFor(100);
      assert.deepEqual(await shown(), keysAt(1), '단계를 직접 고르면 그 단계의 상태다');
      await tabs.nth(2).click();
      await page.clock.runFor(100);
      assert.deepEqual(await shown(), [], '상태를 적지 않은 단계는 선언 상태다');
      await tabs.nth(0).click();
      await page.locator('.fl-pause').click();
      await page.clock.runFor(5000);
      assert.deepEqual(await shown(), keysAt(0), '일시정지 동안 상태가 그대로다');
      await page.locator('.fl-rate').click();
      await page.locator('.fl-pause').click();
      await page.clock.runFor(100);
      assert.deepEqual(await shown(), keysAt(0));
      await page.locator('.fl-pause').click();
      await tabs.nth(1).click();
      await page.locator('.fl-pause').click();
      await page.clock.runFor(total + 500);
      await tabs.nth(0).click();
      await page.clock.runFor(100);
      assert.deepEqual(await shown(), keysAt(0), '다시 시작해도 첫 단계 상태다');
    });
  });
});
