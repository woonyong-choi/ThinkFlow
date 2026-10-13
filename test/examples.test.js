// 표현 예제: examples/ 폴더의 원본을 유효한 씨앗으로 삼아, 모든 예제가 경고 없이 읽히고 모든 장면이 올바른 SVG와 HTML이 되는지 본다.
// 독립 최소 경계 입력은 charts.test.js(차트 열여섯)와 kinds.test.js(개발 그림)에 있다. 시험 이름 첫 낱말(K30)이 요구사항 번호이고, 대응은 docs/design/expression-coverage.md의 시험 번호 표에 있다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { build, descendants, EXAMPLES, findAll, parseMarkup, textsOf, toHtml, toSvg, valueOf } from './support.js';

const CHARTS = ['area', 'bar', 'box', 'difference', 'donut', 'dumbbell', 'ecdf', 'heatmap', 'histogram', 'line', 'percent', 'pie', 'scatter', 'stacked', 'step', 'waterfall'];
const FIGURES = ['api', 'architecture', 'class', 'flow', 'integration', 'memory', 'memory-address', 'memory-fault', 'sql-join', 'metric', 'pointer', 'queue', 'schema', 'sequence', 'stack', 'state', 'trace'];
const ANIMATION = new Set(['animate', 'set', 'animateMotion', 'animateTransform']);

test('K30 the examples are one per expression: chart kinds and the declared development examples', () => {
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

test('#277 pointer insertion shows the same next field before and after, while preserving addresses and traversal', async () => {
  const source = readFileSync(join(EXAMPLES, 'pointer.thinkflow'), 'utf8');
  const result = await build(source, { baseDir: EXAMPLES });
  const inserted = parseMarkup(await toSvg(result, { scene: 2, isStatic: true }));
  const texts = textsOf(inserted).join(' ');

  for (const label of ['같은 next의 전후 비교', '전: next 0x28', '후: next 0x58', '삽입 전', '삽입 후']) assert.ok(texts.includes(label), `insertion must distinguish ${label}`);
  for (const label of ['0x10', '0x28', '0x40', '0x58']) assert.ok(texts.includes(label), `node address ${label} is preserved`);
  assert.equal(valueOf(inserted, 'cur'), '0x58');
  assert.equal(valueOf(inserted, '방문 수'), '3');
  const traversed = parseMarkup(await toSvg(result, { scene: 1, isStatic: true }));
  assert.equal(valueOf(traversed, 'cur'), '0x40');
  assert.equal(valueOf(traversed, '방문 수'), '3');
});

test('#279 metric records API 1 CPU at the last surge arrival and keeps that record while live values change', async () => {
  const source = readFileSync(join(EXAMPLES, 'metric.thinkflow'), 'utf8');
  const result = await build(source, { baseDir: EXAMPLES });
  const cases = [
    { scene: 0, recorded: '미기록', cpus: ['34', '41', '38'], p95: '110' },
    { scene: 1, recorded: '83', cpus: ['83', '73', '50'], p95: '236' },
    { scene: 2, recorded: '83', cpus: ['52', '52', '44'], p95: '148' },
  ];

  for (const { scene, recorded, cpus, p95 } of cases) {
    const dom = parseMarkup(await toSvg(result, { scene, isStatic: true }));
    assert.equal(valueOf(dom, 'API 1 CPU 기록(%)'), recorded, `scene ${scene} record`);
    assert.equal(valueOf(dom, '대시보드 p95'), p95);
    const texts = textsOf(dom);
    for (const cpu of cpus) assert.ok(texts.includes(cpu), `scene ${scene} live CPU ${cpu}`);
  }
});
