// 시작 선언와 줄·낱말·이름 규칙. 공개 진입점은 buildFigure(원본) 하나이고, 거절은 줄 번호와 자리가 있는 진단으로만 본다.
// 시험 이름 첫 낱말(V1~V7)이 요구사항 번호이고, 번호와 계약의 대응은 docs/design/expression-coverage.md의 시험 번호 표에 있다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build, thinkflow, reject, stillDom, textsOf, valueOf } from './support.js';

const CARD = 'box a "A"\n';

test('V1 the first statement is thinkflow without a version or options', async () => {
  const cases = [
    [CARD, 'missing-preamble', 1, 1],
    ['', 'missing-preamble', 1, 1],
    ['# only a comment\n', 'missing-preamble', 1, 1],
    [`thinkflow 2\n${CARD}`, 'invalid-preamble', 1, 11],
    [`thinkflow extra\n${CARD}`, 'invalid-preamble', 1, 11],
    ['thinkflow\n', 'invalid-preamble', 1, 1],
    [`thinkflow\n${CARD}thinkflow\n`, 'invalid-preamble', 3, 1],
  ];
  for (const [source, code, line, column] of cases) {
    const problems = await reject(source);
    assert.equal(problems.length, 1, JSON.stringify(source));
    assert.deepEqual([problems[0].code, problems[0].line, problems[0].column], [code, line, column], JSON.stringify(source));
  }
});

test('V1 comments, blank lines, a BOM and Windows line endings may surround the first declaration', async () => {
  for (const source of [`# note\n\nthinkflow\n${CARD}`, `﻿thinkflow\n${CARD}`, `thinkflow\r\n${CARD.replace('\n', '\r\n')}`, `  thinkflow  # trailing\n${CARD}`]) {
    assert.deepEqual(textsOf(await stillDom(source)), ['A'], JSON.stringify(source));
  }
});

test('V2 no legacy adapter: old names and removed statements are plain syntax errors with no migration advice', async () => {
  const removed = [
    ['step "x"', 'unknown statement'],
    ['say a "x"', 'unknown statement'],
    ['flow right', 'unknown statement'],
    ['sequence', 'unknown statement'],
    ['speed 2', 'unknown statement'],
  ];
  for (const [line, expected] of removed) {
    const problems = await reject(`thinkflow\n${CARD}${line}\n`);
    assert.equal(problems.length, 1, line);
    assert.equal(problems[0].code, 'syntax');
    assert.equal(problems[0].line, 3, line);
    assert.equal(problems[0].column, 1, line);
    assert.ok(problems[0].message.includes(expected), problems[0].message);
  }
  for (const source of ['mutoscope 2\nbox a "A"\n', 'muto 2\nbox a "A"\n']) {
    for (const problem of await reject(source)) assert.doesNotMatch(problem.message, /migrat|convert|upgrade|renam/i);
  }
  // 글이 둘인 장면 줄은 설명 글을 받지 않는다.
  const scene = await reject(thinkflow(`${CARD}scene "name" "description"\n  a -> a\n`));
  assert.ok(scene.some((p) => p.line === 3 && p.code === 'syntax'));
});

test('V3 words are separated by spaces: "->" and "=" need the documented spacing, and options cannot repeat', async () => {
  const cases = [
    ['box a "A"\nbox b "B"\na->b\n', 4],
    ['box a "A" icon = server\n', 2],
    ['box a "A" icon=server icon=db\n', 2],
    ['box a "A" badge=api\n', 2],
    ['box a "A" badge="LB"tone=red\n', 2],
    ['box a "A"\nbox b "B"\na -> b quiet=yes\n', 4],
    ['box a ""\n', 2],
    ['box a "   "\n', 2],
    ['box a "unterminated\n', 2],
    ['box a "bad \\q escape"\n', 2],
    ['box a "A" {\n', 2],
  ];
  for (const [body, line] of cases) {
    const problems = await reject(`thinkflow\n${body}`);
    assert.ok(problems.some((p) => p.line === line && p.code === 'syntax'), `${JSON.stringify(body)} -> ${JSON.stringify(problems)}`);
  }
});

test('V3 text escapes are exactly \\" and \\\\, and quotes may hold # and unicode', async () => {
  assert.deepEqual(textsOf(await stillDom(thinkflow(`box a "say \\"hi\\" \\\\ # 한글"\n`))), ['say "hi" \\ # 한글']);
});

test('V4 header lines come first, then declarations, then scenes; going back is an error and a repeated header too', async () => {
  const cases = [
    ['box a "A"\ntitle "late"\n', 3],
    ['title "one"\ntitle "two"\nbox a "A"\n', 3],
    ['box a "A"\nscene "s" mode=static\n  light a\nbox b "B"\n', 5],
    ['subtitle "x"\ntitle "y"\nbox a "A"\npace 2s\n', 5],
  ];
  for (const [body, line] of cases) {
    const problems = await reject(`thinkflow\n${body}`);
    assert.ok(problems.some((p) => p.line === line), `${JSON.stringify(body)} -> ${JSON.stringify(problems)}`);
  }
});

