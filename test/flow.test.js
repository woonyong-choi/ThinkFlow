// 흐름(track)과 값(value, set=, tone=): 오류 진단, 값이 도착 순서대로 바뀌는지(시간표), 갈래색 이름 집합.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { findClashes } from '../src/chip-clash.js';
import { flowSeg } from '../src/timeline-flow.js';
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
