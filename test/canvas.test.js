// 캔버스: 모든 그림이 같은 표준 캔버스 폭으로 보이고, 좁은 내용은 가운데에 두며, 넓은 내용은 표시만 줄인다(docs/design/layout.md 그림 크기).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { values } from '../src/tokens.js';

const CANVAS = values.size['figure-canvas'];
const EXAMPLES = new URL('../examples/', import.meta.url);

// 루트 svg 태그의 너비, 높이, viewBox
function rootOf(svg) {
  const m = /<svg [^>]*width="([\d.]+)" height="([\d.]+)"[^>]*viewBox="([-\d.]+) 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  return { width: Number(m[1]), height: Number(m[2]), x: Number(m[3]), viewWidth: Number(m[4]), viewHeight: Number(m[5]) };
}

const CHARTS = {
  bar: 'chart bar\nx "정확도(%)"\nseries a "A"\nrow "항목" a=3\nrow "둘째" a=5',
  box: 'chart box\nx "시간(ms)"\nrow "a" min=1 q1=2 median=3 q3=4 max=5',
  heatmap: 'chart heatmap\ncell "a" "x" 10\ncell "a" "y" 5',
  scatter: 'chart scatter\nx "가(%)"\ny "나(%)"\npoint "p" x=1 y=2\npoint "q" x=3 y=1',
  line: 'chart line\nx "주차"\ny "점수(%)"\nseries a "A"\npoint x=1 a=1\npoint x=2 a=2',
  dumbbell: 'chart dumbbell\nx "값(%)"\nseries a "전" role=compare\nseries b "후" role=main\nrow "항목" a=1 b=3',
};
const WIDE_SEQUENCE = `sequence\n${Array.from({ length: 9 }, (_, i) => `box p${i} "참여자 ${i}"`).join('\n')}\nstep "전달"\n${Array.from({ length: 8 }, (_, i) => `  p${i} -> p${i + 1} "메시지 ${i}"`).join('\n')}`;
const NARROW = 'flow down\nbox a "A"\nbox b "B"\na -> b';

// 근거: 설계 docs-integration.md "모든 그림 같은 캔버스 폭 960, 차트도 꽉 채움", playback.md "표시 폭은 문서 미리보기, 목록 카드, 재생기에서 같다"
test('sizeTokens_chart_gallery_and_document_widths_equal_the_figure_canvas', () => {
  assert.equal(values.size.chart.width, CANVAS);
  assert.equal(values.size.document.column, CANVAS);
  assert.equal(values.size.gallery.column, CANVAS);
});

// 근거: 설계 docs-integration.md "모든 그림의 SVG width는 같은 표준 캔버스 폭이다"(모든 예제와 여섯 차트 종류)
test('toSvg_every_example_and_chart_type_is_canvas_wide_and_inside_its_viewbox', async () => {
  const files = readdirSync(EXAMPLES).filter((f) => f.endsWith('.muto'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const root = rootOf(await toSvg(await buildFigure(readFileSync(new URL(file, EXAMPLES), 'utf8'))));

    assert.equal(root.width, CANVAS, file);
  }
  for (const [type, source] of Object.entries(CHARTS)) {
    const result = await buildFigure(source);
    const svg = await toSvg(result, { isStatic: true });

    assert.equal(result.chart.width, CANVAS, type);
    assert.deepEqual([rootOf(svg).width, rootOf(svg).viewWidth], [CANVAS, CANVAS], type);
    for (const m of svg.matchAll(/ x="([\d.]+)"/g)) assert.ok(Number(m[1]) <= CANVAS, `${type} x=${m[1]}`);
  }
});

// 근거: 설계 layout.md 그림 크기 "내용이 캔버스보다 좁으면 판만 넓히고 내용은 가운데에 둔다"(SVG와 재생기 모두)
test('toSvg_and_toHtml_narrow_figure_has_canvas_width_and_centered_content', async () => {
  const result = await buildFigure(NARROW);
  const svg = await toSvg(result, { isStatic: true });
  const player = rootOf(await toHtml(result, 'a'));

  assert.ok(result.scene.width < CANVAS);
  assert.deepEqual([rootOf(svg).width, rootOf(svg).viewWidth], [CANVAS, CANVAS]);
  assert.match(svg, new RegExp(`<g transform="translate\\(${(CANVAS - result.scene.width) / 2} 0\\)">`));
  assert.deepEqual([player.width, player.viewWidth, player.x], [CANVAS, CANVAS, (result.scene.width - CANVAS) / 2]);
});

// 근거: 설계 layout.md 그림 크기 "내용이 캔버스보다 넓으면 viewBox는 내용 폭 그대로 두고 표시 폭만 캔버스로 줄인다"
test('toSvg_content_wider_than_the_canvas_keeps_the_view_and_shrinks_the_display_to_the_canvas', async () => {
  const result = await buildFigure(WIDE_SEQUENCE);
  const root = rootOf(await toSvg(result, { isStatic: true }));

  assert.ok(result.scene.width > CANVAS);
  assert.equal(root.width, CANVAS);
  assert.equal(root.viewWidth, result.scene.width);
  assert.ok(Math.abs(root.height - (root.viewHeight * CANVAS) / root.viewWidth) < 0.1);
});
