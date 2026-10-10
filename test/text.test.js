// 글 읽기와 글 자리 계약: 한 글을 읽는 방식은 글꼴 하나가 정하고(백틱이 글자인지 코드인지), 측정이 놓은 글 자리를 그리는 쪽과 검사가 그대로 읽는다.
// 부품 모양(색, 두께)은 components.test.js 한 곳에서 보고, 여기서는 글이 어떻게 읽히고 어디에 놓이는지만 본다. 모두 공개 진입점(buildFigure, toSvg)과 코드가 실제로 쓰는 부품 함수로 본다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PAD, WIDTH } from '../src/chart/metrics.js';
import { checkFits } from '../src/check/fit.js';
import { CONTENT } from '../src/measure/content.js';
import { measure, wrap } from '../src/measure/fonts.js';
import { STYLE, textSpan } from '../src/measure/texts.js';
import { centerBaseline } from '../src/text.js';
import { build, thinkflow, findAll, findOne, num, parseMarkup, reject, textContent, toSvg } from './support.js';

const TICK = '`';
const EPS = 0.06; // SVG 좌표는 소수 첫째 자리로 줄여 쓴다

const rendered = async (source) => {
  const result = await build(source);
  return { result, dom: parseMarkup(await toSvg(result, { isStatic: true })) };
};
const textsWith = (dom, role) => findAll(dom, (n) => n.tag === 'text' && n.attrs.class === role);
const cardLines = (text) => text.map((n) => textContent(n));

// ---- 읽는 방식 ----

test('T1 backticks are code in prose and characters in literal text: an odd count is accepted in a class member, an API or table type and a value, and still a located error in prose', async () => {
  const source = thinkflow(`
    class a "A" {
      field id "${TICK}odd"
      method run "(): ${TICK}x"
    }
    api p "POST /x" {
      body "${TICK}"
    }
    box b "B"
    value v "v" on=b from=a${TICK}b
  `);
  const { dom } = await rendered(source);
  assert.deepEqual(cardLines(textsWith(dom, 'row mono')), [`id: ${TICK}odd`, `run(): ${TICK}x`]);
  assert.deepEqual(cardLines(textsWith(dom, 'cell type')), [TICK]);
  assert.deepEqual(cardLines(textsWith(dom, 'value')), [`a${TICK}b`]);
  assert.equal(findAll(dom, (n) => n.tag === 'tspan' && n.attrs.class === 'code').length, 0, 'no code spans');
  const problems = await reject(thinkflow(`box a "A ${TICK}unclosed"`));
  assert.equal(problems.length, 1);
  assert.equal(problems[0].line, 2, 'the prose backtick error is located');
  assert.match(problems[0].message, /not paired/);
});

test('T12 a literal type keeps its backticks and escaped characters on a class, an API and a table, and the card is as wide as the glyphs that are drawn', async () => {
  // 고정폭 글꼴이라 같은 글자 수의 평범한 글과 같은 폭이어야 한다. 백틱이 글이 아니라 서식으로 읽히면 글자가 둘 사라지고 카드가 좁아진다. 기대 폭은 같은 글자 수의 평범한 글로 지은 카드에서 따로 얻는다.
  const card = (literal) => thinkflow(`
    class k "K" {
      field f "${literal.replaceAll('"', '\\"')}"
    }
    table t "T" {
      memo "${literal.replaceAll('"', '\\"')}"
    }
    api ap "GET /x" {
      body "${literal.replaceAll('"', '\\"')}"
    }
  `);
  const literal = `a${TICK}b${TICK}c<d>&"e`;
  const plain = literal.replaceAll(TICK, 'x');
  const [withTicks, withLetters] = [await rendered(card(literal)), await rendered(card(plain))];
  const classesOf = (node) => (node.attrs.class ?? '').split(/\s+/);
  for (const [index, id] of ['k', 't', 'ap'].entries()) {
    const [ticked, lettered] = [withTicks.result.scene.items[index], withLetters.result.scene.items[index]];
    assert.equal(ticked.w, lettered.w, `${id}: the card is as wide as the same number of plain glyphs`);
    const group = findOne(withTicks.dom, (n) => n.tag === 'g' && n.attrs.id === `n-${index}`, `node group n-${index}`);
    const drawn = findAll(group, (n) => n.tag === 'text' && (classesOf(n).includes('type') || classesOf(n).includes('mono')));
    const shown = drawn.map(textContent).filter((text) => text.includes('a') && text.includes('<'));
    assert.deepEqual(shown, [id === 'k' ? `f: ${literal}` : literal], `${id}: drawn as written, with its backticks`);
    assert.deepEqual(drawn.flatMap((n) => findAll(n, (child) => classesOf(child).includes('code'))), [], `${id}: no code markup in a literal`);
  }
});

