// 표본 추출기(src/player/sample.js)의 계약. 장면과 시각을 주면 그 순간의 모습을 돌려주는 순수 함수 하나를 한 번만 본다. 종류마다 되풀이하지 않는다.
// 시험은 공개 진입점(buildFigure -> toHtml)이 HTML에 싣는 재생 데이터를 읽고, 바뀌지 않은 curve.js와 sample.js를 격리 컨텍스트(node:vm)에 불러 실제 buildScenes와 sampleScene에 먹인다.
// 기대값은 최소 원본의 사건(이동 시각, 값 변화, 장면 길이)에서 따로 셈한다. 비공개 기록의 모양을 굳히지 않고 보이는 의미(선이 켜졌는가, 후광이 있는가, 보일 글)만 비교한다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { build, thinkflow, findAll, parseMarkup, textContent, toHtml } from './support.js';

const playerFile = (name) => readFileSync(new URL(`../src/player/${name}.js`, import.meta.url), 'utf8');
const CARRIED = /figurePlay\(document\.querySelector\('\.fl-figure'\), (\{.*\})\);\s*$/s;

/**
 * 원본을 HTML 재생기 문서로 만들고 재생기에 넘기는 재생 데이터를 꺼낸다. 표본 추출기는 curve.js와 sample.js만 격리 컨텍스트에 올려 쓴다(DOM, 시계, 난수가 없다).
 * sample은 한 번 만든 사건 모델을 계속 쓰고, fresh는 부를 때마다 모델을 새로 만든다. 돌려주는 모습은 컨텍스트 밖의 평범한 값이다.
 */
async function player(source) {
  const dom = parseMarkup(await toHtml(await build(source), 'sampler'), { html: true });
  const script = findAll(dom, (n) => n.tag === 'script' && n.attrs.type === undefined).map(textContent).at(-1);
  const carried = CARRIED.exec(script);
  assert.ok(carried, 'the page script ends with the playback data');
  const data = JSON.parse(carried[1]);
  const context = vm.createContext({});
  vm.runInContext(`${playerFile('curve')}\n${playerFile('sample')}`, context, { filename: 'player/curve.js+sample.js' });
  const plain = (frame) => JSON.parse(JSON.stringify(frame));
  const scenes = context.buildScenes(data);
  return {
    data,
    pulse: data.metrics.pulse,
    total: (si) => data.presentation[si],
    sample: (si, elapsed, settled) => plain(context.sampleScene(scenes[si], data, elapsed, settled)),
    fresh: (si, elapsed, settled) => plain(context.sampleScene(context.buildScenes(data)[si], data, elapsed, settled)),
    // 선 위 글(label)이 붙은 선 번호. 같은 물리 선은 이동 방향과 상관없이 한 번호다.
    edgeOf: (label) => {
      const pills = findAll(dom, (n) => n.tag === 'g' && /^l-\d+$/.test(n.attrs.id ?? '') && textContent(n) === label);
      assert.ok(pills.length > 0, `no edge label "${label}"`);
      return pills[0].attrs.id.slice(2);
    },
  };
}

const activeEdges = (frame) => Object.entries(frame.edges).filter(([, edge]) => edge.active).map(([key]) => key);
const hasKey = (frame, prefix) => Object.keys(frame.pulses).some((key) => key.startsWith(prefix));
/** 0부터 end까지 step ms 간격(end 포함)의 표시 시각. */
const upTo = (end, step) => [...Array.from({ length: Math.floor(end / step) }, (_, i) => i * step), end];

test('Q1 a frame depends only on the scene and the time: any order of earlier samples gives what a fresh model gives', async () => {
  const mixed = await player(thinkflow(`
    box a "A"
    box b "B"
    box c "C"
    value n "n" on=c from=0
    a -> b "x"
    b -> c "y"
    scene "loop" mode=loop
      a -> b time=1s set="n+1"
      b -> c time=1s set="n+1"
      light c
    scene "flow" mode=once speed=2 for=3s
      track a -> b -> c at=0s every=1s time=1s set="n+1"
  `));
  assert.equal(mixed.data.steps.length, 2);
  for (const si of [0, 1]) {
    const total = mixed.total(si);
    const elapsed = [...upTo(2 * total, 53), total - 1, total, total + 1, 123.456, 0.5];
    // 정해진 규칙으로 섞은 순서(난수를 쓰지 않는다)
    const order = elapsed.map((time, i) => [(i * 7919) % 1009, time]).sort((a, b) => a[0] - b[0]).map(([, time]) => time);
    const expected = new Map(elapsed.map((time) => [time, [false, true].map((settled) => mixed.fresh(si, time, settled))]));
    for (const pass of [order, [...order].reverse(), order]) {
      for (const time of pass) {
        const [live, settled] = [false, true].map((isSettled) => mixed.sample(si, time, isSettled));
        assert.deepEqual([live, settled], expected.get(time), `scene ${si} at ${time}`);
      }
    }
  }
});

