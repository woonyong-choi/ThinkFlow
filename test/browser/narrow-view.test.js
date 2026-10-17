import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import { buildFigure, toHtml } from '../../src/index.js';
import { bindDiagramHost } from '@woonyong-choi/design-tokens/ui/runtime/diagram-host.js';

// 설치된 Chrome을 먼저 쓰고, 없으면 Playwright가 내려받은 Chromium으로 같은 검사를 돈다. 둘 다 없으면 첫 오류를 알린다.
async function launchBrowser() {
  try {
    return await chromium.launch({ channel: 'chrome' });
  } catch (chromeError) {
    try {
      return await chromium.launch();
    } catch {
      throw chromeError;
    }
  }
}

// #272: 실제 CSS·SVG·키보드 스크롤과 홈페이지가 쓰는 iframe 호스트 계약을 함께 확인한다.
test('narrow HTML preserves readable labels and keyboard access in standalone and embedded views', async () => {
  const documents = new Map();
  const graphHeights = new Map();
  for (const id of ['architecture', 'sequence']) {
    const source = new URL(`../../examples/${id}.torso`, import.meta.url);
    const built = await buildFigure(await readFile(source, 'utf8'), { baseDir: fileURLToPath(new URL('.', source)) });
    graphHeights.set(id, built.scene.height);
    documents.set(`/${id}`, await toHtml(built, id));
    documents.set(`/embed-${id}`, `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>body{margin:0}iframe{display:block;width:100%;border:0}</style></head><body><iframe data-diagram src="/${id}" title="그림" allow="fullscreen" allowfullscreen></iframe><script>(${bindDiagramHost.toString()})();</script></body></html>`);
  }
  const server = createServer((request, response) => {
    const body = documents.get(request.url);
    response.writeHead(body ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(body ?? 'not found');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await launchBrowser();
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const width of [320, 390, 430, 1440]) for (const embedded of [false, true]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        for (const id of ['architecture', 'sequence']) {
          await page.goto(`${origin}/${embedded ? 'embed-' : ''}${id}`);
          const frame = embedded ? page.frames().find(frame => frame !== page.mainFrame()) : page.mainFrame();
          await frame.evaluate(() => document.fonts.ready);
          if (id === 'architecture') {
            const initial = await frame.evaluate(() => {
              const canvas = document.querySelector('.fl-canvas').getBoundingClientRect();
              const first = document.querySelector('.fl-canvas .fl-node[data-id="user"]').getBoundingClientRect();
              return { height: document.querySelector('.fl-canvas .dp-panels').getBoundingClientRect().height, startVisible: first.left >= canvas.left && first.right <= canvas.right };
            });
            assert(initial.startVisible, 'the first architecture card is complete before any horizontal scroll');
            assert(initial.height <= graphHeights.get(id), 'an overflowing graph must not become taller than its original layout');
          }
          const tabs = frame.getByRole('tab');
          for (let scene = 0; scene < await tabs.count(); scene++) {
            await tabs.nth(scene).click();
            const current = await frame.evaluate(measure);
            assert(current.minTextSize >= 10.99, `${id}: labels shrink below their natural 11px minimum`);
            assert.equal(current.canvasHeight, current.contentHeight, `${id}: canvas clips vertically`);
            assert(current.pageWidth <= width, `${id}: document overflows horizontally`);
            if (current.overflow) await checkKeyboard(frame);
          }
          await tabs.first().focus();
          await tabs.first().press('ArrowRight');
          assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true', 'arrows on tabs still select scenes');
          if (embedded) await checkEmbedHeight(page, frame);
          if (width === 390) await checkFullscreen(frame);
        }
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});

function measure() {
  const canvas = document.querySelector('.fl-canvas');
  const panels = canvas.querySelector('.dp-panels');
  const texts = [...panels.querySelectorAll('text')].filter(text => text.getBoundingClientRect().height > 0);
  const sizes = texts.map(text => {
    const matrix = text.getScreenCTM();
    return parseFloat(getComputedStyle(text).fontSize) * Math.hypot(matrix.a, matrix.b);
  });
  return {
    minTextSize: Math.min(...sizes),
    panelWidth: panels.getBoundingClientRect().width,
    canvasHeight: canvas.clientHeight,
    contentHeight: canvas.scrollHeight,
    pageWidth: document.documentElement.scrollWidth,
    overflow: canvas.scrollWidth > canvas.clientWidth,
    scene: document.querySelector('[role=tab][aria-selected=true]')?.textContent,
  };
}

async function checkKeyboard(frame) {
  const canvas = frame.locator('.fl-canvas');
  const before = await frame.evaluate(measure);
  assert.equal(await canvas.getAttribute('tabindex'), '0');
  assert(await canvas.getAttribute('aria-labelledby') || await canvas.getAttribute('aria-label'));
  await canvas.evaluate(node => { node.scrollLeft = 0; });
  await canvas.focus();
  assert(await canvas.evaluate(node => node === document.activeElement));
  // 스크립트로 준 초점은 다음 그림 틀에서 키보드 스크롤 대상이 된다. 사람은 초점을 옮긴 같은 틀 안에 키를 누르지 않으므로 두 틀을 기다린다(첫 키가 스크롤되지 않던 간헐 실패).
  await canvas.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await canvas.press('ArrowRight');
  await frame.waitForFunction(() => document.querySelector('.fl-canvas').scrollLeft > 0);
  assert.equal((await frame.evaluate(measure)).scene, before.scene, 'arrows on the canvas leave the scene selected');
  const atEnd = await canvas.evaluate(node => {
    node.scrollLeft = node.scrollWidth;
    return Math.abs(node.scrollLeft + node.clientWidth - node.scrollWidth) <= 1;
  });
  assert(atEnd, 'the complete horizontal extent is reachable');
}

async function checkEmbedHeight(page, frame) {
  await page.waitForFunction(() => {
    const iframe = document.querySelector('iframe');
    return Math.abs(iframe.height - iframe.contentDocument.body.getBoundingClientRect().height) <= 1;
  });
  const before = await frame.evaluate(measure);
  await page.locator('iframe').evaluate(node => { node.style.width = '260px'; });
  await frame.waitForFunction(() => document.querySelector('.fl-figure').clientWidth === 260);
  const after = await frame.evaluate(measure);
  assert.equal(after.scene, before.scene);
  assert(after.minTextSize >= 10.99);
  await page.locator('iframe').evaluate(node => { node.style.width = ''; });
}

async function checkFullscreen(frame) {
  const before = await frame.evaluate(measure);
  const trigger = frame.getByRole('button', { name: '전체화면', exact: true });
  await trigger.click();
  await frame.waitForFunction(() => document.querySelector('.fl-figure.full'));
  const fit = await frame.evaluate(measure);
  for (let index = 0; index < 16; index++) await frame.getByRole('button', { name: '확대', exact: true }).click();
  const zoomed = await frame.evaluate(measure);
  assert(zoomed.panelWidth > fit.panelWidth, 'fullscreen zoom changes the rendered width');
  assert(zoomed.panelWidth > before.panelWidth, 'embedded natural width does not cap fullscreen zoom');
  assert.equal(zoomed.scene, before.scene);
  await frame.getByRole('button', { name: '전체 보기', exact: true }).click();
  await frame.getByRole('button', { name: '전체화면 종료', exact: true }).click();
  await frame.waitForFunction(() => !document.querySelector('.fl-figure.full'));
  const restored = await frame.evaluate(measure);
  assert.equal(restored.minTextSize, before.minTextSize);
  assert.equal(restored.scene, before.scene);
  assert(await trigger.evaluate(node => node === document.activeElement));
}
