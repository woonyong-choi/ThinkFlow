// 움직임: 시간표(박자, 이동 시간, 카드 바뀜)와 움직이는 SVG가 시간표와 같은 시각에 같은 위치에 있다(docs/design/playback.md).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { curveOf, timeAt } from '../src/easing.js';
import { flattenRoute, routeLength } from '../src/route.js';
import { toSvg } from '../src/svg.js';
import { values } from '../src/tokens.js';

const EXAMPLES = new URL('../examples/', import.meta.url);
const MOVE = curveOf('move');
const TOLERANCE = 0.002;

// cost: time O(f), heap O(out), stack O(1), io f
// vars: f = 예제 수, out = 만든 SVG 글자 수
// basis: estimate
// 이동이 있는 예제마다 { name, result, svg }
async function animatedExamples() {
  const names = readdirSync(EXAMPLES).filter((f) => f.endsWith('.dap'));
  const all = await Promise.all(
    names.map(async (file) => {
      const result = await buildFigure(readFileSync(new URL(file, EXAMPLES), 'utf8'), { baseDir: 'examples' });
      return { name: file, result, svg: await toSvg(result, { name: file }) };
    }),
  );
  return all.filter(({ result }) => result.timeline.segs.some((s) => s.hops.length));
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = SVG 글자 수
// basis: estimate
// 점 요소 하나씩 읽은 속성. 박자 순서와 이동 순서가 같아 시간표의 이동과 차례로 짝이 된다.
function packetsOf(svg) {
  return svg
    .split('<g class="p')
    .slice(1)
    .map((chunk) => {
      // 점 보임 창은 calcMode="discrete", 글 상자 흐려짐은 linear다. 둘 다 animate 요소라 모양으로 가른다.
      const attr = (tag, name, mode = '') => chunk.match(new RegExp(`<${tag}(?=[^>]*${mode})[^>]*?\\b${name}="([^"]*)"`))?.[1];
      const list = (tag, name, mode = '', sep = ';') => attr(tag, name, mode)?.split(sep).map((v) => (name === 'keySplines' ? v.split(' ').map(Number) : Number(v)));
      return {
        opacity: { dur: attr('animate', 'dur', 'discrete'), times: list('animate', 'keyTimes', 'discrete'), values: list('animate', 'values', 'discrete') },
        motion: { dur: attr('animateMotion', 'dur'), times: list('animateMotion', 'keyTimes'), splines: list('animateMotion', 'keySplines'), points: list('animateMotion', 'keyPoints') },
        slide: { dur: attr('animateTransform', 'dur'), times: list('animateTransform', 'keyTimes'), values: attr('animateTransform', 'values')?.split(';') },
        href: attr('mpath', 'href'),
      };
    });
}

function bezier(a, b, t) {
  return 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 3차 곡선에서 시간 비율 x의 진행 비율. SMIL keySplines와 같은 정의다.
function ease([x1, y1, x2, y2], x) {
  let [low, high] = [0, 1];
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (bezier(x1, x2, mid) < x) low = mid;
    else high = mid;
  }
  return bezier(y1, y2, (low + high) / 2);
}

// SMIL calcMode=spline(곡선) 또는 linear(단계 끝에서 잘리는 점, keySplines 없음) keyPoints의 경로 비율을 한 바퀴 비율 x에서 푼다.
function pathFractionAt({ times, splines, points }, x) {
  const i = Math.min(times.length - 2, times.findLastIndex((time) => time <= x));
  const u = (x - times[i]) / (times[i + 1] - times[i]);
  return points[i] + (points[i + 1] - points[i]) * (splines ? ease(splines[i], u) : u);
}

// SMIL calcMode=discrete 값을 한 바퀴 비율 x에서 푼다.
function discreteAt({ times, values }, x) {
  return values[times.findLastIndex((time) => time <= x)];
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 글자 수
// basis: estimate
// 위치 index의 태그가 시작한 <g> 안에 있는지. 여는 g와 닫는 g를 세어 깊이가 0 아래로 내려가지 않았는지 본다.
function isInsideGroup(svg, groupStart, index) {
  let depth = 0;
  for (const m of svg.slice(groupStart, index).matchAll(/<g[\s>]|<\/g>/g)) {
    depth += m[0] === '</g>' ? -1 : 1;
    if (depth <= 0) return false;
  }
  return depth > 0;
}

// time=이 붙은 이동은 길이와 무관한 절대 시간이라 길이 비례를 보는 원본에서는 뺀다.
const HOP_SOURCE = readFileSync(new URL('../examples/saturn.dap', import.meta.url), 'utf8').replace(/ time=\S+/g, '');

// cost: time O(b·h), heap O(b·h), stack O(1)
// vars: b = 박자 수, h = 박자의 이동 수
// basis: estimate
// 이동이 지나는 선의 길이와 시간 쌍. 모든 박자의 이동을 모은다.
function hopPairs({ scene, timeline }) {
  return timeline.segs.flatMap((seg) => seg.hops.map((h) => ({ length: routeLength(flattenRoute(scene.edges[h.edge].points)), ms: h.ms })));
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 키프레임 점 수
// basis: estimate
// 키프레임 본문(`P% { opacity: v } P%,Q% { opacity: v }`)의 시각 pct(%)에서의 투명도. 점 사이는 선형이다.
function opacityAt(frames, pct) {
  const points = [...frames.matchAll(/([\d.]+)%(?:,([\d.]+)%)? \{ opacity: ([\d.]+) \}/g)].flatMap(([, from, to, value]) => [[Number(from), Number(value)], [Number(to ?? from), Number(value)]]);
  const after = points.findIndex(([at]) => at > pct);
  if (after <= 0) return points[after < 0 ? points.length - 1 : 0][1];
  const [[a, va], [b, vb]] = [points[after - 1], points[after]];
  return va + ((vb - va) * (pct - a)) / (b - a);
}


// 근거: 설계 figure-syntax.md 요구사항 "카드는 도착 규칙대로 바뀐다"(도착하는 도형은 가장 늦은 도착, 출발하는 도형은 박자 시작)
test('buildTimeline_card_changes_at_the_latest_arrival_and_the_source_card_at_beat_start', async () => {
  const merged = await buildFigure('flow right\nbox a "A"\nbox b "B"\nbox c "C"\na -> c\nb -> c\nstep "s"\n  a -> c time=1s & b -> c time=3s\n  show c "도착"');
  const single = await buildFigure('flow right\nbox a "A"\nbox b "B"\na -> b\nstep "s"\n  a -> b\n  show a "출발"\n  show b "도착"');
  const seg = single.timeline.segs[0];

  assert.equal(merged.timeline.segs[0].cardsAt.c, 3000);
  assert.equal(seg.cardsAt.a, 0);
  assert.equal(seg.cardsAt.b, seg.move);
});

// 근거: 설계 grid.md 요구사항 "칸 light는 도형 light와 같은 박자 규칙이다: 단계 안에서 남고 다음 단계에서 꺼진다"
test('buildTimeline_grid_cell_light_stays_for_the_rest_of_the_step_like_a_node_light', async () => {
  const { timeline } = await buildFigure('flow right\nbox a "A"\ngrid g "G" cols=2 {\n  item x "X"\n  item y "Y" col=1\n}\nstep "하나"\n  light g.x\n  light g.y a\nstep "둘"\n  light a');
  const lit = timeline.segs.map((seg) => [seg.partsOn, seg.nodesOn]);

  assert.deepEqual(lit, [[['g.x'], []], [['g.x', 'g.y'], ['a']], [[], ['a']]]);
});

// 근거: 설계 playback.md 요구사항 "차트 계열은 단계가 바뀌어도 남고, 탭으로 건너뛰어도 보인다"
test('buildTimeline_revealed_chart_series_stay_across_steps', async () => {
  const { timeline } = await buildFigure('chart bar\nseries a "A" role=main\nseries b "B" role=compare\nrow "r" a=1 b=2\nstep "1"\n  reveal a\nstep "2"\n  reveal b');

  assert.deepEqual(timeline.segs[1].series, ['a', 'b']);
});

// 근거: 계약 figure-syntax.md 이동 시간 "선 길이에 비례, hop-min보다 짧지 않고 최대는 없다, 박자는 가장 긴 이동만큼"
test('buildTimeline_hop_time_follows_the_edge_length_with_a_minimum_and_no_maximum', async () => {
  const result = await buildFigure(HOP_SOURCE);
  const pairs = hopPairs(result);
  const free = pairs.filter(({ ms }) => ms > values.duration['hop-min']);

  assert.ok(new Set(free.map((p) => Math.round(p.length))).size > 1);
  for (const { length, ms } of free) assert.ok(Math.abs(ms - (length / values.size.packet['hop-ref']) * values.duration.hop) <= 1);
  for (const { ms } of pairs) assert.ok(ms >= values.duration['hop-min']);
  for (const seg of result.timeline.segs) assert.equal(seg.move, Math.max(0, ...seg.hops.map((h) => h.ms)));
});

// 근거: 계약 figure-syntax.md 머리 표 "speed: 기준 길이 선을 지나는 시간"
test('buildTimeline_speed_header_scales_every_hop_time', async () => {
  const base = hopPairs(await buildFigure(HOP_SOURCE));
  const fast = hopPairs(await buildFigure(HOP_SOURCE.replace('title', `speed ${values.duration.hop * 2}ms\ntitle`)));

  base.forEach((p, i) => assert.ok(Math.abs(fast[i].ms - p.ms * 2) <= 1));
});

// 근거: 계약 figure-syntax.md 이동 시간 "time=이 있으면 그 이동의 절대 시간"
test('buildTimeline_hop_time_option_is_absolute_regardless_of_length', async () => {
  const { timeline } = await buildFigure('flow right\nbox a "A"\nbox b "B"\nbox c "C"\na -> b\nb -> c\nstep "s"\n  a -> b time=900ms\n  b -> c time=900ms');

  assert.deepEqual(timeline.segs.map((s) => s.move), [900, 900]);
});

// 근거: 설계 playback.md 요구사항 "움직이는 SVG의 점이 시간표와 같은 시각에 같은 위치에 있다. keyTimes는 늘어나기만 하고 keySplines 수가 맞으며, 보임 창과 이동 구간이 시간표 이동과 같고, 경로와 점이 한 좌표 그룹에 있다"
test('toSvg_moving_packets_match_the_timeline_at_every_example', async () => {
  for (const { name, result, svg } of await animatedExamples()) {
    const { segs, total } = result.timeline;
    const hops = segs.flatMap((seg) => seg.hops.map((hop) => ({ seg, hop })));
    const packets = packetsOf(svg);
    const expectedDur = `${Math.round(total) / 1000}s`;
    const groupStart = svg.indexOf('<g transform="translate(');
    assert.equal(packets.length, hops.length, name);
    assert.doesNotMatch(svg, /@keyframes p\d+-\d+ /, `${name}: 점 보임은 CSS가 아니라 SMIL이어야 한다`);
    assert.ok(groupStart >= 0, name);

    packets.forEach(({ opacity, motion, slide }, k) => {
      const { seg, hop } = hops[k];
      const start = seg.t0 + (hop.at ?? 0);
      // 흐름의 점은 도형 안을 지나는 구간(gaps)에서 보이지 않는다. 보임 창은 첫 구간 끝까지다.
      const inside = (hop.gaps ?? []).map(([a, b]) => [start + timeAt(MOVE, a) * hop.ms, start + timeAt(MOVE, b) * hop.ms]);
      const shownEnd = start + (hop.cut ?? hop.ms);
      const [from, to] = [start / total, Math.min(inside[0]?.[0] ?? shownEnd, shownEnd) / total];
      const end = shownEnd / total;
      for (const times of [opacity.times, motion.times, ...(slide.times ? [slide.times] : [])]) {
        assert.equal(times[0], 0, name);
        assert.ok(times.at(-1) <= 1, name);
        // 글 상자 옮김(slide)은 자리를 순간에 바꾸는 곳에서 같은 시각이 이어진다. 점의 보임과 이동은 늘어나기만 한다.
        times.slice(1).forEach((time, i) => assert.ok(times === slide.times ? time >= times[i] : time > times[i], `${name}: keyTimes ${times}`));
      }
      if (hop.cut === undefined) assert.equal(motion.splines.length, motion.times.length - 1, name);
      assert.equal(motion.points.length, motion.times.length, name);
      assert.equal(opacity.values.length, opacity.times.length, name);
      assert.deepEqual([opacity.dur, motion.dur, slide.dur ?? expectedDur], [expectedDur, expectedDur, expectedDur], `${name}: 한 바퀴 길이는 10분의 1초로 반올림하지 않은 총 시간`);

      const shown = opacity.times[opacity.values.indexOf(1)];
      const hidden = opacity.times[opacity.values.indexOf(1) + 1] ?? 1;
      assert.ok(Math.abs(shown - from) < 1e-5 && Math.abs(hidden - to) < 1e-5, `${name} hop ${k}: 보임 창 ${shown}-${hidden}, 시간표 ${from}-${to}`);
      assert.ok(motion.times.some((time) => Math.abs(time - end) < 1e-5), `${name} hop ${k}: 이동 끝이 시간표 이동 끝과 다르다`);
      if (from > 0) assert.ok(motion.times.some((time) => Math.abs(time - from) < 1e-5), `${name} hop ${k}: 이동 시작이 보임 창 시작과 다르다`);
      if (slide.times) assert.ok(slide.times.every((time) => time === 0 || time === 1 || (time >= from - 1e-5 && time <= end + 1e-5)), `${name} hop ${k}: 글 상자 keyTimes가 이동 구간 밖이다`);

      const probes = [...Array.from({ length: Math.ceil(total / 25) }, (_, i) => i * 25), start, start + 1, shownEnd - 1, shownEnd + 1, total - 1];
      for (const t of probes) {
        // 단계 끝에서 잘린 점(cut)은 사라진 자리에 머문다(cutMotionKeys). 잘린 뒤의 자리는 잘린 순간의 진행으로 센다.
        const progress = Math.min(1, Math.max(0, (Math.min(t, shownEnd) - start) / hop.ms));
        const expected = hop.isBack ? 1 - ease(MOVE, progress) : ease(MOVE, progress);
        const actual = pathFractionAt(motion, t / total);
        assert.ok(Math.abs(actual - expected) < TOLERANCE, `${name} hop ${k} t=${t}ms: 경로 비율 ${actual.toFixed(4)}, 기대 ${expected.toFixed(4)}`);
        const isOn = t >= start && t < shownEnd && !inside.some(([a, b]) => t > a && t < b);
        if (Math.abs(t - start) > 1 && Math.abs(t - shownEnd) > 1 && inside.every(([a, b]) => Math.abs(t - a) > 1 && Math.abs(t - b) > 1)) assert.equal(discreteAt(opacity, t / total), isOn ? 1 : 0, `${name} hop ${k} t=${t}ms: 보임`);
      }
    });
    for (const m of svg.matchAll(/<g class="p\d+-\d+" opacity="0">/g)) {
      const href = svg.slice(m.index).match(/<mpath href="#(t?p-\d+)"/)[1];
      const pathAt = svg.indexOf(`id="${href}"`);
      assert.ok(pathAt > groupStart && isInsideGroup(svg, groupStart, pathAt), `${name}: ${href} 경로가 이동한 그룹 밖에 있다`);
      assert.ok(isInsideGroup(svg, groupStart, m.index), `${name}: 점이 이동한 그룹 밖에 있다`);
    }
  }
});

// 근거: 설계 playback.md "설명 글과 단계 이름은 교차 페이드하지 않는다"
test('toSvg_caption_and_step_label_fade_one_after_another_never_crossfade', async () => {
  const SEEN = 0.02;
  let checked = 0;
  for (const file of readdirSync(EXAMPLES).filter((f) => f.endsWith('.dap'))) {
    const result = await buildFigure(readFileSync(new URL(file, EXAMPLES), 'utf8'), { baseDir: 'examples' });
    if (!result.timeline.segs.length) continue;
    const svg = await toSvg(result, { name: file });
    const frames = new Map([...svg.matchAll(/@keyframes (a\d+) \{ ([^\n]*?) \}\n/g)].map((m) => [m[1], m[2]]));
    for (const group of [/<g opacity="0" class="(a\d+)"><text[^>]*class="caption"/g, /<text [^>]*class="steplabel (a\d+)"/g]) {
      const classes = [...svg.matchAll(group)].map((m) => m[1]);
      if (classes.length < 2) continue;
      for (let ms = 0; ms < result.timeline.total; ms += 5) {
        const shown = classes.filter((name) => opacityAt(frames.get(name), (ms / result.timeline.total) * 100) > SEEN);
        assert.ok(shown.length <= 1, `${file} ${ms}ms: 글 ${shown.length}개가 같이 보인다`);
      }
      checked += 1;
    }
  }
  assert.ok(checked >= 2, `검사한 글 묶음 ${checked}개`);
});

const STEPPED_BAR = 'chart bar\nx "정확도(%)"\nseries a "A" role=main\nseries b "B" role=compare\nrow "r" a=5 b=3\nstep "하나" "첫째"\n  reveal a\nstep "둘" "둘째"\n  reveal b';

// 근거: 설계 playback.md 요구사항 "멈춘 SVG는 모든 선과 계열을 보이고 움직임이 없다"
test('toSvg_static_output_has_no_motion_and_shows_every_series', async () => {
  const flow = await toSvg(await buildFigure('flow right\nbox a "A"\nbox b "B"\na -> b quiet\nstep "s"\n  a -> b'), { isStatic: true });
  const chart = await toSvg(await buildFigure(STEPPED_BAR), { isStatic: true });

  assert.doesNotMatch(flow, /@keyframes|animateMotion/);
  assert.doesNotMatch(chart, /@keyframes ls|animation: a\d|cs-\d \{ animation/);
  assert.match(chart, /<g class="cs-0">/);
  assert.match(chart, /<g class="cs-1">/);
  assert.equal(chart.includes('opacity="0"'), false);
});