test('Q2 static is always the last frame, once holds it from the scene length on, loop starts over every length, and settled is the last frame in every mode', async () => {
  const modes = ['static', 'once', 'loop'];
  const doc = await player(thinkflow(`
    box a "A"
    box b "B"
    value n "n" on=b from=0
    a -> b
    ${modes.map((mode) => `scene "${mode}" mode=${mode}\n      a -> b time=1s set="n+1"`).join('\n    ')}
  `));
  // 각 장면은 1s 이동 하나이고 도착(1000ms)에 값이 1이 된다. 효과 꼬리는 400ms라 표시 길이는 1400ms다.
  const total = 1400;
  assert.deepEqual(modes.map((_, si) => doc.total(si)), [total, total, total]);
  const rest = (frame) => ({ edges: frame.edges, pulses: frame.pulses, held: frame.held, values: frame.values.filter((value) => value !== null) });
  const last = { edges: {}, pulses: {}, held: { edges: [], lit: [], parts: [], lights: {} }, values: ['1'] };
  const first = doc.sample(2, 0);
  assert.deepEqual([first.phase, first.d, activeEdges(first), rest(first).values], ['play', 0, ['0'], ['0']]);
  for (const elapsed of [0, 700, total - 1, total, total + 1, 3 * total]) {
    const frame = doc.sample(0, elapsed);
    assert.deepEqual([frame.phase, frame.d, rest(frame)], ['final', total, last], `static at ${elapsed}`);
  }
  assert.equal(doc.sample(1, total - 1).phase, 'play');
  for (const elapsed of [total, total + 1, 3 * total]) {
    const frame = doc.sample(1, elapsed);
    assert.deepEqual([frame.phase, frame.d, rest(frame)], ['final', total, last], `once at ${elapsed}`);
  }
  // 반복: 한 바퀴가 끝나는 순간은 다음 바퀴의 처음이고, 한 바퀴 뒤는 같은 시각의 같은 모습이다.
  assert.deepEqual(doc.sample(2, total), doc.sample(2, 0));
  assert.deepEqual(doc.sample(2, total + 700), doc.sample(2, 700));
  assert.deepEqual(doc.sample(2, 3 * total - 1), doc.sample(2, total - 1));
  assert.equal(doc.sample(2, total - 1).phase, 'play');
  // 움직임 줄이기와 한 번 장면이 끝나 멈춘 때: 방식과 시각에 상관없이 마지막 모습이다.
  for (const si of [0, 1, 2]) {
    for (const elapsed of [0, 700, total, 3 * total]) {
      const frame = doc.sample(si, elapsed, true);
      assert.deepEqual([frame.phase, frame.d, rest(frame)], ['final', total, last], `settled ${modes[si]} at ${elapsed}`);
    }
  }
});

test('Q3 a dot leaving a line at the instant another enters it never turns the line off or restarts its pill', async () => {
  // 1s 이동이 1s마다 이어 선 하나에 닿아 있는 구간은 [0, 3000)ms 하나다. 앞 점이 나가는 시각(1000, 2000)에 다음 점이 들어선다.
  const flows = (speed) => thinkflow(`
    box a "A"
    box b "B"
    a -> b
    scene "s" mode=once speed=${speed} for=3s
      track a -> b at=0s every=1s time=1s
  `);
  const beats = thinkflow(`
    box a "A"
    box b "B"
    a -> b
    scene "s" mode=once
      a -> b time=1s
      a -> b time=1s
      a -> b time=1s
  `);
  const cases = [[await player(flows(1)), 1], [await player(flows(3)), 3], [await player(beats), 1]];
  for (const [doc, speed] of cases) {
    const { fadeMs } = doc.pulse;
    const logicalEnd = 3000;
    const around = [1000, 2000].flatMap((boundary) => [-2, -0.5, -0.001, 0, 0.001, 0.5, 2].map((offset) => (boundary + offset * speed) / speed));
    for (const display of [...upTo(logicalEnd / speed, 25), ...around]) {
      const logical = display * speed;
      const frame = doc.sample(0, display);
      if (logical < logicalEnd - 1e-6) {
        assert.deepEqual([activeEdges(frame), frame.edges[0].pill], [['0'], 1], `speed ${speed}, logical ${logical}`);
      }
    }
    // 마지막 점이 나간 뒤에만 꺼지고, 알약은 그때부터 fadeMs 동안 1에서 0으로 준다.
    const gone = doc.sample(0, logicalEnd / speed);
    assert.deepEqual([activeEdges(gone), gone.edges[0].pill], [[], 1]);
    const half = doc.sample(0, logicalEnd / speed + fadeMs / 2);
    assert.ok(Math.abs(half.edges[0].pill - 0.5) < 1e-9, String(half.edges[0].pill));
    assert.equal(doc.sample(0, logicalEnd / speed + fadeMs).edges[0], undefined);
  }
});

