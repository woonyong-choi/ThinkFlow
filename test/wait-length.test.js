// 점이 출발하지 않은 대기가 박자와 단계의 길이에 들어가는지(docs/design/playback.md 박자 길이, 대기가 끝나는 때, 시간 상한). 이슈 #135.
// 시간표, 움직이는 SVG(SMIL), HTML 재생기(가짜 시계)의 전체 길이가 같은지 본다. 재생기 시험은 Chrome이 없으면 건너뛴다. 경로는 CHROME_PATH로 바꿀 수 있다.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright-core';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { TIME_LIMIT_MS } from '../src/source/values.js';
import { packetsOf } from './smil.js';

const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((path) => path && existsSync(path));
// keyTimes는 한 바퀴 비율의 소수 5자리라 시각으로는 이만큼(ms) 어긋난다
const EDGE_MS = 2;
// 값 하나(n)와 도형 셋. 이슈 원본의 앞부분이다.
const HEAD = 'flow right\nbox a "A"\nbox b "B"\nbox c "C"\nvalue n "N" on=a\nvalue holder "쥔 쪽" on=c from=none\na -> b\nb -> c\na -> c\n';
// 이슈 원본: 60초 대기가 점 없이 시간 초과로 끝나고 else가 없다.
const ISSUE = 'flow right\nbox a "A"\nbox b "B"\nvalue n "N" on=a\na -> b\nstep "Wait"\n a -> b wait="n=1" timeout=60s\nstep "Next"\n a -> b time=1s\n';

// 단계 si의 박자 구간 목록
const segsOf = (timeline, si) => timeline.segs.filter((seg) => seg.si === si);
// 박자 구간 seg가 대기 w를 품는다
const holds = (seg, w) => seg.t0 <= w.t0 && w.t1 <= seg.t1;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
// 만들기가 오류로 끝나면 그 진단 목록 { code, line }, 아니면 빈 목록이다.
async function errorsOf(source) {
  try {
    await buildFigure(source);
    return [];
  } catch (error) {
    if (!error.problems) throw error;
    return error.problems.map(({ code, line }) => ({ code, line }));
  }
}

// 근거: 이슈 #135 완료 조건 "원본의 다음 단계가 60000ms 전에 시작하지 않고 모든 대기 시각이 해당 구간과 전체 시간 안에 있다", 설계 playback.md 박자 길이
test('buildFigure_the_issue_source_starts_the_next_step_after_the_60s_timeout_and_keeps_every_wait_inside_its_beat', async () => {
  const { timeline } = await buildFigure(ISSUE);
  const [first] = segsOf(timeline, 0);
  const [next] = segsOf(timeline, 1);
  const [wait] = timeline.waits;

  assert.deepEqual([wait.t0, wait.t1, wait.end], [0, 60000, 'timeout']);
  assert.ok(first.t1 >= 60000, `첫 단계가 ${first.t1}ms에 끝난다`);
  assert.ok(next.t0 >= 60000, `다음 단계가 ${next.t0}ms에 시작한다`);
  assert.equal(next.t0, first.t1);
  assert.ok(timeline.waits.every((w) => timeline.segs.some((seg) => holds(seg, w)) && w.t1 <= timeline.total));
  assert.equal(timeline.total, next.t1);
});

// 근거: 이슈 #135 완료 조건 "else 없는 timeout", 설계 playback.md 대기가 끝나는 때 "timeout: else가 없으면 그 점은 만들지 않는다"
test('buildFigure_a_timeout_without_else_runs_the_beat_until_the_wait_ends_and_the_next_beat_and_step_start_after_it', async () => {
  const { timeline } = await buildFigure(`${HEAD}step "s"\n  b -> c time=1s wait="holder='go'" timeout=20s\n  a -> c time=2s\nstep "t"\n  a -> c time=1s\n`);
  const [first, second] = segsOf(timeline, 0);
  const [after] = segsOf(timeline, 1);

  assert.deepEqual(timeline.waits.map(({ end, t0, t1 }) => [end, t1 - t0]), [['timeout', 20000]]);
  assert.ok(first.t1 - first.t0 >= 20000);
  assert.equal(first.hops.length, 0, '점이 출발하지 않는다');
  assert.ok(second.t0 >= first.t0 + 20000, '다음 박자는 앞 대기가 끝난 뒤 시작한다');
  assert.equal(after.t0, second.t1);
  assert.ok(after.t0 >= 20000 + 2000, '다음 단계는 두 박자가 끝난 뒤 시작한다');
});

