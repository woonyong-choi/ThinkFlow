// 예제 결과(examples/out)를 로컬 Chrome으로 열어 UI 화면을 examples/screens에 찍는다. 먼저 npm run examples를 실행한다.
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = resolve('examples/out');
const SCREENS = resolve('examples/screens');

// 화면 하나: 열 파일, 저장 이름, 기다릴 시간과 누를 것
const SHOTS = [
  { file: 'index.html', name: '01-gallery.png', width: 1400, height: 1500, wait: 5000 },
  { file: 'memory.html', name: '02-flow-player.png', tab: 2, wait: 13500 },
  { file: 'oauth.html', name: '03-sequence-player.png', wait: 6000 },
  { file: 'orders.html', name: '04-data-player.png', wait: 5200 },
  { file: 'order-state.html', name: '05-state-player.png', height: 1100, wait: 2500 },
  { file: 'bar.html', name: '06-bar-chart.png', tab: 2, wait: 2500 },
  { file: 'dumbbell.html', name: '07-dumbbell-chart.png', tab: 2, wait: 2500 },
  { file: 'scatter.html', name: '08-scatter-chart.png', tab: 2, wait: 2500 },
  { file: 'heatmap.html', name: '09-heatmap-chart.png', wait: 2500 },
  { file: 'saturn.html', name: '10-fullscreen-zoom.png', zoom: true, wait: 600 },
  { file: 'memory.html', name: '11-dark-mode.png', dark: true, wait: 5000 },
  { file: 'saturn.svg', name: '12-animated-svg.png', wait: 3000 },
  { file: 'saturn-static.svg', name: '13-static-svg.png', wait: 300 },
  { file: 'box.html', name: '14-box-chart.png', wait: 2500 },
];

// cost: time O(s·w), heap O(1), stack O(1), io 2s + 2
// vars: s = 화면 수, w = 화면마다 기다리는 시간
// basis: estimate
async function main() {
  execFileSync(process.execPath, ['src/cli.js', 'render', 'examples/saturn.flow', '--static', '--out', 'examples/screens-static'], { stdio: 'ignore' });
  execFileSync('mv', ['examples/screens-static/saturn.svg', `${OUT}/saturn-static.svg`]);
  rmSync('examples/screens-static', { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const shot of SHOTS) {
    const page = await browser.newPage({ viewport: { width: shot.width ?? 1280, height: shot.height ?? 900 }, deviceScaleFactor: 2, colorScheme: shot.dark ? 'dark' : 'light' });
    await page.goto(`file://${OUT}/${shot.file}`);
    if (shot.tab) await page.click(`.fl-tabs button:nth-child(${shot.tab})`);
    if (shot.zoom) await zoomIn(page);
    await page.waitForTimeout(shot.wait);
    await page.screenshot({ path: `${SCREENS}/${shot.name}` });
    await page.close();
  }
  await browser.close();
  rmSync(`${OUT}/saturn-static.svg`);
}

// 전체 화면을 열고 휠로 두 번 확대한다.
async function zoomIn(page) {
  await page.click('.fl-full');
  await page.waitForTimeout(400);
  await page.mouse.move(640, 300);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(200);
  await page.mouse.wheel(0, -400);
}

await main();
