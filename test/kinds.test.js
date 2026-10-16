// 개발 그림 열네 가족의 독립 최소 경계: 구성도, 클래스, 순서, 상태, 추적, 큐, 칸 격자. (api, schema는 cards.test.js, flow는 values.test.js, metric은 charts.test.js, integration은 cards.test.js)
// 예제 원본은 examples.test.js가 읽는다. 시험 이름 첫 낱말(K-arch 등)이 요구사항 번호이고, 대응은 docs/design/expression-coverage.md의 시험 번호 표에 있다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIGURE_PAD } from '../src/canvas.js';
import { reflowFigure } from '../src/build.js';
import { headReach } from '../src/draw/arrow.js';
import { measure } from '../src/measure/fonts.js';
import { STYLE } from '../src/measure/texts.js';
import { values } from '@woonyong-choi/design-tokens/tokens.js';
import { build, thinkflow, finalValue, findAll, lineOf, num, parseMarkup, reject, stillDom, textContent, textsOf, toHtml, toSvg, visibleTexts } from './support.js';

const rejectedAt = async (source, needle, pattern) => {
  const problems = await reject(source);
  assert.ok(problems.some((p) => p.line === lineOf(source, needle) && (pattern ? pattern.test(p.message) : true)), `${needle}: ${JSON.stringify(problems)}`);
};
const at = (dom, label) => {
  const found = visibleTexts(dom).filter((n) => textContent(n).trim() === label);
  assert.equal(found.length, 1, `expected one "${label}", found ${found.length}`);
  return { x: num(found[0], 'x'), y: num(found[0], 'y') };
};

test('K-arch a group holds boxes with badges, replica counts, icons and numbered edges; a quiet edge must be walked', async () => {
  const source = (scene) => thinkflow(`
    person u "User"
    group cloud "Cloud" direction=down badge="Zone" {
      box web "Web" count=3 badge="L7" icon=server
      store db "DB" icon=db
    }
    u -> web "req" no=1
    web -> db "sql" no=2 quiet
    ${scene}
  `);
  const walked = source('scene "s" mode=static\n  u -> web\n  web -> db\n');
  const texts = textsOf(await stillDom(walked));
  for (const word of ['User', 'Cloud', 'Zone', 'Web', 'L7', 'DB', 'req', 'sql', '1', '2', '(3)']) assert.ok(texts.includes(word), `${word} in ${JSON.stringify(texts)}`);
  await rejectedAt(source(''), 'quiet', /never/);
  for (const [line, pattern] of [
    ['box a "A" badge="toolongbadge"', /badge|8/],
    ['box a "A" count=1', /count/],
    ['box a "A" shape=circle badge="x"', /./],
    ['box a "A" shape=tile', /icon/],
    ['box a "A" icon=no-such-icon', /cannot use icon/],
    ['box a "A"\nbox b "B"\na -> b no=0', /./],
    ['box a "A"\nbox b "B"\na -> b no=1.5', /./],
  ]) {
    const bad = thinkflow(`${line}\n`);
    assert.ok((await reject(bad)).length, line);
    assert.ok((await reject(bad)).some((p) => pattern.test(p.message)), `${line}: ${JSON.stringify(await reject(bad))}`);
  }
  // 번호는 겹쳐도 된다
  await build(thinkflow('box a "A"\nbox b "B"\nbox c "C"\na -> b no=1\nb -> c no=1\n'));
});

test('K-arch edges to a group and its own members, to itself, or twice in one direction are errors; opposite directions may coexist', async () => {
  const group = thinkflow('group g "G" {\n  box a "A"\n}\ng -> a\n');
  await rejectedAt(group, 'g -> a');
  await rejectedAt(thinkflow('box a "A"\na -> a\n'), 'a -> a');
  await rejectedAt(thinkflow('box a "A"\nbox b "B"\na -> b\na -> b "again"\n'), 'a -> b "again"', /already an edge/);
  await build(thinkflow('box a "A"\nbox b "B"\na -> b\nb -> a\n'));
  await rejectedAt(thinkflow('box a "A"\ngroup g "G" {\n}\n'), 'group g', /group "g" is empty/);
});

