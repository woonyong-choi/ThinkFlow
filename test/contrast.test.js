// 글자와 그래픽 쌍의 대비 기준. 토큰 정본(tokens.json, tokens.dark.json)에서 라이트와 다크 색을 풀어 잰다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { heatLook } from '../src/chart/heatmap.js';
import { contrast, mixHex, pickInk } from '../src/contrast.js';
import { RESUME_ACCENT, themeColor, tokenValue } from './helpers.js';

const TEXT = 4.5;
const GRAPHIC = 3;
// 꾸밈 요소는 WCAG 적용 대상 밖이다. 값이나 상태를 전하지 않고 구조만 돕는다.
const DECORATIVE_LINE = 1.5;
const DECORATIVE_PLATE_EDGE = 1.3;
const FIGURE_FACES = ['bg', 'node', 'group', 'card-on'];
const DOCUMENT_FACES = ['page', 'gallery'];
const ALL_FACES = [...FIGURE_FACES, ...DOCUMENT_FACES];
// 글자 역할(4.5)과 그래픽 역할(3). 역할마다 놓이는 면은 모두 ALL_FACES 안이다.
// 강조 글자는 그룹 바탕 위에 놓이지 않는다. 카드 표시는 내용이 찬 카드 바탕(card-on)에, 링크는 문서 면에 놓인다.
const TEXT_FACES = ['bg', 'node', 'card-on', ...DOCUMENT_FACES];
const TEXT_ROLES = ['state.active-text', 'ui.link'];
const GRAPHIC_ROLES = ['state.active', 'ui.focus', 'ui.progress', 'data.main', 'data.compare'];
const THEMES = ['light', 'dark'];

const color = themeColor;
const opacity = (name) => tokenValue(`opacity.${name}`);

// cost: time O(p), heap O(1), stack O(1)
// vars: p = 쌍 수
// basis: estimate
function expectAtLeast(theme, minimum, pairs) {
  for (const [a, b] of pairs) {
    const ratio = contrast(color(theme, a), color(theme, b));
    assert.ok(ratio >= minimum, `${theme} ${a} on ${b}: ${ratio.toFixed(2)} < ${minimum}`);
  }
}