// 근거: 이슈 #135 완료 조건 "다른 짧은 이동과 병렬인 대기", 설계 playback.md 박자 길이 "move와 대기가 끝난 시각 가운데 늦은 쪽"
test('buildFigure_a_wait_that_runs_beside_a_short_move_stretches_the_beat_to_the_wait_end', async () => {
  const { timeline } = await buildFigure(`${HEAD}step "s"\n  b -> c time=1s wait="holder='go'" timeout=20s & a -> c time=1s\nstep "t"\n  a -> c time=1s\n`);
  const [beat] = segsOf(timeline, 0);
  const [after] = segsOf(timeline, 1);

  assert.deepEqual(beat.hops.map((hop) => hop.ms), [1000], '짧은 이동만 출발한다');
  assert.equal(beat.move, 1000, 'move는 점의 움직임만 센다');
  assert.ok(beat.t1 - beat.t0 >= 20000);
  assert.ok(after.t0 >= beat.t0 + 20000);
});

// 근거: 이슈 #135 완료 조건 "기다린 뒤 when=false", 설계 playback.md 조건과 대기 "wait가 풀린 직후 when이 거짓이어도 건너뛴 것으로 skips에 남고 waits에는 released로 남는다"
test('buildFigure_a_wait_released_and_then_skipped_by_a_false_when_keeps_the_beat_and_the_next_step_after_the_release', async () => {
  const source = `${HEAD}b -> a\nstep "s"\n  a -> c time=3s set="holder=none"\nstep "t" keep="holder"\n  a -> c time=3s set="holder=go" & b -> c time=1s wait="holder='go'" when="n=9"\nstep "u"\n  a -> c time=1s\n`;
  const { timeline } = await buildFigure(source);
  const [beat] = segsOf(timeline, 1);
  const [after] = segsOf(timeline, 2);
  const [wait] = timeline.waits;

  assert.equal(wait.end, 'released');
  assert.equal(timeline.skips.length, 1);
  assert.equal(timeline.skips[0].t, wait.t1);
  assert.ok(holds(beat, wait));
  assert.ok(after.t0 >= wait.t1);
});

// 근거: 이슈 #135 완료 조건 "다음 박자와 다음 단계의 시간은 앞 대기 종료 이후", 설계 playback.md 박자 길이
test('buildFigure_every_beat_and_step_after_a_wait_starts_at_or_after_the_end_of_that_wait', async () => {
  const source = `${HEAD}step "s"\n  a -> b wait="n=1" timeout=7s\n  a -> b wait="n=1" timeout=11s\n  say "끝"\nstep "t"\n  b -> c wait="holder='go'" timeout=5s else=a\n  a -> c time=1s\n`;
  const { timeline } = await buildFigure(source);

  for (const w of timeline.waits) {
    const owner = timeline.segs.find((seg) => holds(seg, w));
    assert.ok(owner, `${w.line}번 줄 대기가 한 박자 안에 든다`);
    for (const later of timeline.segs.filter((seg) => seg.t0 > owner.t0)) assert.ok(later.t0 >= w.t1, `${later.t0}ms 박자는 ${w.t1}ms에 끝난 대기 뒤에 시작한다`);
  }
  assert.deepEqual(segsOf(timeline, 0).map((seg) => seg.t1 - seg.t0 >= 7000), [true, true, false]);
  assert.equal(timeline.waits.length, 3);
});