test('K-class members read as visibility marks; abstract and interface say so; multiplicity labels sit on their ends', async () => {
  const source = thinkflow(`
    interface repo "Repo" {
      method save "(x: T): void" visibility=public
    }
    class base "Base" abstract {
      field id "UUID" visibility=protected
    }
    class user "User" {
      field name "string" visibility=private
      method greet "(): void" visibility=public
    }
    user -> base relation=inheritance
    user -> repo relation=realization
    base -> repo relation=aggregation from="1" to="0..*"
  `);
  const texts = textsOf(await stillDom(source));
  for (const word of ['- name: string', '+ greet(): void', '# id: UUID', '{abstract}', '«interface»', '1', '0..*']) assert.ok(texts.includes(word), `${word} in ${JSON.stringify(texts)}`);
});

test('K-class relations: multiplicity only where it means something, no inheritance loop, members unique, relations only between classes', async () => {
  const base = 'class a "A" {\n  field n "int"\n}\nclass b "B" {\n  field n "int"\n}\nbox x "X"\n';
  await rejectedAt(thinkflow(`${base}a -> b relation=inheritance from="1"\n`), 'relation=inheritance', /multiplicity/);
  const loop = thinkflow(`${base}a -> b relation=inheritance\nb -> a relation=inheritance\n`);
  assert.ok((await reject(loop)).length);
  await rejectedAt(thinkflow('class a "A" {\n  field n "int"\n  field n "long"\n}\n'), 'field n "long"', /already/);
  await rejectedAt(thinkflow(`${base}a -> x relation=association\n`), 'relation=association');
  await rejectedAt(thinkflow(`${base}a -> b relation=nonsense\n`), 'relation=nonsense');
  await rejectedAt(thinkflow('class a "A" {\n  field n "int"\n'), 'class a', /./);
  await build(thinkflow(`${base}a -> b from="1" to="*"\n`));
});

test('K-sequence messages run top to bottom in the order written; notes and branches are drawn; the participant row is the view', async () => {
  const source = thinkflow(`
    person a "A"
    box b "B"
    box c "C"
    view sequence {
      a
      b
      c
    }
    scene "s" mode=static
      a -> b "one"
      b -> c "two" dashed
      note c "memo"
      activate c
      c -> b "inside"
      deactivate c
      fragment alt "pick" choose="yes" {
        branch "yes" {
          c -> b "ok"
        }
        branch "no" {
          c -> b "fail"
        }
      }
  `);
  const dom = await stillDom(source);
  const ys = ['one', 'two', 'inside', 'ok', 'fail'].map((label) => at(dom, label).y);
  assert.deepEqual([...ys].sort((p, q) => p - q), ys, 'top to bottom in the written order');
  const columns = ['A', 'B', 'C'].map((label) => at(dom, label).x);
  assert.deepEqual([...columns].sort((p, q) => p - q), columns, 'participants left to right in the view order');
  for (const word of ['memo', 'alt · pick']) assert.ok(textsOf(dom).includes(word), word);
});

test('K-view a panel is as wide as its title needs; a long Korean or Latin title stays inside the panel and the figure, and the content stays centered inside it', async () => {
  const long = '매우 긴 한국어 패널 이름을 반복해서 적어도 그림 안에서 잘리지 않는지 확인하는 호출 순서 long-latin-identifier-name-for-a-view';
  const views = (graphTitle) => thinkflow(`
    person a "A"
    box b "B"
    view graph ${graphTitle} {
      a
      b
    }
    view sequence "short" {
      a
      b
    }
    scene "s" mode=static
      a -> b "one"
  `);
  const figure = await build(views(`"${long}"`));
  const { scene } = figure;
  const [graph, sequence] = scene.panels;
  const need = measure(long, STYLE.group.size, STYLE.group.face) + FIGURE_PAD * 2;
  assert.ok(graph.box.w >= need && scene.width >= need, `panel ${graph.box.w} and figure ${scene.width} hold the ${need}px title`);
  assert.ok(graph.labelAt.x + measure(long, STYLE.group.size, STYLE.group.face) <= graph.box.x + graph.box.w - FIGURE_PAD + 1e-6, 'the title ends inside the panel padding');
  const dom = parseMarkup(await toSvg(figure, { isStatic: true }));
  const [title] = findAll(dom, (n) => n.tag === 'text' && n.attrs['data-view'] === graph.view);
  assert.ok(num(title, 'x') >= 0 && num(title, 'x') + measure(long, STYLE.group.size, STYLE.group.face) <= scene.width, 'the drawn title is within the figure');
  for (const panel of scene.panels) {
    assert.ok(panel.box.x >= 0 && panel.box.x + panel.box.w <= scene.width + 1e-6, `${panel.view} panel inside the figure`);
    for (const it of scene.items.filter((item) => item.panel === panel.index)) assert.ok(it.x >= panel.box.x && it.x + it.w <= panel.box.x + panel.box.w + 1e-6, `${it.id} inside the ${panel.view} panel`);
  }
  assert.ok(sequence.box.w <= graph.box.w, 'the narrow panel stays centered under the wide one');
  // 제목이 짧으면 내용 자리는 제목 폭에 달라지지 않는다.
  const plain = (await build(views('"ab"'))).scene;
  const bare = (await build(views('"ab"').replace('view graph "ab"', 'view graph'))).scene;
  assert.deepEqual(plain.items.map((it) => [it.id, it.x, it.w]), bare.items.map((it) => [it.id, it.x, it.w]), 'a short title leaves the content where it was');
});