test('Q4 a move against the declared direction runs on the same physical line, so the same label stays lit', async () => {
  const doc = await player(thinkflow(`
    box a "A"
    box b "B"
    box c "C"
    a -> b "wire"
    b -> c "other"
    scene "s" mode=once
      a -> b time=1s
      b -> a time=1s
      c -> b time=1s
  `));
  const [wire, other] = [doc.edgeOf('wire'), doc.edgeOf('other')];
  assert.notEqual(wire, other);
  // 박자 하나는 1000ms: 선언한 방향, 거꾸로, 다른 선을 거꾸로.
  for (const [beat, expected] of [[0, wire], [1, wire], [2, other]]) {
    for (const offset of [100, 500, 900]) {
      const frame = doc.sample(0, beat * 1000 + offset);
      assert.deepEqual(activeEdges(frame), [expected], `beat ${beat} +${offset}`);
      assert.equal(frame.edges[expected].pill, 1);
    }
  }
  // 선언한 방향의 점이 나가는 시각에 거꾸로 가는 점이 들어서도 같은 선은 이어서 켜져 있다.
  for (const time of [999.999, 1000, 1000.001]) assert.deepEqual(activeEdges(doc.sample(0, time)), [wire], String(time));
  // 점이 떠난 wire의 알약은 다른 선이 켜져 있는 동안 줄어들어 fadeMs 뒤에 사라진다.
  assert.equal(doc.sample(0, 2000 + doc.pulse.fadeMs).edges[wire], undefined);
});

test('Q5 a packet lost before its destination gives that destination no halo and no value change, while earlier stops still do', async () => {
  const head = `
    box a "A"
    box b "B"
    box c "C"
    value n "n" on=b from=0
    value m "m" on=c from=0
    a -> b
    b -> c
  `;
  const flow = (extra) => player(thinkflow(`${head}\nscene "s" mode=once for=6s\n  track a -> b -> c at=0s time=2s ${extra}\n`));
  const beat = (extra) => player(thinkflow(`${head}\nscene "s" mode=once\n  a -> b time=1s ${extra}\n`));
  const seen = (doc, key) => upTo(doc.total(0), 10).map((time) => doc.sample(0, time)).filter((frame) => key(frame));
  const [delivered, lost] = [await flow('set="m+1"'), await flow('lost=100% set="m+1"')];
  // 배달된 점은 c에 닿는 2000ms에 값을 바꾸고 c와 값 줄에 후광(올라감 뒤 유지에서 1)을 낸다.
  const hold = 2000 + delivered.pulse.riseMs + delivered.pulse.holdMs / 2;
  assert.equal(delivered.sample(0, hold).pulses['node:c'], 1);
  assert.equal(hasKey(delivered.sample(0, hold), 'value:'), true);
  assert.equal(delivered.sample(0, hold).values.at(-1), '1');
  // 잃은 점은 c에 닿지 못한다: c의 후광도 값 후광도 없고 값은 처음 그대로다. 앞서 선 b에는 닿았다.
  assert.equal(seen(lost, (frame) => 'node:c' in frame.pulses).length, 0);
  assert.equal(seen(lost, (frame) => hasKey(frame, 'value:')).length, 0);
  assert.ok(seen(lost, (frame) => 'node:b' in frame.pulses).length > 0);
  assert.deepEqual([lost.sample(0, 1500).values, lost.sample(0, lost.total(0)).values], [['0', '0'], ['0', '0']]);
  // 한 박자의 이동도 같다.
  const single = await beat('lost=100% set="n+1"');
  assert.equal(seen(single, (frame) => 'node:b' in frame.pulses || hasKey(frame, 'value:')).length, 0);
  assert.equal(single.sample(0, single.total(0)).values[0], '0');
  assert.ok(seen(await beat('set="n+1"'), (frame) => 'node:b' in frame.pulses && hasKey(frame, 'value:')).length > 0);
});

