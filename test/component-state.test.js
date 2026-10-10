// 공통 상태 계약: 켜짐과 평소의 모습은 figure.css의 효과 한 벌(`--fx-*`) 하나가 정하고, 움직이는 SVG의 keyframes와 HTML 재생기의 규칙이 같은 사용자 정의 속성을 읽는다.
// 차트 방향선의 화살촉은 색 역할마다 정의 하나이고, 차트 종류가 섞여도 선언 순서와 상관없이 몸통과 같은 역할의 색을 읽는다.
// 브라우저에서 계산된 색은 보지 않는다(화면 검수는 따로 한다). 여기서는 출력이 어떤 정의를 읽는지만 본다.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build, dap, toHtml, toSvg } from './support.js';

const GRAPH = dap(`
  table t "T" {
    id bigint pk
  }
  grid g "G" cols=2 {
    item a "A" col=0
  }
  box s "S" tone=yellow appearance=outline
  box f "F" tone=blue appearance=filled
  s -> f "go"
  view graph {
    t g s f
  }
  scene "s"
    light t.id g.a
    light s f
    s -> f
`);

const DUMBBELL = `chart d "지연" dumbbell {
  x "지연(ms)"
  series before "전" role=compare
  series after "후" role=main
  row "a" before=10 after=5
}`;
const SCATTER = `chart p "점" scatter {
  x "크기(줄)"
  y "장애(건)"
  point "p1" x=1 y=1
  point "p2" x=2 y=2
  link "p1" -> "p2"
}`;

const KEYFRAMES = /@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g;

