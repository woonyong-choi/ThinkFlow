// 재생기 시작 위치: 화면이 캔버스보다 좁을 때 처음 화면과 양끝 탐색(docs/design/playback.md 재생기).
// 실제 Chrome에서 잰다. Chrome이 없으면 건너뛴다. 경로는 CHROME_PATH로 바꿀 수 있다.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { withFolder } from './helpers.js';

const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((path) => path && existsSync(path));
const EXAMPLES = fileURLToPath(new URL('../examples/', import.meta.url));
const SETTLE_MS = 300;
// 캔버스(wide 1440)보다 좁고 그림(957)보다도 좁은 화면, 그림보다 넓지만 캔버스보다 좁은 화면
const NARROW = 600;
const MIDDLE = 1200;
const EDGE_TOLERANCE = 1;

// 그림 안 도형 상자가 화면 안에서 차지하는 가로 범위
const shapeSpan = (page) =>
  page.evaluate(() => {
    const boxes = [...document.querySelectorAll('svg.fl .fl-node')].map((n) => n.getBoundingClientRect());
    return { left: Math.min(...boxes.map((b) => b.left)), right: Math.max(...boxes.map((b) => b.right)), width: document.documentElement.clientWidth };
  });

// cost: time O(page), heap O(page), stack O(1), io page
// vars: page = 페이지 하나를 여는 비용
// basis: estimate
// 예제의 HTML 재생기를 width 화면에서 열어 body(page)를 돌린다.
function withPlayer(browser, file, width, body) {
  return withFolder(async (folder) => {
    writeFileSync(join(folder, 'page.html'), await toHtml(await buildFigure(readFileSync(join(EXAMPLES, file), 'utf8'), { baseDir: EXAMPLES }), file));
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`file://${join(folder, 'page.html')}`);
    await page.waitForTimeout(SETTLE_MS);
    await body(page);
    assert.deepEqual(errors, []);
    await page.close();
  });
}

describe('player start position', { skip: CHROME ? false : 'Chrome이 없다' }, () => {
  let browser;
  before(async () => {
    browser = await chromium.launch({ executablePath: CHROME });
  });
  after(async () => {
    await browser.close();
  });

  // 근거: 이슈 #63 "넓은 캔버스 재생기 시작 위치". 그림보다 좁은 화면에서 첫 화면은 그림의 왼쪽 끝부터 보이고, 양끝으로 끝까지 간다
  test('player_wide_canvas_narrow_screen_starts_at_the_left_edge_and_reaches_both_ends', async () => {
    await withPlayer(browser, 'order-event-stream.dap', NARROW, async (page) => {
      const first = await shapeSpan(page);
      assert.ok(first.left >= -EDGE_TOLERANCE, `첫 화면에서 그림 왼쪽이 ${first.left}px 잘린다`);

      await page.evaluate(() => document.querySelector('.fl-canvas').scrollTo(0, 0));
      const start = await shapeSpan(page);
      await page.evaluate(() => document.querySelector('.fl-canvas').scrollTo(1e6, 0));
      const end = await shapeSpan(page);

      assert.ok(start.left >= -EDGE_TOLERANCE, '왼쪽 끝까지 가도 도형이 잘린다');
      assert.ok(end.right <= end.width + EDGE_TOLERANCE, `오른쪽 끝까지 가도 도형이 ${end.right - end.width}px 잘린다`);
    });
  });

  // 근거: 이슈 #63. 그림이 화면에 다 들어오면(캔버스보다 좁은 화면) 가운데 정렬을 그대로 둔다
  test('player_screen_wider_than_the_figure_keeps_the_figure_centered', async () => {
    await withPlayer(browser, 'order-event-stream.dap', MIDDLE, async (page) => {
      const { left, right, width } = await shapeSpan(page);

      assert.ok(left >= -EDGE_TOLERANCE && right <= width + EDGE_TOLERANCE, `그림이 ${left}~${right}px로 화면(${width})을 벗어난다`);
      assert.ok(Math.abs(left - (width - right)) <= 40, `좌우 여백이 ${left}, ${width - right}로 다르다`);
    });
  });
});
