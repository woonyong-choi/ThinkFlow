// 장면 방식과 결과물: 움직이는 SVG, 멈춘 SVG, HTML 재생기와 정본 내려받기의 계약. 결정성과 바깥 자원 없음도 여기서 본다.
// 브라우저가 있어야 보이는 것(탭, 시계, 전체 화면)은 docs/design/expression-coverage.md의 브라우저에서만 보이는 계약 표에 있다. 시험 이름 첫 낱말(X1~X11)이 요구사항 번호이고 시험 번호 표에 대응이 있다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXAMPLES, build, thinkflow, descendants, findAll, findOne, parseMarkup, read, reject, textContent, textsOf, toHtml, toSvg } from './support.js';

const MOVE = (mode, speed = 1, time = '10s') => thinkflow(`box a "A"\nbox b "B"\na -> b\nscene "s" mode=${mode} speed=${speed}\n  a -> b "m" time=${time}\n`);
const ANIMATION = new Set(['animate', 'set', 'animateMotion', 'animateTransform']);
const animations = (dom) => descendants(dom).filter((n) => ANIMATION.has(n.tag));
const seconds = (text) => (text.endsWith('ms') ? Number.parseFloat(text) / 1000 : Number.parseFloat(text));

test('X1 mode picks the playback: loop repeats forever, once plays once and freezes, static has no animation at all', async () => {
  const svg = async (mode, options) => parseMarkup(await toSvg(await build(MOVE(mode)), options));
  const loop = await svg('loop');
  assert.equal(loop.attrs['data-mode'], 'loop');
  assert.ok(animations(loop).length > 0 && animations(loop).every((n) => n.attrs.repeatCount === 'indefinite'));
  const once = await svg('once');
  assert.equal(once.attrs['data-mode'], 'once');
  assert.ok(animations(once).length > 0 && animations(once).every((n) => n.attrs.repeatCount === '1' && n.attrs.fill === 'freeze'));
  const still = await svg('static');
  assert.equal(still.attrs['data-mode'], 'static');
  assert.equal(animations(still).length, 0);
  // --static は mode に関係なく動かない(마지막 모습 하나)
  const forced = await svg('loop', { isStatic: true });
  assert.equal(forced.attrs['data-mode'], 'static');
  assert.equal(animations(forced).length, 0);
  assert.equal(descendants(forced).filter((n) => ANIMATION.has(n.tag) || /\banimation\s*:/.test(n.attrs.style ?? '')).length, 0);
});

test('X2 speed scales the playback length, not the logical times: 10s at speed 2 plays in half, plus the fixed effect tail', async () => {
  const dur = async (speed) => {
    const lengths = new Set(animations(parseMarkup(await toSvg(await build(MOVE('loop', speed))))).map((n) => seconds(n.attrs.dur)));
    assert.equal(lengths.size, 1);
    return [...lengths][0];
  };
  assert.equal(await dur(1), 10.4);
  assert.equal(await dur(2), 5.4);
  assert.equal(await dur(0.5), 20.4);
});

test('X3 speed must be a positive finite number, and a length of under 1ms after dividing is an invalid-speed error', async () => {
  for (const speed of ['0', '-1', 'abc', 'NaN', 'Infinity', '1e999', '']) {
    const source = thinkflow(`box a "A"\nbox b "B"\na -> b\nscene "s" mode=once speed=${speed}\n  a -> b time=1s\n`);
    assert.ok((await reject(source)).length, `speed=${speed}`);
  }
  const fast = await reject(thinkflow(`box a "A"\nbox b "B"\na -> b\nscene "s" mode=once speed=100000\n  a -> b time=1s\n`));
  assert.ok(fast.some((p) => p.code === 'invalid-speed'), JSON.stringify(fast));
  await build(thinkflow(`box a "A"\nbox b "B"\na -> b\nscene "s" mode=once speed=1000\n  a -> b time=1s\n`));
});

test('X4 a scene is chosen by number or by name; only its own messages show; an unknown scene is a RangeError', async () => {
  const source = thinkflow(`
    person u "U"
    box s "S"
    view sequence {
      u
      s
    }
    scene "first" mode=static
      u -> s "one"
    scene "second" mode=static
      u -> s "two"
  `);
  const result = await build(source);
  const shown = async (scene) => textsOf(parseMarkup(await toSvg(result, { scene, isStatic: true })));
  assert.ok((await shown(0)).includes('one') && !(await shown(0)).includes('two'));
  assert.ok((await shown(1)).includes('two') && !(await shown(1)).includes('one'));
  assert.deepEqual(await shown('second'), await shown(1));
  assert.equal(parseMarkup(await toSvg(result, { scene: 1 })).attrs['data-scene'], '1');
  await assert.rejects(toSvg(result, { scene: 2 }), RangeError);
  await assert.rejects(toSvg(result, { scene: 'nope' }), RangeError);
});

