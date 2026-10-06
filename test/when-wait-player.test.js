// 조건과 대기의 결과가 움직이는 SVG와 HTML 재생기에서 같다(docs/design/playback.md 이벤트 순서, 대기가 끝나는 때).
// 대기가 풀린 시각과 시간 초과 분기 이동을 SMIL 값을 25ms 간격으로 풀어 시간표와 재생기에 맞추고, 재생기를 가짜 시계로 돌려 일시정지, 배속, 재시작, 단계 직접 선택이 값과 점의 결과를 바꾸지 않는지 본다.
// 재생기 시험은 Chrome이 없으면 건너뛴다. 경로는 CHROME_PATH로 바꿀 수 있다.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright-core';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { values } from '../src/tokens.js';
import { discreteAt, packetsOf } from './smil.js';
import { withFolder } from './helpers.js';

const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((path) => path && existsSync(path));
const EXAMPLES = new URL('../examples/', import.meta.url);
const NAMES = ['mutex-wait', 'queue-wait', 'circuit-breaker', 'deadlock-wait'];
// SMIL을 풀고 재생기를 재는 간격(ms)
const PROBE_MS = 25;
// keyTimes는 한 바퀴 비율의 소수 5자리라 시각으로는 이만큼(ms) 어긋난다
const EDGE_MS = 2;
// 가짜 시계를 멈추는 시각(ms). 설치한 뒤 실제 시간이 이만큼 흐르기 전에 멈춰야 하므로 느린 환경도 견딜 만큼 멀리 둔다.
const PAUSE_AT_MS = 600_000;
// 켜짐이 바뀔 때 새 값으로 서서히 가는 시간(ms). SVG keyframes의 켜진 값은 이 시간 뒤에 닿는다.
const FADE_MS = values.duration.fast;

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
const sourceOf = (name) => readFileSync(new URL(`${name}.dap`, EXAMPLES), 'utf8');

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 시간표 이동 수
// basis: estimate
// 시간표의 이동마다 { seg, hop, start }. start는 그림 전체 출발 시각(구간 시작에 출발 뒤 시간 at을 더한 값)이다.
const hopsOf = (timeline) => timeline.segs.flatMap((seg) => seg.hops.map((hop) => ({ seg, hop, start: seg.t0 + (hop.at ?? 0) })));

// 근거: 이슈 #119 완료 조건 "대기 해제 시각과 분기 이동이 움직이는 SVG와 HTML 재생기에서 같다. SMIL 값을 25ms 간격으로 풀어 재생기 상태와 비교"
test('toSvg_a_dot_released_from_a_wait_or_sent_to_the_else_shape_starts_at_the_wait_end_time_in_the_timeline_and_the_smil', async () => {
  let checked = 0;
  for (const name of NAMES) {
    const result = await buildFigure(sourceOf(name), { baseDir: 'examples' });
    const { timeline } = result;
    const hops = hopsOf(timeline);
    const packets = packetsOf(await toSvg(result, { name }));
    const total = timeline.total;

    assert.equal(packets.length, hops.length, name);
    for (const wait of timeline.waits.filter((w) => w.end === 'released' || w.end === 'timeout')) {
      // 풀린 점은 그 줄의 이동이고, 시간 초과로 끝난 분기 점은 else 도형으로 가는 같은 줄의 이동이다
      const index = hops.findIndex(({ hop, start }) => hop.line === wait.line && Math.abs(start - wait.t1) <= 1 && (wait.end === 'released' ? true : hop.at > 0));
      if (wait.end === 'timeout' && index < 0) continue;
      const { opacity } = packets[index];
      const shownAt = opacity.times[opacity.values.indexOf(1)] * total;

      assert.ok(index >= 0, `${name}: 대기 끝(${wait.t1}ms)에 출발한 점이 시간표에 있다`);
      assert.ok(Math.abs(shownAt - wait.t1) <= EDGE_MS, `${name}: SMIL 점이 ${shownAt.toFixed(1)}ms에 보이기 시작하고 대기는 ${wait.t1}ms에 끝난다`);
      for (let t = Math.floor(wait.t1 / PROBE_MS) * PROBE_MS - 4 * PROBE_MS; t < wait.t1 + 8 * PROBE_MS; t += PROBE_MS) {
        if (Math.abs(t - wait.t1) <= EDGE_MS || Math.abs(t - wait.t1 - hops[index].hop.ms) <= EDGE_MS || t < 0 || t > total) continue;
        const end = hops[index].start + (hops[index].hop.cut ?? hops[index].hop.ms);
        const isInside = (hops[index].hop.gaps ?? []).some(([a, b]) => t > hops[index].start + a * hops[index].hop.ms && t < hops[index].start + b * hops[index].hop.ms);
        if (isInside || Math.abs(t - end) <= EDGE_MS) continue;

        assert.equal(discreteAt(opacity, t / total), t >= wait.t1 && t < end ? 1 : 0, `${name}: t=${t}ms 점의 보임이 대기 끝 시각을 따른다`);
      }
      checked++;
    }
  }
  assert.ok(checked >= 6, '풀림과 시간 초과 점을 여럿 재었다');
});

