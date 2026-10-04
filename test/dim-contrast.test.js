// 흐린 행의 그래픽 대비: 면이 바탕 쪽으로 흐려도 막대와 히트맵 칸의 테두리는 바탕과 대비 3 이상이다(docs/design/docs-integration.md 대비 기준 표).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildFigure } from '../src/build.js';
import { contrast, mixHex } from '../src/contrast.js';
import { toSvg } from '../src/svg.js';
import { themeColor, tokenValue } from './helpers.js';

const EXAMPLES = fileURLToPath(new URL('../examples/', import.meta.url));
const GRAPHIC = 3;
const THEMES = ['light', 'dark'];
// 면(막대, 히트맵 칸)을 가진 흐림 대상 예제와 그 면의 class
const FACES = [['bar.dap', 'grow'], ['heatmap.dap', 'chart-heat']];

// cost: time O(page), heap O(out), stack O(1)
// vars: page = 예제 하나를 만드는 비용, out = 결과 글자 수
// basis: estimate
// 예제의 움직이는 SVG 글.
async function svgOf(file) {
  return toSvg(await buildFigure(readFileSync(EXAMPLES + file, 'utf8'), { baseDir: EXAMPLES }), { name: file });
}

// `var(--color-data-heat-high)`를 토큰 이름 `data.heat-high`로
const roleOf = (cssColor) => /var\(--color-(data)-([\w-]+)\)/.exec(cssColor)?.slice(1, 3).join('.');

// 근거: 이슈 #63 "흐린 막대·히트맵 대비를 현재 토큰으로 다시 측정". 면(opacity.dim)만으로는 라이트 1.5(막대), 1.1(0 칸)이라 테두리로 3 이상을 지킨다
test('contrast_dimmed_bar_and_heat_cells_keep_an_outline_at_3_in_both_themes', async () => {
  for (const [file, face] of FACES) {
    const svg = await svgOf(file);
    const faces = svg.match(new RegExp(`<rect (?:(?!fill="none")[^>])*class="${face}[ "][^>]*>`, 'g')) ?? [];
    const rims = [...svg.matchAll(/<g class="cr-(\d+) rim" opacity="0">(.*?)<\/g>/g)];

    assert.ok(faces.length > 0, `${file}: 면이 없다`);
    assert.equal(rims.length, faces.length, `${file}: 면마다 흐릴 때 보일 테두리 하나`);
    for (const [, , inner] of rims) {
      const role = roleOf(/stroke="([^"]+)"/.exec(inner)?.[1]);
      assert.ok(role, `${file}: 테두리 색이 토큰이 아니다: ${inner}`);
      for (const theme of THEMES) {
        const bg = themeColor(theme, 'bg');
        const dimmedFace = contrast(mixHex(bg, themeColor(theme, role), Number(tokenValue('opacity.dim'))), bg);
        const outline = contrast(themeColor(theme, role), bg);

        assert.ok(outline >= GRAPHIC, `${file} ${theme} ${role} 테두리 ${outline.toFixed(2)} (면만이면 ${dimmedFace.toFixed(2)})`);
      }
    }
  }
});

// 근거: 이슈 #63. 테두리는 흐린 행에서만 보이고 밝은 행에서는 숨는다(움직이는 SVG의 keyframes와 재생기의 CSS)
test('rim_is_hidden_unless_the_row_is_dimmed', async () => {
  const svg = await svgOf('bar.dap');

  assert.ok([...svg.matchAll(/<g class="cr-\d+ rim" opacity="0">/g)].length > 0, '테두리 묶음은 처음에 숨는다');
  assert.match(svg, /\.fl \.cr-\d+\.rim \{ animation: /);
  assert.match(readFileSync(new URL('../src/styles/chart.css', import.meta.url), 'utf8'), /\.fl \.rim\.dim \{\s*opacity: 1;/);
});
