// 한 문서의 카드 모형: 연결점(표 열, API 칸, 격자 칸, 추적 구간), 카드가 여러 보기에 함께 놓이는 일, 보기 규칙.
// 시험 이름 첫 낱말(S1~S11)이 요구사항 번호이고, 번호와 계약의 대응은 docs/design/expression-coverage.md의 시험 번호 표에 있다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build, dap, descendants, findAll, lineOf, num, parseMarkup, reject, stillDom, textContent, textsOf, toHtml, toSvg, visibleTexts } from './support.js';

/** 멈춘 SVG의 선 경로 `p-번호`가 끝나는 점(마지막 좌표 쌍). */
function edgeEnds(dom) {
  return Object.fromEntries(findAll(dom, (n) => n.tag === 'path' && /^p-\d+$/.test(n.attrs.id ?? '')).map((path) => {
    const numbers = path.attrs.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    return [path.attrs.id, { from: numbers.slice(0, 2), to: numbers.slice(-2) }];
  }));
}

/** 보이는 글자 `label`의 기준선 y. */
function rowY(dom, label) {
  const found = visibleTexts(dom).filter((n) => textContent(n).trim() === label);
  assert.equal(found.length, 1, `expected one "${label}"`);
  return num(found[0], 'y');
}

const nearest = (y, rows) => Object.entries(rows).sort(([, a], [, b]) => Math.abs(a - y) - Math.abs(b - y))[0][0];

test('S1 one document holds people, API fields, table columns, values and a chart, and every edge ends on its own row', async () => {
  const source = dap(`
    person user "User"
    table orders "orders" {
      id bigint pk
      status text
    }
    api create "POST /orders" {
      body "OrderRequest"
      created "201 Order"
    }
    value depth "depth" on=user from=3
    chart lag "Lag" bar {
      x "ms(ms)"
      series v "v"
      row "p50" v=40
      row "now" v=depth
    }
    user -> orders.status
    user -> orders.id
    user -> create.created
    create.body -> orders.id
  `);
  const dom = await stillDom(source);
  const rows = { id: rowY(dom, 'idPK'), status: rowY(dom, 'status'), body: rowY(dom, 'body'), created: rowY(dom, 'created') };
  const ends = edgeEnds(dom);
  assert.equal(nearest(ends['p-0'].to[1], { id: rows.id, status: rows.status }), 'status');
  assert.equal(nearest(ends['p-1'].to[1], { id: rows.id, status: rows.status }), 'id');
  assert.equal(nearest(ends['p-2'].to[1], { body: rows.body, created: rows.created }), 'created');
  assert.equal(nearest(ends['p-3'].from[1], { body: rows.body, created: rows.created }), 'body');
  assert.equal(nearest(ends['p-3'].to[1], { id: rows.id, status: rows.status }), 'id');
  assert.ok(textsOf(dom).includes('User') && textsOf(dom).includes('Lag'));
});

test('S2 a grid is addressed by its items; a trace by its spans; a class by nothing but the card itself', async () => {
  const ok = dap(`
    grid g "G" cols=4 {
      item left "L" cols=3
      item right "R" col=3
    }
    box b "B"
    trace t "T" unit=ms {
      span s1 "one" lane=b at=0 dur=100
      span s2 "two" lane=b at=100 dur=300
    }
    b -> g.left
    g.left -> g.right
    scene "s" mode=static
      light g.right t.s2
  `);
  await build(ok);
  for (const [bad, message] of [
    ['b -> g.nope\n', /nope/],
    ['g.left -> g.left\n', /./],
    ['b -> g.left.x\n', /card\.part/],
  ]) {
    const source = dap(`grid g "G" cols=4 {\n  item left "L" cols=3\n}\nbox b "B"\n${bad}`);
    assert.ok((await reject(source)).some((p) => message.test(p.message)), bad);
  }
  const light = dap(`box b "B"\ntrace t "T" {\n  span s1 "one" lane=b at=0 dur=100\n}\nscene "s" mode=static\n  light t.zz\n`);
  assert.ok((await reject(light)).some((p) => p.line === lineOf(light, 'light t.zz')));
});