// 근거: 계약 "기다리는 점은 그리지 않고 선도 켜지 않는다"(움직이는 SVG의 선은 풀린 시각에 켜진다)
test('toSvg_the_edge_of_a_waiting_dot_lights_at_the_release_time_and_not_at_the_beat_start', async () => {
  const result = await buildFigure(sourceOf('mutex-wait'), { baseDir: 'examples' });
  const { timeline } = result;
  const seg = timeline.segs.find((s) => s.edgesAt && Object.keys(s.edgesAt).length);
  const svg = await toSvg(result, { name: 'mutex-wait' });
  const [[edge, at]] = Object.entries(seg.edgesAt);
  const className = new RegExp(`<path id="p-${edge}"[^>]* class="fl-path (a\\d+)"`).exec(svg)[1];
  const frames = new RegExp(`@keyframes ${className} \\{ ([^\\n]*?) \\}\\n`).exec(svg)[1];
  const lit = [...frames.matchAll(/([\d.]+)%(?:,[\d.]+%)? \{ ([^}]*) \}/g)].find(([, , body]) => body.includes('--color-state-active'));
  const beatStart = (seg.t0 / timeline.total) * 100;
  const shownAt = (Number(lit[1]) / 100) * timeline.total;

  assert.ok(at > 0 && !seg.edgesOn.includes(Number(edge)), '대기가 풀려 처음 켜지는 선은 박자 시작에 켜 두지 않는다');
  assert.ok(Math.abs(shownAt - (seg.t0 + at + FADE_MS)) <= EDGE_MS, `선이 ${shownAt.toFixed(1)}ms에 켜진다(풀린 시각 ${seg.t0 + at}ms)`);
  assert.ok(Number(lit[1]) > beatStart + 0.5, '박자 시작에 켜지지 않는다');
});

