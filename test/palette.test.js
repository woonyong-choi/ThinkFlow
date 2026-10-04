// 팔레트와 도형 색 선택(fill, stroke, card). 근거: docs/design/docs-integration.md 색 역할과 대비 기준, docs/design/figure-syntax.md 도형 색.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { contrast, mixHex } from '../src/contrast.js';
import { generatePalette } from '../scripts/lib/palette.mjs';
import { VISION, closestDistance, distanceOf, seenBy } from '../scripts/lib/color-vision.mjs';
import { readJson } from '../scripts/lib/read-json.mjs';
import { valueNames } from '../src/source/grammar.js';
import { toSvg } from '../src/svg.js';
import { toHtml } from '../src/html.js';
import { errorsOf, themeColor, tokenValue } from './helpers.js';

const TEXT = 4.5;
const GRAPHIC = 3;
const THEMES = ['light', 'dark'];
const NAMES = valueNames('paint');
const SURFACES = ['bg', 'node', 'group', 'card', 'card-on', 'page', 'surface'];
const paint = (theme, name, stage) => themeColor(theme, `paint.${name}.${stage}`);
const faces = (theme) => SURFACES.map((s) => themeColor(theme, s));
const fills = (theme) => NAMES.map((n) => paint(theme, n, 'fill'));

// 근거: 대비 기준 표 "글자 4.5, 그래픽 3, 예외 없음". 모든 색, 테마, 단계
test('paint_every_color_stage_reaches_its_contrast_floor_in_both_themes', () => {
  for (const theme of THEMES) {
    for (const name of NAMES) {
      const [fill, stroke, ink] = ['fill', 'stroke', 'ink'].map((s) => paint(theme, name, s));
      for (const text of ['fg', 'muted']) assert.ok(contrast(themeColor(theme, text), fill) >= TEXT, `${theme} ${text} on ${name} fill`);
      assert.ok(contrast(themeColor(theme, 'border'), fill) >= GRAPHIC, `${theme} border on ${name} fill`);
      for (const face of [...faces(theme), ...fills(theme)]) {
        assert.ok(contrast(stroke, face) >= GRAPHIC, `${theme} ${name} stroke on ${face}`);
        assert.ok(contrast(ink, face) >= TEXT, `${theme} ${name} ink on ${face}`);
      }
      const band = mixHex(fill, stroke, tokenValue('opacity.tag'));
      assert.ok(contrast(themeColor(theme, 'fg'), band) >= TEXT, `${theme} tag band on ${name} fill`);
      assert.ok(distanceOf(seenBy(VISION.normal, fill), seenBy(VISION.normal, themeColor(theme, 'node'))) >= tokenValue('distance.fill'), `${theme} ${name} fill reads as painted`);
    }
    for (const role of ['error', 'success', 'warning']) for (const face of faces(theme)) assert.ok(contrast(themeColor(theme, `state.${role}`), face) >= GRAPHIC, `${theme} state.${role} on ${face}`);
  }
});

// 근거: 색 역할 "이웃한 색은 갈린다". 보통 시각과 적록 색각 이상 시뮬레이션의 OKLab 거리, 색상 순서 이웃 쌍
test('paint_hue_neighbors_stay_apart_for_normal_protan_and_deutan_sight', () => {
  const order = ['red', 'amber', 'green', 'teal', 'navy', 'purple', 'pink'];
  for (const theme of THEMES) {
    for (const [a, b] of order.map((n, i) => [n, order[(i + 1) % order.length]])) {
      const [x, y] = [a, b].map((n) => paint(theme, n, 'stroke'));
      assert.ok(closestDistance(x, y, ['normal']) >= tokenValue('distance.neighbor'), `${theme} ${a}/${b} normal`);
      assert.ok(closestDistance(x, y, ['protanopia', 'deuteranopia']) >= tokenValue('distance.neighbor-cvd'), `${theme} ${a}/${b} cvd`);
    }
    // 지금(파랑)과 비교(주황)로 읽히지 않는다
    for (const name of order) for (const role of ['state.active', 'data.compare']) assert.ok(closestDistance(paint(theme, name, 'stroke'), themeColor(theme, role), ['normal']) >= tokenValue('distance.neighbor'), `${theme} ${name} vs ${role}`);
  }
});

