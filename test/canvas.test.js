import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { fitCanvas } from '../src/canvas.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { values } from '../src/tokens.js';

const CANVAS = values.size['figure-canvas'];
const EXAMPLES = new URL('../examples/', import.meta.url);

// 루트 svg 태그의 너비, 높이, viewBox
function rootOf(svg) {
  const m = /<svg [^>]*width="([\d.]+)" height="([\d.]+)" viewBox="([-\d.]+) 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  return { width: Number(m[1]), height: Number(m[2]), x: Number(m[3]), viewWidth: Number(m[4]), viewHeight: Number(m[5]) };
}

const BAR = 'chart bar\nx "정확도(%)"\nseries a "A"\nrow "항목" a=3\nrow "둘째" a=5';
const WIDE_SEQUENCE = `sequence\n${Array.from({ length: 9 }, (_, i) => `box p${i} "참여자 ${i}"`).join('\n')}\nstep "전달"\n${Array.from({ length: 8 }, (_, i) => `  p${i} -> p${i + 1} "메시지 ${i}"`).join('\n')}`;

test('canvas_token_chart_width_equals_canvas', () => {
  assert.equal(values.size['chart-width'], CANVAS);
});

test('fitCanvas_narrow_content_widens_view_and_wide_content_keeps_view_and_shrinks_display', () => {
  assert.deepEqual(fitCanvas(640, 300), { viewWidth: CANVAS, shownWidth: CANVAS, shownHeight: 300, scale: 1 });
  const wide = fitCanvas(CANVAS * 2, 400);
  assert.equal(wide.viewWidth, CANVAS * 2);
  assert.equal(wide.shownWidth, CANVAS);
  assert.equal(wide.shownHeight, 200);
});

test('toSvg_every_example_has_canvas_width', async () => {
  const files = readdirSync(EXAMPLES).filter((f) => f.endsWith('.muto'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const result = await buildFigure(readFileSync(new URL(file, EXAMPLES), 'utf8'));
    const root = rootOf(await toSvg(result));
    assert.equal(root.width, CANVAS, file);
  }
});

test('toSvg_narrow_figure_has_canvas_width_and_centered_content', async () => {
  const result = await buildFigure('flow down\nbox a "A"\nbox b "B"\na -> b');
  const svg = await toSvg(result, { isStatic: true });

  assert.ok(result.scene.width < CANVAS);
  assert.equal(rootOf(svg).width, CANVAS);
  assert.equal(rootOf(svg).viewWidth, CANVAS);
  assert.match(svg, new RegExp(`<g transform="translate\\(${(CANVAS - result.scene.width) / 2} 0\\)">`));
});

test('toSvg_content_wider_than_canvas_keeps_view_and_shrinks_display_to_canvas', async () => {
  const result = await buildFigure(WIDE_SEQUENCE);
  const root = rootOf(await toSvg(result, { isStatic: true }));

  assert.ok(result.scene.width > CANVAS);
  assert.equal(root.width, CANVAS);
  assert.equal(root.viewWidth, result.scene.width);
  assert.ok(Math.abs(root.height - (root.viewHeight * CANVAS) / root.viewWidth) < 0.1);
});

test('buildFigure_wide_wrapped_content_without_aspect_is_folded_into_the_canvas', async () => {
  const boxes = Array.from({ length: 16 }, (_, i) => `box n${i} "단계 ${i}"`).join('\n');
  const edges = Array.from({ length: 15 }, (_, i) => `n${i} -> n${i + 1}`).join('\n');
  const { scene } = await buildFigure(`flow right\n${boxes}\ngroup g "묶음" {\n  box a "가"\n}\n${edges}\nn15 -> a`);

  assert.ok(scene.width <= CANVAS, String(scene.width));
});

test('buildFigure_content_still_wider_than_canvas_after_shrinking_warns_check_10', async () => {
  const { warnings } = await buildFigure(WIDE_SEQUENCE);

  assert.ok(warnings.some((w) => w.code === 'check-10'), JSON.stringify(warnings));
});

test('toHtml_player_viewbox_is_canvas_wide_with_content_centered', async () => {
  const result = await buildFigure('flow down\nbox a "A"\nbox b "B"\na -> b');
  const html = await toHtml(result, 'a');
  const m = /<svg [^>]*width="([\d.]+)" height="([\d.]+)"[^>]*viewBox="([-\d.]+) 0 ([\d.]+) ([\d.]+)"/.exec(html);

  assert.equal(Number(m[1]), CANVAS);
  assert.equal(Number(m[4]), CANVAS);
  assert.equal(Number(m[3]), (result.scene.width - CANVAS) / 2);
});

test('toSvg_every_chart_type_is_canvas_wide_and_inside_its_viewbox', async () => {
  const sources = {
    bar: BAR,
    box: 'chart box\nx "시간(ms)"\nrow "a" min=1 q1=2 median=3 q3=4 max=5',
    heatmap: 'chart heatmap\ncell "a" "x" 10\ncell "a" "y" 5',
    scatter: 'chart scatter\nx "가(%)"\ny "나(%)"\npoint "p" x=1 y=2\npoint "q" x=3 y=1',
    line: 'chart line\nx "주차"\ny "점수(%)"\nseries a "A"\npoint x=1 a=1\npoint x=2 a=2',
    dumbbell: 'chart dumbbell\nx "값(%)"\nseries a "전" role=compare\nseries b "후" role=main\nrow "항목" a=1 b=3',
  };
  for (const [type, source] of Object.entries(sources)) {
    const result = await buildFigure(source);
    const svg = await toSvg(result, { isStatic: true });
    assert.equal(result.chart.width, CANVAS, type);
    assert.equal(rootOf(svg).width, CANVAS, type);
    assert.equal(rootOf(svg).viewWidth, CANVAS, type);
    for (const m of svg.matchAll(/ x="([\d.]+)"/g)) assert.ok(Number(m[1]) <= CANVAS, `${type} x=${m[1]}`);
  }
});

test('toSvg_canvas_output_is_deterministic', async () => {
  const source = BAR;

  assert.equal(await toSvg(await buildFigure(source)), await toSvg(await buildFigure(source)));
});