test('V5 ids are lower-case words joined by single hyphens; one name space covers cards, groups and values', async () => {
  for (const id of ['A', '1a', 'a-', 'a--b', '-a', 'a_b', 'é']) {
    const problems = await reject(`thinkflow\nbox ${id} "A"\n`);
    assert.ok(problems.some((p) => p.line === 2), id);
  }
  for (const id of ['a', 'a1', 'a-b', 'a-b-2']) await build(`thinkflow\nbox ${id} "A"\n`);
  const clashes = [
    'box a "A"\nbox a "B"\n',
    'box a "A"\nvalue a "n" from=0\n',
    'box a "A"\nvalue n "n" from=0\nvalue n "m" from=1\n',
    'box a "A"\ngroup a "G" {\n  box b "B"\n}\n',
  ];
  for (const body of clashes) {
    const problems = await reject(`thinkflow\n${body}`);
    assert.ok(problems.some((p) => /already used/.test(p.message)), body);
  }
});

test('V5 statement and option words can be ids, and a second word "->" makes any first word a move source', async () => {
  const source = thinkflow(`
    box data "D"
    box scene "S"
    value n "n" on=data from=0
    table row "R" {
      id bigint pk
    }
    scene -> data
    scene "go" mode=static
      scene -> data "send" set="n+1"
  `);
  const dom = await stillDom(source);
  for (const label of ['D', 'S', 'R']) assert.ok(textsOf(dom).includes(label), label);
  assert.equal(valueOf(dom, 'n'), '1');
});

test('V6 a mistyped name reports what exists and what was meant', async () => {
  const problems = await reject(thinkflow(`box codex "Codex"\nbox engine "E"\nengine -> cdex\n`));
  const unknown = problems.find((p) => /unknown card/.test(p.message));
  assert.ok(unknown);
  assert.equal(unknown.line, 4);
  assert.match(unknown.message, /Did you mean "codex"\?/);
  assert.match(unknown.message, /Declared: codex, engine/);
});

test('V6 every independent error is reported at once, in line order, with the same five fields', async () => {
  const problems = await reject(thinkflow(`box a ""\nbox b "B" badge=toolongbadge\nstep "x"\nbox c "C" icon = server\n`));
  assert.deepEqual(problems.map((p) => p.line), [2, 3, 4, 5]);
  assert.deepEqual(problems.map((p) => p.line), [...problems.map((p) => p.line)].sort((x, y) => x - y));
  for (const problem of problems) assert.deepEqual(Object.keys(problem).sort(), ['code', 'column', 'line', 'message', 'severity']);
});

test('V6 a malformed block header or a rejected name is one error: its inner lines and its group add none', async () => {
  const cases = [
    'table users {\n  id int pk\n}\n',
    'table Bad "T" {\n  id int\n  pk (id)\n}\n',
    'table Bad "T" {\n  id int\n  unique (id)\n}\n',
    'table Bad "T" {\n  id int\n  fk (id) -> parent (id)\n}\n',
    'table users {\n  id int\n  pk (id)\n}\n',
    'api a {\n  id int\n}\n',
    'class k {\n  field n "int"\n}\n',
    'group g "G" {\n  grid Bad "x" {\n  }\n}\nbox a "A"\n',
  ];
  for (const body of cases) assert.equal((await reject(thinkflow(body))).length, 1, body);
});

test('V6 each rejection names its real cause and counts what the limit counts', async () => {
  const decimals = (value) => `chart c "T" bar {\n  x "x(u)"\n  decimals ${value}\n  series v "v"\n  row "A" v=1\n}\n`;
  await build(thinkflow(decimals('2')));
  const cases = [
    ['class k "K" abstract=yes {\n  field x "int"\n}\n', 2, /Found "abstract"/],
    ['class k "K" {\n  field x "int" static=yes\n}\n', 3, /static takes no value/],
    ['box a "A"\nscene "s" mode=once\n  light a "x"\n', 4, /"a" is a box, not a chart/],
    ['state s "S"\nvalue v "V" on=s\n', 3, /Put a value on box, external, store, person, table, api/],
    [`box a "A" badge="${'😀'.repeat(9)}"\n`, 2, /at most 8 characters\. Found 9/],
    ['box a "A"\nvalue v "V" on=a from=1000000000000000000000\n', 3, /under 1e15/],
    ...['0x2', '1e0', '2.0', '7'].map((value) => [decimals(value), 4, /whole number from 0 to 6/]),
  ];
  for (const [body, line, message] of cases) {
    const problems = await reject(thinkflow(body));
    assert.ok(problems.some((p) => p.line === line && message.test(p.message)), `${JSON.stringify(body)} -> ${JSON.stringify(problems)}`);
  }
});

test('V7 ports are card.part with exactly one dot; classes expose no ports and plain boxes have no parts', async () => {
  const base = `table t "T" {\n  id bigint pk\n}\nclass k "K" {\n  field n "int"\n}\nbox b "B"\n`;
  const cases = [
    ['b -> t.id.x\n', /card\.part/],
    ['b -> k.n\n', /not ports/],
    ['b -> b.part\n', /no parts/],
    ['b -> t.nope\n', /nope/],
  ];
  for (const [edge, message] of cases) {
    const problems = await reject(thinkflow(`${base}${edge}`));
    assert.ok(problems.some((p) => message.test(p.message)), `${edge} -> ${JSON.stringify(problems)}`);
  }
  await build(thinkflow(`${base}b -> t.id\n`));
});