test('X5 a figure with no scenes is one still picture of the declared start values', async () => {
  const result = await build(thinkflow('box a "A"\nvalue n "n" on=a from=5\n'));
  const dom = parseMarkup(await toSvg(result));
  assert.equal(animations(dom).length, 0);
  assert.equal(dom.attrs['data-mode'], 'static');
});

test('X6 builds are deterministic: the same source gives byte-identical SVG and HTML, in any order of calls', async () => {
  const source = thinkflow(`
    box a "A"
    box b "B"
    value n "n" on=b from=0
    a -> b
    chart c "C" bar {
      x "x(u)"
      series v "v"
      row "r" v=n
    }
    scene "x" mode=loop
      a -> b "go" set="n+1"
    scene "y" mode=once
      b -> a "back"
  `);
  const first = await build(source);
  const outputs = async (result) => [await toSvg(result, { scene: 1 }), await toSvg(result, { scene: 0, isStatic: true }), await toHtml(result, 'x')];
  const a = await outputs(first);
  const second = await build(source);
  const b = await outputs(second);
  assert.deepEqual(a, b);
  assert.deepEqual(await outputs(first), a, 'rendering again from the same result changes nothing');
});

// 독립 결과물은 배경과 정지·재생 층이 읽는 변수 정의를 함께 싣는다.
test('renderers_embed_required_style_variables', async () => {
  const sources = [MOVE('loop'), thinkflow(`
    chart c "Heatmap" heatmap {
      cell "r" "a" 1
      cell "r" "b" 2
    }
    scene "cells" mode=loop
      light c "r" "a"
      wait 1s
      light c "r" "b"
  `)];
  for (const source of sources) {
    const result = await build(source);
    const outputs = [['svg', await toSvg(result)], ['static', await toSvg(result, { isStatic: true })], ['html', await toHtml(result)]];
    for (const [format, output] of outputs) {
      const defined = new Set([...output.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
      const required = new Set([...output.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((match) => match[1]));
      const heatCells = findAll(parseMarkup(output, { html: format === 'html' }), (node) => (node.attrs.class ?? '').split(/\s+/).includes('chart-heat'));
      // 공통 차트 CSS의 강도 변수는 히트맵 칸이 있을 때만 읽고, 각 칸이 공급한다.
      if (!heatCells.length) required.delete('--s');
      for (const cell of heatCells) assert.match(cell.attrs.style, /(?:^|;)\s*--s\s*:/);

      assert.deepEqual([...required].filter((name) => !defined.has(name)).sort(), [], `${format}\n${source}`);
    }
  }
});

// ---- 정본 내려받기와 단독 HTML ----

const DOC = thinkflow(`
  title "Doc </script><img src=x onerror=alert(1)> & \\"q\\""
  box a "A <b>"
  box b "B & 'c'"
  a -> b
  scene "one" mode=once
    a -> b "x"
  scene "two" mode=loop
    a -> b "y"
`);

test('X7 the HTML is one standalone file: no outside resource, only inline script, and nothing from the text leaks into markup', async () => {
  const html = await toHtml(await build(DOC), 'doc');
  const dom = parseMarkup(html, { html: true });
  const all = descendants(dom);
  assert.deepEqual(all.filter((n) => n.tag === 'script' && n.attrs.src), []);
  assert.deepEqual(all.filter((n) => n.tag === 'link' && n.attrs.rel === 'stylesheet'), []);
  for (const node of all) {
    for (const name of ['src', 'href', 'poster', 'data', 'action']) {
      if (node.attrs[name] !== undefined) assert.match(node.attrs[name], /^(data:|#)/, `${node.tag} ${name}`);
    }
  }
  assert.doesNotMatch(html, /@import|url\(\s*['"]?https?:|<iframe|<object|<embed/i);
  // 원본의 글은 마크업으로 새지 않는다
  assert.deepEqual(all.filter((n) => n.tag === 'img' || n.attrs.onerror !== undefined), []);
  const texts = all.filter((n) => n.tag === 'text').map(textContent);
  assert.ok(texts.includes('A <b>') && texts.includes("B & 'c'"));
  assert.equal(all.filter((n) => n.tag === 'b').length, 0);
});

test('X8 the canonical copy in the page head rebuilds the whole page byte for byte (the download contract)', async () => {
  const html = await toHtml(await build(DOC), 'doc');
  const dom = parseMarkup(html, { html: true });
  const meta = findOne(dom, (n) => n.tag === 'meta' && n.attrs.name === 'thinkflow-canonical', 'canonical meta');
  const template = Buffer.from(meta.attrs.content, 'base64').toString('utf8');
  assert.match(template, /<meta name="thinkflow-canonical" content="">/);
  // 내려받기가 하는 일: 칸이 빈 정본에 같은 base64를 다시 채운다
  const head = '<meta name="thinkflow-canonical" content="';
  const at = template.indexOf(head) + head.length;
  assert.equal(template.slice(0, at) + meta.attrs.content + template.slice(at), html);
  // 정본 안에는 정본이 또 들어 있지 않아 다시 내려받아도 커지지 않는다
  assert.equal((template.match(/thinkflow-canonical/g) ?? []).length, 2, 'name and the script constant only, never a nested copy');
});

test('X9 one panel per view, in the order declared, and the same panels in the narrow-screen layout', async () => {
  const source = thinkflow(`
    person u "U"
    box s "S"
    chart c "C" bar {
      x "x(u)"
      series v "v"
      row "r" v=1
    }
    u -> s
    view graph "Structure" {
      u
      s
    }
    view sequence "Calls" {
      u
      s
    }
    view plot "Numbers" {
      c
    }
  `);
  const html = parseMarkup(await toHtml(await build(source), 'x'), { html: true });
  const views = (root) => findAll(root, (n) => n.tag === 'section' && n.attrs['data-strategy']).map((n) => n.attrs['data-strategy']);
  const wide = findOne(html, (n) => /\bfl-canvas\b/.test(n.attrs.class ?? ''), 'canvas');
  const narrow = findOne(html, (n) => n.tag === 'template' && /\bfl-narrow\b/.test(n.attrs.class ?? ''), 'narrow template');
  assert.deepEqual(views(wide), ['graph', 'sequence', 'plot']);
  assert.deepEqual(views(narrow), ['graph', 'sequence', 'plot']);
  assert.deepEqual(textsOf(wide).filter((t) => ['Structure', 'Calls', 'Numbers'].includes(t)), ['Structure', 'Calls', 'Numbers']);
});

test('X9 siblings keep their declared order when the narrow-screen layout stacks them one per layer, and the wide layout is unchanged', async () => {
  const source = thinkflow(`
    box lb "LB" icon=lb
    box a1 "API 1" icon=server
    box a2 "API 2" icon=server
    box a3 "API 3" icon=server
    value p95 "p95" on=lb from=110
    value cpu1 "CPU" on=a1 from=34
    value cpu2 "CPU" on=a2 from=41
    value cpu3 "CPU" on=a3 from=38
    lb -> a1
    lb -> a2
    lb -> a3
  `);
  const siblings = async (layoutWidth) => (await build(source, { layoutWidth })).scene.items.filter((item) => /^a\d$/.test(item.id));
  for (const layoutWidth of [272, undefined]) {
    const column = await siblings(layoutWidth);
    assert.deepEqual(column.map((item) => item.id), ['a1', 'a2', 'a3']);
    assert.ok(column.every((item, i) => i === 0 || item.y > column[i - 1].y), `${layoutWidth}: ${JSON.stringify(column.map((item) => [item.id, item.y]))}`);
  }
});

test('X9b every panel of the wide and the narrow-screen layout shares one width ratio that never exceeds its natural size', async () => {
  const names = ['a', 'b', 'c', 'd', 'e', 'f'];
  const source = thinkflow(`
    ${names.map((n) => `box ${n} "Service ${n.toUpperCase()}"`).join('\n    ')}
    chart numbers "Numbers" bar {
      x "x(u)"
      series v "v"
      row "r" v=1
    }
    ${names.slice(1).map((n, i) => `${names[i]} -> ${n}`).join('\n    ')}
    view graph "Structure" {
      ${names.join('\n      ')}
    }
    view sequence "Calls" {
      ${names.join('\n      ')}
    }
    view plot "Numbers" {
      numbers
    }
  `);
  const html = await toHtml(await build(source), 'x');
  const dom = parseMarkup(html, { html: true });
  const wide = findOne(dom, (n) => /\bfl-canvas\b/.test(n.attrs.class ?? ''), 'canvas');
  const narrow = findOne(dom, (n) => n.tag === 'template' && /\bfl-narrow\b/.test(n.attrs.class ?? ''), 'narrow template');
  const variable = (style, name) => Number.parseFloat(new RegExp(`${name}:\\s*([\\d.]+)`).exec(style ?? '')?.[1]);
  for (const root of [wide, narrow]) {
    const bundle = findOne(root, (n) => /\bdp-panels\b/.test(n.attrs.class ?? ''), 'panel bundle');
    const viewW = variable(bundle.attrs.style, '--view-w');
    const panels = findAll(root, (n) => n.tag === 'section' && /\bdp-panel\b/.test(n.attrs.class ?? ''));
    assert.equal(panels.length, 3);
    // 보기 폭은 표준 캔버스 폭으로 부풀리지 않은 가장 넓은 판의 폭이다.
    assert.equal(viewW, Math.max(...panels.map((panel) => variable(panel.attrs.style, '--panel-w'))));
    for (const panel of panels) {
      const panelW = variable(panel.attrs.style, '--panel-w');
      assert.ok(panelW > 0 && panelW <= viewW, `${panel.attrs['data-strategy']}: panel ${panelW} fits the view ${viewW}`);
      assert.doesNotMatch(panel.attrs.style, /--min-w/);
    }
  }
  // 모든 판이 같은 분모를 쓰는 곳은 이 CSS 한 줄이다. 바닥(max)이나 판 구역의 스크롤이 없다.
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  assert.match(css, /\.dp-panel > svg \{[^}]*\bwidth: calc\(100% \* var\(--panel-w\) \/ var\(--view-w\)\);/);
  assert.doesNotMatch(css, /--min-w|max\(calc\(100% \* var\(--panel-w\)/);
  assert.doesNotMatch(css, /\.dp-panel \{[^}]*overflow/);
  // 묶음 폭은 자연 폭(보기 폭)도 넘지 않아, 작은 그림은 캔버스 폭 기준으로 줄지 않는다.
  assert.match(css, /\.dp-panels \{[^}]*\bwidth: min\(100%, var\(--figure-canvas, var\(--spacing-figure-figure-canvas\)\), calc\(var\(--view-w\) \* 1px\)\);/);
});

test('X9d the narrow-screen layout is shipped only when it hides no more moving text than the wide one', async () => {
  const narrowOf = async (name) => {
    const dom = parseMarkup(await toHtml(await build(read(EXAMPLES, name)), name), { html: true });
    return descendants(dom).find((n) => n.tag === 'template' && /\bfl-narrow\b/.test(n.attrs.class ?? ''));
  };
  // 좁은 폭의 구조 배치는 이동 글 4개를 가리므로 쓰지 않고, 넓은 배치를 폭에 맞춰 줄인다.
  assert.equal(await narrowOf('flow.thinkflow'), undefined);
  // 이동 글을 가리지 않는 좁은 배치는 그대로 쓴다.
  assert.ok(await narrowOf('metric.thinkflow'));
});

test('X9c the shared viewer has no viewport-height cap in the document, and keeps the fixed full-screen frame', async () => {
  const html = await toHtml(await build(thinkflow('box a "A"\n')), 'x');
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  assert.doesNotMatch(css, /max-height:[^;}]*\d+[sld]?vh/);
  assert.match(css, /\.fl-figure\.full \{[^}]*\bposition: fixed;/);
  assert.equal(findAll(parseMarkup(html, { html: true }), (n) => n.tag === 'button' && n.attrs['aria-label'] === '전체화면').length, 1);
});

// 도구 막대의 순서와 마크업은 components.test.js U9가 본다. 여기서는 어떤 그림에도 재생 조작이 없다는 것만 본다.
test('X10 no figure has a play, speed, loop or progress control', async () => {
  const sources = [DOC, thinkflow('box a "A"\n'), thinkflow('chart c "C" bar {\n  x "x(u)"\n  series v "v"\n  row "r" v=1\n}\n')];
  for (const source of sources) {
    const html = parseMarkup(await toHtml(await build(source), 'doc'), { html: true });
    const names = findAll(html, (n) => n.tag === 'button').map((n) => n.attrs['aria-label']);
    assert.doesNotMatch(names.join(' '), /재생|일시|정지|배속|반복|속도|play|pause|speed|loop/i);
    assert.deepEqual(findAll(html, (n) => ['input', 'progress', 'audio', 'video'].includes(n.tag)), []);
  }
});

test('X11 the page keeps the original source exactly (line endings and all) so the copy button copies what the author wrote', async () => {
  const source = `thinkflow\r\ntitle "한글 \\"따옴표\\" <b>"\r\nbox a "A" # comment\r\n`;
  const html = parseMarkup(await toHtml(await build(source), 'doc'), { html: true });
  const carried = findAll(html, (n) => n.tag === 'script' && n.attrs.type === 'application/json').map((n) => JSON.parse(textContent(n)));
  assert.deepEqual(carried.filter((value) => value === source), [source]);
});