test('K-sequence a message needs text; a fragment names a branch; an activation closes; an and-beat cannot carry messages', async () => {
  const head = 'person a "A"\nbox b "B"\nview sequence {\n  a\n  b\n}\nscene "s" mode=static\n';
  await rejectedAt(thinkflow(`${head}  a -> b\n`), '  a -> b', /needs text/);
  await rejectedAt(thinkflow(`${head}  a -> b "x"\n  activate b\n`), 'activate b', /deactivate/);
  await rejectedAt(thinkflow(`${head}  activate b\n`), 'activate b', /follows a message/);
  await rejectedAt(thinkflow(`${head}  fragment alt "p" choose="zz" {\n    branch "yes" {\n      a -> b "x"\n    }\n  }\n`), 'fragment alt', /branch/);
  await rejectedAt(thinkflow(`${head}  a -> b "x" & b -> a "y"\n`), '&', /./);
  await rejectedAt(thinkflow(`${head}  fragment maybe "p" {\n    branch "yes" {\n      a -> b "x"\n    }\n  }\n`), 'fragment maybe');
  await rejectedAt(thinkflow(`${head}  fragment alt "p" {\n    branch "yes" {\n      a -> b "x"\n`), 'fragment alt');
});

test('K-sequence #179 a fragment never changes what a card shows: a scene that starts with one, ends with one, nests one, disables one or has only skipped ones all keep the declared value and the shown rows', async () => {
  const head = (order) => `person u "U"\nbox a "A"\nvalue n "COUNT" on=a from=0\nu -> a\nview graph\nview sequence {\n  ${order}\n}\n`;
  const loop = '  fragment loop "F" times=2 {\n    a -> u "in"\n  }\n';
  const skipped = '  fragment opt "S" run=off {\n    a -> u "never"\n  }\n';
  const cases = [
    ['starts with a fragment', 'a\n  u', `scene "s" mode=static\n${loop}`, { COUNT: true, SHOWN: false }],
    ['has only a skipped fragment', 'a\n  u', `scene "s" mode=static\n${skipped}`, { COUNT: true, SHOWN: false }],
    ['shows after only a skipped fragment', 'a\n  u', `scene "s"\n${skipped}  show a "SHOWN"\n`, { COUNT: true, SHOWN: true }],
    ['a fragment between a move and a show', 'u\n  a', `scene "s" mode=static\n  u -> a "go"\n${loop}  show a "SHOWN"\n`, { COUNT: true, SHOWN: true }],
    ['a nested fragment with a disabled one inside', 'u\n  a', `scene "s" mode=static\n  u -> a "go"\n  show a "SHOWN"\n  fragment loop "O" times=2 {\n    fragment opt "I" run=off {\n      a -> u "x"\n    }\n    a -> u "y"\n  }\n`, { COUNT: true, SHOWN: true }],
    ['a branch that is not chosen', 'u\n  a', `scene "s" mode=static\n  u -> a "go"\n  show a "SHOWN"\n  fragment alt "P" choose="yes" {\n    branch "yes" {\n      a -> u "y"\n    }\n    branch "no" {\n      a -> u "n"\n    }\n  }\n  show a "AFTER"\n`, { COUNT: true, SHOWN: true, AFTER: true }],
    ['a fragment between two scenes of one card', 'u\n  a', `scene "s" mode=static\n  u -> a "go"\n  show a "SHOWN"\n${loop}scene "t" mode=static\n`, { COUNT: true, SHOWN: true }],
  ];
  for (const [name, order, body, expected] of cases) {
    const source = thinkflow(head(order) + body);
    const figure = await build(source);
    for (const options of [{ isStatic: true }, {}]) parseMarkup(await toSvg(figure, options));
    await toHtml(figure);
    const texts = textsOf(await stillDom(source));
    for (const [word, isShown] of Object.entries(expected)) assert.equal(texts.includes(word), isShown, `${name}: "${word}" in ${JSON.stringify(texts)}`);
    if (body.includes('scene "t"')) {
      const next = textsOf(await stillDom(source, 1));
      assert.ok(next.includes('COUNT') && !next.includes('SHOWN'), `${name}: the next scene starts from the declared card again: ${JSON.stringify(next)}`);
    }
  }
});