// 근거: 이슈 #135 완료 조건 "누적 1시간 초과는 입력 진단으로 끝난다", 설계 시간 상한 "단계 길이와 전체 시간에는 자동으로 더하는 시간이 모두 들어간다"
describe('time limit with a wait that starts no dot', () => {
  // 대기가 길 때 박자에 더해지는 고정 멈춤(설명 멈춤과 단계 끝 멈춤)을 재어, 대기가 끝난 박자의 끝이 정확히 1시간이 되도록 timeout을 정한다.
  const make = (timeout) => `${HEAD}step "s"\n  a -> b wait="n=1" timeout=${timeout}ms\n`;

  test('buildFigure_a_beat_stretched_only_by_a_wait_passes_at_exactly_one_hour_and_ends_with_time_limit_one_millisecond_over', async () => {
    const fixed = (await buildFigure(make(1_000_000))).timeline.total - 1_000_000;

    assert.deepEqual(await errorsOf(make(TIME_LIMIT_MS - fixed)), []);
    const over = await errorsOf(make(TIME_LIMIT_MS - fixed + 1));

    assert.equal(over.length, 1);
    assert.equal(over[0].code, 'time-limit');
  });

  test('buildFigure_waits_that_add_up_over_one_hour_across_beats_end_with_time_limit_at_the_second_wait', async () => {
    const two = (timeout) => `${HEAD}step "s"\n  a -> b wait="n=1" timeout=${timeout}ms\n  a -> b wait="n=1" timeout=${timeout}ms\n`;
    const fixed = (await buildFigure(two(1_000_000))).timeline.total - 2_000_000;

    assert.deepEqual(await errorsOf(two((TIME_LIMIT_MS - fixed) / 2)), []);
    const over = await errorsOf(two((TIME_LIMIT_MS - fixed) / 2 + 1));

    assert.equal(over.length, 1);
    assert.equal(over[0].code, 'time-limit');
  });
});

// 근거: 이슈 #135 완료 조건 "점이 없는 대기 시간도 SVG와 HTML의 전체 재생 길이에 반영한다", 설계 playback.md 박자 길이
test('toSvg_the_loop_length_and_the_next_step_dot_follow_the_timetable_when_a_wait_starts_no_dot', async () => {
  const result = await buildFigure(ISSUE);
  const { timeline } = result;
  const svg = await toSvg(result, { name: 'issue' });
  const durations = new Set([...svg.matchAll(/ dur="([\d.]+)s"/g)].map(([, s]) => s));
  const [dot] = packetsOf(svg);
  const shownAt = dot.opacity.times[dot.opacity.values.indexOf(1)] * timeline.total;

  assert.ok(timeline.total > 60000);
  assert.deepEqual([...durations], [`${timeline.total / 1000}`], 'SMIL 한 바퀴가 시간표 전체 길이와 같다');
  assert.ok(shownAt >= 60000 - EDGE_MS, `다음 단계의 점이 ${shownAt.toFixed(1)}ms에 보이기 시작한다`);
  assert.ok(Math.abs(shownAt - segsOf(timeline, 1)[0].t0) <= EDGE_MS + 1);
});

describe('player', { skip: CHROME ? false : 'Chrome이 없다' }, () => {
  let browser;
  before(async () => {
    browser = await chromium.launch({ executablePath: CHROME });
  });
  after(async () => {
    await browser.close();
  });

  // 근거: 이슈 #135 완료 조건 "점이 없는 대기 시간도 HTML의 전체 재생 길이에 반영한다"(가짜 시계로 재생기를 흘려 단계 탭이 켜지는 시각을 잰다)
  test('player_turns_on_the_next_step_only_after_the_wait_and_wraps_at_the_timetable_total', async () => {
    const result = await buildFigure(ISSUE);
    const { timeline } = result;
    const html = await toHtml(result, 'issue');
    const data = JSON.parse(html.match(/figurePlay\(document\.querySelector\('\.fl-figure'\), (\{[\s\S]*\})\);\n<\/script>/)[1].replace(/\\u003c/g, '<'));
    const nextAt = segsOf(timeline, 1)[0].t0;
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const stepOf = () => page.evaluate(() => [...document.querySelectorAll('.fl-tabs button')].findIndex((button) => button.classList.contains('on')));
    try {
      await page.clock.install({ time: 0 });
      await page.clock.pauseAt(3_600_000);
      await page.setContent(html);
      await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
      const seen = [];
      for (const [label, until] of [['대기 중', 59_000], ['대기가 끝난 직후', nextAt - 100], ['다음 단계 시작 직후', nextAt + 200], ['한 바퀴 끝 직후', timeline.total + 200]]) {
        await page.clock.runFor(until - (seen.at(-1)?.at ?? 0));
        seen.push({ label, at: until, step: await stepOf() });
      }

      assert.equal(data.segs.at(-1).t1, timeline.total, '재생기가 읽는 전체 길이가 시간표와 같다');
      assert.deepEqual(seen.map(({ step }) => step), [0, 0, 1, 0], seen.map(({ label, at, step }) => `${label} ${at}ms 단계 ${step}`).join(', '));
    } finally {
      await page.close();
    }
  });
});
