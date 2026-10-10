// 공통 부품 계약: 카드(측정 measure/card.js, texts.js, 그리기 draw/card.js, texts.js, surface.js), 선과 화살촉(draw/connector.js, arrow.js), 아이콘(icons/), HTML 그림 틀(도구 막대, 탭 줄).
// 같은 요소는 부품 하나가 소유하므로 부품마다 한 곳에 한 번만 본다. 종류별 시험이 같은 모양을 다시 보지 않고, 여기서는 부품 사이의 약속(잰 기하와 그린 모양이 같다, 글자가 이스케이프된다, 같은 도형이 같은 모양이다)만 본다.
// 시험 이름 첫 낱말(U1~U11)이 요구사항 번호이고, 번호와 계약의 대응은 docs/design/expression-coverage.md의 시험 번호 표에 있다. 브라우저에서만 보이는 것(탭을 만들고 숨기는 일, 클릭)은 같은 문서의 브라우저에서만 보이는 계약 표에 있다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

import { figureFrame } from '../src/html/player-script.js';
import { getIconCatalog, readIcon } from '../src/vendor/theme/ui/build/icons.mjs';
import { ToolIcon } from '../src/vendor/theme/ui/toolbar.mjs';
import { iconBody } from '../src/vendor/theme/ui/svg.mjs';
import { drawTexts } from '../src/draw/texts.js';
import { edgeMarker } from '../src/draw/arrow.js';
import { TEXT } from '../src/chart/metrics.js';
import { BADGE_STYLE } from '../src/measure/decor.js';
import { measure, createGlyphSet } from '../src/measure/fonts.js';
import { PAD } from '../src/measure/card.js';
import { STYLE, allTexts, textAt, textSpan } from '../src/measure/texts.js';
import { STYLES } from '../src/styles.js';
import { centerBaseline } from '../src/text.js';
import { values } from '../src/vendor/theme/tokens.js';
import { build, dap, descendants, findAll, findOne, num, parseMarkup, textContent, toHtml, toSvg } from './support.js';

const TICK = '`';
const EPS = 0.06; // SVG 좌표는 소수 첫째 자리로 줄여 쓴다

/** 멈춘 SVG의 DOM과 모형. */
async function rendered(source) {
  const result = await build(source);
  return { result, dom: parseMarkup(await toSvg(result, { isStatic: true })) };
}

/** 도형 하나의 묶음 `<g id="n-번호">`. */
const nodeGroup = (dom, index) => findOne(dom, (n) => n.tag === 'g' && n.attrs.id === `n-${index}`, `node group n-${index}`);
const classes = (node) => (node.attrs.class ?? '').split(/\s+/);
const hasClass = (node, name) => classes(node).includes(name);

// 구조가 같은지 비교하려고 요소를 태그, 속성, 자식으로 푼 값.
const shape = (node) => (node.text !== undefined ? node.text : { tag: node.tag, attrs: node.attrs, children: node.children.map(shape) });

// ---- 카드 ----

const CARDS = dap(`
  person u "Order" icon=server
  box a "Order" "Accepted" icon=server
  box r "Replica" count=3
  table t "Order" {
    id bigint pk
    memo text
  }
  api ap "GET /order" {
    body "Order"
  }
  interface port "Port" {
    method save "(): void"
  }
  class k "Order" abstract {
    field id "UUID"
    method confirm "(): void" abstract
  }
  u -> a
`);