test('K-state states are connected by labelled transitions; a self transition is allowed; start and final points take no label', async () => {
  const source = thinkflow(`
    state s1 "Idle"
    state s2 "Busy"
    start s1
    final s2
    s1 -> s2 "go"
    s2 -> s2 "again"
  `);
  const texts = textsOf(await stillDom(source));
  for (const word of ['Idle', 'Busy', 'go', 'again']) assert.ok(texts.includes(word), word);
  await rejectedAt(thinkflow('state s1 "A"\nstate s2 "B"\ns1 -> s2\n'), 's1 -> s2', /label|event/);
});

test('K-state a self transition loops out of the card by at least three arrowhead lengths, so it reads as a loop and not as its own arrowhead', async () => {
  const { scene } = await build(thinkflow('state a "A"\nstate b "B"\na -> a "retry"\na -> b "go"\n'));
  const card = scene.items.find((item) => item.id === 'a');
  const loop = scene.edges.find((e) => e.from === 'a' && e.to === 'a').points;
  const { length, half } = headReach(values["border-width"].edge);
  const standoff = card.y - Math.min(...loop.map((p) => p.y));
  const span = Math.max(...loop.map((p) => p.x)) - Math.min(...loop.map((p) => p.x));
  assert.ok(standoff >= 3 * length, `the loop stands ${standoff}px off the card, the arrowhead is ${length}px long`);
  assert.ok(span >= 3 * 2 * half, `the loop is ${span}px wide, the arrowhead ${2 * half}px`);
});

test('K-trace spans sit on a linear time axis: position follows "at", length follows "dur", for both units', async () => {
  for (const unit of ['ms', 'us', 's']) {
    const source = thinkflow(`
      box a "A"
      trace t "T" unit=${unit} {
        span one "ONE" lane=a at=0 dur=100
        span two "TWO" lane=a at=100 dur=300
      }
    `);
    const dom = await stillDom(source);
    assert.ok(textsOf(dom).includes(unit), `the axis names its unit ${unit}`);
    const zero = at(dom, '0').x;
    const hundred = at(dom, '100').x;
    const unitWidth = hundred - zero;
    const spans = findAll(dom, (n) => n.tag === 'rect' && !n.attrs.class && num(n, 'height') < 20 && num(n, 'width') > 10);
    assert.equal(spans.length, 2);
    spans.sort((p, q) => num(p, 'y') - num(q, 'y'));
    assert.ok(Math.abs(num(spans[0], 'x') - zero) < 1.5 && Math.abs(num(spans[0], 'width') - unitWidth) < 1.5, 'ONE starts at 0 and lasts 100');
    assert.ok(Math.abs(num(spans[1], 'x') - hundred) < 1.5 && Math.abs(num(spans[1], 'width') - 3 * unitWidth) < 3, 'TWO starts at 100 and lasts 300');
  }
});

test('K-trace span labels use the current time panel boundary when its width grows', async () => {
  const base = await build(thinkflow(`
    box a "A"
    trace t "T" unit=ms {
      span one "ONE" lane=a at=8 dur=1
      span two "TWO" lane=a at=11 dur=1
    }
  `));
  const width = base.scene.times[0].width * 2;
  const wide = await reflowFigure(base, { chartWidth: width });
  const panel = wide.scene.times[0];
  assert.equal(panel.width, width);
  for (const span of panel.lanes[0].spans) {
    assert.ok(span.nameX + measure(span.label, values.text.figure['11']) < panel.plotRight, 'the label fits to the right of its span');
    assert.equal(span.isLeft, false, 'unused space past the original width remains available');
  }
});

