// 글과 아이콘의 안전: 어느 글 자리에 어떤 글이 와도 SVG는 올바른 XML, HTML은 같은 구조로 남고, 사용자 아이콘은 안전한 도형만 거쳐 들어온다.
// 시험 이름 첫 낱말(I1~I3)이 요구사항 번호이고, 번호와 계약의 대응은 docs/design/expression-coverage.md의 시험 번호 표에 있다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build, thinkflow, descendants, findAll, lineOf, parseMarkup, reject, textContent, textsOf, toHtml, toSvg, workspace } from './support.js';

const HOSTILE = '<b>&"\'--]]>';
const WORD = "<b>'--"; // 따옴표 밖에 쓰는 낱말 자리용(공백, 큰따옴표, 문장 사이 &가 없다)
const CLOSER = '</script><!--';
const quote = (text) => `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/** 글을 받는 자리마다 `text`를 넣은 문서. 낱말 자리에는 `word`를, 8자 이하 자리에는 `word`의 앞부분을 넣는다. */
const everywhere = (text, word = text) => {
  const q = (label) => quote(`${label} ${text}`);
  const badge = quote(word.slice(0, 6));
  return thinkflow(`
    title ${q('T')}
    subtitle ${q('S')}
    person u ${q('U')}
    box a ${q('A')} ${quote(`sub${word}`)} badge=${badge}
    group g ${q('G')} badge=${badge} {
      box b ${q('B')}
    }
    table t ${q('Ta')} {
      id bigint pk
      memo ${q('ty')}
    }
    api ap "GET /x" {
      body ${q('ty')}
    }
    class k ${q('K')} {
      field f ${q('ty')}
      method m ${quote(`(): ${text}`)}
    }
    grid gr ${q('Gr')} cols=2 {
      item i ${q('It')}
    }
    queue q ${q('Q')} slots=2
    value n ${q('V')} on=a from=${word}
    chart c ${q('C')} bar ${q('sub')} {
      x ${quote(`X ${text}(u)`)}
      series s ${q('Se')}
      row ${q('R')} s=1
      row ${q('M')} s=-
      rule 2 ${q('Ru')}
      missing ${q('Mi')}
    }
    trace tr ${q('Tr')} {
      span sp ${q('Sp')} lane=a at=0 dur=1
    }
    u -> a ${q('E')}
    a -> b ${q('F')}
    a -> q
    view graph
    view sequence ${q('Sq')} {
      u
      a
    }
    scene ${q('Sc')} mode=static
      u -> a ${q('Mv')} set="n=${word}"
      note u ${q('No')}
      show a ${q('Sh')} tag=${q('tg')} meta=${q('mt')} mark=${badge}
    scene "Frames" mode=static
      u -> a "Mv2"
      fragment alt ${q('Fr')} choose=${q('Br')} {
        branch ${q('Br')} {
          a -> u ${q('In')}
        }
        branch "Other" {
          a -> u "Ot"
        }
      }
  `);
};

test('I1 hostile text in any slot keeps the SVG well-formed XML and shows the text exactly as written', async () => {
  const result = await build(everywhere(HOSTILE, WORD), { strict: false });
  for (const options of [{ isStatic: true }, {}]) {
    const dom = parseMarkup(await toSvg(result, options));
    assert.deepEqual(descendants(dom).filter((n) => n.tag === 'script' || Object.keys(n.attrs).some((a) => /^on/i.test(a))), []);
  }
  const shownIn = async (scene) => textsOf(parseMarkup(await toSvg(result, { scene, isStatic: true }))).join(' ').replace(/\s+/g, ' ');
  const [first, second] = [await shownIn(0), await shownIn(1)];
  for (const [shown, slots] of [[first, ['U', 'A', 'B', 'G', 'K', 'Gr', 'It', 'Q', 'C', 'R', 'Se', 'E', 'F', 'Sh', 'No', 'Mv']], [second, ['Fr', 'Br', 'In']]]) {
    for (const slot of slots) assert.ok(shown.includes(`${slot} ${HOSTILE}`), `${slot} ${HOSTILE} not found; text near it: ${shown.match(new RegExp(`${slot}[^]{0,50}`))?.[0]}`);
  }
  const title = findAll(parseMarkup(await toSvg(result, { isStatic: true })), (n) => n.tag === 'title').map(textContent);
  assert.deepEqual(title, [`T ${HOSTILE}`], 'the document title is text, not markup');
});

test('I1 the HTML keeps the structure of a benign twin: same elements and script blocks, hostile text never becomes markup', async () => {
  const benign = await build(everywhere('ok', 'ok'), { strict: false });
  const hostile = await build(everywhere(HOSTILE, WORD), { strict: false });
  const shape = async (result) => {
    const dom = parseMarkup(await toHtml(result, 'doc'), { html: true });
    const tags = descendants(dom).map((n) => n.tag);
    return { scripts: tags.filter((t) => t === 'script').length, styles: tags.filter((t) => t === 'style').length, svgs: tags.filter((t) => t === 'svg').length, injected: tags.filter((t) => ['img', 'iframe', 'object', 'embed', 'b'].includes(t)).length };
  };
  assert.deepEqual(await shape(hostile), await shape(benign));
  assert.equal((await shape(hostile)).injected, 0);
});

test('I1 a text that tries to close the script block or comment cannot end the page script early', async () => {
  const text = `${CLOSER}<img src=x onerror=alert(1)>`;
  const source = thinkflow(`title ${quote(text)}\nbox a ${quote(CLOSER)}\nbox b "B"\na -> b "edge"\nscene ${quote(CLOSER)}\n  a -> b ${quote(CLOSER)}\n`);
  const html = await toHtml(await build(source), `${CLOSER}name`);
  const dom = parseMarkup(html, { html: true });
  const plain = parseMarkup(await toHtml(await build(thinkflow('title "t"\nbox a "A"\nbox b "B"\na -> b "edge"\nscene "s"\n  a -> b "move"\n')), 'name'), { html: true });
  const scripts = (root) => findAll(root, (n) => n.tag === 'script');
  assert.equal(scripts(dom).length, scripts(plain).length);
  assert.equal(findAll(dom, (n) => n.tag === 'img' || n.attrs.onerror !== undefined).length, 0);
  assert.ok(textContent(findAll(dom, (n) => n.tag === 'title')[0]).includes(CLOSER), 'the page title carries the text, escaped');
  for (const script of scripts(dom)) assert.ok(!textContent(script).includes('</script'), 'no closing tag inside script text');
});

test('I1 a file name that is not a clean name is only ever a title: the page title is escaped text', async () => {
  const dom = parseMarkup(await toHtml(await build(thinkflow('box a "A"\n')), 'a<b>&"'), { html: true });
  assert.equal(textContent(findAll(dom, (n) => n.tag === 'title')[0]), 'a<b>&"');
});

// ---- 사용자 아이콘 ----

const ICON = (inner, attrs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${attrs}>${inner}</svg>`;
const usingIcon = (name) => thinkflow(`icons custom "icons"\nbox a "A" icon=custom:${name}\n`);

