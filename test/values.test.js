// 값 의미: 이동의 방향, 갱신 순서, 사라짐, 동시 이동, 대기와 예약. 모두 공개 출력(장면의 멈춘 SVG에 보이는 값 줄)으로 확인한다.
// 시험 이름 첫 낱말(E1~E18)이 요구사항 번호이고, 번호와 계약의 대응은 docs/design/expression-coverage.md의 시험 번호 표에 있다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build, thinkflow, finalValue, lineOf, reject } from './support.js';

const BASE = `
  box a "A"
  box b "B"
  box c "C"
  value n "n" on=b from=0
  a -> b
  c -> b
`;
/** 장면 하나(`mode`는 기본 static)에 박자 줄들을 단 원본. */
const one = (moves, head = BASE, mode = 'static') => thinkflow(`${head}\nscene "s" mode=${mode}\n${moves.map((m) => `  ${m}`).join('\n')}\n`);
/** 줄 번호가 `needle`을 가진 줄의 것인 진단이 있어야 한다. */
const atLine = (problems, source, needle) => problems.some((p) => p.line === lineOf(source, needle));

test('E1 a move applies its set on arrival at the destination, not at departure or at the origin', async () => {
  assert.equal(await finalValue(one(['a -> b set="n+1"']), 'n'), '1');
  assert.equal(await finalValue(one(['a -> b set="n+5@b"']), 'n'), '5');
  assert.equal(await finalValue(one(['a -> b']), 'n'), '0');
  // on 줄은 어떤 점이든 그 카드에 닿을 때 적용한다. 출발 카드는 닿는 것이 아니다.
  const origin = `${BASE}\n  value k "k" on=a from=0\n  on a k+1`;
  assert.equal(await finalValue(one(['a -> b'], origin), 'k'), '0');
  assert.equal(await finalValue(one(['b -> a'], origin), 'k'), '1');
});

test('E2 a move against the declared edge direction follows the edge backwards and still arrives at its own destination', async () => {
  const reverse = thinkflow(`
    box a "A"
    box b "B"
    value n "n" on=b from=0
    value k "k" on=a from=0
    b -> a
    scene "s" mode=static
      a -> b set="n+1"
      b -> a set="k+1"
  `);
  assert.equal(await finalValue(reverse, 'n'), '1');
  assert.equal(await finalValue(reverse, 'k'), '1');
});

test('E2 a move needs a card and an edge: a missing edge and an unknown card are located errors', async () => {
  const none = thinkflow(`box a "A"\nbox b "B"\nbox c "C"\na -> b\nscene "s" mode=static\n  a -> c\n`);
  assert.ok((await reject(none)).some((p) => p.line === lineOf(none, 'a -> c') && /no edge between "a" and "c"/.test(p.message)));
  const unknown = thinkflow(`box a "A"\nbox b "B"\na -> b\nscene "s" mode=static\n  a -> zz\n`);
  assert.ok((await reject(unknown)).some((p) => p.line === lineOf(unknown, 'a -> zz') && /unknown card/.test(p.message)));
});

test('E3 at one instant every on-line applies before any set=, and a later set sees the on-line result', async () => {
  const head = `${BASE}\n  on b n=7`;
  assert.equal(await finalValue(one(['a -> b set="n+1"'], head), 'n'), '8');
  assert.equal(await finalValue(one(['a -> b set="n=5"'], head), 'n'), '5');
});

test('E4 a read expression takes the value from the start of its update, so := swaps', async () => {
  const swap = thinkflow(`
    box a "A"
    box b "B"
    value x "x" on=a from=1
    value y "y" on=b from=2
    a -> b
    scene "s" mode=static
      a -> b set="x:=y, y:=x"
  `);
  assert.equal(await finalValue(swap, 'x'), '2');
  assert.equal(await finalValue(swap, 'y'), '1');
});

test('E5 values restart from "from" in each scene; keep carries them; a scene set= wins over keep and over from', async () => {
  const doc = (second) => thinkflow(`${BASE}\nscene "one" mode=static\n  a -> b set="n+1"\nscene "two" mode=static${second}\n  a -> b set="n+1"\n`);
  assert.equal(await finalValue(doc(''), 'n', 0), '1');
  assert.equal(await finalValue(doc(''), 'n', 1), '1');
  assert.equal(await finalValue(doc(' keep="n"'), 'n', 1), '2');
  assert.equal(await finalValue(doc(' keep="n" set="n=10"'), 'n', 1), '11');
  assert.equal(await finalValue(doc(' set="n=10"'), 'n', 1), '11');
});

