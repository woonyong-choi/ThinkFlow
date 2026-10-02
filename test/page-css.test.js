// 페이지 UI 규칙: 그림 표시 폭이 문서 미리보기, 목록 카드, 재생기에서 같다. 분할 조작이 한 모양이다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { values } from '../src/tokens.js';
import { playerSource } from './helpers.js';

const css = (name) => readFileSync(new URL(`../src/styles/${name}.css`, import.meta.url), 'utf8');
const [PLAYER, GALLERY, DOCUMENT, CONTROL] = [css('player'), css('gallery'), css('document'), css('control')];

// cost: time O(n), heap O(n), stack O(1)
// vars: n = CSS 글자 수
// basis: estimate
// 선택자가 정확히 같은 규칙 블록의 선언 표. 같은 선택자 블록이 여럿이면 뒤의 선언이 앞을 덮는다.
function declarationsOf(sheet, selector) {
  const block = new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'g');
  const found = {};
  for (const match of sheet.matchAll(block)) {
    for (const line of match[1].split(';')) {
      const [name, ...rest] = line.split(':');
      if (rest.length) found[name.trim()] = rest.join(':').trim();
    }
  }
  return found;
}

test('size_document_column_and_gallery_column_equal_the_figure_canvas_so_nothing_shrinks_the_figure', () => {
  assert.equal(values.size['document-column'], values.size['figure-canvas']);
  assert.equal(values.size['gallery-column'], values.size['figure-canvas']);
});

test('displayWidthRule_all_three_pages_use_one_gutter_and_the_canvas_as_the_container_maximum', () => {
  const gutter = (sheet) => declarationsOf(sheet, 'body').padding.split(' ').at(-1);

  // 컨테이너 폭 = 화면 폭 - 좌우 바깥 여백. 세 쪽의 좌우 바깥 여백이 같다.
  assert.deepEqual([gutter(PLAYER), gutter(GALLERY), gutter(DOCUMENT)], ['var(--space-16)', 'var(--space-16)', 'var(--space-16)']);
  // 그림 폭은 min(표준 캔버스 폭, 컨테이너 폭)이다.
  assert.equal(declarationsOf(PLAYER, '.fl-figure')['max-width'], 'var(--size-figure-canvas)');
  assert.equal(declarationsOf(DOCUMENT, 'article')['max-width'], 'var(--size-document-column)');
  assert.match(GALLERY, /minmax\(min\(100%, var\(--size-gallery-column\)\), 1fr\)/);
});

test('displayWidthRule_containers_take_no_horizontal_padding_or_layout_border_around_the_figure', () => {
  assert.match(declarationsOf(PLAYER, '.fl-canvas').padding, /^var\(--space-6\) 0$/);
  for (const [sheet, selector] of [[PLAYER, '.fl-figure'], [GALLERY, 'section']]) {
    const rules = declarationsOf(sheet, selector);
    assert.equal(rules.border, undefined, `${selector} border`);
    assert.match(rules['box-shadow'], /^0 0 0 var\(--border-thin\) var\(--color-frame\)$/);
  }
  assert.equal(declarationsOf(PLAYER, 'html.embedded body').padding, '0');
});

test('displayWidthRule_document_images_shrink_to_the_container_and_are_centered', () => {
  assert.equal(declarationsOf(DOCUMENT, 'img')['max-width'], '100%');
  assert.equal(declarationsOf(PLAYER, '.fl-canvas svg').margin, '0 auto');
});

test('readableRule_player_and_cards_never_shrink_the_figure_below_the_canvas_width_or_to_the_screen_height', () => {
  const svg = declarationsOf(PLAYER, '.fl-canvas svg');

  assert.equal(svg['min-width'], 'var(--size-figure-canvas)');
  assert.equal(svg['max-width'], undefined);
  assert.equal(svg['max-height'], undefined);
  assert.equal(declarationsOf(PLAYER, 'html.embedded .fl-canvas svg')['max-height'], undefined);
  assert.equal(declarationsOf(PLAYER, '.fl-canvas').overflow, 'auto', 'a narrow screen scrolls the figure sideways');
  assert.equal(declarationsOf(PLAYER, '.fl-foot').position, 'sticky', 'a tall figure keeps the controls reachable');
  assert.equal(declarationsOf(DOCUMENT, 'img')['max-height'], undefined);
});

test('splitControls_theme_group_player_tabs_and_round_buttons_share_radius_and_height', () => {
  const group = declarationsOf(CONTROL, '.fl-tabs,\n.theme');
  const button = declarationsOf(CONTROL, '.fl-tabs button,\n.theme button');
  const round = declarationsOf(PLAYER, '.fl-round');

  assert.equal(group['border-radius'], 'var(--radius-full)');
  assert.equal(group['min-height'], 'var(--size-control)');
  assert.equal(group.padding, 'var(--space-1-5)');
  assert.equal(button['border-radius'], 'var(--radius-full)');
  assert.equal(button['min-height'], 'var(--size-control-inner)');
  assert.equal(round['border-radius'], 'var(--radius-full)');
  assert.equal(round.height, 'var(--size-control)');
  assert.equal(values.size['control-inner'], values.size.control - 2 * (values.space['1-5'] + values.border.thin));
});