test('U1 a card is drawn exactly where it was measured: its surfaces fill the measured box and every measured text is drawn at its measured place', async () => {
  const { result, dom } = await rendered(CARDS);
  const { items } = result.scene;
  assert.equal(items.length, 7);
  items.forEach((item, index) => {
    const group = nodeGroup(dom, index);
    const surfaces = descendants(group).filter((n) => n.tag === 'rect' && hasClass(n, 'fl-stroke'));
    assert.ok(surfaces.length >= 1, `${item.id}: a surface`);
    const edge = (side) => surfaces.map((rect) => (side === 'x' ? num(rect, 'x') + num(rect, 'width') : num(rect, 'y') + num(rect, 'height')));
    // 복제 개수가 있는 상자는 뒤 윤곽 겹이 오른쪽 아래로 비치므로 윤곽들이 모여 측정한 상자를 정확히 채운다.
    assert.ok(Math.abs(Math.min(...surfaces.map((rect) => num(rect, 'x'))) - item.x) < EPS && Math.abs(Math.min(...surfaces.map((rect) => num(rect, 'y'))) - item.y) < EPS, `${item.id}: top-left`);
    assert.ok(Math.abs(Math.max(...edge('x')) - (item.x + item.w)) < EPS && Math.abs(Math.max(...edge('y')) - (item.y + item.h)) < EPS, `${item.id}: ${item.w}x${item.h} box`);
    const measured = allTexts(item);
    const drawn = descendants(group).filter((n) => n.tag === 'text' && !hasClass(n, 'badge'));
    assert.equal(drawn.length, measured.length, `${item.id}: as many drawn texts as measured texts`);
    for (const t of measured) {
      const matches = drawn.filter((n) => n.attrs.class === t.role && Math.abs(num(n, 'x') - (item.x + t.x)) < EPS && Math.abs(num(n, 'y') - centerBaseline(item.y + t.center, t.style.size)) < EPS);
      assert.equal(matches.length, 1, `${item.id}: "${t.text}" is drawn once at its place`);
      assert.equal(textContent(matches[0]), t.text + (t.key?.text ?? ''));
      const span = textSpan(item, t);
      assert.ok(span.x >= item.x - EPS && span.x + span.width <= item.x + item.w + EPS, `${item.id}: "${t.text}" lies inside the card`);
    }
  });
});

test('U2 every kind of card has the same header: the title is centered, with an icon the icon and title block is centered and the icon is level with the title', async () => {
  const { result } = await rendered(CARDS);
  const byId = Object.fromEntries(result.scene.items.map((item) => [item.id, item]));
  const title = (item) => item.texts.find((t) => t.role === 'label');
  // 아이콘이 없는 카드(클래스, 인터페이스)는 제목이 카드 가운데다.
  for (const id of ['port', 'k']) {
    assert.equal(byId[id].decor, undefined, `${id}: no icon`);
    assert.ok(Math.abs(title(byId[id]).x - byId[id].w / 2) < EPS && title(byId[id]).anchor === 'middle', `${id}: title centered`);
  }
  // 아이콘이 있는 카드(사람, 상자, 표, API)는 아이콘과 제목 묶음이 가운데이고 제목은 아이콘 칸 절반만큼 오른쪽이며 아이콘 가운데가 제목 가운데다. 이름과 종류가 달라도 같다.
  const offsets = ['u', 'a', 't', 'ap'].map((id) => {
    const item = byId[id];
    const icon = item.decor.items.find((entry) => entry.kind === 'icon');
    assert.ok(Math.abs(item.decor.x * 2 + item.decor.w - item.w) < EPS, `${id}: header block centered`);
    assert.ok(Math.abs(item.decor.y + icon.y + icon.h / 2 - title(item).center) < EPS, `${id}: icon level with title`);
    return title(item).x - item.w / 2;
  });
  assert.ok(offsets[0] > 0 && offsets.every((offset) => Math.abs(offset - offsets[0]) < EPS), `title offsets ${offsets}`);
});

