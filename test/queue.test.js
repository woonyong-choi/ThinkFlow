// 큐 도형(`queue id "이름" slots=N [from=K]`): 칸 수 경계 입력, 찬 칸 수 범위 처리, 값 변경 재생, 라이트와 다크 토큰.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { contrast } from '../src/contrast.js';
import { filledSlots } from '../src/measure/queue.js';
import { QUEUE_SLOTS_MAX } from '../src/source/grammar.js';
import { toSvg } from '../src/svg.js';
import { themeColor } from './helpers.js';

const THEMES = ['light', 'dark'];
const MIN_GRAPHIC = 3;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
// 큐 하나와 그 앞뒤 상자를 가진 원본. queueLine은 큐 선언 줄, steps는 시간 흐름이다.
const sourceOf = (queueLine, steps = '') => `flow right\nbox a "A"\n${queueLine}\nbox b "B"\na -> q\nq -> b\n${steps}`;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
// 원본의 오류 진단 목록. 오류가 없으면 빈 목록이다.
async function errorsOf(source) {
  try {
    await buildFigure(source);
    return [];
  } catch (error) {
    return error.problems;
  }
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = SVG 글자 수
// basis: estimate
// 값 글자마다 찬 칸 묶음의 칸 수 { 글자: 칸 수 }
function filledCounts(svg) {
  const groups = [...svg.matchAll(/<g class="queue-fill"[^>]*?data-t="([^"]*)">((?:<rect [^>]*\/>)*)/g)];
  return Object.fromEntries(groups.map(([, text, rects]) => [text, rects.split('<rect ').length - 1]));
}

// 근거: 이슈 #60 "슬롯 수에도 할당 전 입력 검증". slots는 1 이상 상한(32) 이하 정수만 받는다
test('buildFigure_accepts_slots_1_and_the_limit_and_rejects_0_over_the_limit_and_a_missing_or_fractional_count', async () => {
  for (const slots of [1, QUEUE_SLOTS_MAX]) assert.deepEqual(await errorsOf(sourceOf(`queue q "큐" slots=${slots}`)), [], `slots=${slots}`);
  for (const bad of ['slots=0', `slots=${QUEUE_SLOTS_MAX + 1}`, 'slots=-1', 'slots=2.5', 'slots=abc']) {
    const [error] = await errorsOf(sourceOf(`queue q "큐" ${bad}`));

    assert.match(error.message, /slots is a whole number of 1 to 32/, bad);
  }
  assert.match((await errorsOf(sourceOf('queue q "큐"')))[0].message, /a queue needs its slot count/);
});

// 근거: 이슈 #60 "빈 큐, 일부 찬 큐, 가득 찬 큐". from은 처음 찬 칸 수이고 0부터 slots까지다
test('buildFigure_accepts_from_between_0_and_slots_and_rejects_from_over_slots', async () => {
  for (const from of [0, 3, 4]) assert.deepEqual(await errorsOf(sourceOf(`queue q "큐" slots=4 from=${from}`)), [], `from=${from}`);
  const [error] = await errorsOf(sourceOf('queue q "큐" slots=4 from=5'));

  assert.match(error.message, /at most slots=4/);
});

// 근거: 설계 figure-syntax.md 큐: 음수는 0칸, 칸 수를 넘으면 가득 찬 칸. 경계값 -1, 0, slots, slots+1과 아주 큰 값
test('filledSlots_clamps_below_zero_to_empty_and_above_slots_to_full', () => {
  const filled = ['-1', '0', '1', '5', '6', '1e+21', '-1e+21'].map((text) => filledSlots(text, 5));

  assert.deepEqual(filled, [0, 0, 1, 5, 5, 5, 0]);
});

// 근거: 이슈 #60 완료 조건 "빈 큐, 일부 찬 큐, 가득 찬 큐를 구분한다(정지 SVG)". 정지 SVG는 처음 찬 칸 수(from)만큼 칸을 채운다
test('toSvg_static_draws_an_empty_a_partly_filled_and_a_full_queue_with_different_filled_slot_counts', async () => {
  const counts = [];
  for (const from of [0, 2, 4]) {
    const svg = await toSvg(await buildFigure(sourceOf(`queue q "큐" slots=4 from=${from}`)), { isStatic: true });
    counts.push(svg.match(/<g class="queue-fill">((?:<rect [^>]*\/>)*)<\/g>/)[1].split('<rect ').length - 1);
  }

  assert.deepEqual(counts, [0, 2, 4]);
});

// 근거: 설계 figure-check.md 14번: 큐 값이 0 미만이거나 칸 수를 넘으면 경고하고, 0과 slots는 경고하지 않는다
test('buildFigure_warns_check_14_when_a_queue_goes_below_zero_or_over_its_slots_and_stays_quiet_at_the_bounds', async () => {
  const run = async (from, set) => buildFigure(sourceOf(`queue q "큐" slots=3 from=${from}`, `step "s"\n  a -> q "x" set="${set}"\n`));
  const atBounds = await run(3, 'q-3');
  const below = await run(0, 'q-1');
  const over = await run(3, 'q+1');

  assert.deepEqual(atBounds.warnings, []);
  assert.deepEqual([below, over].map(({ warnings }) => warnings.map((w) => [w.code, w.line])), [[['check-14', 3]], [['check-14', 3]]]);
  assert.match(below.warnings[0].message, /below 0\. It draws as 0 filled slots/);
  assert.match(over.warnings[0].message, /over its 3 slots\. It draws as full/);
});

// 근거: 설계 figure-syntax.md 큐: 찬 칸 수는 정수. 소수와 낱말 값, 카드 줄(value on=큐)은 오류
test('buildFigure_rejects_a_fractional_or_word_set_on_a_queue_and_a_value_card_on_it', async () => {
  const steps = (set) => `step "s"\n  a -> q set="${set}"\n`;
  for (const set of ['q+0.5', 'q=1.5', 'q=full']) assert.match((await errorsOf(sourceOf('queue q "큐" slots=3', steps(set))))[0].message, /counts filled slots in whole numbers/, set);

  const card = await errorsOf(`${sourceOf('queue q "큐" slots=3')}value n "길이" on=q\n`);

  assert.match(card[0].message, /a queue has no card/);
});

// 근거: 이슈 #60 "값 변경에 따라 칸 수가 변하고 값이 바뀌면 value-flash 동안 밝아진다". 시간표의 변화 목록과 SVG 찬 칸 묶음이 같은 값을 쓴다
test('toSvg_animated_queue_swaps_the_filled_slot_group_with_each_value_and_flashes_the_outline_for_the_value_flash', async () => {
  const result = await buildFigure(sourceOf('queue q "큐" slots=3', 'on q q+1\nstep "s" for=3s\n  track a -> q "x" time=1s every=1s\n'));
  const [row] = result.timeline.values;
  const svg = await toSvg(result);

  assert.deepEqual(row.changes.map(([, text]) => text), ['1', '2', '3']);
  assert.deepEqual(filledCounts(svg), { 0: 0, 1: 1, 2: 2, 3: 3 });
  assert.equal(row.flashes.length, 3);
  assert.match(svg, /opacity="0" data-vf="0"><animate/);
});

// 근거: 사용자 결정 "찬 칸은 브랜드 파랑 계열 토큰, 빈 칸은 무채색 면, 외곽선 대비 3. 라이트와 다크 모두". 찬 칸은 도형 면과 빈 칸 위에서 3 이상이다
test('queue_fill_reaches_contrast_3_on_the_node_face_and_the_empty_slot_in_both_themes', () => {
  for (const theme of THEMES) {
    const fill = themeColor(theme, 'figure.queue-fill');
    for (const face of ['node', 'figure.queue-empty']) assert.ok(contrast(fill, themeColor(theme, face)) >= MIN_GRAPHIC, `${theme} queue-fill on ${face}`);
  }
});