test('Q6 a value whose net change is nothing gets no value halo, while the arrival and a real change still do', async () => {
  const head = `
    box a "A"
    box b "B"
    box c "C"
    value n "n" on=b from=0
    a -> b
    c -> b
  `;
  const run = (moves) => player(thinkflow(`${head}\nscene "s" mode=once\n${moves.map((move) => `  ${move}`).join('\n')}\n`));
  const unchanged = {
    'set to the value it has': 'a -> b time=1s set="n=0"',
    'plus then minus in one update': 'a -> b time=1s set="n+1, n-1"',
    'two arrivals of the same instant cancel': 'a -> b time=1s set="n+1" & c -> b time=1s set="n-1"',
  };
  for (const [name, move] of Object.entries(unchanged)) {
    const doc = await run([move]);
    const frames = upTo(doc.total(0), 10).map((time) => doc.sample(0, time));
    assert.equal(frames.filter((frame) => hasKey(frame, 'value:')).length, 0, name);
    assert.ok(frames.some((frame) => frame.pulses['node:b'] === 1), `${name}: the dot still arrives at b`);
    assert.ok(frames.every((frame) => frame.values.filter((value) => value !== null).every((value) => value === '0')), name);
  }
  const changed = await run(['a -> b time=1s set="n+1"']);
  const frames = upTo(changed.total(0), 10).map((time) => changed.sample(0, time));
  assert.ok(frames.some((frame) => hasKey(frame, 'value:')));
  assert.equal(changed.sample(0, 999).values[0], '0');
  assert.equal(changed.sample(0, 1000).values[0], '1');
});

test('Q7 the last frame keeps the logical end of the scene even when the rounded display length falls a hair short of it', async () => {
  // 논리 길이 9000ms, 이동 1s, 멈춤 8s, 마지막은 길이 0인 `light b`. 표시 길이는 마지막 사건의 꼬리 없이 (논리 길이 ÷ 속도)를 소수 셋째 자리로 줄인 값이다.
  const doc = await player(thinkflow(`
    box a "A"
    box b "B"
    a -> b
    ${['static', 'once', 'loop'].map((mode) => `scene "${mode}" mode=${mode} speed=7\n      a -> b time=1s\n      wait 8s\n      light b`).join('\n    ')}
  `));
  const logicalEnd = 9000;
  for (const si of [0, 1, 2]) assert.ok(doc.total(si) * 7 < logicalEnd, `display length ${doc.total(si)} x 7 is short of ${logicalEnd}`);
  const finals = [doc.sample(0, 0), doc.sample(1, doc.total(1)), doc.sample(2, 0, true), doc.sample(1, 0, true), doc.sample(1, 5 * doc.total(1))];
  for (const frame of finals) {
    assert.deepEqual([frame.phase, frame.held.lit, activeEdges(frame)], ['final', ['b'], []], `scene ${frame.si}`);
  }
  // 끝 직전의 표시 시각에는 아직 켜지지 않는다. 켜짐은 논리 끝의 길이 0 박자에 있다.
  assert.deepEqual(doc.sample(1, doc.total(1) - 1).held.lit, []);
});

test('Q8 the last frame is at rest: no halo and no line pill is left over, at any speed', async () => {
  const left = [];
  for (const speed of [1, 3, 0.7]) {
    const doc = await player(thinkflow(`
      box a "A"
      box b "B"
      value n "n" on=b from=0
      a -> b
      scene "once" mode=once speed=${speed} for=10s
        track a -> b at=9s time=1s set="n+1"
      scene "static" mode=static speed=${speed} for=10s
        track a -> b at=9s time=1s set="n+1"
    `));
    for (const [si, elapsed, settled] of [[0, doc.total(0), false], [0, 0, true], [1, 0, false]]) {
      const frame = doc.sample(si, elapsed, settled);
      assert.equal(frame.phase, 'final');
      assert.equal(frame.values.filter((value) => value !== null).at(-1), '1');
      if (Object.keys(frame.pulses).length || Object.keys(frame.edges).length) left.push({ speed, si, settled, edges: frame.edges, pulses: frame.pulses });
    }
  }
  assert.deepEqual(left, []);
});
