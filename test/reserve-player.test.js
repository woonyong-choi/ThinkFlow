// 원자 예약(`reserve=`)의 결과가 움직이는 SVG와 HTML 재생기에서 같다(docs/design/playback.md 원자 예약).
// SMIL 값을 25ms 간격으로 풀어 시간표의 값 줄과 맞추고, 재생기를 가짜 시계로 돌려 일시정지, 배속, 재시작, 단계 직접 선택이 값 결과를 바꾸지 않는지 본다.
// 재생기 시험은 Chrome이 없으면 건너뛴다. 경로는 CHROME_PATH로 바꿀 수 있다.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright-core';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';

const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((path) => path && existsSync(path));
const example = (name) => readFileSync(new URL(`../examples/${name}.dap`, import.meta.url), 'utf8');
// 둘째 단계가 `keep`한 쥔 쪽에서 시작해, 단계를 바로 골라도 앞 단계의 예약 결과가 이어지는지 보는 원본
const TWO_STEPS = `flow right
box a "A"
box b "B"
box c "C"
box lock "잠금"
store q "대기열"
value holder "쥔 쪽" on=lock from=none
a -> lock
b -> lock
c -> lock
c -> q
step "A와 B가 같은 시각에 요청한다" for=7s
  track a -> lock "요청" at=0s time=1s wait="holder='none'" reserve="holder=A"
  track b -> lock "요청" at=0s time=1s wait="holder='none'" reserve="holder=B"
  track a -> lock "풀기" at=3s time=1s when="holder='A'" set="holder=none"
step "C는 B가 쥔 잠금을 기다리다 포기한다" for=5s keep="holder"
  track c -> lock "요청" at=0s time=1s wait="holder='none'" reserve="holder=C" timeout=2s else=q
`;
const SOURCES = [['atomic-lock', example('atomic-lock')], ['atomic-queue', example('atomic-queue')], ['two-steps', TWO_STEPS]];
// SMIL을 풀고 재생기를 재는 간격(ms)
const PROBE_MS = 25;
// keyTimes는 한 바퀴 비율의 소수 5자리라 시각으로는 이만큼(ms) 어긋난다. 경계에서 이만큼 안쪽 시각은 재지 않는다.
const EDGE_MS = 2;
// 가짜 시계를 멈추는 시각(ms). 설치한 뒤 실제 시간이 이만큼 흐르기 전에 멈춰야 하므로 느린 환경도 견딜 만큼 멀리 둔다.
const PAUSE_AT_MS = 600_000;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = SVG 글자 수
// basis: estimate
// 움직이는 SVG의 값 글자 요소마다 { vi, text, dur, times, values }. 값 줄 번호 vi와 글(data-t)은 요소의 속성이다.
function valueTextsOf(svg) {
  const pattern = /<(?:text|g)\b[^>]*?\bdata-v="(\d+)"[^>]*?>((?:(?!<\/(?:g|text)>)[\s\S])*?)<animate ([^>]*?)\/>/g;
  return [...svg.matchAll(pattern)].map(([whole, vi, , animate]) => {
    const attr = (name) => animate.match(new RegExp(`\\b${name}="([^"]*)"`))[1];
    return { vi: Number(vi), text: whole.match(/\bdata-t="([^"]*)"/)?.[1], dur: Number.parseFloat(attr('dur')) * 1000, times: attr('keyTimes').split(';').map(Number), values: attr('values').split(';').map(Number) };
  });
}

// SMIL calcMode=discrete 값을 한 바퀴 비율 x에서 푼다.
const discreteAt = ({ times, values }, x) => values[times.findLastIndex((time) => time <= x)];

