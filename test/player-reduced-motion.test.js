// 움직임 줄이기(prefers-reduced-motion): 차트가 다 자란 정지 상태로 시작하고, 실행 중에 켜면 바로 멈추고, 꺼도 저절로 재생하지 않는다(docs/design/playback.md 재생기).
// 실제 Chrome에서 Web Animations 상태와 계산된 스타일로 잰다. Chrome이 없으면 건너뛴다. 경로는 CHROME_PATH로 바꿀 수 있다.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright-core';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';

const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((path) => path && existsSync(path));
const BAR = 'chart bar\nx "Value(ms)"\nseries s "S"\nrow "A" s=1\n';
const LINE = 'chart line\nx "Week"\ny "Rate"\nseries a "A"\npoint x=1 a=3\npoint x=2 a=5\npoint x=3 a=4\n';
const TWO_STEPS = 'chart bar\nx "Value(ms)"\nspeed 20s\nseries a "A"\nseries b "B"\nrow "R" a=1 b=2\nstep "One"\nreveal a\nstep "Two"\nreveal b\n';
const SETTLE_MS = 300;
const SAMPLE_MS = 600;
const REDUCE = { reducedMotion: 'reduce' };
const SCALE_TOLERANCE = 0.01;

// 차트 움직임(CSS 애니메이션)의 지금 상태. 보류 중인 pause()와 play()가 끝난 뒤에 잰다.
const motion = (page) =>
  page.evaluate(async () => {
    const animations = document.getAnimations({ subtree: true }).filter((a) => a.animationName?.startsWith('chart-'));
    await Promise.all(animations.map((a) => a.ready));
    return { times: animations.map((a) => a.currentTime), states: animations.map((a) => a.playState) };
  });

// 막대 폭, 선 경로, 값 글자, 점이 완성 상태인지. 자라는 움직임이 걸린 요소의 계산된 스타일과 상자 크기로 잰다.
const grownState = (page) =>
  page.evaluate(() => {
    const shown = (el) => !el.classList.contains('hidden') && !el.closest('.hidden');
    const bad = [];
    for (const el of document.querySelectorAll('svg.fl .grow')) {
      if (!shown(el)) continue;
      const box = el.getBBox();
      const drawn = el.getBoundingClientRect().width / (box.width * el.getScreenCTM().a);
      if (getComputedStyle(el).transform !== 'none' || Math.abs(drawn - 1) > 0.01) bad.push(`grow ${getComputedStyle(el).transform} ${drawn}`);
    }
    for (const el of document.querySelectorAll('svg.fl .draw')) if (shown(el) && parseFloat(getComputedStyle(el).strokeDashoffset) !== 0) bad.push(`draw ${getComputedStyle(el).strokeDashoffset}`);
    for (const el of document.querySelectorAll('svg.fl .wipe')) if (shown(el) && getComputedStyle(el).clipPath !== 'none' && getComputedStyle(el).clipPath !== 'inset(0px)') bad.push(`wipe ${getComputedStyle(el).clipPath}`);
    for (const el of document.querySelectorAll('svg.fl .pop, svg.fl .late, svg.fl .dot')) if (shown(el) && getComputedStyle(el).opacity !== '1') bad.push(`${el.getAttribute('class')} ${getComputedStyle(el).opacity}`);
    return bad;
  });

// 계열 i가 보이는지(드러냈는지). 숨긴 계열은 opacity 0이다.
const seriesShown = (page, i) => page.evaluate((n) => [...document.querySelectorAll(`svg.fl .cs-${n}`)].every((el) => getComputedStyle(el).opacity !== '0'), i);
const label = (page) => page.getAttribute('.fl-pause', 'aria-label');

// cost: time O(page), heap O(page), stack O(1), io page
// vars: page = 페이지 하나를 여는 비용
// basis: estimate
// 원본의 HTML 재생기를 설정(options)대로 열어 body(page)를 돌린다. 파일을 만들지 않고 문서를 바로 넣는다.
async function withPlayer(browser, source, options, body) {
  const html = await toHtml(await buildFigure(source), 'chart');
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, ...options });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setContent(html);
  await page.waitForTimeout(SETTLE_MS);
  await body(page);
  assert.deepEqual(errors, []);
  await page.close();
}