test('E5 keep lists plain values only: unknown, repeated and reference values and a keep on the first scene are located errors', async () => {
  const ref = `${BASE}\n  value r "r" on=a ref=n`;
  const second = (head, keep) => thinkflow(`${head}\nscene "one" mode=static\n  a -> b\nscene "two" mode=static keep="${keep}"\n  a -> b\n`);
  for (const source of [second(BASE, 'zz'), second(BASE, 'n, n'), second(ref, 'r')]) {
    assert.ok(atLine(await reject(source), source, 'keep='), source);
  }
  const first = thinkflow(`${BASE}\nscene "one" mode=static keep="n"\n  a -> b\n`);
  assert.ok(atLine(await reject(first), first, 'keep='));
});

test('E6 a reference value follows the value it points at, including references of references', async () => {
  const doc = thinkflow(`${BASE}\nvalue r "r" on=a ref=n\nvalue s "s" on=c ref=r\nscene "s" mode=static\n  a -> b set="n+3"\n`);
  assert.equal(await finalValue(doc, 'r'), '3');
  assert.equal(await finalValue(doc, 's'), '3');
  for (const bad of ['value r "r" on=a ref=r', 'value r "r" on=a ref=zz', 'value r "r" on=a ref=n from=1']) {
    const source = thinkflow(`${BASE}\n${bad}\n`);
    assert.ok(atLine(await reject(source), source, bad), bad);
  }
});

test('E7 a queue counts through its own name and is observable through a referencing value', async () => {
  const doc = thinkflow(`
    box a "A"
    queue q "Q" slots=4 from=1
    value len "len" on=a ref=q
    a -> q
    scene "s" mode=static
      a -> q set="q+2"
      a -> q set="q-1"
  `);
  assert.equal(await finalValue(doc, 'len'), '2');
  // 같은 시각에 넘쳤다가 돌아오는 값은 보이지 않으므로 칸 수 경고도 없다
  const over = thinkflow('box a "A"\nqueue q "Q" slots=2 from=2\na -> q\nscene "s" mode=once\n  a -> q time=500ms set="q+1, q-1"\n');
  assert.deepEqual((await build(over, { strict: false })).warnings, []);
  for (const bad of ['queue q "Q" slots=0', 'queue q "Q" slots=33', 'queue q "Q" slots=2.5', 'queue q "Q" slots=2 from=3', 'queue q "Q"']) {
    const source = thinkflow(`${bad}\n`);
    assert.ok(atLine(await reject(source), source, bad), bad);
  }
});

test('E8 lost: the effect of a destination the dot never reaches is not applied, earlier stops are', async () => {
  const head = `
    box a "A"
    box b "B"
    box c "C"
    value n "n" on=b from=0
    value m "m" on=c from=0
    a -> b
    b -> c
  `;
  const track = (extra) => thinkflow(`${head}\nscene "s" mode=static for=6s\n  track a -> b -> c at=0s time=2s ${extra}\n`);
  assert.equal(await finalValue(track('set="m+1"'), 'm'), '1');
  assert.equal(await finalValue(track('lost=100% set="m+1"'), 'm'), '0');
  assert.equal(await finalValue(track('lost=100% set="n+1@b"'), 'n'), '1');
  assert.equal(await finalValue(track('lost=0% set="n+1@b"'), 'n'), '0');
  assert.equal(await finalValue(one(['a -> b lost=100% set="n+1"']), 'n'), '0');
  for (const bad of ['lost=101%', 'lost=-1%', 'lost=60', 'lost=%']) {
    const source = track(bad);
    assert.ok(atLine(await reject(source), source, bad), bad);
  }
});

test('E9 parallel moves of one beat: the later arrival wins, equal arrivals go in declaration order', async () => {
  const equal = (first, second) => one([`a -> b time=1s set="n=${first}" & c -> b time=1s set="n=${second}"`]);
  assert.equal(await finalValue(equal(1, 2), 'n'), '2');
  assert.equal(await finalValue(equal(2, 1), 'n'), '1');
  const staggered = (first, second) => one([`a -> b time=2s set="n=${first}" & c -> b time=1s set="n=${second}"`]);
  assert.equal(await finalValue(staggered(1, 2), 'n'), '1');
  assert.equal(await finalValue(staggered(2, 1), 'n'), '2');
});