test('S3 grid cells are as wide and tall as the units they cover, empty places stay empty, and cells may not overlap', async () => {
  const dom = await stillDom(dap(`
    grid g "G" rows=2 cols=10 {
      item wide "WIDE" cols=6
      item narrow "NARROW" col=6 cols=4
      item low "LOW" row=1 cols=10
    }
  `));
  // 칸 글자는 칸 가운데에 놓인다. 가운데가 6칸 칸은 3, 4칸 칸은 8, 10칸 칸은 5 단위 자리이므로 세 가운데는 한 단위 폭으로 늘어선다.
  const center = (label) => num(visibleTexts(dom).find((n) => textContent(n).trim() === label), 'x');
  const [wide, narrow, low] = ['WIDE', 'NARROW', 'LOW'].map(center);
  const unit = (narrow - wide) / (8 - 3);
  assert.ok(unit > 10, `unit ${unit}`);
  assert.ok(Math.abs(low - (wide + 2 * unit)) < 0.5, `centers ${wide} ${narrow} ${low}`);
  const clash = dap(`grid g "G" cols=4 {\n  item a "A" cols=3\n  item b "B" col=2 cols=2\n}\n`);
  assert.ok((await reject(clash)).length);
  const outside = dap(`grid g "G" cols=4 {\n  item a "A" col=4\n}\n`);
  assert.ok((await reject(outside)).some((p) => p.line === lineOf(outside, 'item a')));
});

test('S4 a table foreign key becomes an edge between the two columns, to a key column only, and a column cannot reference itself', async () => {
  const doc = (child) => dap(`table users "users" {\n  id bigint pk\n  name text\n}\ntable orders "orders" {\n  id bigint pk\n  ${child}\n}\n`);
  await build(doc('user_id bigint fk=users.id'));
  const cases = [
    [doc('user_id bigint fk=users.name'), 'user_id', /fk must point to a pk or unique column/],
    [doc('user_id bigint fk=users.zz'), 'user_id', /unknown column in "users" "zz"/],
    [doc('user_id bigint fk=nope.id'), 'user_id', /unknown table "nope"/],
    [dap('table orders "orders" {\n  id bigint pk fk=orders.id\n}\n'), 'fk=orders.id', /cannot go from "orders.id" to itself/],
  ];
  for (const [source, needle, message] of cases) {
    const problems = await reject(source);
    assert.ok(problems.some((p) => p.line === lineOf(source, needle) && message.test(p.message)), `${needle}: ${JSON.stringify(problems)}`);
  }
  const contradictory = dap(`table t "t" {\n  id bigint pk nullable\n}\n`);
  assert.ok((await reject(contradictory)).some((p) => p.line === lineOf(contradictory, 'id bigint')));
});

test('S5 the same card in a graph view and a sequence view is drawn once per view and moves once per view', async () => {
  const source = dap(`
    person user "User"
    box gw "Gateway"
    value hits "hits" on=gw from=0
    user -> gw
    view graph "Structure"
    view sequence "Calls" {
      user gw
    }
    scene "s" mode=static
      user -> gw "POST" set="hits+1"
  `);
  const result = await build(source);
  const html = parseMarkup(await toHtml(result, 'x'), { html: true });
  const canvas = findAll(html, (n) => /\bfl-canvas\b/.test(n.attrs.class ?? ''))[0];
  const panels = findAll(canvas, (n) => n.tag === 'section' && n.attrs['data-strategy']);
  assert.deepEqual(panels.map((p) => p.attrs['data-strategy']), ['graph', 'sequence']);
  assert.deepEqual(textsOf(canvas).filter((t) => t === 'Structure' || t === 'Calls'), ['Structure', 'Calls']);
  const dom = parseMarkup(await toSvg(result, { isStatic: true }));
  const texts = textsOf(dom);
  assert.equal(texts.filter((t) => t === 'Gateway').length, 2, 'one head in the graph, one lifeline head in the sequence');
  assert.equal(texts.filter((t) => t === 'POST').length, 1, 'the message appears once, as the sequence message (the graph carries it as a moving chip)');
  const hits = findAll(dom, (n) => n.tag === 'text' && textContent(n).trim() === '1');
  assert.equal(hits.length, 1, 'the shared value changes once and shows once');
});

test('S6 sequence-only statements need their card in a sequence view', async () => {
  for (const line of ['note gw "n"', 'activate gw', 'deactivate gw', 'gw -> user "m" create']) {
    const source = dap(`box gw "G"\nbox user "U"\ngw -> user\nscene "s" mode=static\n  ${line}\n`);
    assert.ok((await reject(source)).some((p) => p.line === lineOf(source, `  ${line}`)), line);
  }
});

test('S7 #175 a value, show or clear on a card that no graph view shows is rejected at its own line, and the same figure with the card in a graph view is drawn', async () => {
  const doc = (line, graph = '') => dap(`
    person u "User"
    box s "Service"
    value n "count" on=s from=0
    ${graph}
    view sequence {
      u s
    }
    scene "s" mode=static
      u -> s "call" set="n+1"
      ${line}
  `);
  const kinds = [['', 'value n'], ['show s "verified" tag="ok"', 'show s'], ['clear s', 'clear s']];
  for (const [line, statement] of kinds) {
    const source = doc(line);
    const problems = await reject(source);
    const lines = problems.map((p) => p.line);
    assert.ok(lines.includes(lineOf(source, 'value n')), `${statement}: the value declaration is located: ${JSON.stringify(problems)}`);
    if (line) assert.ok(lines.includes(lineOf(source, statement)), `${statement}: the statement is located: ${JSON.stringify(problems)}`);
    assert.ok(problems.every((p) => p.severity === 'error' && /no graph view shows/.test(p.message) && p.line >= 1), JSON.stringify(problems));
  }
  const shown = textsOf(parseMarkup(await toSvg(await build(doc('show s "verified" tag="ok"', 'view graph {\n      s\n    }')), { isStatic: true })));
  for (const word of ['verified', 'count']) assert.ok(shown.includes(word), `${word} is drawn once a graph view shows the card: ${JSON.stringify(shown)}`);
});