test('U3 a card with sections keeps header and fields apart: header texts are centered above the first divider, field texts sit left or right below it, and the drawn dividers are the measured ones', async () => {
  const { result, dom } = await rendered(CARDS);
  const sectioned = ['t', 'ap', 'port', 'k'];
  for (const id of sectioned) {
    const index = result.scene.items.findIndex((item) => item.id === id);
    const item = result.scene.items[index];
    const first = item.dividers[0];
    const [headerTexts, fieldTexts] = [allTexts(item).filter((t) => t.role === 'label' || t.role === 'meta'), allTexts(item).filter((t) => t.role !== 'label' && t.role !== 'meta')];
    assert.ok(headerTexts.length && fieldTexts.length, `${id}: header and fields`);
    for (const t of headerTexts) assert.ok(t.center < first && t.anchor === 'middle', `${id}: header text "${t.text}" above the divider, centered`);
    for (const t of fieldTexts) assert.ok(t.center > first && t.anchor !== 'middle', `${id}: field text "${t.text}" below the divider, aligned to a side`);
    const lines = descendants(nodeGroup(dom, index)).filter((n) => n.tag === 'line' && hasClass(n, 'col-line')).map((n) => num(n, 'y1'));
    assert.deepEqual(lines.map((y) => Math.round((y - item.y) * 10)), item.dividers.map((y) => Math.round(y * 10)), `${id}: dividers`);
  }
  // 인터페이스 표시는 제목 위, 추상 표시는 제목 아래의 머리 띠 안이다.
  const marks = (id) => {
    const item = result.scene.items.find((entry) => entry.id === id);
    return { item, title: item.texts.find((t) => t.role === 'label'), mark: item.texts.find((t) => t.role === 'meta') };
  };
  const port = marks('port');
  assert.equal(port.mark.text, '«interface»');
  assert.ok(port.mark.center < port.title.center && port.title.center < port.item.dividers[0]);
  const abstract = marks('k');
  assert.equal(abstract.mark.text, '{abstract}');
  assert.ok(abstract.title.center < abstract.mark.center && abstract.mark.center < abstract.item.dividers[0]);
});

// ---- 글 ----

test('U4 one text component writes every card text: XML characters are escaped, the key mark follows its name, and a rich label keeps backticks as code markup', () => {
  const glyphs = createGlyphSet();
  const origin = { x: 10, y: 20 };
  const style = { size: 13, face: 'regular', line: 20 };
  const texts = [
    textAt('cell', 'a < b & "c"', style, { x: 4, center: 8 }, { key: { text: 'PK', style: { size: 11, face: 'semibold' } } }),
    textAt('label', `Run ${TICK}npm test${TICK} now`, style, { x: 50, center: 30, anchor: 'middle' }),
    textAt('cell type', 'end', style, { x: 90, center: 8, anchor: 'end' }, { underline: true }),
  ];
  const dom = parseMarkup(`<svg xmlns="http://www.w3.org/2000/svg">${drawTexts(texts, origin, glyphs)}</svg>`);
  const [name, title, type] = findAll(dom, (n) => n.tag === 'text');
  assert.equal(textContent(name), 'a < b & "c"PK');
  assert.equal(findOne(name, (n) => n.tag === 'tspan', 'key mark').attrs.class, 'key');
  assert.equal(name.attrs['text-anchor'], undefined, 'start is the default anchor');
  assert.equal(num(name, 'x'), 14);
  assert.ok(Math.abs(num(name, 'y') - centerBaseline(28, 13)) < EPS);
  assert.equal(textContent(title), 'Run npm test now');
  assert.equal(findOne(title, (n) => n.tag === 'tspan', 'code span').attrs.class, 'code');
  assert.equal(textContent(findOne(title, (n) => n.tag === 'tspan')), 'npm test');
  assert.equal(title.attrs['text-anchor'], 'middle');
  assert.equal(type.attrs['text-anchor'], 'end');
  assert.equal(type.attrs['text-decoration'], 'underline');
  // 그린 글자는 글꼴 조각에 모인다: 이름은 보통 글꼴, 키 표시는 굵은 글꼴, 코드 구간은 고정폭이다.
  assert.ok(glyphs.used.get('regular').includes('<') && glyphs.used.get('semibold').includes('P') && glyphs.used.get('mono').includes('n'));
});