test('S1 켜짐과 평소 모습은 효과 한 벌(--fx-*)을 움직이는 SVG와 HTML이 함께 읽는다', async () => {
  const result = await build(GRAPH);
  const svg = await toSvg(result);
  const html = await toHtml(result, 'state');
  for (const out of [svg, html]) {
    const defined = new Set([...out.matchAll(/(--fx-[\w-]+)\s*:/g)].map((m) => m[1]));
    const read = [...out.matchAll(/var\((--fx-[\w-]+)/g)].map((m) => m[1]);
    assert.deepEqual(read.filter((name) => !defined.has(name)), [], 'every --fx-* that is read is defined in the same document');
  }
  const frames = (svg.match(KEYFRAMES) ?? []).filter((k) => k.includes('--fx-'));
  assert.ok(frames.length > 0, 'the lit nodes, parts and cells animate through --fx-*');
  assert.ok(frames.every((k) => !/--color-state-active\)|--simple2-(hover-fill|separator|row-selection|surface-edge)|--color-paint/.test(k)), 'keyframes do not repeat token colors');
  assert.match(html, /\.fl-part\.on :is\(\.part-bg, \.grid-cell\)\s*\{\s*fill: var\(--fx-face-on\)/, 'the HTML lit field and cell read the same lit face as the animated SVG');
  assert.ok(frames.some((k) => k.includes('fill: var(--fx-face-on)') && !k.includes('stroke')) && frames.some((k) => k.includes('fill: var(--fx-face);')), 'the animated SVG lights a field and a cell by that lit face only');
  assert.match(svg, /\.fl-node\.ap-outline\.tn-yellow\s*\{\s*--fx-edge-rest:/, 'a chosen tone changes only the rest values');
  assert.match(svg, /\.fl-node\.ap-filled\.tn-blue\s*\{\s*--fx-face:/);
});

// 켜진 차트 카드: 카드 면은 켜짐 면(--fx-face-on)으로 바뀌므로 글자 바탕과 받침 선도 같은 구간에 같은 면을 따라야 한다.
// 면은 윤곽 요소의 class가, 차트는 그 형제 묶음(.fl-chart)이 가지므로 움직이는 SVG는 묶음에 같은 켜짐 구간을 따로 건다.
// 건 속성은 일반 상속 속성 color다(chart.css의 `.fl-chart`가 바탕 면을 color로 싣고 받는 쪽이 currentColor로 읽는다). 사용자 정의 속성 keyframes는 시작 때 값이 굳어 테마가 바뀌어도 따라가지 않는다.
const LIT_CHART = dap(`
  box a "A"
  a -> sales
  chart sales "매출" line {
    x "시각(시)"
    y "지연(ms)"
    series u "A" role=main
    series v "B" role=compare
    point x=1 u=1 v=3
    point x=2 u=2 v=1
    point x=3 u=4 v=2
  }
  view graph down
  scene "켜짐" mode=loop
    a -> sales time=600ms
    light sales
    wait 1s
`);

test('S3 켜진 차트 카드의 글자 바탕과 받침 선은 정지 SVG, 움직이는 SVG, HTML 모두 켜진 카드 면을 따른다', async () => {
  const result = await build(LIT_CHART);
  const groupsOf = (out) => [...out.matchAll(/<g class="fl-chart(?: ([\w-]+))?" data-chart="sales"/g)].map((m) => m[1]);
  const GROUND_ON = 'color: var(--fx-face-on)';
  const GROUND_OFF = 'color: var(--fx-face)';

  const still = await toSvg(result, { isStatic: true });
  const [stillName] = groupsOf(still);
  assert.match(stillName ?? '', /^a\d+$/, 'the static SVG puts a lit class on the chart group, not only on the card face');
  assert.ok(still.includes(`.fl .${stillName} { ${GROUND_ON}; }`), 'the final state is lit, so the ground is the lit face');
  // 면을 정하는 CSS 상태는 여기 한 곳에서 본다(components.test.js U10은 그려진 형상만 본다). 별칭은 그림 바탕, 카드 면, 켜진 카드 면이고 차트 묶음이 일반 상속 속성 color로 싣는다.
  // 글자 뒤 바탕 면과 받침 선은 그 color(currentColor)만 읽고 자기 color를 정하지 않는다.
  assert.match(still, /\.fl \{\s*--chart-ground:\s*var\(--color-prose-pre-background\);/);
  assert.match(still, /\.fl \.fl-node \{\s*--chart-ground:\s*var\(--fx-face\);/);
  assert.match(still, /\.fl \.fl-node\.on \{\s*--chart-ground:\s*var\(--fx-face-on\);/);
  assert.match(still, /\.fl \.fl-chart \{\s*color:\s*var\(--chart-ground\);/);
  assert.match(still, /\.fl \.chart-text-bg \{\s*fill:\s*currentColor;/);
  for (const selector of ['chart-rule-casing', 'chart-after']) assert.match(still, new RegExp(`\\.fl \\.${selector} \\{\\s*stroke:\\s*currentColor;\\s*stroke-width:[^;]+;\\s*\\}`), `${selector} reads the carried ground and sets no color of its own`);

  const moving = await toSvg(result);
  const names = groupsOf(moving);
  const live = names.find((name) => /^a\d+$/.test(name ?? ''));
  assert.ok(live, 'the animated SVG puts a lit class on the chart group');
  const frames = (moving.match(KEYFRAMES) ?? []).find((k) => k.startsWith(`@keyframes ${live} `));
  assert.ok(frames?.includes(GROUND_ON) && frames.includes(GROUND_OFF), 'the loop turns the ground from the rest face to the lit face and back with the card');
  assert.ok(moving.includes(`.fl .${live} { animation: ${live} `), 'the keyframes run on the chart group');
  assert.ok(!frames.includes('--chart-ground'), 'the keyframes animate the inherited color, not the alias');
  const declaring = (moving.match(KEYFRAMES) ?? []).filter((k) => /[{;]\s*--[\w-]+\s*:/.test(k));
  assert.deepEqual(declaring.map((k) => k.slice(0, k.indexOf('{')).trim()), [], 'no keyframes declare a custom property, whose value would freeze at the start and miss a theme change');
  const frozen = names.find((name) => /^sa\d+$/.test(name ?? ''));
  assert.ok(frozen === undefined || moving.includes(`.fl .${frozen} { ${GROUND_ON}; }`), 'the final-state layer holds the lit ground');

  const html = await toHtml(result, 'lit');
  assert.ok(groupsOf(html).length > 0 && groupsOf(html).every((name) => name === undefined), 'the HTML player has no lit class on the chart group');
  assert.match(html, /\.fl \.fl-node\.on\s*\{\s*--chart-ground:\s*var\(--fx-face-on\)/, 'the HTML player lights the ground by the existing .on rule, which the chart group carries as color');
  assert.match(html, /\.fl \.fl-chart\s*\{\s*color:\s*var\(--chart-ground\)/, 'the same carrier in the HTML player');
});

// 움직이는 SVG의 시간은 재생기(player/sample.js)와 같다: 점이 선을 떠나면 선 색과 알약은 평소로 돌아오고(알약은 표시 400ms, speed와 상관없다), 조용한 선의 보임만 마지막 모습까지 남는다.
const WALK = dap(`
  box a "A"
  box b "B"
  box c "C"
  a -> b "x"
  b -> c quiet
  scene "walk" mode=once speed=4
    b -> c time=1s
    a -> b time=1s
  scene "later" mode=once
    wait 1s
`);

// keyframes 본문을 [{ at: 퍼센트 목록, value }]로 읽는다.
const stopsOf = (frames) => [...frames.slice(frames.indexOf('{') + 1).matchAll(/([\d.,%]+) \{ ([^}]*) \}/g)].map(([, at, value]) => ({ at: at.split(',').map(parseFloat), value }));

test('S4 움직이는 SVG의 선은 점이 떠나면 평소로 돌아오고, 알약은 speed와 상관없이 400 표시 ms 뒤에 평소가 되며, 조용한 선의 보임만 마지막 모습까지 남는다', async () => {
  const result = await build(WALK);
  const svg = await toSvg(result, { scene: 0 });
  const framesOf = (out, name) => stopsOf((out.match(KEYFRAMES) ?? []).find((k) => k.startsWith(`@keyframes ${name} `)));
  const durationMs = Number(/\.fl \.a\d+ \{ animation: a\d+ ([\d.]+)s/.exec(svg)[1]) * 1000;
  const ms = (percent) => (percent / 100) * durationMs;
  const [lineClass] = /class="fl-edge (a\d+)"/.exec(svg).slice(1);
  const lineStops = framesOf(svg, lineClass);
  assert.deepEqual([lineStops.at(-1).at.at(-1), lineStops.at(-1).value], [100, 'color: var(--fx-line-rest)'], '100%에서 움직인 선은 평소 색이다');
  // 점은 a -> b 선에 논리 1000ms에 들어서고(speed 4에서 250 표시 ms) 2000ms에 떠난다(500 표시 ms). 알약은 들어서는 즉시 활성 색이고, 떠난 뒤 400 표시 ms(논리 1600이 아니다) 동안 평소 색으로 돌아온다.
  const [pillClass] = /class="pill (a\d+)"/.exec(svg).slice(1);
  const pillStops = framesOf(svg, pillClass);
  const [hold, settled] = pillStops.slice(-2);
  assert.equal(settled.value, 'stroke: var(--fx-edge-rest)');
  assert.equal(hold.value, 'stroke: var(--fx-edge)');
  assert.ok(Math.abs(ms(hold.at[0]) - 500) < 1, `the pill stays active until the dot leaves (${ms(hold.at[0])}ms)`);
  assert.ok(Math.abs(ms(settled.at[0]) - ms(hold.at[0]) - 400) < 1, `the pill fades for 400 display ms at speed 4 (${ms(settled.at[0]) - ms(hold.at[0])}ms)`);
  const on = pillStops.findIndex((stop) => stop.value === 'stroke: var(--fx-edge)');
  assert.ok(on > 0 && pillStops[on - 1].value === 'stroke: var(--fx-edge-rest)' && pillStops[on].at[0] - pillStops[on - 1].at.at(-1) < 0.01, 'the pill turns active at once, with no rise');
  const [quietClass] = /class="fl-edge quiet (a\d+) a\d+"/.exec(svg).slice(1);
  const quietStops = framesOf(svg, quietClass);
  assert.deepEqual([quietStops.at(-1).at.at(-1), quietStops.at(-1).value], [100, 'opacity: 1'], '조용한 선은 100%에서도 보인다');
  assert.match(svg, /\.fl \.sa\d+ \{ opacity: 1; \}/, '마지막 모습 층에서도 보인다');
  assert.doesNotMatch(svg, /\.fl \.sa\d+ \{[^}]*--fx-edge\)/, '마지막 모습 층의 선과 알약은 평소 색이다');
  // 다른 장면에서 지나간 조용한 선은 이 장면에서 보이지 않는다.
  const later = await toSvg(result, { scene: 1 });
  const [laterClass] = /class="fl-edge quiet (a\d+)/.exec(later).slice(1);
  assert.deepEqual(framesOf(later, laterClass).map((stop) => stop.value), ['opacity: 0']);
  // 켜짐 구간의 시각은 반올림하지 않는다: 1ms보다 작게 다른 두 일정은 서로 다른 keyframes를 받고, 같은 일정은 class 하나를 나눠 쓴다.
  const edgeClasses = async (first, second) => {
    const out = await toSvg(await build(dap(`
      box a "A"
      box b "B"
      box c "C"
      a -> b
      b -> c
      scene "s" mode=once
        track a -> b at=${first}ms time=10ms
        track b -> c at=${second}ms time=10ms
    `)), { scene: 0 });
    return [...out.matchAll(/class="fl-edge (a\d+)"/g)].map(([, name]) => name);
  };
  const [near, far] = await edgeClasses(10.1, 10.4);
  assert.notEqual(near, far, 'edges that start 0.3ms apart do not share a keyframes');
  const [same, again] = await edgeClasses(10.1, 10.1);
  assert.equal(same, again, 'identical schedules reuse one class');
});

test('S5 light가 켠 그룹은 경계 색만 강조 색이 되고 굵기와 면은 바뀌지 않으며, 켜지 않은 그룹은 아무 class도 받지 않는다', async () => {
  const result = await build(dap(`
    group g "G" {
      box a "A"
      box b "B"
    }
    group h "H" {
      box d "D"
    }
    box c "C"
    a -> c
    scene "s" mode=once
      a -> c time=1s
      light g
  `));
  const svg = await toSvg(result);
  const boxes = [...svg.matchAll(/class="frame-box fl-stroke([^"]*)"/g)].map((m) => m[1].trim());
  // 움직이는 층과 마지막 모습 층(sa) 각각에서 켠 그룹 하나만 켜짐 class를 받는다.
  assert.deepEqual(boxes.filter(Boolean).map((name) => name.trim().replace(/\d+$/, '')).sort(), ['a', 'sa'], 'only the lit group has a lit class');
  const [name] = boxes.filter((value) => /^a\d+$/.test(value));
  const frames = (svg.match(KEYFRAMES) ?? []).find((k) => k.startsWith(`@keyframes ${name} `));
  assert.ok(frames.includes('stroke: var(--fx-edge)') && frames.includes('stroke: var(--fx-edge-rest)'), 'the border goes from its rest colour to the lit colour');
  assert.doesNotMatch(frames, /stroke-width|fill/, 'only the border colour changes');
  assert.match(await toHtml(result, 'group'), /\.fl \.fl-group\.on > \.frame-box \{\s*stroke: var\(--fx-edge\);\s*\}/, 'the HTML player lights the same border');
  assert.match(svg, /\.fl \.frame-box \{\s*--fx-edge-rest: var\(--color-line\);\s*fill: none;\s*stroke: var\(--fx-edge-rest\);/, 'a group reads its rest border through the variable, set on the rect itself so a badge inside the group does not inherit it');
});

for (const [first, order] of [['덤벨', [DUMBBELL, SCATTER]], ['산점도', [SCATTER, DUMBBELL]]]) {
  test(`S2 차트 종류가 섞여도 방향선 화살촉은 몸통과 같은 역할의 색을 읽는다 (${first} 먼저)`, async () => {
    const result = await build(dap(`${order.join('\n')}\nscene "a"`));
    for (const out of [await toSvg(result), await toHtml(result, 'arrows')]) {
      assert.deepEqual([...out.matchAll(/<marker id="(fl-arrow-[a-z]+)"/g)].map((m) => m[1]).sort(), ['fl-arrow-main', 'fl-arrow-muted'], 'one marker per role, whatever the declaration order');
      const lines = [...out.matchAll(/class="chart-(?:arrow|link) arrow-([a-z]+) pop" marker-end="url\(#(fl-arrow-[a-z]+)\)"/g)];
      assert.ok(lines.length >= 2, 'both chart kinds draw a direction line');
      assert.ok(lines.every(([, role, marker]) => marker === `fl-arrow-${role}`), 'each line points at the marker of its own role');
      assert.doesNotMatch(out, /url\(#fl-arrow\)/, 'no shared marker whose color the first chart decides');
    }
  });
}
