// 이동 글 상자는 자기 점에 붙어 다니고, 점이 선 라벨 위를 지나도 라벨 글자 대비가 유지된다(docs/design/playback.md 이동 글, 점 층). 재생기를 브라우저에서 돌려 화면 값으로 잰다.
// Chrome이 없으면 건너뛴다. 경로는 CHROME_PATH로 바꿀 수 있다.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright-core';
import { buildFigure } from '../src/build.js';
import { contrast } from '../src/contrast.js';
import { toHtml } from '../src/html.js';
import { withFolder } from './helpers.js';

const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((path) => path && existsSync(path));
// 글 상자 가장자리와 점 중심 사이 최대 거리(px). 글 상자 간격 12에 옆으로 비킨 여백 4를 더한 것이 규칙이고, 토큰 값이 아니다. 토큰을 키우면 이 값을 넘어 실패한다.
const REACH_RULE = 16;
const REACH_TOLERANCE = 0.5;
const TEXT_CONTRAST = 4.5;
const FRAME_MS = 50;
const SOURCES = ['../examples/saturn.muto', './fixtures/chip-reach/context.muto', './fixtures/chip-reach/a7-cache.muto'];

// cost: time O(p·l), heap O(p), stack O(1)
// vars: p = 화면의 점 수, l = 선 라벨 수
// basis: estimate
// 화면의 점과 글 상자를 재는 브라우저 쪽 함수. 글 상자와 점 사이 거리(그림 px)와, 점이 선 라벨 글자에 닿은 때 글자 색과 글자 뒤에 보이는 바탕 색을 돌려준다.
// 그리는 순서는 문서 순서라 알약 묶음이 점 층보다 뒤에 있으면 알약이 점 위에 그려진다.
function sampleFrame() {
  const svg = document.querySelector('svg.fl');
  const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
  const layer = svg.querySelector('.fl-packets');
  const rgb = (el) => getComputedStyle(el).fill;
  const out = { gaps: [], touches: [] };
  for (const packet of layer.querySelectorAll('.fl-packet')) {
    if (Number(packet.style.opacity) < 0.5) continue;
    const dot = packet.querySelectorAll(':scope > circle')[1].getBoundingClientRect();
    const [cx, cy] = [dot.x + dot.width / 2, dot.y + dot.height / 2];
    const chip = packet.querySelector(':scope > g');
    if (chip && Number(chip.style.opacity) >= 0.5) {
      const box = chip.querySelector('rect').getBoundingClientRect();
      out.gaps.push(Math.hypot(Math.max(box.x - cx, 0, cx - box.right), Math.max(box.y - cy, 0, cy - box.bottom)) / scale);
    }
    for (const text of svg.querySelectorAll('.fl-pill text.edgelabel')) {
      const t = text.getBoundingClientRect();
      if (Math.hypot(Math.max(t.x - cx, 0, cx - t.right), Math.max(t.y - cy, 0, cy - t.bottom)) > dot.width / 2) continue;
      const isAbove = Boolean(layer.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING);
      out.touches.push({ text: rgb(text), behind: isAbove ? rgb(text.parentElement.querySelector('rect.pill')) : rgb(packet.querySelectorAll(':scope > circle')[1]) });
    }
  }
  return out;
}

const toHex = (rgb) => `#${rgb.match(/\d+/g).slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;

describe('chip reach', { skip: CHROME ? false : 'Chrome이 없다' }, () => {
  let browser;
  const walks = new Map();
  before(async () => {
    browser = await chromium.launch({ executablePath: CHROME });
    for (const path of SOURCES) walks.set(path, await walk(path));
  });
  after(async () => {
    await browser.close();
  });

  // cost: time O(T/F), heap O(T/F), stack O(1), io 1
  // vars: T = 그림 전체 시간, F = 프레임 간격
  // basis: estimate
  // 재생기를 가짜 시계로 한 바퀴 돌리며 프레임마다 잰 { gaps, touches } 합. 시계를 직접 흘려 시각이 정해져 있다.
  async function walk(path) {
    const result = await buildFigure(readFileSync(new URL(path, import.meta.url), 'utf8'), { baseDir: 'examples' });
    const total = result.timeline.segs.reduce((sum, seg) => sum + seg.t1 - seg.t0, 0);
    const all = { gaps: [], touches: [] };
    await withFolder(async (folder) => {
      writeFileSync(join(folder, 'page.html'), await toHtml(result, 'reach'));
      const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
      await page.clock.install({ time: 0 });
      await page.goto(`file://${join(folder, 'page.html')}`);
      // 가짜 시계는 CSS 전환(실제 시간으로 흐른다)을 따라가지 못해, 켜지는 알약 면이 전환 중인 채로 잴 수 있다. 전환을 꺼 켜진 뒤의 값을 잰다.
      await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; }' });
      for (let t = 0; t < total; t += FRAME_MS) {
        await page.clock.runFor(FRAME_MS);
        const frame = await page.evaluate(sampleFrame);
        all.gaps.push(...frame.gaps);
        all.touches.push(...frame.touches);
      }
      await page.close();
    });
    return all;
  }

  // 근거: 버그 #40 "이동 글 상자가 점에서 떨어져 뜸"(51~90px). 설계 playback.md 이동 글: 상자 가장자리와 점 중심 거리는 붙임 거리 이하
  test('player_every_moving_chip_stays_within_the_reach_of_its_dot_on_every_frame', async () => {
    for (const path of SOURCES) {
      const { gaps } = walks.get(path);

      assert.ok(gaps.length > 20, `${path}: 잰 글 상자 ${gaps.length}개`);
      assert.ok(Math.max(...gaps) <= REACH_RULE + REACH_TOLERANCE, `${path}: 글 상자가 점에서 ${Math.max(...gaps).toFixed(1)}px 떨어진다`);
    }
  });

  // 근거: 검사 결과 F04 "이동 점이 선 라벨 글자를 가린다(그 순간 대비 3.2~3.4)", 결정 D02 글자 대비 4.5
  test('player_edge_label_text_keeps_the_text_contrast_while_a_dot_passes_over_it', async () => {
    let touched = 0;
    for (const path of SOURCES) {
      const { touches } = walks.get(path);

      touched += touches.length;
      for (const { text, behind } of touches) assert.ok(contrast(toHex(text), toHex(behind)) >= TEXT_CONTRAST, `${path}: 점이 지나는 라벨 글자 대비 ${contrast(toHex(text), toHex(behind)).toFixed(2)}`);
    }
    assert.ok(touched > 0, '점이 라벨 글자에 닿는 프레임이 하나도 없으면 이 시험이 아무것도 재지 않는다');
  });
});
