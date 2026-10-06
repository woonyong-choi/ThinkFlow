// 페이지: 목록 쪽(gallery)과 문서 미리보기가 브라우저에서 보이는 모양(docs/design/playback.md 문서 미리보기, layout.md 카드 머리).
// Chrome이 없으면 건너뛴다. 경로는 CHROME_PATH로 바꿀 수 있다.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright-core';
import { buildFigure } from '../src/build.js';
import { toDocument, toGallery, toHtml } from '../src/html.js';
import { values } from '../src/tokens.js';
import { runCli, withFolder } from './helpers.js';

const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((path) => path && existsSync(path));
const SKIP = CHROME ? false : 'Chrome이 없다';
const FIGURES = [{ name: 'call-registers', title: '호출 중 레지스터 값의 변화', kind: 'flow', isChart: false, href: 'call-registers' }];
const WIDTH = 1400;
const AUDIT_WAIT_MS = 500;
const FIGURE = 'flow right\nbox a "A"\n';
const GAP_TOLERANCE = 0.5;
const AXIS_TOLERANCE = 1;
const RING_WAIT_MS = 600;
// 밝힌 격자 칸 테두리 안쪽 0.3만큼 들어간 점을 찍는다(테두리 굵기 절반 안, 이웃 칸 선과도 겹치는 자리)
const GRID_RING_PROBE = 0.3;
const SEMIBOLD = 600;
const CAPTION = '단계 설명 글. 막대와 같은 가운데 축에 놓인다.';
const CODE_FIGURE = 'flow right\nbox a "일반 `code` 글"\nbox b "B"\na -> b "보냄"\nstep "s"\n  a -> b';
const BAR_FIGURE = 'chart bar\nx "정확도(%)"\nseries a "A"\nrow "항목" a=3\nrow "둘째" a=5';

// cost: time O(page), heap O(page), stack O(1), io page
// vars: page = 페이지 하나를 여는 비용
// basis: estimate
// HTML을 연 페이지로 body(page)를 돌린다. html이 문자열이면 page.html 하나고, 객체면 { 파일 이름: 내용 }이며 page.html을 연다(iframe 자식 문서를 같이 둘 때). 끝나면 임시 폴더를 지운다.
function withPage(browser, html, body) {
  return withFolder(async (folder) => {
    for (const [name, text] of Object.entries(typeof html === 'string' ? { 'page.html': html } : html)) writeFileSync(join(folder, name), text);
    const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 }, colorScheme: 'dark' });
    await page.goto(`file://${join(folder, 'page.html')}`);
    await body(page);
    await page.close();
  });
}

