// 개발 그림 열네 가족의 독립 최소 경계: 구성도, 클래스, 순서, 상태, 추적, 큐, 칸 격자. (api, schema는 cards.test.js, flow는 values.test.js, metric은 charts.test.js, integration은 cards.test.js)
// 예제 원본은 examples.test.js가 읽는다. 시험 이름 첫 낱말(K-arch 등)이 요구사항 번호이고, 대응은 docs/design/expression-coverage.md의 시험 번호 표에 있다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIGURE_PAD } from '../src/canvas.js';
import { reflowFigure } from '../src/build.js';
import { headReach } from '../src/draw/arrow.js';
import { measure } from '../src/measure/fonts.js';
import { STYLE } from '../src/measure/texts.js';
import { values } from '../src/vendor/theme/tokens.js';
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