test('E9 updates of one instant show as the last text of that instant; a return to the earlier text is no change and no pulse', async () => {
  const seen = async (exprs) => {
    const { timeline } = await build(one([`a -> b time=500ms set="${exprs}"`], BASE, 'once'));
    return { changes: timeline.values.find((row) => row.id === 'n').changes, hasPulse: timeline.pulses.some((pulse) => pulse.key.startsWith('value:')) };
  };
  assert.deepEqual(await seen('n+1, n-1'), { changes: [], hasPulse: false });
  assert.deepEqual(await seen('n+1, n+1, n-1'), { changes: [[500, '1']], hasPulse: true });
  assert.deepEqual(await seen('n=7, n=3'), { changes: [[500, '3']], hasPulse: true });
});

test('E10 a flow with every= departs repeatedly; only dots that arrive before the scene ends change the value', async () => {
  const flow = (length) => thinkflow(`${BASE}\nscene "s" mode=static for=${length}\n  track a -> b at=0s every=1s time=500ms set="n+1"\n`);
  assert.equal(await finalValue(flow('3s'), 'n'), '3');
  assert.equal(await finalValue(flow('2.2s'), 'n'), '2');
  // 흐름도 같은 시각의 갱신은 마지막 글 하나로 보이고, 조건이 있는 흐름(이벤트 처리기)도 같다
  const returned = async (condition) => (await build(thinkflow(`${BASE}\nscene "s" mode=once for=2s\n  track a -> b at=0s time=500ms ${condition} set="n+1, n-1"\n`))).timeline.values.find((row) => row.id === 'n').changes;
  assert.deepEqual(await returned(''), []);
  assert.deepEqual(await returned('wait="n=0"'), []);
});

test('E11 when: a false condition skips the move completely, a true one runs it', async () => {
  const gated = (condition) => one([`a -> b when="${condition}" set="n+1"`]);
  assert.equal(await finalValue(gated('n=1'), 'n'), '0');
  assert.equal(await finalValue(gated('n=0'), 'n'), '1');
  assert.equal(await finalValue(gated('n!=0 || n<1'), 'n'), '1');
  assert.equal(await finalValue(gated('!(n=0)'), 'n'), '0');
});

/** 시퀀스 보기를 더한 원본. `fragment`는 순서 보기가 있어야 쓴다. */
const sequenced = (moves) => thinkflow(`${BASE}\nview graph\nview sequence "S" {\n  a b\n}\nscene "s" mode=once\n${moves}`);

test('E11 inside a fragment a value changes when each repetition arrives, a message takes the time it takes outside, and when, wait and reserve are line errors', async () => {
  const loop = await build(sequenced('  fragment loop "L" times=3 {\n    a -> b "x" time=500ms set="n+1"\n  }\n'));
  assert.deepEqual(loop.timeline.values.find((row) => row.id === 'n').changes, [[500, '1'], [1000, '2'], [1500, '3']]);
  const same = await build(sequenced('  a -> b "x"\n  fragment loop "L" times=1 {\n    a -> b "x"\n  }\n'));
  const [outside, inside] = same.timeline.segs.map((seg) => seg.hops[0].ms);
  assert.equal(inside, outside);
  for (const option of ['when="n<0"', 'wait="n=0"', 'reserve="n+1"']) {
    const direct = sequenced(`  fragment loop "L" times=2 {\n    a -> b "x" ${option}\n  }\n`);
    const nested = sequenced(`  fragment alt "A" choose="p" {\n    branch "p" {\n      fragment opt "O" run=on {\n        a -> b "x" ${option}\n      }\n    }\n    branch "q" {\n      a -> b "y"\n    }\n  }\n`);
    for (const source of [direct, nested]) {
      const problems = await reject(source);
      assert.ok(problems.some((p) => p.line === lineOf(source, option) && /cannot be used inside a fragment/.test(p.message)), `${option}: ${JSON.stringify(problems)}`);
    }
  }
});

/** 잠금 한 칸과 요청 둘. `seen`은 `lock`에 닿은 점 수를 센다. */
const lockDoc = (moves, { holder = 'A', length = '6s' } = {}) => thinkflow(`
  box a "A"
  box b "B"
  box lock "L"
  box x "X"
  value holder "holder" on=lock from=${holder}
  value seen "seen" on=x from=0
  a -> lock
  b -> lock
  b -> x
  on lock seen+1
  scene "s" mode=static for=${length}
${moves.map((m) => `    ${m}`).join('\n')}
`);