for (const theme of THEMES) {
  test(`contrast_${theme}_body_and_muted_text_reach_4_5_on_every_face`, () => {
    const faces = ['bg', 'node', 'surface', 'card-on', 'group', 'page', 'gallery'];
    expectAtLeast(theme, TEXT, faces.flatMap((face) => [['fg', face], ['muted', face]]));
  });

  test(`contrast_${theme}_text_roles_reach_4_5_on_their_faces`, () => {
    // 링크(열기, SVG, 목록으로), 카드 표시 ✓, 열 표시 PK
    expectAtLeast(theme, TEXT, TEXT_FACES.flatMap((face) => TEXT_ROLES.map((role) => [role, face])));
  });

  test(`contrast_${theme}_graphic_roles_reach_3_on_every_figure_and_document_face`, () => {
    // 밝힌 선과 점, 도형·그룹·카드 테두리(state), 진행 고리, 초점 고리(ui), 계열 막대와 점(data)
    expectAtLeast(theme, GRAPHIC, ALL_FACES.flatMap((face) => GRAPHIC_ROLES.map((role) => [role, face])));
  });

  test(`contrast_${theme}_text_on_active_fill_reaches_4_5`, () => {
    // 켜진 선 라벨 알약, 이동 글 상자, 켜진 테마 단추, 카드 안 켜진 이름 알약
    expectAtLeast(theme, TEXT, [['state.on-active', 'state.active-fill']]);
  });

  test(`contrast_${theme}_card_tag_text_reaches_4_5_on_every_tone_band`, () => {
    for (const face of ['node', 'surface', 'card-on']) {
      for (const tone of ['purple', 'green', 'teal', 'gray']) {
        const band = mixHex(color(theme, face), color(theme, `tag.${tone}`), opacity('tag'));
        const ratio = contrast(color(theme, 'fg'), band);
        assert.ok(ratio >= TEXT, `${theme} tag ${tone} on ${face}: ${ratio.toFixed(2)}`);
      }
    }
  });

  test(`contrast_${theme}_borders_reach_3_on_every_face_they_separate`, () => {
    // 노드, 그룹, 카드(surface 면)와 조작부 윤곽
    const faces = [...FIGURE_FACES, 'surface', ...DOCUMENT_FACES];
    expectAtLeast(theme, GRAPHIC, faces.flatMap((face) => [['border', face], ['group-border', face]]));
  });

  test(`contrast_${theme}_node_face_is_brighter_than_the_figure_ground`, () => {
    assert.ok(contrast(color(theme, 'node'), color(theme, 'bg')) > 1.05);
  });

  test(`contrast_${theme}_active_tab_state_ring_reaches_3_on_the_tab_group_face_and_text_keeps_4_5`, () => {
    // 켜진 탭 표시는 border 색 고리다. 알약 면은 글자 대비만 맡는다.
    expectAtLeast(theme, TEXT, [['fg', 'ui.control-on'], ['muted', 'bg']]);
    expectAtLeast(theme, GRAPHIC, [['border', 'bg']]);
  });

  test(`decorative_${theme}_lines_and_bands_reach_1_5_on_the_figure_ground`, () => {
    // 격자, 히트맵 값 0 칸, 신뢰구간 띠는 값이 숫자로도 적혀 있어 색은 거들 뿐이라 WCAG 적용 대상 밖이다.
    expectAtLeast(theme, DECORATIVE_LINE, [['data.grid', 'bg'], ['data.heat-low', 'bg']]);
    for (const series of ['data.main', 'data.compare']) {
      const band = mixHex(color(theme, 'bg'), color(theme, series), opacity('range'));
      const ratio = contrast(band, color(theme, 'bg'));
      assert.ok(ratio >= DECORATIVE_LINE, `${theme} range band ${series}: ${ratio.toFixed(2)}`);
    }
  });

  test(`contrast_${theme}_heat_text_reaches_4_5_on_every_cell_strength`, () => {
    const [low, high] = [color(theme, 'data.heat-low'), color(theme, 'data.heat-high')];
    const [dark, light] = [color(theme, 'data.heat-ink'), color(theme, 'data.heat-ink-on')];
    for (let step = 0; step <= 1000; step += 1) {
      const cell = mixHex(low, high, step / 1000);
      const ratio = contrast(pickInk(cell, dark, light), cell);
      assert.ok(ratio >= TEXT, `${theme} heat strength ${step / 1000} (${cell}): ${ratio.toFixed(2)}`);
    }
  });

  test(`contrast_${theme}_heat_cell_look_reaches_4_5_on_every_hundredth_of_strength_lit_and_dimmed`, () => {
    // 칸 색과 글자색은 heatLook 한 식이 함께 고른다. 0.01 단위로 훑어 평소(밝힘)와 흐림 모두 잰다.
    const heat = { low: color(theme, 'data.heat-low'), high: color(theme, 'data.heat-high'), ink: color(theme, 'data.heat-ink'), inkOn: color(theme, 'data.heat-ink-on') };
    const bg = color(theme, 'bg');
    for (let step = 0; step <= 100; step++) {
      const look = heatLook(step / 100, heat);
      const lit = contrast(look.isOn ? heat.inkOn : heat.ink, look.fill);
      assert.ok(lit >= TEXT, `${theme} lit strength ${step / 100} (${look.fill}): ${lit.toFixed(2)}`);
      const face = mixHex(bg, look.fill, opacity('dim'));
      const dimmed = contrast(mixHex(face, heat.ink, opacity('dim-ink')), face);
      assert.ok(dimmed >= TEXT, `${theme} dimmed strength ${step / 100}: ${dimmed.toFixed(2)}`);
    }
  });

  test(`contrast_${theme}_confidence_line_reaches_3_against_its_casing_on_every_bar_color`, () => {
    // 신뢰구간 선(fg)은 막대 위에 얹히므로 둘레 바탕색 테두리(bg)와 맞닿는다. 테두리와 선이 3 이상이면 막대 색과 상관없이 보인다.
    expectAtLeast(theme, GRAPHIC, [['fg', 'bg']]);
  });

  test(`contrast_${theme}_dimmed_row_text_keeps_value_text_at_4_5_and_helper_text_at_3`, () => {
    // 밝히지 않은 행의 글자는 opacity.dim-ink로 바탕에 얹힌다. 값 글자(fg)는 읽혀야 하고, 보조 글자(muted)는 흐린 상태에서도 3 이상이다.
    const bg = color(theme, 'bg');
    for (const [role, minimum] of [['fg', TEXT], ['muted', GRAPHIC]]) {
      const ratio = contrast(mixHex(bg, color(theme, role), opacity('dim-ink')), bg);
      assert.ok(ratio >= minimum, `${theme} dimmed ${role}: ${ratio.toFixed(2)} < ${minimum}`);
    }
  });

  test(`contrast_${theme}_dimmed_heat_text_reaches_4_5_on_every_cell_strength`, () => {
    // 흐린 칸: 면은 opacity.dim으로 바탕 쪽으로 옅어지고, 글자는 어두운 글자(heat-ink)가 opacity.dim-ink로 얹힌다.
    const [bg, low, high] = ['bg', 'data.heat-low', 'data.heat-high'].map((name) => color(theme, name));
    const ink = color(theme, 'data.heat-ink');
    for (let step = 0; step <= 1000; step++) {
      const face = mixHex(bg, mixHex(low, high, step / 1000), opacity('dim'));
      const ratio = contrast(mixHex(face, ink, opacity('dim-ink')), face);
      assert.ok(ratio >= TEXT, `${theme} dimmed heat strength ${step / 1000}: ${ratio.toFixed(2)}`);
    }
  });

  test(`decorative_${theme}_figure_plate_edge_reaches_1_3_on_the_document_ground`, () => {
    // 판 테두리는 흰 문서 위 판 모양만 잡는 꾸밈이다. 판 안 도형은 각자 3을 맞춘다.
    expectAtLeast(theme, DECORATIVE_PLATE_EDGE, [['plate-border', 'page']]);
  });
}

