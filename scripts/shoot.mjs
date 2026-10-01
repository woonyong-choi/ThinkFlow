// 결과 파일을 로컬 Chrome으로 열어 화면을 PNG로 찍는다. 그림 모양을 눈으로 확인할 때 쓴다.
// 사용: node scripts/shoot.mjs <html|svg> <png> [대기 ms] [--dark] [--width 1400] [--click 선택자]
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [input, output, waitArg] = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.match(/^--(width|click)$/));
const option = (name) => process.argv[process.argv.indexOf(name) + 1];
const width = process.argv.includes('--width') ? Number(option('--width')) : 1400;

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2, colorScheme: process.argv.includes('--dark') ? 'dark' : 'light' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(/^https?:/.test(input) ? input : `file://${resolve(input)}`);
if (process.argv.includes('--click')) await page.click(option('--click'));
await page.waitForTimeout(Number(waitArg ?? 800));
// fullPage는 끝없이 도는 SVG 애니메이션에서 멈추지 않아, 문서 높이로 창을 늘려 찍는다.
// SVG 파일은 그림 크기로, HTML은 문서 높이로 맞춘다.
const size = await page.evaluate(() => {
  const root = document.documentElement;
  return root.tagName === 'svg' ? { w: Number(root.getAttribute('width')), h: Number(root.getAttribute('height')) } : { w: 0, h: root.scrollHeight };
});
await page.setViewportSize({ width: Math.ceil(size.w || width), height: Math.ceil(Math.max(200, Math.min(size.h, 4000))) });
await page.screenshot({ path: output });
await browser.close();
if (errors.length) console.error(errors.join('\n'));