test('T2 a value is read as written by the measuring and the drawing: the face that reads it as characters has the width of the glyphs it draws', () => {
  const width = (text, face) => measure(text, STYLE.value.size, face);
  const written = `a${TICK}b${TICK}c`;
  assert.equal(STYLE.value.face, 'semiboldLiteral');
  // 글자 그대로 읽는 면은 백틱도 글자 폭을 갖고, 같은 굵기의 서식 읽기와 글자 폭이 같다.
  assert.ok(Math.abs(width('abc', 'semibold') - width('abc', STYLE.value.face)) < 1e-9, 'same weight, same glyph widths');
  assert.ok(width(written, STYLE.value.face) > width('abc', STYLE.value.face), 'the backticks are glyphs');
  // 서식으로 읽는 같은 굵기는 백틱을 지우고 코드 구간을 고정폭으로 재므로 폭이 다르다. 값은 이 읽기를 쓰면 안 된다.
  assert.notEqual(width(written, 'semibold'), width(written, STYLE.value.face));
});

test('T3 a rich label has the text it shows as its accessible name, and a class member keeps its characters across wrapped lines', async () => {
  const members = Array.from({ length: 3 }, (_, i) => `method m${i} "(first: Alpha, second: Beta, third: Gamma, fourth: Delta): Result${i}"`).join('\n  ');
  const { dom } = await rendered(thinkflow(`
    box a "A ${TICK}code${TICK} B"
    class k "Order" {
      ${members}
    }
  `));
  const groups = findAll(dom, (n) => n.tag === 'g' && n.attrs.class?.startsWith('fl-node'));
  assert.equal(groups[0].attrs['aria-label'], 'A code B');
  const described = groups[1].attrs['aria-label'].split('; ');
  assert.equal(described.length, 4, 'the label and one entry per member, however many lines each member wraps to');
  assert.ok(described[1].startsWith('m0(first: Alpha') && described[1].endsWith('Result0'), described[1]);
  const lines = textsWith(dom, 'row mono');
  assert.ok(lines.length > 3, 'the members wrap');
});

// ---- 글 자리 ----

test('T4 a card line is drawn where the measure put it: tag, shown text, mark, muted extra and a value share one measured line', async () => {
  const { result, dom } = await rendered(thinkflow(`
    box a "Order"
    value total "total" on=a from=0
    scene "s" mode=static
      show a "paid ${TICK}USD${TICK}" tag="ok" mark="1" meta="done"
      show a "a long explanation that has to wrap onto a second line inside the card" mono
  `));
  const item = result.scene.items.find((it) => it.id === 'a');
  const [layout] = item.content.layouts.slice(-1);
  assert.ok(layout.rows.length >= 3, 'value row and two shown lines');
  const box = { x: item.x + CONTENT.margin, y: item.y + item.h - CONTENT.margin - item.content.h };
  const drawn = findAll(dom, (n) => n.tag === 'text' && /^(tag|mark|row|row mono|value)$/.test(n.attrs.class ?? ''));
  for (const laid of layout.rows) {
    const records = [...laid.texts, ...(laid.valueSlot ? [...laid.valueSlot.texts.values()] : [])];
    for (const t of records) {
      const hits = drawn.filter((n) => n.attrs.class === t.role && Math.abs(num(n, 'x') - (box.x + t.x)) < EPS && Math.abs(num(n, 'y') - centerBaseline(box.y + t.center, t.style.size)) < EPS);
      assert.ok(hits.length >= 1, `"${t.text}" is drawn at its measured place`);
      const expected = t.style.face === 'regular' || t.style.face === 'semibold' ? t.text.replaceAll(TICK, '') : t.text;
      assert.ok(hits.some((n) => textContent(n) === expected), `"${t.text}" is the drawn text`);
    }
  }
  const muted = findAll(dom, (n) => n.tag === 'tspan' && n.attrs.class === 'muted');
  assert.ok(muted.some((n) => textContent(n).includes('done')), 'the extra after the text is muted');
  const first = layout.rows.find((laid) => laid.row.tag);
  const body = first.texts.find((t) => t.role === 'row');
  const tag = first.texts.find((t) => t.role === 'tag');
  assert.ok(textSpan({ x: 0, y: 0 }, tag).x + textSpan({ x: 0, y: 0 }, tag).width <= body.x, 'the shown text starts after the tag');
});

