// 표현 서른 가지: examples/ 폴더의 원본을 유효한 씨앗으로 삼아, 모든 예제가 경고 없이 읽히고 모든 장면이 올바른 SVG와 HTML이 되는지 본다.
// 독립 최소 경계 입력은 charts.test.js(차트 열여섯)와 kinds.test.js(개발 그림 열넷)에 있다. 시험 이름 첫 낱말(K30)이 요구사항 번호이고, 대응은 docs/design/expression-coverage.md의 시험 번호 표에 있다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { build, descendants, EXAMPLES, findAll, parseMarkup, textsOf, toHtml, toSvg } from './support.js';

const CHARTS = ['area', 'bar', 'box', 'difference', 'donut', 'dumbbell', 'ecdf', 'heatmap', 'histogram', 'line', 'percent', 'pie', 'scatter', 'stacked', 'step', 'waterfall'];
const FIGURES = ['api', 'architecture', 'class', 'flow', 'integration', 'memory', 'metric', 'pointer', 'queue', 'schema', 'sequence', 'stack', 'state', 'trace'];
const ANIMATION = new Set(['animate', 'set', 'animateMotion', 'animateTransform']);

test('K30 the examples are one per expression: sixteen chart kinds and fourteen figure families, nothing else', () => {
  const names = readdirSync(EXAMPLES).filter((f) => f.endsWith('.thinkflow')).map((f) => f.replace(/\.thinkflow$/, '')).sort();
  assert.deepEqual(names, [...CHARTS, ...FIGURES].sort());
});

/** 그림에 선언한 카드 제목(`kind id "제목"`). 코드 조각과 줄바꿈이 필요한 긴 글은 뺀다. */
function declaredTitles(source) {
  return [...source.matchAll(/^\s*(?:person|box|external|store|decision|queue|state|table|api|class|interface|grid|chart|trace|group)\s+[a-z][a-z0-9-]*\s+"([^"]{1,16})"/gm)].map((m) => m[1]).filter((t) => !t.includes('`'));
}

for (const name of [...CHARTS, ...FIGURES]) {
  test(`K30 ${name}.thinkflow builds strictly, every scene is a well-formed picture, and the page is standalone`, async () => {
    const source = readFileSync(join(EXAMPLES, `${name}.thinkflow`), 'utf8');
    const result = await build(source, { baseDir: EXAMPLES });
    assert.deepEqual(result.warnings, []);
    const { steps, presentation } = result.timeline;
    for (let scene = 0; scene < Math.max(steps.length, 1); scene += 1) {
      const movingSvg = await toSvg(result, { scene });
      const moving = parseMarkup(movingSvg);
      const still = parseMarkup(await toSvg(result, { scene, isStatic: true }));
      assert.equal(moving.attrs['data-scene'], String(scene));
      // 장면의 방식은 컴파일러가 정한 시간표 값이다. 움직이는 장면(반복이나 한 번이고 표시 길이가 0보다 긴 장면)은 SMIL과 CSS 시계가 모두 그 방식으로 되풀이하고, 나머지는 시계가 없다.
      const mode = steps[scene]?.mode ?? 'static';
      assert.equal(moving.attrs['data-mode'], mode);
      const animations = descendants(moving).filter((n) => ANIMATION.has(n.tag));
      const clocks = [...animations.map((n) => (n.attrs.repeatCount === 'indefinite' ? 'loop' : 'once')), ...[...movingSvg.matchAll(/\d(?:\.\d+)?s (infinite|1 forwards) linear/g)].map(([, repeat]) => (repeat === 'infinite' ? 'loop' : 'once'))];
      if (mode !== 'static' && presentation[scene] > 0) {
        assert.ok(clocks.length > 0, `scene ${scene} moves`);
        assert.ok(clocks.every((repeat) => repeat === mode), `scene ${scene} ${mode}`);
      } else assert.deepEqual(clocks, [], `scene ${scene} is still`);
      assert.equal(still.attrs['data-mode'], 'static');
      assert.equal(descendants(still).filter((n) => ANIMATION.has(n.tag)).length, 0);
    }
    const first = textsOf(parseMarkup(await toSvg(result, { scene: 0, isStatic: true }))).join(' ').replace(/\s+/g, ' ');
    for (const title of declaredTitles(source)) assert.ok(first.includes(title.replace(/\s+/g, ' ')), `"${title}" is drawn`);

    const html = await toHtml(result, name);
    const page = parseMarkup(html, { html: true });
    assert.ok(findAll(page, (n) => n.tag === 'section' && n.attrs['data-strategy']).length >= 1);
    assert.equal(findAll(page, (n) => n.tag === 'script' && n.attrs.src).length, 0);
    assert.doesNotMatch(html, /\b(src|href)="https?:/);
  });
}

test('K30 every chart example is the chart kind its file is named after, and says so in its title', async () => {
  for (const kind of CHARTS) {
    const source = readFileSync(join(EXAMPLES, `${kind}.thinkflow`), 'utf8');
    assert.match(source, new RegExp(`^chart\\s+[a-z][a-z0-9-]*\\s+"[^"]*"\\s+${kind}\\b`, 'm'), kind);
  }
});