test('controlStates_hover_focus_and_selected_rules_live_only_in_control_css_and_cover_all_three_controls', () => {
  const hover = declarationsOf(CONTROL, '.fl-round:hover,\n.fl-tabs button:hover,\n.theme button:hover');
  const focus = declarationsOf(CONTROL, '.fl-round:focus-visible,\n.fl-tabs button:focus-visible,\n.theme button:focus-visible');
  const selected = declarationsOf(CONTROL, ".fl-tabs button.on,\n.theme button[aria-pressed='true']");

  assert.equal(hover.color, 'var(--color-fg)');
  assert.equal(focus.outline, 'var(--border-tag) solid var(--color-ui-focus)');
  assert.equal(selected.background, 'var(--color-ui-control-on)');
  for (const sheet of [PLAYER, GALLERY, DOCUMENT]) assert.doesNotMatch(sheet, /(?:\.fl-round|\.fl-tabs button|\.theme button)[^{]*:(?:hover|focus-visible)/);
});

test('playerBody_sets_the_text_color_token_so_inherited_text_is_not_default_black', () => {
  assert.equal(declarationsOf(PLAYER, 'body').color, 'var(--color-fg)');
});

test('progressRing_circle_is_built_from_tokens_and_covers_the_pause_button_border', async () => {
  const result = await buildFigure(readFileSync(new URL('../examples/memory.muto', import.meta.url), 'utf8'), { baseDir: 'examples' });
  const html = await toHtml(result, 'memory');
  const size = values.size.control;
  const width = values.border.edge;
  const circle = html.match(/<circle class="fl-ring-fill" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" stroke-width="([\d.]+)" transform="rotate\(-90 ([\d.]+) ([\d.]+)\)"/);

  assert.ok(circle, 'ring circle markup');
  assert.deepEqual(circle.slice(1).map(Number), [size / 2, size / 2, (size - width) / 2, width, size / 2, size / 2]);
  assert.ok(html.includes(`<svg class="fl-ring" viewBox="0 0 ${size} ${size}"`));
  assert.ok(!html.includes('fl-tab-fill'), 'old tab fill is gone');
});

test('progressRing_css_sits_over_the_border_box_and_has_no_number_literals_for_the_ring', () => {
  const ring = declarationsOf(PLAYER, '.fl-ring');
  const fill = declarationsOf(PLAYER, '.fl-ring-fill');

  assert.equal(ring.inset, 'calc(-1 * var(--border-thin))');
  assert.equal(fill.stroke, 'var(--color-ui-progress)');
  assert.equal(fill.fill, 'none');
  assert.equal(fill['stroke-width'], undefined, 'stroke width comes from the token via markup');
  assert.doesNotMatch(PLAYER, /fl-tab-(fill|track|label)/);
});

test('segmentedTabs_active_tab_is_a_solid_pill_with_semibold_label_and_no_progress_element', () => {
  const active = declarationsOf(CONTROL, ".fl-tabs button.on,\n.theme button[aria-pressed='true']");
  const tab = declarationsOf(CONTROL, '.fl-tabs button,\n.theme button');

  assert.equal(active.background, 'var(--color-ui-control-on)');
  assert.equal(active['font-weight'], 'var(--weight-semibold)');
  assert.equal(active.color, 'var(--color-fg)');
  assert.equal(tab.color, 'var(--color-muted)');
  assert.equal(declarationsOf(CONTROL, '.fl-tabs,\n.theme').background, 'var(--color-bg)');
});

test('controlsAxis_bar_and_caption_share_one_center_axis_with_symmetric_padding', () => {
  const foot = declarationsOf(PLAYER, '.fl-foot');
  const bar = declarationsOf(PLAYER, '.fl-bar');

  assert.equal(foot['justify-items'], 'center');
  assert.match(foot.padding, /^var\(--space-\d+\)$/, 'one value so top and bottom are equal');
  assert.equal(bar['grid-template-columns'], '1fr auto 1fr');
  assert.equal(declarationsOf(PLAYER, '.fl-bar .fl-pause')['justify-self'], 'end');
  assert.equal(declarationsOf(PLAYER, '.fl-bar .fl-rate')['justify-self'], 'start');
  assert.equal(declarationsOf(PLAYER, '.fl-caption')['text-align'], 'center');
});

test('controlsSize_round_buttons_and_tabs_share_text_size', () => {
  const round = declarationsOf(PLAYER, '.fl-round');
  const tab = declarationsOf(CONTROL, '.fl-tabs button,\n.theme button');

  assert.equal(round.font.split(' ')[0], tab.font.split(' ')[0]);
});

test('playerSource_every_template_placeholder_sits_in_a_template_literal', () => {
  const player = playerSource();

  assert.doesNotMatch(player, /'[^'\n]*\$\{[^'\n]*'/);
});
