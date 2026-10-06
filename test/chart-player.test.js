// 차트 재생기: 일시정지와 배속이 차트의 CSS 움직임(막대, 선, 값 글자)에도 같은 시간으로 걸리는지(docs/design/playback.md 재생기).
// 실제 Chrome에서 Web Animations 상태로 잰다. Chrome이 없으면 건너뛴다. 경로는 CHROME_PATH로 바꿀 수 있다.
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright-core';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { withFolder } from './helpers.js';

const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((path) => path && existsSync(path));
const SOURCE = 'chart bar\nx "Value(ms)"\nspeed 20s\nseries s "S"\nrow "A" s=1\nstep "Reveal"\nreveal s\n';
const TWO_STEPS = 'chart bar\nx "Value(ms)"\nspeed 20s\nseries a "A"\nseries b "B"\nrow "R" a=1 b=2\nstep "One"\nreveal a\nstep "Two"\nreveal b\n';
const SETTLE_MS = 300;
const SAMPLE_MS = 600;
const RATIO_TOLERANCE = 0.2;

// 차트 움직임(CSS 애니메이션)과 진행 고리의 지금 상태. 고리는 박자 시계(player clock)를 그대로 그린다.
const snapshot = (page) =>
  page.evaluate(async () => {
    const animations = [...document.querySelector('svg.fl').getAnimations({ subtree: true })].filter((a) => a.animationName?.startsWith('chart-'));
    // pause()와 play()는 다음 프레임에 적용되므로 보류가 끝난 뒤에 잰다.
    await Promise.all(animations.map((a) => a.ready));
    const fill = document.querySelector('.fl-ring-fill');
    const ring = 1 - parseFloat(fill.style.strokeDashoffset) / parseFloat(fill.style.strokeDasharray);
    return { count: animations.length, times: animations.map((a) => a.currentTime), states: animations.map((a) => a.playState), rates: animations.map((a) => a.playbackRate), ring, rate: document.querySelector('.fl-rate').textContent };
  });

// cost: time O(page), heap O(page), stack O(1), io page
// vars: page = 페이지 하나를 여는 비용
// basis: estimate
// 원본의 HTML 재생기를 열어 body(page)를 돌린다.
function withPlayer(browser, source, body) {
  return withFolder(async (folder) => {
    writeFileSync(join(folder, 'page.html'), await toHtml(await buildFigure(source), 'chart'));
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`file://${join(folder, 'page.html')}`);
      await page.click('.fl-pause');
    await page.waitForTimeout(SETTLE_MS);
    await body(page);
    assert.deepEqual(errors, []);
    await page.close();
  });
}

describe('chart player', { skip: CHROME ? false : 'Chrome이 없다' }, () => {
  let browser;
  before(async () => {
    browser = await chromium.launch({ executablePath: CHROME });
  });
  after(async () => {
    await browser.close();
  });

  // 근거: 이슈 #77, 설계 playback.md 재생기: 일시정지 동안 차트의 막대, 선, 값 글자의 진행이 멈추고 재개하면 이어진다
  test('player_pause_stops_every_chart_animation_and_resume_continues_it', async () => {
    await withPlayer(browser, SOURCE, async (page) => {
      await page.click('.fl-pause');
      const paused = await snapshot(page);
      await page.waitForTimeout(SAMPLE_MS);
      const still = await snapshot(page);

      assert.ok(paused.count >= 2, `움직임 ${paused.count}개`);
      assert.deepEqual(still.times, paused.times, '정지 동안 currentTime이 변한다');
      assert.ok(still.states.every((s) => s === 'paused'), still.states.join());
      assert.equal(still.ring, paused.ring);

      await page.click('.fl-pause');
      await page.waitForTimeout(SAMPLE_MS);
      const resumed = await snapshot(page);

      assert.ok(resumed.states.every((s) => s === 'running'), resumed.states.join());
      assert.ok(resumed.times.every((t, i) => t > still.times[i] + SAMPLE_MS / 2), `${resumed.times} <= ${still.times}`);
    });
  });

  // 근거: 이슈 #77, 설계 playback.md 재생기: 배속 단추의 값이 차트 움직임의 재생 속도와 박자 시계에 같게 걸린다
  test('player_rate_button_sets_the_chart_animation_rate_and_chart_and_clock_advance_by_the_same_ratio', async () => {
    await withPlayer(browser, SOURCE, async (page) => {
      const ratios = {};
      for (const [label, rate] of [['2×', 2], ['0.5×', 0.5], ['1×', 1]]) {
        await page.click('.fl-rate');
        const before = await snapshot(page);
        await page.waitForTimeout(SAMPLE_MS);
        const after = await snapshot(page);

        assert.equal(before.rate, label);
        assert.ok(after.rates.every((r) => r === rate), `${label}: ${after.rates}`);
        ratios[label] = (after.times[0] - before.times[0]) / (after.ring - before.ring);
      }

      for (const label of ['0.5×', '1×']) assert.ok(Math.abs(ratios[label] - ratios['2×']) / ratios['2×'] < RATIO_TOLERANCE, `차트 시간 / 박자 시계 비율이 배속마다 다르다: ${JSON.stringify(ratios)}`);
    });
  });

  // 근거: 이슈 #77, 설계 playback.md 재생기: 단계 이동(재시작)으로 새로 걸리는 움직임도 지금의 정지와 배속을 따른다
  test('player_step_change_restarts_the_chart_motion_under_the_current_pause_and_rate', async () => {
    await withPlayer(browser, TWO_STEPS, async (page) => {
      await page.click('.fl-rate');
      await page.click('.fl-pause');
      await page.locator('.fl-tabs button').nth(1).click();
      const restarted = await snapshot(page);
      await page.waitForTimeout(SAMPLE_MS);
      const later = await snapshot(page);

      assert.equal(await page.getAttribute('.fl-pause', 'aria-label'), '재생');
      assert.equal(await page.locator('.grow').first().evaluate((el) => getComputedStyle(el).transform), 'none', '선택한 장면은 완성된 차트로 읽는다');
      assert.ok(restarted.times.every((t) => t < SETTLE_MS), `재시작한 움직임이 처음부터 시작하지 않는다: ${restarted.times}`);
      assert.deepEqual(later.times, restarted.times);
      assert.ok(later.states.every((s) => s === 'paused'), later.states.join());
      assert.ok(later.rates.every((r) => r === 2), later.rates.join());

      await page.click('.fl-pause');
      await page.waitForTimeout(SAMPLE_MS);
      const running = await snapshot(page);

      assert.ok(running.count > 0 && running.times.every((t) => t > SAMPLE_MS), `2배속으로 흐르지 않는다: ${running.times}`);
    });
  });
});