describe('player', { skip: CHROME ? false : 'Chrome이 없다' }, () => {
  let browser;
  before(async () => {
    browser = await chromium.launch({ executablePath: CHROME });
  });
  after(async () => {
    await browser.close();
  });

  // cost: time O(1), heap O(1), stack O(1), io 1
  // basis: estimate
  // 지금 재생기 화면의 { step, values, dots }. values는 값 줄마다 보이는 글자, dots는 보이는 점의 번호(만든 차례)다.
  const sample = (page) =>
    page.evaluate(() => {
      const step = [...document.querySelectorAll('.fl-tabs button')].findIndex((button) => button.classList.contains('on'));
      const rows = [...new Set([...document.querySelectorAll('[data-v]')].map((el) => el.dataset.v))];
      const shown = rows.flatMap((vi) => {
        const text = [...document.querySelectorAll(`[data-v="${vi}"]`)].filter((el) => el.getAttribute('opacity') === '1').map((el) => el.dataset.t);
        return text.length ? [[Number(vi), text.join('|')]] : [];
      });
      const dots = [...document.querySelectorAll('.fl-packet')].flatMap((el, i) => (Number(el.style.opacity) > 0.5 ? [i] : []));
      return { step, values: shown, dots };
    });

  // cost: time O(F), heap O(F), stack O(1), io F
  // vars: F = 프레임 수
  // basis: estimate
  // 재생기를 가짜 시계로 프레임마다 흘리며 { t, step, values, dots } 목록을 모은다. until(frames)가 true가 되거나 limitMs가 다하면 멈춘다.
  async function runFrames(page, { limitMs, until = () => false }) {
    const frames = [];
    for (let t = PROBE_MS; t <= limitMs && !until(frames); t += PROBE_MS) {
      await page.clock.runFor(PROBE_MS);
      frames.push({ t, ...(await sample(page)) });
    }
    return frames;
  }

  // cost: time O(F), heap O(F), stack O(1)
  // vars: F = 프레임 수
  // basis: estimate
  // 같은 상태가 이어지는 프레임을 하나로 묶은 목록 { at, step, values, dots }
  const runsOf = (frames) =>
    frames.reduce((runs, { t, step, values: shown, dots }) => {
      const last = runs.at(-1);
      if (last && last.step === step && JSON.stringify([last.values, last.dots]) === JSON.stringify([shown, dots])) return runs;
      return [...runs, { at: t, step, values: shown, dots }];
    }, []);

  // cost: time O(F), heap O(F), stack O(1)
  // vars: F = 프레임 수
  // basis: estimate
  // 단계 step이 처음 켜져 있는 동안의 상태 목록(시각 없이)
  const statesOfStep = (runs, step) => {
    const from = runs.findIndex((run) => run.step === step);
    const to = runs.findIndex((run, i) => i > from && run.step !== step);
    return runs.slice(from, to < 0 ? runs.length : to).map(({ values: shown, dots }) => [shown, dots]);
  };

  // cost: time O(1), heap O(1), stack O(1), io 3
  // basis: estimate
  // 원본의 재생기 HTML을 가짜 시계로 연 페이지로 body(page, result, html)를 돌린다. 끝나면 임시 폴더를 지운다.
  function withPlayer(name, body) {
    return withFolder(async (folder) => {
      const result = await buildFigure(sourceOf(name), { baseDir: 'examples' });
      const html = await toHtml(result, name);
      writeFileSync(join(folder, 'page.html'), html);
      const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
      // 가짜 시계는 설치만 하면 실제 시간으로 흘러 결과가 실행마다 달라진다. 페이지를 열기 전에 멈춰 두고 runFor로만 흘린다.
      await page.clock.install({ time: 0 });
      await page.clock.pauseAt(PAUSE_AT_MS);
      await page.goto(`file://${join(folder, 'page.html')}`);
      await page.click('.fl-pause');
      await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
      try {
        return await body(page, result, html);
      } finally {
        await page.close();
      }
    });
  }

  const references = new Map();
  // cost: time O(F), heap O(F), stack O(1), io F
  // vars: F = 프레임 수
  // basis: estimate
  // 처음부터 한 바퀴 재생한 기준 상태 목록. 원본마다 한 번만 만든다.
  const referenceOf = (name) => {
    if (!references.has(name)) references.set(name, withPlayer(name, async (page, { timeline }) => ({ runs: runsOf(await runFrames(page, { limitMs: timeline.total * 1.1 })), timeline })));
    return references.get(name);
  };

  const eachSource = (body) => async () => {
    for (const name of NAMES) await body(name);
  };

  // 근거: 이슈 #119 완료 조건 "대기 해제 시각과 분기 이동이 움직이는 HTML 재생기에서 같다"(재생기 점이 시간표의 출발 시각에 나타난다)
  test('player_dots_appear_at_the_release_and_branch_times_of_the_timeline', async () => {
    for (const name of ['mutex-wait', 'queue-wait']) {
      await withPlayer(name, async (page, { timeline }, html) => {
        const data = JSON.parse(html.match(/figurePlay\(document\.querySelector\('\.fl-figure'\), (\{[\s\S]*\})\);\n<\/script>/)[1].replace(/\\u003c/g, '<'));
        const released = timeline.waits.filter((w) => w.end === 'released' || w.end === 'timeout');
        let checked = 0;

        assert.ok(released.length > 0, name);
        for (const wait of released) {
          const si = data.segs.findIndex((s) => s.t0 <= wait.t1 && wait.t1 < s.t1);
          const seg = data.segs[si];
          const hopIndex = seg.hops.findIndex((hop) => hop.line === wait.line && Math.abs(seg.t0 + (hop.at ?? 0) - wait.t1) <= 1);
          if (hopIndex < 0) continue;
          const probes = await page.evaluate(
            ({ data: playerData, si: segIndex, hop: hopI, at, ms }) => {
              const stage = createStage(document.querySelector('.fl-figure'), playerData);
              const target = playerData.segs[segIndex];
              resetPackets(stage, target);
              const packet = stage.packets[hopI];
              // 이 박자의 점은 층 맨 끝에 만들어진다(재생기가 이미 그린 점이 앞에 있다)
              const layer = [...stage.packetLayer.querySelectorAll('.fl-packet')];
              const element = layer[layer.length - target.hops.length + hopI];
              const shown = (elapsed) => {
                packet.move(elapsed);
                return Number(element.style.opacity) > 0.5;
              };
              return { before: shown(at - 30), after: shown(at + Math.min(ms / 2, 300)) };
            },
            { data, si, hop: hopIndex, at: seg.hops[hopIndex].at, ms: seg.hops[hopIndex].ms },
          );

          assert.equal(probes.before, false, `${name}: 대기 끝(${wait.t1}ms) 전에는 점이 보이지 않는다`);
          assert.equal(probes.after, true, `${name}: 대기 끝 뒤에는 점이 보인다`);
          checked++;
        }
        assert.ok(checked > 0, name);
      });
    }
  });

  // 근거: 계약 "기다리는 점은 선도 켜지 않는다", 재생기가 풀린 시각에 선을 켠다(SVG와 같은 시각)
  test('player_edge_of_a_waiting_dot_turns_on_at_the_release_time', async () => {
    await withPlayer('mutex-wait', async (page, { timeline }, html) => {
      const data = JSON.parse(html.match(/figurePlay\(document\.querySelector\('\.fl-figure'\), (\{[\s\S]*\})\);\n<\/script>/)[1].replace(/\\u003c/g, '<'));
      const si = data.segs.findIndex((s) => s.edgesAt && Object.keys(s.edgesAt).length);
      const [[edge, at]] = Object.entries(data.segs[si].edgesAt);
      const state = await page.evaluate(
        ({ data: playerData, si: segIndex, edge: edgeIndex, at: lightAt }) => {
          const stage = createStage(document.querySelector('.fl-figure'), playerData);
          const target = playerData.segs[segIndex];
          drawSegmentState(stage, target, false);
          const isOn = () => document.querySelector(`#e-${edgeIndex}`).classList.contains('on');
          const out = { start: isOn() };
          advanceStage(stage, target, lightAt - 1);
          out.before = isOn();
          advanceStage(stage, target, lightAt + 1);
          out.after = isOn();
          return out;
        },
        { data, si, edge: Number(edge), at },
      );

      assert.ok(at > 0 && timeline.segs[si].edgesAt);
      assert.deepEqual(state, { start: false, before: false, after: true });
    });
  });

  // 근거: 이슈 #119 완료 조건 "pause, rate, restart와 단계 직접 선택이 대기와 값 결과를 바꾸지 않는다", 설계 playback.md 이벤트 순서 "재생 시계만 움직이고 계산을 다시 하지 않는다"
  test('player_pause_and_rate_changes_do_not_change_the_waits_values_and_dots_of_a_lap', eachSource(async (name) => {
    const { runs, timeline } = await referenceOf(name);
    const states = (list) => list.map(({ step, values: shown, dots }) => [step, shown, dots]);
    const total = timeline.total;
    // 한 바퀴 안의 상태(마지막 단계가 끝나기까지)
    const lapEnd = runs.findLastIndex((run) => run.step === timeline.steps.length - 1) + 1;
    const lapOf = (list) => states(runsOf(list)).slice(0, lapEnd);

    await withPlayer(name, async (page) => {
      const before = await runFrames(page, { limitMs: total / 2 });
      await page.click('.fl-pause');
      const paused = await sample(page);
      const during = await runFrames(page, { limitMs: 3000 });
      await page.click('.fl-pause');
      const after = await runFrames(page, { limitMs: total * 1.1 - total / 2 });

      assert.ok(during.every(({ step, values: shown, dots }) => JSON.stringify([step, shown, dots]) === JSON.stringify([paused.step, paused.values, paused.dots])), `${name}: 멈춘 동안 값과 점이 그대로다`);
      assert.deepEqual(lapOf([...before, ...during, ...after]), states(runs).slice(0, lapEnd), `${name}: 일시정지 뒤 이어도 같다`);
    });
    for (const clicks of [1, 2]) {
      await withPlayer(name, async (page) => {
        for (let i = 0; i < clicks; i++) await page.click('.fl-rate');
        const rate = clicks === 1 ? 2 : 0.5;
        const frames = await runFrames(page, { limitMs: (total * 1.1) / rate });

        assert.deepEqual(lapOf(frames).map(([step, shown]) => [step, shown]), states(runs).slice(0, lapEnd).map(([step, shown]) => [step, shown]), `${name}: ${rate}배속에서 값이 바뀌는 차례가 같다`);
      });
    }
  }));

  // 근거: 이슈 #119 완료 조건 "단계 직접 선택이 대기와 값 결과를 바꾸지 않는다"(앞 단계를 다시 재생하지 않는다)
  test('player_selecting_a_step_directly_shows_the_same_values_and_dots_as_playing_up_to_it', eachSource(async (name) => {
    const { runs, timeline } = await referenceOf(name);

    for (let step = 0; step < timeline.steps.length; step++) {
      await withPlayer(name, async (page) => {
        await page.click(`.fl-tabs button:nth-child(${step + 1})`);
        await page.click('.fl-pause');
        const first = await sample(page);
        const frames = await runFrames(page, { limitMs: timeline.total, until: (list) => list.length && list.at(-1).step !== step });
        const own = statesOfStep(runsOf([{ t: 0, ...first }, ...frames]), step);

        assert.deepEqual(first.values.map(([, text]) => text), timeline.values.filter((row) => row.si === step).map((row) => row.initial), `${name}: ${step}번 단계의 시작 값은 시간표의 initial이다`);
        assert.deepEqual(own.map(([shown]) => shown), statesOfStep(runs, step).map(([shown]) => shown), `${name}: ${step}번 단계를 바로 고른 값 변화가 처음부터 재생한 값 변화와 같다`);
        assert.deepEqual(own.map(([, dots]) => dots.length > 0), statesOfStep(runs, step).map(([, dots]) => dots.length > 0), `${name}: ${step}번 단계의 점이 보이는 차례가 같다`);
      });
    }
  }));

  // 근거: 이슈 #119 완료 조건 "restart가 값 결과를 바꾸지 않는다", 계약 "그림 전체 재시작은 from에서 시작한다"
  test('player_restart_after_a_lap_starts_the_first_step_again_from_its_start_values', eachSource(async (name) => {
    const { runs, timeline } = await referenceOf(name);
    const fromValues = timeline.values.filter((row) => row.si === 0).map((row) => row.initial);
    const wrapped = runs.slice(runs.findLastIndex((run) => run.step === timeline.steps.length - 1) + 1);

    assert.ok(wrapped.length > 0 && wrapped[0].step === 0, `${name}: 한 바퀴가 끝나면 첫 단계로 되돌아간다`);
    assert.deepEqual(wrapped[0].values.map(([, text]) => text), fromValues, `${name}: 되풀이한 첫 단계는 from에서 시작한다`);
  }));
});