test('K-trace #170 a narrow time panel preserves duration ratios and puts long labels above their spans', async () => {
  const source = thinkflow(`
    box a "긴 한국어 서비스 이름이 있는 레인"
    trace t "요청 시간 추적" unit=ms {
      span first "POST /api/orders/long-request-identifier/subscriptions/long-lived-reference" lane=a at=0 dur=100
      span second "긴 작업 이름을 생략하지 않고 모두 표시하며 다른 구간과 글자가 겹치지 않아야 한다" lane=a at=50 dur=300
    }
  `);
  const base = await build(source);
  const narrow = await reflowFigure(base, { chartWidth: 272 });
  const panel = narrow.scene.times[0];
  assert.equal(panel.width, 272, 'time participates in the compact layout');
  const spans = panel.lanes[0].spans;
  assert.ok(Math.abs(spans[1].w / spans[0].w - 3) < 0.001, '100ms and 300ms retain their ratio');
  assert.ok(spans[1].y > spans[0].y + spans[0].h, 'overlapping times use different rows');
  for (const span of spans) {
    assert.ok(span.texts.length > 1, 'long names wrap instead of widening the panel');
    assert.equal(span.texts.map((text) => text.text).join('').replace(/\s/g, ''), span.label.replace(/\s/g, ''));
    for (const text of span.texts) {
      assert.ok(text.center < span.y, 'the name is above its bar');
      assert.ok(text.x >= 0 && text.x + measure(text.text, text.style.size, text.style.face) <= panel.width, 'the complete name stays inside the panel');
    }
  }
  const html = await toHtml(base, 'trace');
  assert.ok(html.includes('fl-narrow'), 'a time-only wide panel can carry its compact counterpart');
});

test('K-trace span rules: all three options are required, lanes are declared cards, ids are unique, the unit is one of three', async () => {
  const head = 'box a "A"\ntrace t "T" unit=ms {\n';
  for (const [line, pattern] of [
    ['span s "S" lane=a at=0', /dur|lane|at/],
    ['span s "S" lane=zz at=0 dur=1', /zz|unknown/],
    ['span s "S" lane=a at=0 dur=0', /./],
    ['span s "S" lane=a at=-1 dur=1', /./],
  ]) {
    const source = thinkflow(`${head}  ${line}\n}\n`);
    await rejectedAt(source, line, pattern);
  }
  await rejectedAt(thinkflow(`${head}  span s "S" lane=a at=0 dur=1\n  span s "T" lane=a at=1 dur=1\n}\n`), 'span s "T"', /already/);
  await rejectedAt(thinkflow('box a "A"\ntrace t "T" unit=h {\n  span s "S" lane=a at=0 dur=1\n}\n'), 'trace t');
  assert.ok((await reject(thinkflow('box a "A"\ntrace t "T" {\n}\n'))).length, 'an empty trace');
});

test('K-queue a count past its ends warns (an error under strict) while exactly empty or exactly full does not', async () => {
  const queue = (moves) => thinkflow(`box a "A"\nqueue q "Q" slots=2\nvalue len "len" on=a ref=q\na -> q\nscene "s" mode=static\n${moves.map((m) => `  ${m}`).join('\n')}\n`);
  await build(queue(['a -> q set="q+2"']));
  await build(queue(['a -> q set="q+1"', 'a -> q set="q-1"']));
  const under = queue(['a -> q set="q-1"']);
  const over = queue(['a -> q set="q+3"']);
  for (const source of [under, over]) {
    assert.ok((await reject(source)).some((p) => p.code === 'check-14'), 'strict makes the warning an error');
    const lenient = await build(source, { strict: false });
    assert.ok(lenient.warnings.some((w) => w.code === 'check-14'));
  }
  assert.equal(await finalValue(under, 'len', 0, { strict: false }), '-1', 'the value is not clamped; only the picture is');
  assert.equal(await finalValue(over, 'len', 0, { strict: false }), '3');
});

test('K-grid cells connect to cells, never to themselves, never to a gap, and a grid cannot take show', async () => {
  const grid = (extra) => thinkflow(`grid g "G" rows=2 cols=4 {\n  item a "A" cols=2\n  item b "B" col=2 cols=2\n  gap x "Rest" count=9 row=1 cols=4\n}\n${extra}`);
  await build(grid('g.a -> g.b\n'));
  await rejectedAt(grid('g.a -> g.a\n'), 'g.a -> g.a');
  await rejectedAt(grid('g.a -> g.x\n'), 'g.a -> g.x');
  await rejectedAt(grid('box z "Z"\nz -> g.x\n'), 'z -> g.x');
  await rejectedAt(grid('g.a -> g.b "label"\n'), 'g.a -> g.b "label"');
  await rejectedAt(grid('scene "s" mode=static\n  show g "x"\n'), 'show g');
});