test('I2 a user icon keeps its shapes but never its colors: every paint becomes currentColor or none', async (t) => {
  const dir = workspace(t, { 'icons/mine.svg': ICON('<title>t</title><rect x="1" y="1" width="10" height="10" fill="#ff0000"/><path d="M2 9h4" stroke="#00ff00" stroke-width="2" fill="none"/><g opacity="0.5"><circle cx="5" cy="5" r="3" fill="rgb(1,2,3)"/></g>') });
  const svg = await toSvg(await build(usingIcon('mine'), { baseDir: dir }), { isStatic: true });
  assert.doesNotMatch(svg.replace(/<style>[\s\S]*?<\/style>/, ''), /#ff0000|#00ff00|rgb\(1,\s*2,\s*3\)/i);
  const shapes = descendants(parseMarkup(svg)).filter((n) => ['rect', 'path', 'circle'].includes(n.tag));
  assert.ok(shapes.some((n) => n.attrs.d === 'M2 9h4'), 'the path is kept');
  assert.ok(shapes.every((n) => !/#[0-9a-f]{3,6}\b/i.test(`${n.attrs.fill ?? ''} ${n.attrs.stroke ?? ''}`)), 'no literal color on shapes');
});

test('I2 an icon file with code, outside resources or unknown content is rejected at its line, or stripped so none of it reaches the picture', async (t) => {
  const hostile = {
    script: ICON('<script>alert(1)</script>'),
    onload: ICON('<path d="M0 0h1"/>', ' onload="alert(1)"'),
    onclick: ICON('<path d="M0 0h1" onclick="alert(1)"/>'),
    image: ICON('<image href="https://example.com/x.png"/>'),
    use: ICON('<use href="#a"/>'),
    style: ICON('<style>*{fill:red}</style><path d="M0 0h1"/>'),
    foreign: ICON('<foreignObject><div/></foreignObject>'),
    pathcode: ICON('<path d="M0 0 javascript:alert(1)"/>'),
    entity: ICON('<path d="M0 0h1&#x41;"/>'),
    cdata: ICON('<![CDATA[x]]><path d="M0 0h1"/>'),
    text: `${ICON('<path d="M0 0h1"/>')} trailing`,
    notsvg: '<html></html>',
    unclosed: ICON('<g><path d="M0 0h1"/>').replace('</svg>', ''),
    oversize: ICON(`<path d="M${'0 '.repeat(40000)}"/>`),
  };
  const dir = workspace(t, Object.fromEntries(Object.entries(hostile).map(([name, text]) => [`icons/${name}.svg`, text])));
  // 그림 자리(SVG 문서 전체, HTML 쪽에서는 그림 영역)에는 코드가 될 요소도, 이벤트 속성도, 바깥 주소도 없어야 한다.
  const assertClean = (root, label) => {
    for (const node of [root, ...descendants(root)]) {
      assert.ok(!['script', 'image', 'foreignObject', 'iframe', 'object', 'embed'].includes(node.tag), `${label}: <${node.tag}> reached the picture`);
      for (const [attr, value] of Object.entries(node.attrs ?? {})) {
        assert.doesNotMatch(attr, /^on/i, `${label}: ${attr}`);
        assert.doesNotMatch(value, /javascript:|example\.com|alert\(1\)/i, `${label}: ${attr}="${value.slice(0, 40)}"`);
      }
    }
  };
  for (const name of Object.keys(hostile)) {
    const source = usingIcon(name);
    let result;
    try {
      result = await build(source, { baseDir: dir });
    } catch (error) {
      assert.ok(error.problems.some((p) => p.line === lineOf(source, 'icon=custom:') && /cannot use icon/.test(p.message)), `${name}: ${JSON.stringify(error.problems)}`);
      continue;
    }
    assertClean(parseMarkup(await toSvg(result, { isStatic: true })), `${name} svg`);
    assertClean(findAll(parseMarkup(await toHtml(result, 'x'), { html: true }), (n) => /\bfl-canvas\b/.test(n.attrs.class ?? ''))[0], `${name} html`);
  }
  // 적어도 코드가 될 수 있는 요소는 거절한다
  for (const name of ['script', 'image', 'use', 'style', 'foreign', 'cdata', 'entity', 'unclosed', 'oversize', 'notsvg']) {
    const source = usingIcon(name);
    assert.ok((await reject(source, { baseDir: dir })).some((p) => p.line === lineOf(source, 'icon=custom:')), name);
  }
});

test('I2 an icon root size is a finite positive viewBox, or width and height only when there is no viewBox; anything else is a located error', async (t) => {
  const root = (attrs, inner = '<path d="M0 0h1"/>') => `<svg xmlns="http://www.w3.org/2000/svg"${attrs}>${inner}</svg>`;
  const invalid = {
    'viewBox three numbers': [' viewBox="0 0 24"', /invalid viewBox/],
    'viewBox five numbers': [' viewBox="0 0 24 24 1"', /invalid viewBox/],
    'viewBox zero width': [' viewBox="0 0 0 24"', /invalid viewBox/],
    'viewBox negative height': [' viewBox="0 0 24 -1"', /invalid viewBox/],
    'viewBox Infinity': [' viewBox="0 0 Infinity 24"', /invalid viewBox/],
    'viewBox overflow': [' viewBox="0 0 1e309 24"', /invalid viewBox/],
    'viewBox hex': [' viewBox="0 0 0x18 24"', /invalid viewBox/],
    'viewBox trailing text': [' viewBox="0 0 24oops 24"', /invalid viewBox/],
    'viewBox empty': [' viewBox=""', /invalid viewBox/],
    'bad viewBox beside good width and height': [' viewBox="0 0 24" width="24" height="24"', /invalid viewBox/],
    'width Infinity': [' width="Infinity" height="24"', /finite positive width and height/],
    'width overflow': [' width="1e309" height="24"', /finite positive width and height/],
    'width trailing text': [' width="12oops" height="24"', /finite positive width and height/],
    'width hex': [' width="0x18" height="24"', /finite positive width and height/],
    'width underflow to zero': [' width="1e-400" height="24"', /finite positive width and height/],
    'width zero': [' width="0" height="24"', /finite positive width and height/],
    'height negative': [' width="24" height="-5"', /finite positive width and height/],
    'height percent': [' width="24" height="100%"', /finite positive width and height/],
    'height missing': [' width="24"', /finite positive width and height/],
    'no size at all': ['', /finite positive width and height/],
    'viewBox too small to fit the grid': [' viewBox="0 0 1e-320 1e-320"', /too large or too small/],
    'width and height too small to fit the grid': [' width="1e-320" height="1e-320"', /too large or too small/],
  };
  const dir = workspace(t, Object.fromEntries(Object.entries(invalid).map(([name, [attrs]], i) => [`icons/bad${i}.svg`, root(attrs)])));
  for (const [i, [name, [, message]]] of Object.entries(invalid).entries()) {
    const source = usingIcon(`bad${i}`);
    const problems = await reject(source, { baseDir: dir });
    assert.ok(problems.some((p) => p.line === lineOf(source, 'icon=custom:') && message.test(p.message)), `${name}: ${JSON.stringify(problems)}`);
  }
  // 같은 파일 모양에서 숫자 도형 속성도 무한대를 내보내지 않는다.
  const shapes = { circle: root(' viewBox="0 0 24 24"', '<circle cx="5" cy="5" r="1e309"/>'), stroke: root(' viewBox="0 0 24 24"', '<path d="M0 0h1" stroke-width="Infinity"/>') };
  const shapeDir = workspace(t, Object.fromEntries(Object.entries(shapes).map(([name, text]) => [`icons/${name}.svg`, text])));
  for (const name of Object.keys(shapes)) {
    const source = usingIcon(name);
    assert.ok((await reject(source, { baseDir: shapeDir })).some((p) => p.line === lineOf(source, 'icon=custom:') && /unsupported/.test(p.message)), name);
  }

  // 올바른 크기는 같은 칸(24) 안에서 가장 긴 변이 같은 크기로 보이도록 그려진다: 비율 × 긴 변이 기준 아이콘과 같다.
  const valid = {
    'viewBox decimals': [' viewBox="0 0 24.5 12.25"', 24.5],
    'viewBox commas': [' viewBox="0,0,48,24"', 48],
    'viewBox exponent and leading dot': [' viewBox="0 0 2.4e1 .12e2"', 24],
    'viewBox negative origin': [' viewBox="-4 -4 32 16"', 32],
    'width and height': [' width="48" height="24"', 48],
    'width and height px': [' width="48px" height="24px"', 48],
    'width and height exponent': [' width="1.2E+1" height="6"', 12],
    'huge viewBox': [' viewBox="0 0 1e308 1e308"', 1e308],
    'huge width and height': [' width="1e308" height="1e308"', 1e308],
    'tiny but representable': [' viewBox="0 0 1e-300 1e-300"', 1e-300],
  };
  const files = { 'icons/ref.svg': root(' viewBox="0 0 24 24"'), ...Object.fromEntries(Object.entries(valid).map(([, [attrs]], i) => [`icons/ok${i}.svg`, root(attrs)])) };
  const okDir = workspace(t, files);
  const scaleOf = async (name) => {
    const svg = await toSvg(await build(usingIcon(name), { baseDir: okDir }), { isStatic: true });
    const icon = findAll(parseMarkup(svg), (n) => /\bfl-icon\b/.test(n.attrs.class ?? ''))[0];
    assert.ok(icon, `${name}: the icon is drawn`);
    // 격자에 맞추는 배율은 아이콘 안쪽 그룹에 있다(없으면 1). 합친 배율이 그려진 크기다.
    const inner = icon.children.find((n) => n.tag === 'g')?.attrs.transform;
    return Number(/scale\(([^)]+)\)/.exec(icon.attrs.transform)[1]) * Number(/scale\(([^)]+)\)/.exec(inner ?? 'scale(1)')[1]);
  };
  const reference = await scaleOf('ref');
  for (const [i, [name, [, longest]]] of Object.entries(valid).entries()) {
    const scale = await scaleOf(`ok${i}`);
    assert.ok(scale > 0 && Math.abs(scale * longest - reference * 24) < reference * 24 * 0.01, `${name}: scale ${scale} for longest side ${longest} vs reference ${reference}`);
  }
});

test('I2 icon references that are missing, from an unknown set, or that reach outside the folder are located errors', async (t) => {
  const dir = workspace(t, { 'icons/mine.svg': ICON('<path d="M0 0h1"/>'), 'secret.svg': ICON('<path d="M0 0h1"/>') });
  for (const ref of ['custom:absent', 'custom:../secret', 'custom:/etc/passwd', 'nope:mine', 'nope', 'custom:']) {
    const source = thinkflow(`icons custom "icons"\nbox a "A" icon=${ref}\n`);
    const problems = await reject(source, { baseDir: dir });
    assert.ok(problems.some((p) => p.line === lineOf(source, 'icon=')), `${ref}: ${JSON.stringify(problems)}`);
  }
  await build(usingIcon('mine'), { baseDir: dir });
});

test('I2 built-in icons: concept names and technology brands draw shapes; an unknown name is an error', async () => {
  const plain = await toSvg(await build(thinkflow('box a "A"\n')), { isStatic: true });
  for (const name of ['server', 'server-detail', 'db', 'user', 'git', 'postgresql']) {
    const svg = await toSvg(await build(thinkflow(`box a "A" icon=${name}\n`)), { isStatic: true });
    assert.notEqual(svg, plain, `${name} changes the picture`);
    parseMarkup(svg);
  }
  for (const name of ['not-an-icon', 'serve']) {
    const unknown = thinkflow(`box a "A" icon=${name}\n`);
    const problem = (await reject(unknown)).find(p => p.line === lineOf(unknown, 'icon='));
    assert.ok(problem);
    assert.match(problem.message, /assets\/icons\/catalog\.json/);
    assert.doesNotMatch(problem.message, /Declared:/, 'an icon typo does not print the entire shared library');
    if (name === 'serve') assert.match(problem.message, /Did you mean "server"/);
  }
});

test('I3 text with markup characters in a successful build shows as written in the SVG text', async () => {
  const dom = parseMarkup(await toSvg(await build(thinkflow('box a "x < y & z > w"\n')), { isStatic: true }));
  assert.ok(textsOf(dom).some((t) => t === 'x < y & z > w'));
});