test('E12 wait holds the dot until the condition is true, and the released dot then arrives', async () => {
  const released = lockDoc([
    'track a -> lock at=0s time=1s set="holder=none"',
    `track b -> lock at=0s time=1s wait="holder='none'" set="holder=B"`,
  ]);
  assert.equal(await finalValue(released, 'holder'), 'B');
  const never = lockDoc([`track b -> lock at=0s time=1s wait="holder='none'" stuck set="holder=B"`]);
  assert.equal(await finalValue(never, 'holder'), 'A');
});

test('E12 timeout ends a wait; else= sends the dot to the fallback, without else the dot is never made', async () => {
  const request = (extra) => lockDoc([`track b -> lock at=0s time=1s wait="holder='none'" timeout=2s ${extra} set="holder=B"`]);
  assert.equal(await finalValue(request('else=x'), 'seen'), '0', 'seen counts arrivals at lock, the fallback goes to x');
  const fallback = lockDoc([`track b -> lock at=0s time=1s wait="holder='none'" timeout=2s else=x set="holder=B"`]).replace('on lock seen+1', 'on x seen+1');
  assert.equal(await finalValue(fallback, 'seen'), '1');
  assert.equal(await finalValue(fallback, 'holder'), 'A');
  const plain = lockDoc([`track b -> lock at=0s time=1s wait="holder='none'" timeout=2s set="holder=B"`]).replace('on lock seen+1', 'on x seen+1');
  assert.equal(await finalValue(plain, 'seen'), '0');
  assert.equal(await finalValue(plain, 'holder'), 'A');
});

test('E12 a release at exactly the timeout instant wins over the timeout (release by an arrival update)', async () => {
  const doc = lockDoc([
    'track a -> lock at=0s time=1s set="holder=none"',
    `track b -> lock at=0s time=1s wait="holder='none'" timeout=1s set="holder=B"`,
  ]);
  assert.equal(await finalValue(doc, 'holder'), 'B');
});

test('E12 #173 a release made by a departing dot at the timeout instant also wins (set to the origin, and reserve)', async () => {
  const waiter = `track b -> lock at=0s time=1s wait="holder='none'" timeout=1s set="holder=B"`;
  const viaSet = lockDoc([`track a -> lock at=1s time=1s set="holder=none@a"`, waiter]);
  assert.equal(await finalValue(viaSet, 'holder'), 'B', 'set=…@origin at the same instant');
  const viaReserve = lockDoc([`track a -> lock at=1s time=1s reserve="holder=none"`, waiter]);
  assert.equal(await finalValue(viaReserve, 'holder'), 'B', 'reserve= at the same instant');
  // 1ms 앞서 풀리면 풀림이 이기고, 1ms 늦게 풀리면 시간 초과가 이긴다
  const early = lockDoc([`track a -> lock at=999ms time=1s reserve="holder=none"`, waiter]);
  assert.equal(await finalValue(early, 'holder'), 'B');
  const late = lockDoc([`track a -> lock at=1001ms time=1s reserve="holder=none"`, waiter]);
  assert.equal(await finalValue(late, 'holder'), 'none');
});

test('E13 a wait that can never end is a warning, and stuck says it is meant', async () => {
  const stalled = (extra) => thinkflow(`box a "A"\nbox b "B"\nvalue h "h" on=b from=A\na -> b\nscene "s" mode=static\n  a -> b wait="h='none'" ${extra}\n`);
  const warned = await build(stalled(''), { strict: false });
  assert.deepEqual(warned.warnings.map((w) => [w.code, w.severity]), [['wait-stalled', 'warning']]);
  assert.equal(warned.warnings[0].line, lineOf(stalled(''), 'wait='));
  assert.deepEqual((await build(stalled('stuck'), { strict: false })).warnings, []);
  await reject(stalled(''));
});