// 근거: 카드 바탕 기본값은 도형 바탕과 OKLab 거리가 distance.card 범위 안(두 테마)
test('card_default_face_sits_within_the_oklab_range_from_the_node_face', () => {
  for (const theme of THEMES) {
    const distance = distanceOf(seenBy(VISION.normal, themeColor(theme, 'card')), seenBy(VISION.normal, themeColor(theme, 'node')));
    assert.ok(distance >= tokenValue('distance.card.min') && distance <= tokenValue('distance.card.max'), `${theme} ${distance.toFixed(4)}`);
  }
});

// 근거: 값의 출처 재현. 팔레트 값은 scripts/build-palette.mjs가 같은 정본에서 다시 만든 값과 같다
test('palette_values_in_tokens_equal_the_regenerated_ones', () => {
  const light = readJson(new URL('../src/tokens.json', import.meta.url).pathname);
  const dark = readJson(new URL('../src/tokens.dark.json', import.meta.url).pathname);
  const layer = light.get('color').get('palette');
  for (const [name, steps] of Object.entries(generatePalette(light, dark))) for (const [step, hex] of Object.entries(steps)) assert.equal(layer.get(name).get(step).get('$value'), hex, `${name}.${step}`);
});

// 근거: 값은 팔레트 이름뿐이고 hex와 없는 이름은 오류. 파랑과 주황은 고를 수 없다
test('parseFigure_rejects_hex_unknown_names_and_the_reserved_blue_and_orange', () => {
  for (const value of ['#ff0000', '"red"', 'blue', 'orange', 'mauve']) {
    const [error] = errorsOf(`flow right\nbox a "A" fill=${value}\n`);
    assert.ok(error, value);
  }
  const hex = errorsOf('flow right\nbox a "A" stroke=#ff0000\n')[0];
  assert.match(hex, /not hex/);
  assert.match(errorsOf('flow right\nbox a "A" fill=blue\n')[0], /one of red, amber, green, teal, navy, purple, pink, gray/);
  assert.deepEqual(errorsOf('flow right\nbox a "A" fill=red stroke=gray\nstep "s"\n  light a\n  show a "x" card=teal\n'), []);
});

const SOURCE = 'flow right\nbox a "A" "sub" fill=red stroke=amber\nbox b "B"\ngroup g "G" stroke=green fill=teal {\n  box c "C" stroke=navy\n}\na -> b\nb -> c\nstep "s"\n  light a\n  show a "x" card=pink\n';

// 근거: 밝힘은 색이 아니라 굵은 테두리와 후광. 색을 고른 도형은 켜져도 그 색이고, 고르지 않은 도형은 지금처럼 파랑이다
test('toSvg_lit_shape_keeps_its_stroke_color_and_gets_a_halo_while_unpainted_shapes_stay_blue', async () => {
  const svg = await toSvg(await buildFigure(SOURCE));
  assert.ok(/stroke: var\(--color-paint-amber-stroke\); stroke-width: var\(--border-strong\)/.test(svg), 'lit keyframe keeps amber');
  assert.ok(/class="fl-halo [^"]*" fill="none" opacity="0"/.test(svg), 'halo');
  assert.ok(svg.includes('fill="var(--color-paint-red-fill)"'), 'red fill');
  assert.ok(svg.includes('fill="var(--color-paint-pink-fill)"'), 'pink card');
  const plain = await toSvg(await buildFigure('flow right\nbox a "A"\nbox b "B"\na -> b\nstep "s"\n  light a\n'));
  assert.ok(!/fl-halo|ps-/.test(plain), 'unpainted');
});

// 근거: HTML 재생기도 같은 규칙. 켜진 도형의 테두리는 고른 색이 이기고 후광은 켜질 때 보인다
test('toHtml_painted_stroke_rules_beat_the_lit_blue_and_show_the_halo_when_on', async () => {
  const html = await toHtml(await buildFigure(SOURCE), 'x');
  assert.ok(html.includes('.fl .fl-node.on .fl-stroke.ps-amber'));
  assert.ok(html.includes('.fl .fl-group.on .fl-halo'));
  assert.ok(html.includes('.fl .frame-box.pf-teal'));
});