test('S8 #172 card content shown by a scene is drawn whichever view is declared first', async () => {
  const doc = (views) => dap(`
    box api "API"
    store db "DB"
    api -> db
    ${views}
    scene "s" mode=static
      api -> db "write"
      show db "committed"
  `);
  const sequenceFirst = doc('view sequence {\n  api\n  db\n}\nview graph');
  const graphFirst = doc('view graph\nview sequence {\n  api\n  db\n}');
  for (const source of [sequenceFirst, graphFirst]) {
    const result = await build(source);
    const texts = textsOf(parseMarkup(await toSvg(result, { isStatic: true })));
    assert.equal(texts.filter((t) => t === 'committed').length, 1, JSON.stringify(texts));
    const html = parseMarkup(await toHtml(result, 'x'), { html: true });
    const graphPanel = findAll(html, (n) => n.tag === 'section' && n.attrs['data-strategy'] === 'graph')[0];
    assert.ok(descendants(graphPanel).some((n) => n.tag === 'text' && textContent(n) === 'committed'), 'the graph panel carries the card layer');
  }
});

test('S9 every card must be shown by some view, views take only fitting members, and an edge needs a graph view that holds both ends', async () => {
  const cases = [
    ['box a "A"\nview sequence {\n  a\n  zz\n}\n', 'zz'],
    ['group g "G" {\n  box a "A"\n}\nview graph {\n  a\n}\n', 'list group'],
    ['box a "A"\nbox b "B"\na -> b\nview graph {\n  a\n}\nview graph {\n  b\n}\n', 'is not drawn'],
    ['box a "A"\nbox b "B"\nview plot {\n  a\n}\nview graph {\n  b\n}\n', 'chart'],
  ];
  for (const [body, message] of cases) {
    const problems = await reject(dap(body));
    assert.ok(problems.some((p) => p.message.includes(message)), `${JSON.stringify(body)} -> ${JSON.stringify(problems)}`);
  }
});

test('S9 a view names its kind first and has no id of its own: the old "view id kind" form is a plain syntax error', async () => {
  for (const line of ['view main graph', 'view calls sequence {', 'view p plot {', 'view t time {']) {
    const source = dap(`box a "A"\n${line}\n${line.endsWith('{') ? '  a\n}\n' : ''}`);
    const problems = await reject(source);
    assert.ok(problems.some((p) => p.line === lineOf(source, line) && p.code === 'syntax'), line);
    for (const problem of problems) assert.doesNotMatch(problem.message, /renamed|no longer|used to|old form|instead of/i, 'no migration advice');
  }
});

test('S10 a default view appears when none is declared: a graph holding every card, plus one time view per trace', async () => {
  const source = dap(`box a "A"\ntrace t "T" {\n  span s1 "one" lane=a at=0 dur=10\n}\n`);
  const html = parseMarkup(await toHtml(await build(source), 'x'), { html: true });
  const variants = findAll(html, (n) => n.attrs.class?.split(' ').includes('dp-panels'));
  assert.ok(variants.length);
  for (const variant of variants) {
    const strategies = findAll(variant, (n) => n.tag === 'section' && n.attrs['data-strategy']).map((n) => n.attrs['data-strategy']);
    assert.deepEqual(strategies, ['graph', 'time'], 'every responsive layout preserves the default view roles');
  }
});

test('S11 participants are listed in the order they first send: a different order is a warning (an error under strict) pointing into the view block', async () => {
  const source = dap(`person u "U"\nbox s "S"\nview sequence {\n  s\n  u\n}\nscene "m" mode=static\n  u -> s "hi"\n`);
  const firstParticipant = lineOf(source, 'view sequence') + 1;
  const strict = await reject(source);
  assert.ok(strict.some((p) => /first send/.test(p.message) && p.line === firstParticipant), JSON.stringify(strict));
  const lenient = await build(source, { strict: false });
  assert.deepEqual(lenient.warnings.map((w) => w.line), [firstParticipant]);
  await build(dap(`person u "U"\nbox s "S"\nview sequence {\n  u\n  s\n}\nscene "m" mode=static\n  u -> s "hi"\n`));
});