test('E14 reserve lets one of two same-instant requests through, in declaration order; plain wait+set lets both', async () => {
  const request = (who, extra) => `track ${who.toLowerCase()} -> lock at=0s time=1s wait="holder='none'" timeout=1s ${extra}`;
  const reserved = (first, second) => lockDoc([request(first, `reserve="holder=${first}"`), request(second, `reserve="holder=${second}"`)], { holder: 'none' });
  assert.equal(await finalValue(reserved('A', 'B'), 'seen'), '1');
  assert.equal(await finalValue(reserved('A', 'B'), 'holder'), 'A');
  assert.equal(await finalValue(reserved('B', 'A'), 'holder'), 'B');
  const plain = lockDoc([request('A', 'set="holder=A"'), request('B', 'set="holder=B"')], { holder: 'none' });
  assert.equal(await finalValue(plain, 'seen'), '2');
});

test('E14 a reserve takes effect at departure and is not returned when the dot is lost or never leaves', async () => {
  const doc = (extra, wait = '') => lockDoc([`track a -> lock at=0s time=1s ${wait} reserve="holder=A" ${extra}`], { holder: 'none' });
  assert.equal(await finalValue(doc(''), 'holder'), 'A');
  assert.equal(await finalValue(doc('lost=0%'), 'holder'), 'A');
  assert.equal(await finalValue(doc('', `wait="holder='zz'" timeout=1s`), 'holder'), 'none');
});

test('E14 a reserve and an update at one instant that end on the earlier text are no change', async () => {
  const doc = lockDoc(['track a -> lock at=0s time=1s reserve="holder=none" set="holder=A@a"']);
  const { timeline } = await build(doc);
  assert.deepEqual(timeline.values.find((row) => row.id === 'holder').changes, []);
});

test('E14 a reserve is all-or-nothing: an expression that cannot run at departure fails the build at that line', async () => {
  const doc = thinkflow(`
    box a "A"
    box b "B"
    queue q "Q" slots=4
    value n "n" on=b from=0
    value w "w" on=b from=none
    a -> b
    a -> q
    scene "s" mode=static
      a -> b reserve="n+1, q:=w"
  `);
  const problems = await reject(doc);
  assert.ok(problems.some((p) => p.code === 'value-type' && p.line === lineOf(doc, 'reserve=')), JSON.stringify(problems));
});

test('E15 conditions compare like with like; number against word, an unknown value and a constant comparison are located errors', async () => {
  const bad = ["n='x'", 'q=1', '1=1', "n<'x'", 'n=', `n=${'1'.repeat(250)}`];
  for (const condition of bad) {
    const source = one([`a -> b when="${condition}"`]);
    assert.ok(atLine(await reject(source), source, 'when='), condition);
  }
});

test('E16 the event budget ends a runaway chain with budget-exceeded, and raising it lets the same source build', async () => {
  const doc = lockDoc(['track a -> lock at=0s every=100ms time=50ms wait="holder=\'A\'" set="seen+1"'], { length: '4s' });
  assert.ok((await reject(doc, { budget: { events: 20 } })).some((p) => p.code === 'budget-exceeded'));
  await build(doc);
});

test('E17 numbers in value expressions are finite and under 1e15 in magnitude', async () => {
  const set = (expr) => one([`a -> b set="${expr}"`]);
  assert.equal(await finalValue(set('n+999999999999999'), 'n'), '999999999999999');
  for (const bad of ['n+1000000000000000', 'n+1e3', 'n+1,5', 'n+0x10', `n+${'9'.repeat(400)}`, 'n++1', 'n*2', 'n+']) {
    assert.ok(atLine(await reject(set(bad)), set(bad), 'set='), bad);
  }
  // 합의 결과도 같은 범위다. 넘으면 정밀도를 잃은 글을 만들지 않고 그 식 줄의 value-type 오류다.
  const high = BASE.replace('from=0', 'from=999999999999999');
  for (const [head, expr] of [[high, 'n+1'], [BASE.replace('from=0', 'from=-999999999999999'), 'n-1'], [high, 'n+999999999999999, n-999999999999999']]) {
    const source = one([`a -> b set="${expr}"`], head);
    const problems = await reject(source);
    assert.ok(problems.some((p) => p.code === 'value-type' && p.line === lineOf(source, 'set=')), `${expr}: ${JSON.stringify(problems)}`);
  }
});

test('E18 a document without scenes shows the declared start values', async () => {
  const doc = thinkflow(`box a "A"\nvalue n "n" on=a from=37\nvalue w "w" on=a from=idle\n`);
  assert.equal(await finalValue(doc, 'n'), '37');
  assert.equal(await finalValue(doc, 'w'), 'idle');
});