test('U6 a label is rich text in every slot that takes a label: backticks make code, and the card and the line label measure and draw it the same way', async () => {
  const { result, dom } = await rendered(dap(`
    box a "Run ${TICK}npm test${TICK}"
    box b "B"
    a -> b "call ${TICK}run()${TICK}"
  `));
  const code = (node) => descendants(node).filter((n) => hasClass(n, 'code')).map(textContent);
  const box = descendants(nodeGroup(dom, 0)).find((n) => n.tag === 'text');
  assert.equal(textContent(box), 'Run npm test');
  assert.deepEqual(code(box), ['npm test']);
  const line = findOne(dom, (n) => n.tag === 'text' && hasClass(n, 'edgelabel'), 'line label');
  assert.equal(textContent(line), 'call run()');
  assert.deepEqual(code(line), ['run()']);
  // 잰 글 폭은 백틱을 뺀 표시 글자의 폭이다(고정폭 구간 포함).
  const [item] = result.scene.items;
  const label = item.texts.find((t) => t.role === 'label');
  assert.equal(label.text, `Run ${TICK}npm test${TICK}`);
  assert.equal(textSpan(item, label).width, measure('Run ', label.style.size, label.style.face) + measure('npm test', label.style.size, 'mono'));
  assert.ok(PAD.x * 2 + textSpan(item, label).width <= item.w + EPS);
});

// ---- 글 역할 ----

// 측정(STYLE)과 그리기(CSS)는 글 역할의 크기와 굵기를 같은 토큰으로 읽는다. 다르면 잰 폭과 그린 폭이 어긋난다. 크기와 굵기만 보고 색과 자리는 보지 않는다.
test('U11 a measured text role is the drawn role: the CSS of every role has the size and weight of its STYLE, and chart names are measured and drawn at the same weight', () => {
  const rulesOf = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selectors, body]) => ({ selectors: selectors.split(',').map((s) => s.trim()), body }));
  const declared = (css, selector, property) => rulesOf(css).filter((rule) => rule.selectors.includes(selector)).flatMap(({ body }) => [...body.matchAll(new RegExp(`(?:^|;|\\s)${property}:\\s*([^;]+);`, 'g'))].map(([, value]) => value.trim()));
  const sizeOf = (css, selector) => values.text[/--text-([\w-]+)\)/.exec(declared(css, selector, 'font-size').at(-1))[1]];
  const weightOf = (css, selector) => {
    const weight = declared(css, selector, 'font-weight').at(-1);
    return weight === undefined ? 400 : values["font-weight"][/--font-weight-(\w+)\)/.exec(weight)[1]];
  };
  const WEIGHTS = { regular: 400, semibold: 600, semiboldLiteral: 600 };
  const roles = [['.fl .label', STYLE.label], ['.fl .sub', STYLE.sub], ['.fl .frame', STYLE.group], ['.fl .row', STYLE.row], ['.fl .meta', STYLE.meta], ['.fl .cell', STYLE.cell], ['.fl .item', STYLE.item], ['.fl .mini', STYLE.mini], ['.fl .chip', STYLE.chip], ['.fl .edgelabel', STYLE.pill], ['.fl .tag', STYLE.tag], ['.fl .mark', STYLE.mark], ['.fl .cell .key', STYLE.key], ['.fl .value', STYLE.value], ['.fl .badge', BADGE_STYLE]];
  for (const [selector, style] of roles) assert.deepEqual([sizeOf(STYLES.figure, selector), weightOf(STYLES.figure, selector)], [style.size, WEIGHTS[style.face]], selector);
  // 글자 사이 간격은 잰 폭이 아는 것(tracking.text, 문서 전체)뿐이다. 그룹 제목에 따로 간격을 주지 않는다.
  assert.deepEqual(declared(STYLES.figure, '.fl .frame', 'letter-spacing'), []);
  // 차트의 행 이름과 끝 이름은 보통 굵기로 재고(chart/labels.js, end-labels.js) 보통 굵기로 그린다. 굵은 면은 합계 행과 강조 값에만 있다.
  assert.deepEqual([sizeOf(STYLES.chart, '.fl .chart-label'), weightOf(STYLES.chart, '.fl .chart-label')], [TEXT['13'], 400]);
  assert.deepEqual([sizeOf(STYLES.chart, '.fl .chart-end-label'), weightOf(STYLES.chart, '.fl .chart-end-label')], [TEXT['11'], 400]);
  assert.deepEqual([sizeOf(STYLES.status, '.fl .status-text'), weightOf(STYLES.status, '.fl .status-text')], [BADGE_STYLE.size, 600]);
});