test('T5 the fit check reads the measured texts: a text outside its card is an internal check-1 error and a text that fits is not', async () => {
  const { result } = await rendered(thinkflow(`
    table t "Order" {
      id bigint pk
      memo text
    }
    class k "Order" {
      field id "UUID"
    }
  `));
  const run = (scene) => {
    const errors = [];
    checkFits({ scene, timeline: { segs: [] } }, { error: (line, message) => errors.push(message) });
    return errors;
  };
  assert.deepEqual(run(result.scene), []);
  for (const id of ['t', 'k']) {
    const items = result.scene.items.map((it) => (it.id === id ? { ...it, texts: it.texts.map((t) => ({ ...t, x: t.x + it.w })) } : it));
    const errors = run({ ...result.scene, items });
    assert.ok(errors.length >= 1 && errors.every((message) => message.startsWith('[check 1] internal:')), `${id}: ${errors}`);
  }
  const crowded = result.scene.items.map((it) => (it.id === 't' ? { ...it, tableRows: it.tableRows.map((row) => ({ ...row, texts: row.texts.map((t) => (t.role === 'cell type' ? { ...t, x: t.x - 60 } : t)) })) } : it));
  assert.ok(run({ ...result.scene, items: crowded }).some((message) => /column/.test(message)), 'a column name and its type must not overlap');
});

// 구조를 보이는 내용(관계 그래프)은 카드 종류와 상관없이 같은 하한 폭으로 카드를 넓힌다: 이름은 줄이거나 자르지 않고 열 사이는 겹치지 않는다.
const GRAPH_CARDS = {
  plain: 'box a "A"',
  headed: 'box a "A" icon=server',
  table: 'table a "A" {\n id bigint pk\n}',
  api: 'api a "GET /a" {\n amount "int"\n}',
};
const GRAPH_CHAINS = {
  'equal columns': ['service0', 'service1', 'service2', 'service3'],
  'columns of different widths': ['db', 'a-service-with-a-very-long-name', 'cache', 'an-even-longer-service-name-than-the-one-before-it'],
};

test('T13 a relation graph row widens every card kind to fit its columns: no name is cut, columns do not overlap and the build fit check passes', async () => {
  // 엄격한 빌드는 그림 검사(글이 카드 밖에 나가면 internal 오류)를 거치므로 빌드가 끝나는 것이 검사 통과다.
  for (const [kind, card] of Object.entries(GRAPH_CARDS)) {
    for (const [chain, names] of Object.entries(GRAPH_CHAINS)) {
      const label = `${kind}, ${chain}`;
      const graph = names.slice(1).map((name, i) => `${names[i]} -> ${name}`).join('; ');
      const { result, dom } = await rendered(thinkflow(`${card}\nview graph down\nscene "s" mode=static\n  show a graph "${graph}"`));
      const item = result.scene.items.find((it) => it.id === 'a');
      const [{ graph: laid }] = item.content.layouts.at(-1).rows;
      assert.deepEqual(laid.nodes.map((n) => n.name), names, `${label}: every name is placed`);
      laid.nodes.forEach((n, i) => {
        assert.ok(n.w >= measure(n.name, STYLE.mini.size, STYLE.mini.face), `${label}: "${n.name}" is not cut`);
        assert.ok(laid.at.x + n.x >= 0 && laid.at.x + n.x + n.w <= item.content.w + EPS, `${label}: "${n.name}" is inside the content face`);
        if (i) assert.ok(n.x >= laid.nodes[i - 1].x + laid.nodes[i - 1].w, `${label}: "${n.name}" does not overlap the column before it`);
      });
      assert.deepEqual(textsWith(dom, 'mini').map((n) => textContent(n)), names, `${label}: every name is drawn`);
    }
  }
});

// ---- 머리 ----