test('K-grid field strips preserve bit ratios and route matching trailing fields below a continuous lookup table', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../examples/memory-address.thinkflow', import.meta.url), 'utf8');
  const renamed = source.replace(/\bva\b/g, 'input').replace(/\bpt\b/g, 'lookup').replace(/\bpa\b/g, 'output');
  const result = await build(renamed);
  const [input, lookup, output] = ['input', 'lookup', 'output'].map(id => result.scene.items.find(item => item.id === id));
  assert.ok(input.x + input.w < lookup.x && lookup.x + lookup.w < output.x);
  assert.equal(lookup.unit.gutter, 0);
  assert.equal(input.cells[0].w / input.cells[1].w, 5 / 3);
  const edge = result.scene.edges.find(edge => edge.from === 'input' && edge.to === 'output');
  const offsetIn = input.cells.find(cell => cell.id === 'off');
  const offsetOut = output.cells.find(cell => cell.id === 'off');
  assert.equal(edge.points[0].y, input.y + offsetIn.y + offsetIn.h);
  assert.equal(edge.points.at(-1).y, output.y + offsetOut.y + offsetOut.h);
  assert.ok(Math.max(...edge.points.map(point => point.y)) > lookup.y + lookup.h);
  const narrow = await reflowFigure(result, { layoutWidth: 320 });
  const times = figure => figure.timeline.segs.map(seg => [seg.t0, seg.t1, seg.hops.map(hop => [hop.at ?? 0, hop.ms])]);
  assert.deepEqual(times(narrow), times(result));
});


test('K-grid outside row keys share measured bounds and avoid incoming cell leads', async () => {
  const source = thinkflow(`
    box cpu "CPU"
    grid ram "Physical memory" rows=2 {
      item zero "Page 1" key="Frame 0"
      item one "Free" key="Frame 1" row=1
    }
    cpu -> ram.zero
    view graph right
    scene "Map" mode=static
  `);
  const result = await build(source);
  const ram = result.scene.items.find(item => item.id === 'ram');
  const key = ram.texts.find(text => text.text === 'Frame 0');
  const cell = ram.cells.find(cell => cell.id === 'zero');
  assert.ok(key && key.x < cell.x);
  const { textSpan } = await import('../src/measure/texts.js');
  const span = textSpan({ x: 0, y: 0 }, key);
  assert.ok(span.x >= 0 && span.x + span.width < cell.x);
  assert.ok(cell.x + cell.w <= ram.w);
  const { textBoxes } = await import('../src/draw/boxes.js');
  assert.ok(textBoxes(result.scene).some(box => box.name === 'Frame 0'));
  const west = Object.values(ram.cellEnds).find(ends => ends.WEST)?.WEST;
  assert.ok(west);
  assert.ok(west.port.y > key.center + key.style.size / 2);
  const svg = await toSvg(result);
  assert.match(svg, /Frame 0/);
  assert.equal((svg.match(/Frame 0<\/text>/g) ?? []).length, 1);
  await rejectedAt(source.replace('rows=2 {', 'rows=2 cols=2 {').replace('item one "Free" key="Frame 1" row=1', 'item one "Free" key="Frame 1" row=1 col=1'), 'item one', /key=.*col=0/);
  await rejectedAt(source.replace('item zero "Page 1"', 'gap zero "Page 1" count=2'), 'gap zero', /key=.*item/);
});


test('K-grid outside row keys survive value changes and wrap within the measured item', async () => {
  const key = 'Frame '.repeat(35).trim();
  const source = thinkflow(`grid ram "RAM" {
 item one "placeholder" key="${key}"
}
value n "Data" on=ram.one from=empty
scene "Loaded" mode=static set="n=loaded"`);
  const result = await build(source);
  const ram = result.scene.items.find(item => item.id === 'ram');
  assert.ok(ram.cells[0].keyLines.length > 1);
  assert.equal(ram.cells[0].keyLines.join(' ').replace(/\s+/g, ' '), key);
  const shown = textsOf(await stillDom(source));
  assert.ok(shown.includes('loaded'));
  assert.ok(!shown.includes('placeholder'));
  assert.ok(ram.texts.filter(text => text.role === 'item gap').every(text => text.center >= ram.cells[0].y && text.center <= ram.cells[0].y + ram.cells[0].h));
  await rejectedAt(source.replace(key, ' '), 'item one', /cannot be empty/);
  const problems = await reject(source, { budget: { 'grid-elements': 3 } });
  assert.ok(problems.some(problem => problem.code === 'budget-exceeded'));
});