test('stateRoles_values_follow_the_resume_accent_and_strong_is_the_lightest_same_hue_that_reaches_4_5', () => {
  assert.ok(contrast(RESUME_ACCENT, color('light', 'bg')) < GRAPHIC, 'the resume accent itself misses 3 on the figure ground');
  assert.equal(color('light', 'state.active'), color('light', 'palette.blue.550'));
  assert.equal(color('dark', 'state.active'), '#79c0ff');
  assert.equal(color('light', 'state.on-active'), '#ffffff');
  assert.equal(color('dark', 'state.on-active'), '#0d1117');
  assert.equal(color('dark', 'state.active-text'), color('dark', 'state.active'));
  // 흰 글자가 놓이는 면(state.active-fill)은 라이트에서 state.active와 같은 색상의 어두운 단계다.
  assert.equal(color('light', 'state.active-text'), '#1072c2');
  assert.equal(color('light', 'state.active-fill'), color('light', 'state.active-text'));
  assert.equal(color('dark', 'state.active-fill'), color('dark', 'state.active'));
  const faces = ['node', 'bg', 'card-on', 'page', 'gallery'];
  const lowest = Math.min(...faces.map((face) => contrast(color('light', 'state.active-text'), color('light', face))));
  const brighter = Math.min(...faces.map((face) => contrast(mixHex(color('light', 'state.active-text'), '#ffffff', 0.01), color('light', face))));
  assert.ok(lowest >= TEXT && brighter < TEXT, `${lowest.toFixed(2)} / ${brighter.toFixed(2)}`);
  assert.ok(contrast(color('light', 'state.active'), color('light', 'node')) < TEXT, 'state.active itself is a graphic color, not a text color');
});

test('contrast_dark_heat_inks_are_one_color_so_the_build_time_light_pick_is_right_in_dark', () => {
  assert.equal(color('dark', 'data.heat-ink'), color('dark', 'data.heat-ink-on'));
});

test('buildFigure_heatmap_cells_draw_fill_and_ink_from_the_strength_written_in_the_style', async () => {
  // 칸 색(--s와 fill 속성)과 글자색(on class)이 같은 강도에서 나온다. 0~100을 1씩 훑는다.
  const rows = Array.from({ length: 101 }, (_, v) => `cell "r${v}" "c" ${v}`);
  const { chart } = await buildFigure(`chart heatmap\n${rows.join('\n')}\n`);
  const cells = [...chart.body.matchAll(/class="chart-heat" style="--s:([\d.]+)" fill="(#[0-9a-f]{6})"[^]*?class="cr-\d+ ink chart-cell( on)?"/g)];
  const heat = { low: color('light', 'data.heat-low'), high: color('light', 'data.heat-high'), ink: color('light', 'data.heat-ink'), inkOn: color('light', 'data.heat-ink-on') };

  assert.equal(cells.length, 101);
  for (const [, strength, fill, on] of cells) {
    const look = heatLook(Number(strength), heat);
    assert.equal(fill, look.fill, `strength ${strength}`);
    assert.equal(Boolean(on), look.isOn, `strength ${strength}`);
    assert.equal(look.strength, Number(strength));
  }
});

test('buildFigure_heatmap_cells_pick_the_ink_with_the_larger_contrast', async () => {
  const source = 'chart heatmap\ncell "a" "x" 1\ncell "a" "y" 50\ncell "b" "x" 100\ncell "b" "y" 0\n';
  const { chart } = await buildFigure(source);
  const [low, high] = [color('light', 'data.heat-low'), color('light', 'data.heat-high')];
  const picked = [...chart.body.matchAll(/class="chart-heat" style="--s:([\d.]+)"[^]*?class="cr-\d+ ink chart-cell( on)?"/g)];

  assert.equal(picked.length, 4);
  for (const [, strength, on] of picked) {
    const cell = mixHex(low, high, Number(strength));
    const expected = pickInk(cell, color('light', 'data.heat-ink'), color('light', 'data.heat-ink-on')) === color('light', 'data.heat-ink-on');
    assert.equal(Boolean(on), expected, `strength ${strength}`);
  }
});

test('chartCss_confidence_line_is_thin_text_color_with_a_background_casing', async () => {
  const { STYLES } = await import('../src/styles.js');

  assert.match(STYLES.chart, /\.fl \.chart-ci \{[^}]*stroke: var\(--color-fg\);[^}]*stroke-width: var\(--border-tag\)/);
  assert.match(STYLES.chart, /\.fl \.chart-ci-casing \{[^}]*stroke: var\(--color-bg\);[^}]*stroke-width: var\(--border-casing\)/);
});
