// 값 유지와 읽기 결과가 움직이는 SVG와 HTML 재생기에서 같다(docs/design/playback.md 단계 사이 값 유지, 값 변화).
// 재생기를 가짜 시계로 돌려 일시정지, 배속, 재시작, 단계 직접 선택 뒤의 값 글자를 처음부터 재생한 값과 비교하고, SMIL 값을 25ms 간격으로 풀어 시간표와 재생기 상태에 맞춘다.
// 재생기 시험은 Chrome이 없으면 건너뛴다. 경로는 CHROME_PATH로 바꿀 수 있다.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright-core';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { withFolder } from './helpers.js';

const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((path) => path && existsSync(path));
const SOURCES = ['./fixtures/value-keep/lap.dap', './fixtures/compat/v1/all-value-keep.dap'];
// SMIL을 풀고 재생기를 재는 간격(ms)
const PROBE_MS = 25;
// keyTimes는 한 바퀴 비율의 소수 5자리라 시각으로는 이만큼(ms) 어긋난다. 경계에서 이만큼 안쪽 시각은 재지 않는다.
const EDGE_MS = 2;
// 재생기는 프레임(16ms)마다 시계를 흘리고 박자 끝에서 넘친 시간을 버려, 한 바퀴가 지나면 SMIL보다 박자 수 x 프레임 간격만큼 늦을 수 있다.
const FRAME_MS = 16;
// 가짜 시계를 멈추는 시각(ms). 설치한 뒤 실제 시간이 이만큼 흐르기 전에 멈춰야 하므로 느린 환경도 견딜 만큼 멀리 둔다.
const PAUSE_AT_MS = 600_000;

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
const sourceOf = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// cost: time O(n), heap O(n), stack O(1)
// vars: n = SVG 글자 수
// basis: estimate
// 움직이는 SVG의 값 요소(글자, 큐 찬 칸 묶음, 밝힘 테두리)마다 { kind: 'text' | 'flash', vi, text, dur, times, values }. 값 줄 번호 vi와 글(data-t)은 요소의 속성이다.
function valueElementsOf(svg) {
  const pattern = /<(?:text|g|rect)\b[^>]*?\bdata-(v|vf)="(\d+)"[^>]*?>((?:(?!<\/(?:g|text|rect)>)[\s\S])*?)<animate ([^>]*?)\/>/g;
  return [...svg.matchAll(pattern)].map(([whole, kind, vi, , animate]) => {
    const attr = (name) => animate.match(new RegExp(`\\b${name}="([^"]*)"`))[1];
    return { kind: kind === 'v' ? 'text' : 'flash', vi: Number(vi), text: whole.match(/\bdata-t="([^"]*)"/)?.[1], dur: Number.parseFloat(attr('dur')) * 1000, times: attr('keyTimes').split(';').map(Number), values: attr('values').split(';').map(Number) };
  });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// SMIL calcMode=discrete 값을 한 바퀴 비율 x에서 푼다.
const discreteAt = ({ times, values }, x) => values[times.findLastIndex((time) => time <= x)];

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 구간 수
// basis: estimate
// 구간 [시작, 끝, ...] 목록의 어느 경계에서든 EDGE_MS 이내인지
const isNearEdge = (spans, t) => spans.some(([from, to]) => Math.abs(t - from) <= EDGE_MS || Math.abs(t - to) <= EDGE_MS);

// cost: time O(r·(p + c)), heap O(r), stack O(1)
// vars: r = 값 줄 수, p = 구간 수, c = 값이 바뀌는 횟수
// basis: estimate
// 시각 t(ms)에 SMIL이 보이는 값 요소를 풀어 값 줄마다 { text, flash }로. 단계가 아닌 값 줄은 글이 없다(undefined).
function smilStateAt(elements, timeline, t) {
  return timeline.values.map((row, vi) => {
    const mine = elements.filter((el) => el.vi === vi);
    const shown = mine.filter((el) => el.kind === 'text' && discreteAt(el, t / el.dur) === 1);
    const flash = mine.some((el) => el.kind === 'flash' && discreteAt(el, t / el.dur) === 1);
    assert.ok(shown.length <= 1, `${row.id}: 같은 시각에 글자 요소가 둘 이상 보인다`);
    return { text: shown[0]?.text, flash };
  });
}

// cost: time O(r·(p + c)), heap O(r), stack O(1)
// vars: r = 값 줄 수, p = 구간 수, c = 값이 바뀌는 횟수
// basis: estimate
// 시간표가 정한 시각 t(ms)의 값 줄마다 { text, flash }. 구간 밖이면 글이 없다.
const timelineStateAt = (timeline, t) =>
  timeline.values.map((row) => ({ text: row.periods.find(([from, to]) => t >= from && t < to)?.[2], flash: row.flashes.some(([from, to]) => t >= from && t < to) }));

// 근거: 이슈 #118 완료 조건 "SMIL 값을 25ms 간격으로 풀어 재생기 상태와 비교"(재생기가 읽는 시간표와 같다), 설계 playback.md 값 변화 "움직이는 SVG는 SMIL 이산 불투명도로 보인다"
test('toSvg_keep_and_read_values_match_the_timeline_every_25ms', async () => {
  for (const path of SOURCES) {
    const result = await buildFigure(sourceOf(path), { baseDir: 'test' });
    const { timeline } = result;
    const elements = valueElementsOf(await toSvg(result, { name: 'keep' }));
    const edges = [...timeline.values.flatMap((row) => [...row.periods, ...row.flashes])];
    let probed = 0;
    let flashed = 0;

    assert.ok(elements.every((el) => Math.abs(el.dur - timeline.total) <= 1), `${path}: 모든 값 요소가 한 바퀴 길이를 쓴다`);
    for (let t = 0; t < timeline.total; t += PROBE_MS) {
      if (isNearEdge(edges, t)) continue;
      const smil = smilStateAt(elements, timeline, t);

      assert.deepEqual(smil, timelineStateAt(timeline, t), `${path}: t=${t}ms`);
      probed++;
      flashed += smil.some(({ flash }) => flash) ? 1 : 0;
    }
    assert.ok(probed > timeline.total / PROBE_MS / 2 && flashed > 0, `${path}: 밝힘이 있는 시각을 잰다`);
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
  // 지금 재생기 화면의 { step, values }. step은 켜진 탭 번호이고 values는 값 줄마다 보이는 글자(data-t)와 밝힘 테두리다. 보이는 줄만 담는다.
  const sample = (page) =>
    page.evaluate(() => {
      const step = [...document.querySelectorAll('.fl-tabs button')].findIndex((button) => button.classList.contains('on'));
      const rows = [...new Set([...document.querySelectorAll('[data-v]')].map((el) => el.dataset.v))];
      const values = rows.flatMap((vi) => {
        const text = [...document.querySelectorAll(`[data-v="${vi}"]`)].filter((el) => el.getAttribute('opacity') === '1').map((el) => el.dataset.t);
        const flash = document.querySelector(`[data-vf="${vi}"]`)?.getAttribute('opacity') === '1';
        return text.length || flash ? [[Number(vi), text.join('|'), flash]] : [];
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
  // 같은 상태가 이어지는 프레임을 하나로 묶은 목록 { at, step, values }. at은 그 상태가 처음 보인 프레임의 시각이다.
  const runsOf = (frames) =>
    frames.reduce((runs, { t, step, values }) => {
      const last = runs.at(-1);
      if (last && last.step === step && JSON.stringify(last.values) === JSON.stringify(values)) return runs;
      return [...runs, { at: t, step, values }];
    }, []);

  // cost: time O(F), heap O(F), stack O(1)
  // vars: F = 프레임 수
  // basis: estimate
  // 단계 step이 처음 켜져 있는 동안(한 바퀴 되풀이 전까지)의 상태 목록(시각 없이)
  const statesOfStep = (runs, step) => {
    const from = runs.findIndex((run) => run.step === step);
    const to = runs.findIndex((run, i) => i > from && run.step !== step);
    return runs.slice(from, to < 0 ? runs.length : to).map(({ values }) => values);
  };

  // cost: time O(S), heap O(1), stack O(1), io S
  // vars: S = 시험 원본 수
  // basis: estimate
  // 시험 본문을 원본마다 돌린다.
  const eachSource = (body) => async () => {
    for (const path of SOURCES) await body(path);
  };

  // cost: time O(1), heap O(1), stack O(1), io 3
  // basis: estimate
  // 원본의 재생기 HTML을 가짜 시계로 연 페이지로 body(page, result)를 돌린다. 끝나면 임시 폴더를 지운다.
  function withPlayer(path, body) {
    return withFolder(async (folder) => {
      const result = await buildFigure(sourceOf(path), { baseDir: 'test' });
      writeFileSync(join(folder, 'page.html'), await toHtml(result, 'keep'));
      const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
      // 가짜 시계는 설치만 하면 실제 시간으로 흘러 결과가 실행마다 달라진다. 페이지를 열기 전에 멈춰 두고 runFor로만 흘린다.
      await page.clock.install({ time: 0 });
      await page.clock.pauseAt(PAUSE_AT_MS);
      await page.goto(`file://${join(folder, 'page.html')}`);
      // 가짜 시계는 CSS 전환(실제 시간으로 흐른다)을 따라가지 못한다. 전환을 꺼 켜진 뒤의 값을 잰다.
      await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
      try {
        return await body(page, result);
      } finally {
        await page.close();
      }
    });
  }

  const references = new Map();
  // cost: time O(F), heap O(F), stack O(1), io F
  // vars: F = 프레임 수
  // basis: estimate
  // 처음부터 한 바퀴 재생한 기준 상태 목록. 한 바퀴보다 길게 돌려 되풀이 직후의 첫 단계까지 담고, 원본마다 한 번만 만든다.
  const referenceOf = (path) => {
    if (!references.has(path)) references.set(path, withPlayer(path, async (page, { timeline }) => ({ runs: runsOf(await runFrames(page, { limitMs: timeline.total * 1.3 })), timeline })));
    return references.get(path);
  };


  // 근거: 이슈 #118 완료 조건 "같은 입력은 같은 값 결과를 만든다", 재생기 상태가 시간표의 값 구간과 같다
  test('player_values_follow_the_timeline_periods_and_flashes_on_every_frame', eachSource(async (path) => {
    const { runs, timeline } = await referenceOf(path);
    const rows = timeline.values;
    const shownTexts = new Set(runs.flatMap(({ values }) => values.map(([vi, text]) => `${rows[vi].si}:${vi}:${text}`)));

    for (const { step, values } of runs) for (const [vi] of values) assert.equal(rows[vi].si, step, `${rows[vi].id}의 값 줄은 자기 단계에서만 보인다`);
    for (let step = 0; step < timeline.steps.length; step++) {
      const [entered] = runs.filter((run) => run.step === step);

      assert.deepEqual(entered.values.map(([, text]) => text), rows.filter((row) => row.si === step).map((row) => row.initial), `${step}번 단계에 들어서면 시간표의 initial이 보인다`);
    }
    // 시간표가 정한 모든 글(시작 값과 변화)이 화면에 한 번은 보인다
    for (const row of rows) for (const text of [row.initial, ...row.changes.map(([, changed]) => changed)]) assert.ok(shownTexts.has(`${row.si}:${rows.indexOf(row)}:${text}`), `${row.id}=${text}`);
  }));

  // 근거: 이슈 #118 완료 조건 "SMIL 값을 25ms 간격으로 풀어 재생기 상태와 비교", 값 글자와 밝힘이 같은 시각에 바뀐다
  test('player_state_changes_in_the_same_order_and_time_as_the_animated_svg', eachSource(async (path) => {
    const { runs, timeline } = await referenceOf(path);
    const result = await buildFigure(sourceOf(path), { baseDir: 'test' });
    const elements = valueElementsOf(await toSvg(result, { name: 'keep' }));
    const stepAt = (t) => timeline.segs.findLast((seg) => seg.t0 <= t)?.si ?? 0;
    const frames = [];
    for (let t = PROBE_MS; t <= timeline.total * 1.3; t += PROBE_MS) {
      const lap = t % timeline.total;
      const values = smilStateAt(elements, timeline, lap).flatMap(({ text, flash }, vi) => (text !== undefined || flash ? [[vi, text ?? '', flash]] : []));
      frames.push({ t, step: stepAt(lap), values });
    }
    const smil = runsOf(frames);
    const lap = timeline.segs.length * FRAME_MS + PROBE_MS;

    assert.deepEqual(runs.map(({ step, values }) => [step, values]), smil.map(({ step, values }) => [step, values]), '상태가 바뀌는 차례와 값이 같다');
    runs.forEach((run, i) => assert.ok(Math.abs(run.at - smil[i].at) <= lap, `${i}번째 상태가 ${run.at}ms와 ${smil[i].at}ms에 나온다`));
  }));

  // 근거: 이슈 #118 완료 조건 "pause, rate, restart와 단계 직접 선택이 값 결과를 바꾸지 않는다", 설계 playback.md 이벤트 순서 "재생 시계만 움직이고 계산을 다시 하지 않는다"
  test('player_pause_and_rate_changes_do_not_change_the_value_states_of_a_lap', eachSource(async (path) => {
    const { runs, timeline } = await referenceOf(path);
    const states = (list) => list.map(({ step, values }) => [step, values]);
    const total = timeline.total;
    // 한 바퀴 안의 상태(마지막 단계가 끝나기까지). 그 뒤 되풀이한 첫 단계의 길이는 박자 끝에서 버려지는 시간에 따라 달라서 시험 창에 따라 잘릴 수 있다.
    const lapEnd = runs.findLastIndex((run) => run.step === timeline.steps.length - 1) + 1;
    const lapOf = (list) => states(runsOf(list)).slice(0, lapEnd);

    // 일시정지: 중간에서 멈춰 시계를 흘려도 글자가 그대로고, 다시 재생하면 차례가 같다
    await withPlayer(path, async (page) => {
      const before = await runFrames(page, { limitMs: total / 2 });
      await page.click('.fl-pause');
      const paused = await sample(page);
      const during = await runFrames(page, { limitMs: 3000 });
      await page.click('.fl-pause');
      const after = await runFrames(page, { limitMs: total * 1.3 - total / 2 });

      assert.ok(during.every(({ step, values }) => JSON.stringify([step, values]) === JSON.stringify([paused.step, paused.values])), '멈춘 동안 값 글자와 밝힘이 그대로다');
      assert.deepEqual(lapOf([...before, ...during, ...after]), states(runs).slice(0, lapEnd));
    });
    // 배속: 2배속과 0.5배속 모두 한 바퀴의 상태가 바뀌는 차례와 값이 같다
    for (const clicks of [1, 2]) {
      await withPlayer(path, async (page) => {
        for (let i = 0; i < clicks; i++) await page.click('.fl-rate');
        const rate = clicks === 1 ? 2 : 0.5;
        const frames = await runFrames(page, { limitMs: (total * 1.3) / rate });

        assert.deepEqual(lapOf(frames), states(runs).slice(0, lapEnd), `${rate}배속`);
      });
    }
  }));

  // 근거: 이슈 #118 완료 조건 "단계 직접 선택이 값 결과를 바꾸지 않는다", 계약 "단계를 직접 선택해도 앞 단계를 재생하지 않는다"
  test('player_selecting_a_step_directly_shows_the_same_values_as_playing_up_to_it', eachSource(async (path) => {
    const { runs, timeline } = await referenceOf(path);
    const steps = timeline.steps.length;

    for (let step = 0; step < steps; step++) {
      await withPlayer(path, async (page) => {
        await page.click(`.fl-tabs button:nth-child(${step + 1})`);
        const first = await sample(page);
        const frames = await runFrames(page, { limitMs: timeline.total, until: (list) => list.length && list.at(-1).step !== step });
        const own = statesOfStep(runsOf([{ t: 0, ...first }, ...frames]), step);

        assert.deepEqual(first.values.map(([, text]) => text), timeline.values.filter((row) => row.si === step).map((row) => row.initial), `${step}번 단계의 시작 값은 시간표의 initial이다`);
        assert.deepEqual(own, statesOfStep(runs, step), `${step}번 단계를 바로 고른 값 변화가 처음부터 재생한 값 변화와 같다`);
      });
    }
  }));

  // 근거: 이슈 #118 완료 조건 "restart가 값 결과를 바꾸지 않는다", 계약 "그림 전체 재시작은 from에서 시작한다"
  test('player_restart_after_a_lap_and_selecting_the_first_step_again_start_from_from', eachSource(async (path) => {
    const { runs, timeline } = await referenceOf(path);
    const fromValues = timeline.values.filter((row) => row.si === 0).map((row) => row.initial);
    const last = timeline.steps.length - 1;
    const wrapped = runs.slice(runs.findLastIndex((run) => run.step === last) + 1);

    assert.ok(wrapped.length > 0 && wrapped[0].step === 0, '한 바퀴가 끝나면 첫 단계로 되돌아간다');
    assert.deepEqual(wrapped[0].values.map(([, text]) => text), fromValues, '되풀이한 첫 단계는 끝난 값이 아니라 from에서 시작한다');
    assert.deepEqual(statesOfStep(wrapped, 0), statesOfStep(runs, 0).slice(0, statesOfStep(wrapped, 0).length));
    await withPlayer(path, async (page) => {
      await page.click(`.fl-tabs button:nth-child(${last + 1})`);
      await runFrames(page, { limitMs: timeline.total / 2 });
      await page.click('.fl-tabs button:nth-child(1)');
      const again = await sample(page);

      assert.deepEqual(again.values.map(([, text]) => text), fromValues, '마지막 단계에서 첫 탭을 누르면 from에서 시작한다');
    });
  }));
});