test('K-grid keyed rows keep distinct incoming ports for multiple callers', async () => {
  const result = await build(thinkflow(`box a "A"
box b "B"
grid ram "RAM" rows=2 {
 item first "Page 0" key="Frame 0"
 item next "Page 1" key="Frame 1" row=1
}
a -> ram.next
b -> ram.next
view graph right`));
  const ram = result.scene.items.find(item => item.id === 'ram');
  const ports = Object.values(ram.cellEnds).map(ends => ends.WEST.port.y);
  assert.equal(new Set(ports).size, 2);
});


test('K-grid a unit= grid is a byte layout: ruler, row offsets, proportional fields, two text levels, open end and region brackets', async () => {
  const source = thinkflow(`
    grid tcp "TCP header" rows=3 cols=32 unit=bit {
      item sport "Source Port" cols=16
      item dport "Destination Port" cols=16
      item flags "Flags" "CWR ECE" cols=8
      item win "Window" cols=24
      item opt "Options" cols=32 open
      region "Header" rows=2
      region "Payload"
    }
  `);
  const result = await build(source);
  const tcp = result.scene.items.find((item) => item.id === 'tcp');
  const cell = (id) => tcp.cells.find((c) => c.id === id);
  // 자리를 적지 않은 칸은 앞 칸 뒤에 이어 놓이고, 폭은 차지한 비트 수에 비례한다.
  assert.deepEqual(['sport', 'dport', 'flags', 'win', 'opt'].map((id) => [cell(id).row, cell(id).col]), [[0, 0], [0, 16], [1, 0], [1, 8], [2, 0]]);
  assert.ok(Math.abs(cell('dport').w - cell('sport').w) < 0.01 && Math.abs(cell('win').w - cell('flags').w * 3) < 0.01);
  // 눈금 숫자는 칸 위, 행 오프셋은 같은 단위로 칸 왼쪽, 보조 글은 적은 글이나 차지한 단위 수다.
  const texts = tcp.texts.map((t) => t.text);
  for (const label of ['bit', '0', '31', '32', '64', 'Header', 'Payload', '16 bit', 'CWR ECE']) assert.ok(texts.includes(label) || tcp.cells.some((c) => c.texts.some((t) => t.text === label)), label);
  const ruler = tcp.texts.filter((t) => t.text === '31');
  assert.ok(ruler.length >= 1 && ruler.every((t) => t.center < cell('sport').y));
  const offset = tcp.texts.find((t) => t.text === '64');
  assert.ok(offset.x < cell('opt').x && offset.anchor === 'end');
  assert.equal(cell('opt').texts.some((t) => t.text.endsWith('bit')), false);
  // 틀은 칸 사이 선보다 진한 역할이고, 열린 칸 아래는 점선이며, 구간마다 괄호가 하나다.
  const svg = await toSvg(result, { isStatic: true });
  assert.equal((svg.match(/class="chart-whisker"/g) ?? []).length, 3);
  assert.match(svg, /class="grid-cell empty"/);
  assert.equal(tcp.braces.length, 2);
  assert.ok(tcp.braces.every((b) => b.x >= cell('sport').x + cell('sport').w * 2 - 0.5));
});

test('K-grid byte layout lines that break the layout are line-numbered errors', async () => {
  const base = (body, head = 'rows=2 cols=8 unit=byte') => thinkflow(`
    grid g "G" ${head} {
      item a "A" cols=8
      ${body}
    }
  `);
  await rejectedAt(base('region "R" rows=1', 'rows=2 cols=8'), 'region "R"', /unit=/);
  await rejectedAt(base('item b "B" cols=8\n      region "One" rows=2\n      region "Two" row=1'), 'region "Two"', /overlaps/);
  await rejectedAt(base('region "Far" row=1 rows=2'), 'region "Far"', /ends at row 3/);
  await rejectedAt(base('item b "B" cols=4 open\n      item c "C" row=1 col=4 cols=4', 'rows=3 cols=8 unit=byte'), 'item b', /open marks/);
  await rejectedAt(base('item b "B" row=1 col=4 cols=4 key="K"'), 'item b', /col=0/);
  await rejectedAt(base('', 'rows=2 cols=65 unit=bit'), 'grid g', /at most 64 columns/);
  await rejectedAt(base('item b "B" cols=9'), 'item b', /ends at column/);
});