// 근거: 이슈 #138 완료 조건 "SVG와 HTML은 같은 시간표를 읽는다", 설계 playback.md 값 변화 "움직이는 SVG는 SMIL 이산 불투명도로 보인다"
test('toSvg_reserved_values_match_the_timeline_every_25ms', async () => {
  for (const [name, source] of SOURCES) {
    const result = await buildFigure(source, { baseDir: 'examples' });
    const { timeline } = result;
    const texts = valueTextsOf(await toSvg(result, { name }));
    const edges = timeline.values.flatMap((row) => row.periods);
    let probed = 0;

    for (let t = 0; t < timeline.total; t += PROBE_MS) {
      if (edges.some(([from, to]) => Math.abs(t - from) <= EDGE_MS || Math.abs(t - to) <= EDGE_MS)) continue;
      const smil = timeline.values.map((_, vi) => texts.filter((el) => el.vi === vi && discreteAt(el, t / el.dur) === 1).map((el) => el.text));
      const expected = timeline.values.map((row) => [row.periods.find(([from, to]) => t >= from && t < to)?.[2]].filter((text) => text !== undefined));

      assert.deepEqual(smil, expected, `${name}: t=${t}ms`);
      probed++;
    }
    assert.ok(probed > timeline.total / PROBE_MS / 2, name);
  }
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
  // 지금 재생기 화면의 { step, values }. step은 켜진 탭 번호이고 values는 값 줄마다 보이는 글자(data-t)다.
  const sample = (page) =>
    page.evaluate(() => {
      const step = [...document.querySelectorAll('.fl-tabs button')].findIndex((button) => button.classList.contains('on'));
      const rows = [...new Set([...document.querySelectorAll('[data-v]')].map((el) => el.dataset.v))];
      const values = rows.flatMap((vi) => {
        const text = [...document.querySelectorAll(`[data-v="${vi}"]`)].filter((el) => el.getAttribute('opacity') === '1').map((el) => el.dataset.t);
        return text.length ? [[Number(vi), text.join('|')]] : [];
      });
      return { step, values };
    });

  // cost: time O(F), heap O(F), stack O(1), io F
  // vars: F = 프레임 수
  // basis: estimate
  // 재생기를 가짜 시계로 프레임마다 흘리며 { t, step, values } 목록을 모은다. until(frames)가 true가 되거나 limitMs가 다하면 멈춘다.
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
  // 같은 상태가 이어지는 프레임을 하나로 묶은 목록 { step, values }
  const runsOf = (frames) =>
    frames.reduce((runs, { step, values }) => (runs.length && JSON.stringify(runs.at(-1)) === JSON.stringify({ step, values }) ? runs : [...runs, { step, values }]), []);

  // cost: time O(1), heap O(1), stack O(1), io 3
  // basis: estimate
  // 원본의 재생기 HTML을 가짜 시계로 연 페이지로 body(page, result)를 돌린다.
  async function withPlayer(source, body) {
    const result = await buildFigure(source, { baseDir: 'examples' });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    // 가짜 시계는 설치만 하면 실제 시간으로 흘러 결과가 실행마다 달라진다. 페이지를 열기 전에 멈춰 두고 runFor로만 흘린다.
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(PAUSE_AT_MS);
    await page.setContent(await toHtml(result, 'reserve'));
    await page.click('.fl-pause');
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
    try {
      return await body(page, result);
    } finally {
      await page.close();
    }
  }

  const references = new Map();
  // cost: time O(F), heap O(F), stack O(1), io F
  // vars: F = 프레임 수
  // basis: estimate
  // 처음부터 한 바퀴 재생한 기준 상태 목록. 원본마다 한 번만 만든다.
  const referenceOf = (name, source) => {
    if (!references.has(name)) references.set(name, withPlayer(source, async (page, { timeline }) => ({ runs: runsOf(await runFrames(page, { limitMs: timeline.total * 1.1 })), timeline })));
    return references.get(name);
  };

  // 같은 시각에 바뀌어 길이가 없는 구간(`none`에서 `A`로 바로 바뀌는 처음 값)은 재생기가 보이지 않으므로 길이가 있는 구간만 비교한다
  const orderOf = (texts) => texts.filter((text, i) => text !== undefined && text !== texts[i - 1]);

  test('player_shows_the_reserved_values_in_the_order_of_the_timeline_periods', async () => {
    for (const [name, source] of SOURCES) {
      const { runs, timeline } = await referenceOf(name, source);

      for (const [vi, row] of timeline.values.entries()) {
        const shown = orderOf(runs.filter((run) => run.step === row.si).map((run) => run.values.find(([index]) => index === vi)?.[1]));
        const expected = orderOf(row.periods.filter(([from, to]) => to > from).map(([, , text]) => text));

        // 재생기는 한 바퀴를 넘겨 재므로 두 바퀴째가 앞에 이어 붙은 값은 뗀다
        assert.deepEqual(shown.slice(0, expected.length), expected, `${name} ${row.id}(${row.si}번 단계)`);
      }
    }
  });

  // 근거: 이슈 #138 완료 조건 "pause·rate·restart·단계 직접 선택이 예약 결과를 바꾸지 않는다"
  test('player_pause_and_rate_changes_do_not_change_the_reserved_values_of_a_lap', async () => {
    for (const [name, source] of SOURCES) {
      const { runs, timeline } = await referenceOf(name, source);
      const total = timeline.total;
      const lapEnd = runs.findLastIndex((run) => run.step === timeline.steps.length - 1) + 1;

      await withPlayer(source, async (page) => {
        const before = await runFrames(page, { limitMs: total / 2 });
        await page.click('.fl-pause');
        const paused = await sample(page);
        const during = await runFrames(page, { limitMs: 3000 });
        await page.click('.fl-pause');
        const after = await runFrames(page, { limitMs: total * 1.1 - total / 2 });

        assert.ok(during.every(({ step, values }) => JSON.stringify({ step, values }) === JSON.stringify(paused)), `${name}: 멈춘 동안 값이 그대로다`);
        assert.deepEqual(runsOf([...before, ...during, ...after]).slice(0, lapEnd), runs.slice(0, lapEnd), `${name}: 일시정지 뒤 이어도 같다`);
      });
      for (const clicks of [1, 2]) {
        await withPlayer(source, async (page) => {
          for (let i = 0; i < clicks; i++) await page.click('.fl-rate');
          const rate = clicks === 1 ? 2 : 0.5;
          const frames = await runFrames(page, { limitMs: (total * 1.1) / rate });

          assert.deepEqual(runsOf(frames).slice(0, lapEnd), runs.slice(0, lapEnd), `${name}: ${rate}배속에서 값이 바뀌는 차례가 같다`);
        });
      }
    }
  });

  // 근거: 이슈 #138 완료 조건 "단계 직접 선택이 예약 결과를 바꾸지 않는다", 설계 playback.md 단계 사이 값 유지
  test('player_selecting_a_step_directly_shows_the_same_reserved_values_as_playing_up_to_it', async () => {
    const [name, source] = SOURCES[2];
    const { runs, timeline } = await referenceOf(name, source);
    // cost: time O(r), heap O(r), stack O(1)
    // vars: r = 상태 수
    // basis: estimate
    // 단계 step이 처음 켜져 있는 동안의 값 상태 목록
    const statesOfStep = (list, step) => {
      const from = list.findIndex((run) => run.step === step);
      const to = list.findIndex((run, i) => i > from && run.step !== step);
      return list.slice(from, to < 0 ? list.length : to).map(({ values }) => values);
    };

    for (let step = 0; step < timeline.steps.length; step++) {
      await withPlayer(source, async (page) => {
        await page.click(`.fl-tabs button:nth-child(${step + 1})`);
        await page.click('.fl-pause');
        const first = await sample(page);
        const frames = await runFrames(page, { limitMs: timeline.total, until: (list) => list.length && list.at(-1).step !== step });
        const own = statesOfStep(runsOf([{ t: 0, ...first }, ...frames]), step);

        const t0 = timeline.segs.find((seg) => seg.si === step).t0;
        const startOf = (row) => row.changes.findLast(([at]) => at <= t0)?.[1] ?? row.initial;

        assert.deepEqual(first.values.map(([, text]) => text), timeline.values.filter((row) => row.si === step).map(startOf), `${step}번 단계를 고른 첫 화면은 시작 시각까지 예약한 값이다`);
        assert.deepEqual(own, statesOfStep(runs, step), `${step}번 단계를 바로 고른 값 변화가 처음부터 재생한 값 변화와 같다`);
      });
    }
    assert.equal(timeline.values.find((row) => row.si === 1).initial, 'B', '둘째 단계는 앞 단계가 예약한 쥔 쪽에서 시작한다');
  });

  // 근거: 이슈 #138 완료 조건 "restart가 예약 결과를 바꾸지 않는다"
  test('player_restart_after_a_lap_shows_the_same_reserved_values_at_the_same_lap_times', async () => {
    for (const [name, source] of SOURCES) {
      const { timeline } = await referenceOf(name, source);
      const { total } = timeline;
      const edges = timeline.values.flatMap((row) => row.periods.flat().filter((x) => typeof x === 'number'));
      const probes = [200, total * 0.4, total * 0.9].filter((t) => edges.every((edge) => Math.abs(t - edge) > 100));

      await withPlayer(source, async (page) => {
        const frames = await runFrames(page, { limitMs: total * 2.1 });
        const at = (t) => frames[Math.round(t / PROBE_MS) - 1];

        assert.ok(probes.length >= 2, name);
        for (const t of probes) assert.deepEqual(at(total + t).values, at(t).values, `${name}: 두 바퀴째 ${Math.round(t)}ms의 값이 첫 바퀴와 같다`);
      });
    }
  });
});