describe('pages', { skip: SKIP }, () => {
  let browser;
  before(async () => {
    browser = await chromium.launch({ executablePath: CHROME });
  });
  after(async () => {
    await browser.close();
  });

  // 근거: #159. 먼저 읽고 재생하며, 키보드로 고른 장면도 멈춘 상태로 확인한다.
  test('player_opens_paused_and_keyboard_scene_selection_stays_paused', async () => {
    const source = `${CODE_FIGURE}\nstep "second"\n  a -> b`;
    await withPage(browser, await toHtml(await buildFigure(source), 'reading'), async (page) => {
      const progress = () => page.locator('.fl-ring-fill').evaluate((el) => el.style.strokeDashoffset);
      assert.equal(await page.getAttribute('.fl-pause', 'aria-label'), '재생');
      const start = await progress();
      await page.waitForTimeout(AUDIT_WAIT_MS);
      assert.equal(await progress(), start);
      assert.equal(await page.locator('.fl-position').textContent(), '1 / 2');
      await page.locator('.fl-tabs button').first().focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('.fl-position').textContent(), '2 / 2');
      assert.equal(await page.locator('.fl-tabs button:focus').textContent(), 'second');
      assert.equal(await page.getAttribute('.fl-pause', 'aria-label'), '재생');
      await page.keyboard.press('Home');
      assert.equal(await page.locator('.fl-position').textContent(), '1 / 2');
      assert.equal(await page.locator('.fl-tabs button[tabindex="0"]').count(), 1);
      await page.click('.fl-pause');
      await page.waitForTimeout(AUDIT_WAIT_MS);
      assert.notEqual(await progress(), start);
      await page.locator('.fl-tabs button').last().click();
      assert.equal(await page.getAttribute('.fl-pause', 'aria-label'), '재생');
      const stopped = await progress();
      await page.click('.fl-rate');
      await page.waitForTimeout(AUDIT_WAIT_MS);
      assert.equal(await progress(), stopped);
    });
  });

  // 근거: #159. 진행 고리는 확대하지 않고, 활성 도형의 굵기는 표면 규칙에 가려지지 않는다.
  test('player_ring_size_strokes_and_typeface_match_the_figure', async () => {
    await withPage(browser, await toHtml(await buildFigure(CODE_FIGURE), 'detail'), async (page) => {
      await page.waitForTimeout(AUDIT_WAIT_MS);
      const details = await page.evaluate(() => {
        const style = (selector) => getComputedStyle(document.querySelector(selector));
        const ring = document.querySelector('.fl-ring');
        return { width: ring.getBoundingClientRect().width, view: ring.viewBox.baseVal.width,
          cap: style('.fl-ring-fill').strokeLinecap, stroke: style('.fl-ring-fill').strokeWidth,
          active: style('.fl-node.on .fl-stroke').strokeWidth,
          font: style('.fl-tabs button').fontFamily.split(',')[0], label: style('.label').fontFamily.split(',')[0] };
      });
      assert.equal(details.width, details.view);
      assert.equal(details.cap, 'round');
      assert.equal(details.stroke, '2px');
      assert.equal(details.active, '2.5px');
      assert.equal(details.font, details.label);
    });
  });

  // 근거: #157. 카드와 도형 표면의 그림자가 실제로 보이고 글자·선에는 적용되지 않아야 한다.
  test('simple2_surface_depth_and_filled_play_icon_are_rendered_in_both_modes', async () => {
    const html = await toHtml(await buildFigure(CODE_FIGURE), 'depth');
    await withPage(browser, html, async (page) => {
      for (const colorScheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme });
        const style = await page.evaluate(() => {
          const read = (s, pseudo) => getComputedStyle(document.querySelector(s), pseudo);
          return {
            card: read('.fl-figure').boxShadow,
            node: read('.fl-node > .fl-stroke').filter,
            text: read('.label').filter, edge: read('.fl-path').filter,
            face: read('.fl-pause', '::before').width,
            fill: read('.fl-pause-icon svg').fill, stroke: read('.fl-pause-icon svg').stroke,
            selected: read('.fl-tabs button.on').boxShadow,
            border: read('.fl-rate').borderWidth,
          };
        });
        assert.notEqual(style.card, 'none');
        assert.match(style.node, /drop-shadow/);
        assert.equal(style.text, 'none');
        assert.equal(style.edge, 'none');
        assert.equal(style.face, '36px');
        assert.notEqual(style.fill, 'none');
        assert.equal(style.stroke, 'none');
        assert.equal(style.selected, 'none');
        assert.equal(style.border, '0px');
      }
    });
    await withPage(browser, toGallery(FIGURES, '예제'), async (page) => {
      assert.notEqual(await page.locator('section').evaluate((el) => getComputedStyle(el).boxShadow), 'none');
      assert.equal(await page.locator('section').evaluate((el) => getComputedStyle(el).borderRadius), '18px');
    });
  });

  // 근거: 버그 #18 "카드 머리의 제목과 파일 이름이 붙어 나옴": 제목, 파일 이름, 꼬리표 사이는 space.3이고 한 줄에 놓인다
  test('cardHead_separates_the_title_from_source_metadata', async () => {
    for (const html of [toGallery(FIGURES, '예제'), toDocument(FIGURES, '예제')]) {
      await withPage(browser, html, async (page) => {
        const [title, name, kind] = await Promise.all(['h2 .title', 'h2 .name', 'h2 .kind'].map((selector) => page.locator(selector).first().boundingBox()));

        if (html.includes('<main>')) assert.ok(name.y >= title.y + title.height - GAP_TOLERANCE, '목록은 제목 다음 줄에 파일 정보를 둔다');
        else assert.ok(name.x - (title.x + title.width) >= values.space['3'] - GAP_TOLERANCE);
        assert.ok(kind.x - (name.x + name.width) >= values.space['3'] - GAP_TOLERANCE, `파일 이름과 꼬리표 사이 ${kind.x - (name.x + name.width)}`);
        assert.ok(Math.abs(kind.y - name.y) < name.height, '파일 정보는 같은 줄이다');
      });
    }
  });

  // 근거: 설계 playback.md 값 변화: 재생기는 시간표의 값 구간을 읽어 글자를 고른다. 일시정지에서 멈추고, 탭 이동은 그 단계 처음 값으로 돌아가며, 배속을 바꿔도 줄마다 값이 하나만 보인다
  test('player_value_rows_follow_the_timeline_after_pause_tab_jump_and_rate_change', async () => {
    const source = 'flow right\nbox a "A"\nbox b "B"\nvalue n "개수" on=b\non b n+1\na -> b\nstep "하나"\n  a -> b "x"\nstep "흐름" for=4s\n  track a -> b every=600ms time=300ms\n';
    const result = await buildFigure(source);
    const rowsOf = (si) => result.timeline.values.filter((row) => row.si === si);
    // 화면에서 보이는 값 글자: 지금 단계의 값 줄마다 불투명도 1인 글자 요소의 글(다른 단계의 값 줄은 모두 숨어 있어 뺀다)
    const shown = (page) => page.evaluate(() => [...new Set([...document.querySelectorAll('[data-v]')].map((el) => el.dataset.v))].map((v) => [...document.querySelectorAll(`[data-v="${v}"]`)].filter((el) => el.getAttribute('opacity') === '1').map((el) => el.dataset.t)).filter((texts) => texts.length));
    await withPage(browser, await toHtml(result, 'values'), async (page) => {
      await page.click('.fl-tabs button:nth-child(2)');
      await page.click('.fl-pause');
      await page.waitForTimeout(1500);
      const changed = await shown(page);
      await page.click('.fl-pause');
      const paused = await shown(page);
      await page.waitForTimeout(500);
      const still = await shown(page);
      await page.click('.fl-rate');
      const fast = await shown(page);
      await page.click('.fl-tabs button:nth-child(1)');
      const first = await shown(page);
      await page.click('.fl-tabs button:nth-child(2)');
      const second = await shown(page);

      assert.notDeepEqual(changed, rowsOf(1).map((row) => [row.initial]), '흐름이 값을 바꾸기 전이면 이 시험이 아무것도 보이지 않는다');
      assert.deepEqual(still, paused);
      assert.deepEqual(fast.map((texts) => texts.length), [1]);
      assert.deepEqual(first, rowsOf(0).map((row) => [row.initial]));
      assert.deepEqual(second, rowsOf(1).map((row) => [row.initial]));
    });
  });

  // 근거: 설계 playback.md 요구사항 "조작 막대와 설명이 한 가운데 축", "탭 묶음과 둥근 단추의 높이가 같다", "탭은 segmented 방식", "진행 표시는 일시정지 단추 고리"(사용자 결정)
  test('player_controls_share_one_axis_and_height_and_the_ring_and_active_tab_show_state', async () => {
    const html = await toHtml(await buildFigure(readFileSync(new URL('../examples/memory.dap', import.meta.url), 'utf8'), { baseDir: 'examples' }), 'memory');
    await withPage(browser, html, async (page) => {
      await page.evaluate((text) => { document.querySelector('.fl-caption').textContent = text;
        document.querySelector('.fl-rate').textContent = '0.25×';
      }, CAPTION);
      const box = (selector) => page.locator(selector).first().boundingBox();
      const center = (b) => b.x + b.width / 2;
      const [tabs, caption, bar, pause, ring, round] = await Promise.all(['.fl-tabs', '.fl-caption', '.fl-bar', '.fl-pause', '.fl-ring', '.fl-pause'].map(box));
      const offsetAt = () => page.evaluate(() => Number.parseFloat(getComputedStyle(document.querySelector('.fl-ring-fill')).strokeDashoffset));
      await page.click('.fl-pause');
      const first = await offsetAt();
      await page.waitForTimeout(RING_WAIT_MS);
      const style = await page.evaluate(() => {
        const read = (el) => { const c = getComputedStyle(el); return { weight: Number(c.fontWeight), background: c.backgroundColor, color: c.color }; };
        const on = document.querySelector('.fl-tabs button.on');
        const off = [...document.querySelectorAll('.fl-tabs button:not(.on)')].find(Boolean);
        return { on: read(on), off: read(off), group: getComputedStyle(document.querySelector('.fl-tabs')).backgroundColor };
      });

      assert.ok(Math.abs(center(tabs) - center(caption)) <= AXIS_TOLERANCE, `탭과 설명의 축 차이 ${center(tabs) - center(caption)}`);
      assert.ok(Math.abs(center(tabs) - center(bar)) <= AXIS_TOLERANCE, '탭 묶음이 조작 막대 가운데에 있다');
      assert.ok(Math.abs(tabs.height - round.height) <= AXIS_TOLERANCE, `탭 묶음 높이 ${tabs.height}, 둥근 단추 높이 ${round.height}`);
      assert.ok(Math.abs(center(ring) - center(pause)) <= AXIS_TOLERANCE && ring.width >= pause.width, '진행 고리가 일시정지 단추 둘레에 있다');
      assert.ok(first > (await offsetAt()) || first === 0, '고리 채움이 시간에 따라 늘어난다');
      assert.ok(style.on.weight >= SEMIBOLD && style.off.weight < SEMIBOLD, '켜진 탭만 굵은 글');
      assert.notEqual(style.on.background, style.group, '켜진 탭은 묶음 바탕과 다른 알약 면');
      assert.notEqual(style.on.color, style.off.color);
      const targets = await page.locator('.fl-bar button').evaluateAll((buttons) => buttons.map((button) => {
        const { width, height } = button.getBoundingClientRect();
        return { width, height };
      }));
      assert.ok(targets.every(({ width, height }) => width >= 44 && height >= 44), '모든 재생 조작은 44px 이상의 영역이다');
      await page.locator('.fl-pause').focus();
      assert.equal(await page.locator('.fl-pause').evaluate((button) => getComputedStyle(button).outlineWidth), '3px');

    });
  });

  // 근거: 설계 layout.md 요구사항 "차트 숫자는 tabular-nums", "고정폭 글꼴은 코드에만"(사용자 결정)
  test('player_chart_numbers_are_tabular_and_monospace_is_used_only_for_code', async () => {
    const chart = await toHtml(await buildFigure(BAR_FIGURE), 'bar');
    await withPage(browser, chart, async (page) => {
      const variants = await page.$$eval('.chart-value, .chart-tick', (nodes) => nodes.map((n) => getComputedStyle(n).fontVariantNumeric));

      assert.ok(variants.length > 0 && variants.every((v) => v.includes('tabular-nums')), variants.join());
    });
    const flow = await toHtml(await buildFigure(CODE_FIGURE), 'code');
    await withPage(browser, flow, async (page) => {
      const families = await page.evaluate(() => {
        const mono = (el) => /Mono/.test(getComputedStyle(el).fontFamily);
        const plain = [...document.querySelectorAll('svg .label, svg .edgelabel, .fl-tabs button, .fl-rate, .fl-caption')];
        return { plainMono: plain.filter(mono).length, codeMono: [...document.querySelectorAll('svg .code')].every(mono), codeCount: document.querySelectorAll('svg .code').length };
      });

      assert.equal(families.plainMono, 0);
      assert.ok(families.codeCount > 0 && families.codeMono);
    });
  });

  // 근거: 설계 playback.md 요구사항 "목록 쪽 테마 단추가 목록과 iframe 그림을 함께 바꾼다"(루트 color-scheme과 고른 값 저장), 감사 C9 "실제 자식 HTML 없이 루트만 확인했다"
  test('gallery_theme_buttons_set_the_root_color_scheme_and_remember_the_choice', async () => {
    const child = await toHtml(await buildFigure(CODE_FIGURE), 'call-registers');
    await withPage(browser, { 'page.html': toGallery(FIGURES, '예제'), 'call-registers.html': child }, async (page) => {
      await page.waitForFunction(() => document.querySelector('iframe').style.height !== '');
      const frame = page.frames().find((f) => f !== page.mainFrame());
      const labels = await page.locator('.theme button').allTextContents();
      await page.click('.theme button[data-mode="light"]');
      await frame.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light');

      assert.deepEqual(labels, ['시스템', '라이트', '다크']);
      assert.equal(await page.evaluate(() => document.documentElement.style.colorScheme), 'light');
      assert.equal(await page.evaluate(() => localStorage.getItem('daphnis-theme')), 'light');
      assert.equal(await frame.evaluate(() => document.readyState), 'complete');
      assert.ok(await frame.locator('svg').count() > 0, '자식 문서에 그림이 있다');
    });
  });

  // 근거: 버그 "격자 칸을 밝히면 파랑 테두리가 일부만 보인다"(pte-fields). 밝힌 칸 테두리의 네 변 어디에서도 맨 위에 보이는 것은 그 칸 자신의 테두리이고, 뒤에 그린 이웃 칸의 선이 아니다
  test('grid_lit_cell_border_is_topmost_on_all_four_sides_over_neighbor_cell_lines', async () => {
    const source = readFileSync(new URL('../examples/pte-fields.dap', import.meta.url), 'utf8');
    const html = await toHtml(await buildFigure(source, { baseDir: 'examples' }), 'pte-fields');
    await withPage(browser, html, async (page) => {
      for (const tab of [0, 1]) {
        await page.locator('.fl-tabs button').nth(tab).click();
        await page.waitForTimeout(RING_WAIT_MS);
        const wrong = await page.evaluate((inset) => {
          const lit = [...document.querySelectorAll('.fl-part.on')].map((g) => g.dataset.part);
          const out = [];
          for (const key of new Set(lit)) {
            const cell = document.querySelector(`.fl-part[data-part="${key}"] .grid-cell`).getBoundingClientRect();
            const scale = cell.width / Number(document.querySelector(`.fl-part[data-part="${key}"] .grid-cell`).getAttribute('width'));
            const pad = inset * scale;
            const sides = { top: [cell.x + cell.width / 2, cell.y + pad], bottom: [cell.x + cell.width / 2, cell.bottom - pad], left: [cell.x + pad, cell.y + cell.height / 2], right: [cell.right - pad, cell.y + cell.height / 2] };
            for (const [side, [x, y]] of Object.entries(sides)) {
              const hit = document.elementFromPoint(x, y)?.closest('.fl-part')?.dataset.part;
              if (hit !== key) out.push(`${key} ${side} -> ${hit}`);
            }
          }
          return out;
        }, GRID_RING_PROBE);

        assert.deepEqual(wrong, [], `tab ${tab}`);
      }
    });
  });
  // 근거: 이슈 #69 "목록을 열기만 해도 파일명의 스크립트가 실행된다"와 "`#`, `?`, 공백, 한글 이름도 해당 출력 파일을 연다". 실제 Chrome에서 목록과 문서 미리보기를 열어 본다
  test('gallery_opened_in_chrome_runs_no_script_from_a_file_name_and_opens_the_file_of_every_odd_name', async () => {
    const names = ['javascript:parent.__daphnisAudit=1;void(0)', 'data:text;<img src=x onerror=parent.__daphnisAudit=1>', 'x" onload="parent.__daphnisAudit=1', 'a#b', 'q?x', 'sp ace', '한글 그림', "q'uote", 'p(a)r'];
    await withFolder(async (folder) => {
      for (const name of names) writeFileSync(join(folder, `${name}.dap`), FIGURE);
      const made = runCli(['gallery', '.', '--out', 'out'], folder);
      assert.equal(made.status, 0, made.stderr);

      for (const listing of ['index.html', 'document.html']) {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(`file://${join(folder, 'out', listing)}`);
        await page.waitForTimeout(AUDIT_WAIT_MS);
        const audited = await page.evaluate(() => window.__daphnisAudit);
        assert.equal(audited, undefined, `${listing}: 파일명이 부모 창에서 실행되지 않는다`);
        assert.deepEqual(errors, [], listing);
        const targets = await page.evaluate(() => [...document.querySelectorAll('a[href$=".html"], a[href$=".svg"], iframe[src], img[src]')].map((el) => el.href || el.src));
        assert.ok(targets.every((url) => url.startsWith('file://')), `${listing}: 모든 링크는 같은 폴더의 파일이다`);
        await page.close();
      }

      for (const name of names) {
        const page = await browser.newPage();
        await page.goto(`file://${join(folder, 'out', 'index.html')}`);
        const link = page.locator('section', { has: page.locator(`h2 code.name:text-is(${JSON.stringify(`${name}.dap`)})`) }).locator('nav a', { hasText: '열기' });
        const href = await link.evaluate((a) => a.href);
        assert.equal(fileURLToPath(href), join(folder, 'out', `${name}.html`), `${name}: 열기 링크는 그 이름의 HTML을 가리킨다`);
        await page.goto(href);
        assert.ok((await page.locator('svg').count()) > 0, `${name}: 그림이 열린다`);
        await page.close();
      }
    });
  });
});