test('K-timing a timing view shows value bands, 0/1 lines, card moves and value notes from the same timeline as the sequence view', async () => {
  const source = thinkflow(`
    box a "A"
    box b "B"
    value lock "Lock" from=free
    value busy "Busy" from=0
    view sequence {
      a b
    }
    view timing "Signals" {
      a b
      lock busy
      note lock=held "held"
    }
    scene "One" mode=once
      a -> b "take" time=400ms set="lock=held, busy=1"
      b -> a "done" time=400ms set="lock=free, busy=0"
  `);
  const result = await build(source);
  const [panel] = result.scene.timings;
  assert.deepEqual(panel.rows.map((row) => [row.id, row.kind]), [['a', 'card'], ['b', 'card'], ['lock', 'value'], ['busy', 'value']]);
  const [part] = panel.scenes;
  const lock = part.rows.find((row) => row.id === 'lock');
  assert.deepEqual(lock.bands.map((band) => band.text), ['free', 'held', 'free']);
  // 띠가 바뀌는 자리는 시간표의 값 변화 시각이고, 순서 보기의 메시지 도착 시각과 같다.
  const change = result.timeline.values.find((row) => row.id === 'lock').changes[0][0];
  assert.equal(change, 400);
  assert.ok(Math.abs(lock.bands[1].x0 - part.scale.at(change / (part.unit === 's' ? 1000 : 1))) < 0.01);
  assert.ok(part.rows.find((row) => row.id === 'busy').wave);
  assert.deepEqual(part.arrows.map((arrow) => arrow.label), ['take', 'done']);
  assert.equal(part.notes.length, 1);
  assert.ok(Math.abs(part.notes[0].x1 - part.notes[0].x0 - (lock.bands[1].x1 - lock.bands[1].x0)) < 0.01);
  // 움직이는 SVG는 드러냄 창과 재생 막대를 장면 시계로 옮기고, 정지 SVG와 HTML은 다 드러난 모습에서 시작한다.
  const moving = await toSvg(result);
  assert.match(moving, /class="fl-timing-clip"[^>]*><animate attributeName="width"/);
  assert.match(moving, /fl-timing-head"[^>]*><animate attributeName="visibility"/);
  const still = await toSvg(result, { isStatic: true });
  assert.doesNotMatch(still, /<animate/);
  const html = await toHtml(result, 'timing');
  const [, end] = /class="fl-timing-clip" data-t0="0" data-t1="(\d+)"/.exec(html);
  assert.ok(Number(end) >= 800);
});

test('K-timing rows and notes that are not values or moving cards are line-numbered errors, and timing does not hide cards from the default view', async () => {
  const source = thinkflow(`
    box a "A"
    box b "B"
    grid c "C" {
      item i "I"
    }
    value n "N" from=0
    a -> b
    view timing {
      a n
      note n=1 "one"
    }
    scene "S"
      a -> b "go" set="n=1"
  `);
  const result = await build(source);
  assert.deepEqual(result.figure.views.map((view) => view.strategy), ['timing', 'graph']);
  await rejectedAt(source.replace('a n\n', 'a n c\n'), 'a n c', /timing row.*grid/);
  await rejectedAt(source.replace('a n\n', 'a n m\n'), 'a n m', /unknown value or card "m"/);
  await rejectedAt(source.replace('note n=1', 'note a=1'), 'note a=1', /card row/);
  await rejectedAt(source.replace('note n=1 "one"', 'note n=1'), 'note n=1', /note value=state "text"/);
  await rejectedAt(source.replace(/view timing \{[^}]*\}/, 'view timing'), 'view timing', /block/);
});

test('K-queue slot rows are balanced and a shorter last row is centred under the rows above', async () => {
  const { queueSlots, sizeQueue } = await import('../src/measure/queue.js');
  const rowsOf = (count) => {
    const size = sizeQueue({ label: 'q', slots: count });
    const slots = queueSlots({ x: 0, y: 0, w: size.w, h: size.h, slots: count });
    const rows = new Map();
    for (const s of slots) rows.set(s.y, [...(rows.get(s.y) ?? []), s]);
    return [...rows.values()];
  };
  assert.deepEqual(rowsOf(10).map((row) => row.length), [5, 5]);
  const [top, bottom] = rowsOf(9);
  assert.deepEqual([top.length, bottom.length], [5, 4]);
  const middle = (row) => (row[0].x + row.at(-1).x + row.at(-1).w) / 2;
  assert.ok(Math.abs(middle(top) - middle(bottom)) < 1e-9, 'the short last row is centred');
  assert.deepEqual(rowsOf(6).map((row) => row.length), [6]);
});