// ---- 선과 화살촉 ----

const ENDS = (edge, index = 0) => {
  const marker = edgeMarker(edge, index);
  const defs = marker.defs ? findAll(parseMarkup(`<svg xmlns="http://www.w3.org/2000/svg">${marker.defs}</svg>`), (n) => n.tag === 'marker') : [];
  return { defs, start: /marker-start="url\(#([^)]+)\)"/.exec(marker.attributes)?.[1], end: /marker-end="url\(#([^)]+)\)"/.exec(marker.attributes)?.[1] };
};

test('U7 an ordinary line has an arrow head at its end or ends, a semantic relation has its own head, and every head a line points at is defined once', () => {
  // 보통 화살표: 끝, 양쪽, 없음
  const ordinary = ENDS({ head: 'end' });
  assert.deepEqual([ordinary.defs.length, ordinary.start, ordinary.end], [1, undefined, ordinary.defs[0].attrs.id]);
  const both = ENDS({ head: 'both' });
  assert.deepEqual([both.start, both.end], [both.defs[0].attrs.id, both.defs[0].attrs.id]);
  assert.deepEqual(ENDS({ head: 'none' }), { defs: [], start: undefined, end: undefined });
  // 의미 관계: 상속과 실현은 빈 삼각형이 끝에, 집합과 합성은 마름모가 시작에, 의존은 보통 화살촉이다. 연관은 머리가 없다.
  const head = (relation) => ENDS({ head: 'end', relation });
  for (const relation of ['inheritance', 'realization']) assert.deepEqual([head(relation).start, head(relation).end === head(relation).defs[0].attrs.id], [undefined, true], relation);
  for (const relation of ['aggregation', 'composition']) assert.deepEqual([head(relation).start === head(relation).defs[0].attrs.id, head(relation).end], [true, undefined], relation);
  assert.deepEqual(head('association'), { defs: [], start: undefined, end: undefined });
  const dependency = head('dependency');
  const strip = (marker) => shape({ ...marker, attrs: { ...marker.attrs, id: '' } });
  assert.deepEqual(strip(dependency.defs[0]), strip(ordinary.defs[0]), 'a dependency head is the ordinary arrow head');
  // 모양마다 다른 머리: 같은 선 번호에서도 id가 겹치지 않는다.
  const ids = ['inheritance', 'aggregation', 'composition', 'dependency'].map((relation) => head(relation).defs[0].attrs.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('U7 in a drawn figure each head a line points at exists once, and ordinary lines of a graph and a class diagram share one head', async () => {
  const flow = (await rendered(dap('box a "A"\nbox b "B"\nbox c "C"\nbox d "D"\na -> b\na -> c head=none\na -> d head=both\n'))).dom;
  const members = (id) => `class ${id} "${id.toUpperCase()}" {\n  field n "int"\n}`;
  const uml = (await rendered(dap(`
    ${['a', 'b', 'c', 'd', 'e', 'f'].map(members).join('\n')}
    interface i "I" {
      method m "(): void"
    }
    a -> b relation=inheritance
    a -> c relation=composition
    a -> d relation=aggregation
    a -> e relation=dependency
    a -> i relation=realization
    a -> f relation=association
  `))).dom;
  for (const dom of [flow, uml]) {
    const markers = findAll(dom, (n) => n.tag === 'marker');
    const ids = markers.map((n) => n.attrs.id);
    assert.equal(new Set(ids).size, ids.length, 'marker ids are unique');
    for (const path of findAll(dom, (n) => n.tag === 'path' && hasClass(n, 'fl-path'))) {
      for (const name of ['marker-start', 'marker-end']) {
        if (path.attrs[name] === undefined) continue;
        assert.ok(ids.includes(/url\(#([^)]+)\)/.exec(path.attrs[name])[1]), `${path.attrs.id} ${name} resolves`);
      }
    }
  }
  const heads = (dom) => findAll(dom, (n) => n.tag === 'path' && hasClass(n, 'fl-path')).map((path) => [Boolean(path.attrs['marker-start']), Boolean(path.attrs['marker-end'])]);
  assert.deepEqual(heads(flow), [[false, true], [false, false], [true, true]]);
  assert.equal(heads(uml).length, 6);
  const arrows = (dom) => findAll(dom, (n) => n.tag === 'marker' && n.children.some((c) => c.tag === 'path' && hasClass(c, 'fl-arrowhead'))).map((n) => shape({ ...n, attrs: { ...n.attrs, id: '' } }));
  assert.deepEqual(arrows(uml), [arrows(flow)[0]], 'the dependency head is the head of an ordinary line');
});

// ---- 아이콘 ----

test('U8 a concept icon is one symbol: the card header, the tile and the group title draw the same shapes in the same role, a brand keeps its own glyph', async () => {
  for (const name of ['server', 'flag-add']) {
    const result = await build(dap(`
      group g "G" icon=${name} {
        box a "A" icon=${name}
        box t "T" shape=tile icon=${name}
      }
      box b "B" icon=git
      a -> b
      scene "Move" mode=loop
        a -> b
    `));
    const svg = await toSvg(result, { isStatic: true });
    const dom = parseMarkup(svg);
    const symbols = findAll(dom, (n) => n.tag === 'g' && hasClass(n, 'fl-symbol'));
    assert.equal(symbols.length, 4);
    const [concept, brand] = [symbols.filter((n) => hasClass(n, 'fl-symbol-concept')), symbols.filter((n) => hasClass(n, 'fl-symbol-brand'))];
    assert.equal(concept.length, 3, 'group title, card header and tile');
    assert.equal(brand.length, 1);
    for (const [index, symbol] of concept.entries()) {
      const prefix = index === 0 ? 'icon-g-0' : `icon-n-${index - 1}`;
      const registered = parseMarkup(`<svg xmlns="http://www.w3.org/2000/svg">${iconBody(readIcon(name), { size: values.icon['size-small'], prefix })}</svg>`);
      assert.deepEqual(shape({ tag: 'g', attrs: {}, children: symbol.children[0].children }), shape({ tag: 'g', attrs: {}, children: registered.children }), 'the registered shapes');
    }
    const animated = await toSvg(result);
    const html = await toHtml(result, 'icons');
    for (const output of [svg, animated, html]) {
      const parsed = parseMarkup(output, { html: output === html });
      // HTML의 좁은 배치는 비활성 template이며 넓은 배치와 교체되어 둘 중 하나만 문서에 붙는다.
      const layouts = output === html ? findAll(parsed, node => hasClass(node, 'dp-panels')) : [parsed];
      for (const layout of layouts) {
        const masks = findAll(layout, (node) => node.tag === 'mask').map(node => node.attrs.id);
        assert.equal(new Set(masks).size, masks.length, 'repeated icons and motion layers have unique masks');
        if (name === 'flag-add') assert.ok(masks.length >= 3, 'the built-in mask survives rendering');
        for (const symbol of findAll(layout, (node) => hasClass(node, 'fl-symbol'))) {
          const local = findAll(symbol, (node) => node.tag === 'mask').map(node => node.attrs.id);
          for (const node of descendants(symbol)) if (node.attrs.mask) assert.ok(local.includes(/^url\(#(.+)\)$/.exec(node.attrs.mask)?.[1]), 'an icon only uses its own mask');
        }
      }
    }
    assert.equal(await toSvg(result), animated, 'shared icon IDs do not depend on earlier renders');
    assert.equal(await toHtml(result, 'icons'), html, 'HTML is deterministic');
  }
});

// ---- HTML 그림 틀 ----

// 차트의 글자 뒤 바탕 면과 받침 선은 차트가 놓인 면의 색이다. 차트 보기는 그림 바탕, 차트 카드는 카드 면이다. 여기서는 그려진 형상(어느 묶음 안에 놓였는가)만 보고, 면을 정하는 CSS는 component-state.test.js가 본다.
test('U10 a chart is drawn on the surface it sits on: in a plot view and inside each chart card, with a hollow reference marker that reads the carried ground', async () => {
  const source = dap(`
    box a "A"
    chart c "C" bar {
      x "x(u)"
      series v "v"
      row "r" v=1
    }
    chart l "L" line {
      x "t(h)"
      y "v(ms)"
      series u "u" role=main
      series goal "goal" role=reference
      point x=1 u=1 goal=2
      point x=2 u=2 goal=2
    }
    view graph "Cards" {
      a
      c
      l
    }
    view plot "Numbers" {
      c
    }
    view plot "Goals" {
      l
    }
  `);
  const svg = await toSvg(await build(source), { isStatic: true });
  const dom = parseMarkup(svg);
  assert.ok(findAll(dom, (n) => hasClass(n, 'fl-plot')).length > 0, 'a chart in a plot view');
  const cards = findAll(dom, (n) => hasClass(n, 'fl-shape-chart'));
  assert.equal(cards.length, 2, 'two chart cards');
  for (const card of cards) assert.ok(findAll(card, (n) => hasClass(n, 'fl-chart')).length > 0, 'the chart is drawn inside its card, so it inherits the card face');
  // 바탕 면을 정하는 CSS 상태(--chart-ground, 운반하는 color, currentColor를 읽는 지움 면과 받침 선)는 component-state.test.js S3 한 곳에서 본다.
  // 기대값 계열의 속 빈 점도 같은 운반을 읽고, 표현 속성에는 var()가 남지 않는다. 범례는 차트 본문 안이다.
  const hollow = findAll(dom, (n) => hasClass(n, 'fl-chart')).flatMap((chart) => findAll(chart, (n) => n.attrs.fill === 'currentColor' && n.attrs.stroke));
  assert.ok(hollow.length > 0, 'the reference series marker is hollow with the carried ground inside the chart group');
  assert.ok(findAll(dom, (n) => Object.values(n.attrs).some((v) => String(v).includes('--chart-ground'))).length === 0, 'no presentation attribute names the alias');
  // 바탕 면 값은 그림 바탕(배경 사각형과 설명 판)과 같은 토큰이다.
  assert.ok(findAll(dom, (n) => n.tag === 'rect' && n.attrs.fill === 'var(--color-prose-pre-background)').length > 0);
});

test('U9 every page has one frame, one toolbar and one tab row: the toolbar sits in the drawing, the tab row below it, and neither depends on the figure', async () => {
  const frame = parseMarkup(figureFrame({ canvas: '<p>x</p>', source: 'daphnis 2\n' }), { html: true });
  const figure = findOne(frame, (n) => n.tag === 'figure' && hasClass(n, 'fl-figure'), 'figure');
  const [surface, foot] = figure.children.filter((n) => n.tag === 'div');
  assert.ok(hasClass(surface, 'fl-surface') && hasClass(foot, 'fl-foot'));
  const tools = findOne(surface, (n) => hasClass(n, 'app-toolbar'), 'toolbar');
  assert.equal(tools.attrs.role, 'toolbar');
  assert.deepEqual(tools.children.filter((n) => n.tag === 'button').map((n) => n.attrs['aria-label']), ['문법 복사', 'HTML 다운로드', '전체화면']);
  assert.deepEqual(tools.children.filter((n) => n.tag === 'button').map((n) => classes(n).find((name) => name !== 'app-tool-button')), ['fl-copy', 'fl-download', 'fl-full']);
  assert.equal(descendants(surface).indexOf(tools) < descendants(surface).findIndex((n) => hasClass(n, 'fl-canvas')), true, 'toolbar before the canvas');
  const tabs = findOne(foot, (n) => hasClass(n, 'app-tablist'), 'tab row');
  assert.equal(tabs.attrs.role, 'tablist');
  assert.deepEqual(tabs.children, [], 'a frame without labels has no tabs');
  assert.deepEqual(findAll(surface, (n) => n.attrs.role === 'tab' || hasClass(n, 'app-tablist')), [], 'the tab row is outside the drawing');
  // 원본이 없으면 복사할 글이 없다.
  assert.deepEqual(findAll(parseMarkup(figureFrame({ canvas: '' }), { html: true }), (n) => hasClass(n, 'fl-source')), []);

  // 그림이 달라도 도구 막대와 탭 줄 마크업은 한 벌이다. 탭 숨김 판정은 브라우저의 재생기가 하고, 이 쪽은 판정이 읽는 장면 수만 싣는다.
  const pages = {};
  for (const [name, source] of Object.entries({
    still: 'box a "A"\n',
    one: 'box a "A"\nbox b "B"\na -> b\nscene "only" mode=static\n  a -> b "go"\n',
    three: 'box a "A"\nbox b "B"\na -> b\nscene "x" mode=static\n  a -> b "1"\nscene "y" mode=static\n  a -> b "2"\nscene "z" mode=static\n  a -> b "3"\n',
    chart: 'chart c "C" bar {\n  x "x(u)"\n  series v "v"\n  row "r" v=1\n}\n',
  })) {
    const html = await toHtml(await build(dap(source)), 'doc');
    const dom = parseMarkup(html, { html: true });
    const script = textContent(descendants(dom).filter((n) => n.tag === 'script').at(-1));
    pages[name] = {
      chrome: shape(findOne(dom, (n) => hasClass(n, 'app-toolbar'), 'toolbar')),
      tabs: findAll(dom, (n) => n.attrs.role === 'tab'),
      data: JSON.parse(/figurePlay\(document\.querySelector\('\.fl-figure'\), (.*)\);\s*$/s.exec(script)[1]),
    };
  }
  for (const page of Object.values(pages)) assert.deepEqual(page.chrome, pages.still.chrome);
  for (const page of Object.values(pages)) {
    assert.equal(page.tabs.length, page.data.steps.length);
    for (const tab of page.tabs) assert.equal(tab.attrs['aria-controls'], 'scene-panel');
  }
  assert.deepEqual([pages.still.data.segs.length, pages.one.data.steps.length, pages.three.data.steps.length], [0, 1, 3]);
  // 단일 HTML도 공통 조작 아이콘을 외부 모듈 없이 그린다.
  const html = await toHtml(await build(dap('box a "A"\n')), 'doc');
  const script = textContent(findAll(parseMarkup(html, { html: true }), node => node.tag === 'script').at(-1));
  const names = Object.keys(getIconCatalog().controls);
  const drawn = runInNewContext(`${script}\nfunction figurePlay() {}\n${JSON.stringify(names)}.map(ToolIcon);`, { document: { querySelector: () => null }, matchMedia: () => ({ matches: false }) });
  assert.deepEqual(Array.from(drawn), names.map(ToolIcon));
  for (const [, name] of html.matchAll(/getPropertyValue\(['"](--[\w-]+)['"]\)/g)) {
    assert.ok(html.includes(`${name}:`), `runtime token ${name} survives CSS pruning`);
  }
});
