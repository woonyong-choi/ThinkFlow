// 값 없는 카드: 내용이 없는 단계에서는 빈 점선 틀을 그리지 않는다(docs/design/figure-syntax.md 카드).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildFigure } from '../src/build.js';
import { toSvg } from '../src/svg.js';

const EXAMPLES = fileURLToPath(new URL('../examples/', import.meta.url));
const CARD_FRAME = /<rect [^>]*class="fl-card[ "][^>]*>/g;

// 근거: 이슈 #63 "값 없는 카드의 빈 점선 틀". 카드에 내용이 없는 정지 SVG에는 틀이 보이지 않는다
test('toSvg_static_card_without_content_draws_no_visible_frame', async () => {
  const result = await buildFigure(readFileSync(`${EXAMPLES}memory.dap`, 'utf8'), { baseDir: EXAMPLES });
  const frames = (await toSvg(result, { isStatic: true, name: 'memory' })).match(CARD_FRAME);

  assert.ok(frames.length > 0);
  assert.ok(frames.every((frame) => frame.includes('opacity="0"')), frames.find((frame) => !frame.includes('opacity="0"')));
});

// 근거: 이슈 #63. 움직이는 SVG는 카드에 내용이 들어오는 박자에만 틀이 보이고, 재생기도 같다
test('toSvg_moving_card_frame_is_visible_only_while_the_card_has_content', async () => {
  const result = await buildFigure(readFileSync(`${EXAMPLES}memory.dap`, 'utf8'), { baseDir: EXAMPLES });
  const svg = await toSvg(result, { name: 'memory' });
  const frameKeyframes = [...svg.matchAll(/@keyframes (\w+) \{([^@]*?\})\s*\}/g)].filter(([, , body]) => body.includes('stroke:') && body.includes('fill:') && /opacity: [01]/.test(body));

  assert.ok(frameKeyframes.length > 0, '카드 틀 keyframes가 불투명도를 바꾼다');
  assert.match(readFileSync(new URL('../src/styles/player.css', import.meta.url), 'utf8'), /\.fl \.fl-card\.filled \{[^}]*opacity: 1;/);
});