const HEADS = {
  class: `class a "A very long class label that goes well beyond the card width limit of typical classes" {\n field id "UUID"\n}`,
  table: `table a "A very long table label that goes well beyond the card width limit of typical tables" {\n id bigint pk\n}`,
  korean: `class a "주문결제승인상태를관리하는아주아주긴이름을가진도메인서비스클래스입니다 그리고 공백이 있는 한국어 설명도 길게 이어집니다" {\n field id "UUID"\n}`,
  identifier: `table a "very_long_snake_case_identifier_for_the_orders_table_that_never_ends_ok" {\n id bigint pk\n}`,
  api: `api a "POST https://pay.example.com/v1/charges" {\n amount "amount: int"\n}`,
  abstract: `class a "AbstractRepositoryFactoryManagerImplementationBaseClassForEverything" abstract {\n method run "(): void" abstract\n}`,
  interface: `interface a "Repository interface with a very long descriptive name that wraps around" {\n method find "(id: UUID): T"\n}`,
};

test('T6 one header wraps a long title in every card kind: it fits the card, keeps every character and mark, and stays near the card width', async () => {
  const widths = {};
  for (const [name, body] of Object.entries(HEADS)) {
    const { result } = await rendered(thinkflow(`${body}\nview graph down\nscene "one"`));
    const item = result.scene.items[0];
    const lines = item.texts.filter((t) => t.role === 'label').map((t) => t.text);
    const label = body.match(/"([^"]+)"/)[1];
    assert.equal(lines.join('').replaceAll(' ', ''), label.replaceAll(' ', ''), `${name}: every character of the title is kept`);
    assert.ok(lines.length > 1, `${name}: a long title wraps`);
    assert.ok(item.w <= 210 + EPS, `${name}: ${item.w}px is not wider than a card`);
    for (const t of item.texts) assert.ok(textSpan(item, t).x >= item.x - EPS && textSpan(item, t).x + textSpan(item, t).width <= item.x + item.w + EPS, `${name}: "${t.text}" inside the card`);
    widths[name] = item.w;
    if (name === 'abstract') assert.ok(item.texts.some((t) => t.text === '{abstract}'));
    if (name === 'interface') assert.ok(item.texts.some((t) => t.text === '«interface»'));
  }
  assert.ok(Object.values(widths).every((w) => w < 215), JSON.stringify(widths));
});

test('T7 a wide body keeps a long title on one line, and a short title never wraps', async () => {
  const wide = await rendered(thinkflow(`api a "POST https://pay.example.com/v1/charges" {\n amount "amount: a_really_long_type_description_that_makes_the_body_wide_enough_here"\n}\nview graph down\nscene "one"`));
  const item = wide.result.scene.items[0];
  assert.equal(item.texts.filter((t) => t.role === 'label').length, 1, 'the body is wider than the title, so the title keeps one line');
  assert.ok(item.w > 300);
  const short = await rendered(thinkflow(`class a "Short" {\n field id "UUID"\n}\nview graph down\nscene "one"`));
  assert.equal(short.result.scene.items[0].texts.filter((t) => t.role === 'label').length, 1);
});

test('T8 sequence participants take the same wrapped header, including the stereotype and abstract marks', async () => {
  const { result } = await rendered(thinkflow(`
    table orders "A long participant table label that keeps going and going on" {
      id bigint pk
    }
    class rep "AbstractRepositoryFactoryManagerImplementationBaseClassForEverything" abstract {
      method run "(): void" abstract
    }
    api pay "POST https://pay.example.com/v1/charges" {
      amount "amount: int"
    }
    view sequence {
      orders rep pay
    }
    scene "s"
      orders -> rep "y"
      rep -> pay "w"
  `));
  for (const id of ['orders', 'rep', 'pay']) {
    const item = result.scene.items.find((it) => it.id === id);
    assert.ok(item.texts.filter((t) => t.role === 'label').length > 1, `${id}: wrapped`);
    assert.equal(item.tableRows, undefined, `${id}: header only`);
    assert.equal(item.description, undefined);
    for (const t of item.texts) assert.ok(textSpan(item, t).x >= item.x - EPS && textSpan(item, t).x + textSpan(item, t).width <= item.x + item.w + EPS);
  }
  assert.ok(result.scene.items.find((it) => it.id === 'rep').texts.some((t) => t.text === '{abstract}'));
});