describe('player reduced motion', { skip: CHROME ? false : 'Chrome이 없다' }, () => {
  let browser;
  before(async () => {
    browser = await chromium.launch({ executablePath: CHROME });
  });
  after(async () => {
    await browser.close();
  });

  // 근거: 이슈 #105, 설계 playback.md 재생기: 움직임 줄이기로 열면 단계 없는 차트가 다 자란 채 멈춰 있다
  test('player_reduced_motion_opens_a_stepless_chart_fully_grown_with_no_progressing_animation', async () => {
    for (const source of [BAR, LINE]) {
      await withPlayer(browser, source, REDUCE, async (page) => {
        const first = await motion(page);
        await page.waitForTimeout(SAMPLE_MS);
        const second = await motion(page);

        assert.ok(second.states.every((s) => s !== 'running'), `진행하는 움직임이 있다: ${second.states}`);
        assert.deepEqual(second.times, first.times, '시간이 지나며 currentTime이 변한다');
        assert.deepEqual(await grownState(page), []);
      });
    }
  });

  // 근거: 이슈 #105, 설계 playback.md 재생기: 단계 있는 차트는 멈춘 채로 시작하고 첫 단계에 공개된 계열만 다 자란 상태다
  test('player_reduced_motion_opens_a_stepped_chart_paused_with_only_the_first_step_series_grown', async () => {
    await withPlayer(browser, TWO_STEPS, REDUCE, async (page) => {
      const first = await motion(page);
      await page.waitForTimeout(SAMPLE_MS);
      const second = await motion(page);

      assert.equal(await label(page), '재생');
      assert.ok(second.states.every((s) => s !== 'running'), second.states.join());
      assert.deepEqual(second.times, first.times);
      assert.equal(await seriesShown(page, 0), true);
      assert.equal(await seriesShown(page, 1), false, '공개되지 않은 계열이 보인다');
      assert.deepEqual(await grownState(page), []);
    });
  });

  // 근거: 이슈 #105, 설계 playback.md 재생기: 재생 중에 설정이 켜지면 바로 멈추고 현재 단계의 완성 상태로 바꾼다
  test('player_reduced_motion_turned_on_while_playing_stops_at_the_grown_state_of_the_current_step', async () => {
    await withPlayer(browser, TWO_STEPS, undefined, async (page) => {
      await page.click('.fl-pause');
      await page.waitForTimeout(SETTLE_MS);
      assert.equal(await label(page), '일시정지');
      assert.notEqual((await grownState(page)).length, 0, '켜기 전에는 자라는 중이어야 한다');

      await page.emulateMedia(REDUCE);
      await page.waitForTimeout(SETTLE_MS);
      const first = await motion(page);
      await page.waitForTimeout(SAMPLE_MS);
      const second = await motion(page);

      assert.equal(await label(page), '재생');
      assert.ok(second.states.every((s) => s !== 'running'), second.states.join());
      assert.deepEqual(second.times, first.times);
      assert.equal(await seriesShown(page, 1), false);
      assert.deepEqual(await grownState(page), []);
    });
  });

  // 근거: 이슈 #105, 설계 playback.md 재생기: 멈춘 상태에서 설정이 꺼져도 저절로 재생하지 않는다
  test('player_reduced_motion_turned_off_while_paused_does_not_start_playing', async () => {
    for (const source of [BAR, TWO_STEPS]) {
      await withPlayer(browser, source, REDUCE, async (page) => {
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.waitForTimeout(SAMPLE_MS);
        const states = (await motion(page)).states;

        assert.equal(await label(page), '재생');
        assert.ok(states.every((s) => s !== 'running'), states.join());
        assert.deepEqual(await grownState(page), []);
      });
    }
  });

  // 근거: 이슈 #105, 설계 playback.md 재생기: 움직임 줄이기에서 단계를 옮기면 그 단계까지 공개된 계열만 완성 상태로 바뀐다
  test('player_reduced_motion_step_change_shows_only_the_series_revealed_so_far_fully_grown', async () => {
    await withPlayer(browser, TWO_STEPS, REDUCE, async (page) => {
      await page.locator('.fl-tabs button').nth(1).click();
      await page.waitForTimeout(SETTLE_MS);

      assert.equal(await seriesShown(page, 0), true);
      assert.equal(await seriesShown(page, 1), true);
      assert.ok((await motion(page)).states.every((s) => s !== 'running'));
      assert.equal(await label(page), '재생');
      assert.deepEqual(await grownState(page), []);

      await page.locator('.fl-tabs button').nth(0).click();
      await page.waitForTimeout(SETTLE_MS);

      assert.equal(await seriesShown(page, 1), false);
      assert.deepEqual(await grownState(page), []);
    });
  });

  // 근거: 이슈 #105, 설계 playback.md 재생기: 단계 없는 차트에도 재생 단추가 있고 누르면 재생한다
  test('player_stepless_chart_has_a_play_button_that_plays_and_pauses', async () => {
    await withPlayer(browser, BAR, REDUCE, async (page) => {
      assert.equal(await page.isVisible('.fl-foot'), true);
      assert.equal(await page.isVisible('.fl-pause'), true);
      assert.equal(await page.evaluate(() => document.querySelector('.fl-ring-fill').style.strokeDashoffset === document.querySelector('.fl-ring-fill').style.strokeDasharray), true, '진행 고리가 비어 있어야 한다');
      await page.click('.fl-pause', { timeout: 2000 });
      const first = await motion(page);
      await page.waitForTimeout(SAMPLE_MS);
      const second = await motion(page);

      assert.equal(await label(page), '일시정지');
      assert.ok(second.states.length > 0 && second.states.every((s) => s === 'running'), second.states.join());
      assert.ok(second.times.every((t, i) => t > first.times[i] + SAMPLE_MS / 2), `${second.times} <= ${first.times}`);

      await page.click('.fl-pause');
      const paused = await motion(page);
      await page.waitForTimeout(SAMPLE_MS);

      assert.deepEqual((await motion(page)).times, paused.times);
    });
    await withPlayer(browser, BAR, undefined, async (page) => {
      assert.equal(await label(page), '재생');
      assert.ok((await motion(page)).states.every((s) => s !== 'running'), '일반 모드도 먼저 읽을 수 있도록 멈춰 시작한다');
      assert.deepEqual(await grownState(page), []);
    });
  });
});