test('T9 a word without spaces breaks after path and identifier separators before it breaks inside a segment', () => {
  const style = { size: 15, face: 'semibold' };
  assert.deepEqual(wrap('POST https://pay.example.com/v1/charges', 174, style), ['POST', 'https://pay.example.com/', 'v1/charges']);
  const lines = wrap('very_long_snake_case_identifier_for_the_orders_table', 120, style);
  assert.ok(lines.length > 1 && lines.every((line) => measure(line, style.size, style.face) <= 120 + 0.5));
  assert.ok(lines.slice(0, -1).every((line) => line.endsWith('_')), JSON.stringify(lines));
  assert.deepEqual(wrap('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 100, style).join(''), 'a'.repeat(52));
});

// ---- 제목 줄 ----

test('T10 a chart title and subtitle are the card title and subtitle: same roles and line heights, aligned left with the plot', async () => {
  const { dom } = await rendered(thinkflow(`
    box a "Card title" "Card subtitle"
    chart c "Chart title" bar "Chart subtitle" {
      x "x(u)"
      series v "v"
      row "A" v=40
      row "B" v=20
    }
  `));
  const title = textsWith(dom, 'label');
  const sub = textsWith(dom, 'sub');
  const [cardTitle, chartTitle] = ['Card title', 'Chart title'].map((name) => title.find((n) => textContent(n) === name));
  const [cardSub, chartSub] = ['Card subtitle', 'Chart subtitle'].map((name) => sub.find((n) => textContent(n) === name));
  assert.ok(cardTitle && chartTitle && cardSub && chartSub, 'the card and the chart use the same two roles');
  assert.equal(chartTitle.attrs['text-anchor'], undefined, 'left aligned');
  // 제목 줄 가운데에서 부제 줄 가운데까지는 두 줄 높이의 절반씩이다. 카드가 같은 두 줄을 쌓는 간격과 같다.
  const centers = (titleNode, subNode) => [centerBaseline(0, STYLE.label.size), centerBaseline(0, STYLE.sub.size)].map((base, k) => num([titleNode, subNode][k], 'y') - base);
  const [chartTitleCenter, chartSubCenter] = centers(chartTitle, chartSub);
  const [cardTitleCenter, cardSubCenter] = centers(cardTitle, cardSub);
  assert.ok(Math.abs(chartSubCenter - chartTitleCenter - (STYLE.label.line + STYLE.sub.line) / 2) < EPS, 'the chart stacks the title and the subtitle by their line heights');
  assert.ok(Math.abs(cardSubCenter - cardTitleCenter - (STYLE.label.line + STYLE.sub.line) / 2) < EPS, 'the card stacks them the same way');
  assert.equal(findAll(dom, (n) => /chart-(title|sub)\b/.test(n.attrs.class ?? '')).length, 0, 'no chart-only header roles');
});

test('T11 a long chart or trace title wraps at the default width: it keeps every character and no header line passes the figure width', async () => {
  const titles = [
    'Quarterly revenue by region and channel with a deliberately long title that needs more than one line at the default width',
    'GET /v1/orders/{id}/payments/authorizations/capture-and-settle-with-an-unusually-long-trace-name that also has several words',
  ];
  const { dom } = await rendered(thinkflow(`
    box a "A"
    chart c "${titles[0]}" bar "Short subtitle" {
      x "x(u)"
      series v "v"
      row "A" v=40
    }
    trace t "${titles[1]}" unit=ms {
      span s "S" lane=a at=0 dur=10
    }
    view graph down "graph"
    view time "time" {
      t
    }
  `));
  // 제목은 왼쪽 여백(PAD)에서 시작하는 label 글이다. 카드 이름 "A"는 가운데 맞춤이라 빠진다. 차트 머리가 앞, 시간 머리가 뒤다.
  const headers = textsWith(dom, 'label').filter((n) => num(n, 'x') === PAD && n.attrs['text-anchor'] === undefined);
  const squash = (text) => text.replace(/\s/g, '');
  let from = 0;
  for (const title of titles) {
    let joined = '';
    const own = [];
    while (joined.length < squash(title).length && from < headers.length) {
      own.push(headers[from]);
      joined += squash(textContent(headers[from++]));
    }
    assert.equal(joined, squash(title), 'every character is kept, in order');
    assert.ok(own.length > 1, `"${title.slice(0, 20)}" is split into lines`);
  }
  assert.equal(from, headers.length, 'no other title line');
  for (const node of headers) {
    const right = PAD + measure(textContent(node), STYLE.label.size, STYLE.label.face);
    assert.ok(right <= WIDTH - PAD + EPS, `"${textContent(node).slice(0, 20)}" ends at ${right}, inside the figure width ${WIDTH}`);
  }
});
