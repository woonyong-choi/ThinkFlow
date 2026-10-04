// 출력 숫자 서식: 실행 환경(Node 버전)마다 달라지는 부동소수 끝자리가 파일 바이트에 남지 않는다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildFigure } from '../src/build.js';
import { createClock } from '../src/animate/clock.js';
import { toHtml } from '../src/html.js';
import { toSvg } from '../src/svg.js';
import { roundCoord } from '../src/text.js';

const EXAMPLES = fileURLToPath(new URL('../examples/', import.meta.url));
const NOISE = 1e-12;
const NOISY_MATH = ['sqrt', 'hypot', 'pow', 'sin', 'cos', 'tan', 'atan2', 'exp', 'log', 'cbrt'];
// 소수 자릿수가 이보다 길면 부동소수 끝자리가 샌 것이다(keyTimes의 다섯 자리가 가장 길다)
const LONGEST_DECIMALS = 5;
// 글꼴 토큰 같은 정본 글자값은 계산 결과가 아니라서 검사에서 뺀다
const CUSTOM_PROPERTY = /--[\w-]+: [^;]*;/g;

const sources = readdirSync(EXAMPLES).filter((f) => f.endsWith('.dap'));

// cost: time O(m·n), heap O(n), stack O(1)
// vars: m = 흔드는 Math 함수 수, n = 원본 수
// basis: estimate
// Math 함수 결과에 noise를 더해 두 Node 버전의 끝자리 차이를 흉내 내고 body를 돌린 뒤 되돌린다.
async function withNoisyMath(noise, body) {
  const originals = NOISY_MATH.map((name) => [name, Math[name]]);
  for (const [name, original] of originals) Math[name] = (...args) => original(...args) + noise;
  try {
    return await body();
  } finally {
    for (const [name, original] of originals) Math[name] = original;
  }
}

// cost: time O(build), heap O(out), stack O(1), io 1
// vars: build = 원본 하나를 만드는 비용, out = 결과 글자 수
// basis: estimate
// 예제 하나의 SVG와 HTML 글.
async function render(file) {
  const result = await buildFigure(readFileSync(join(EXAMPLES, file), 'utf8'), { baseDir: EXAMPLES });
  return { svg: await toSvg(result, { name: file }), html: await toHtml(result, file) };
}

// 근거: 이슈 #96 "Node 26과 22의 SVG 바이트가 다르다". 끝자리가 1e-12 흔들려도 같은 바이트여야 한다
test('outputs_are_byte_equal_when_calculation_results_wobble_by_1e-12', async () => {
  for (const file of sources) {
    const plain = await render(file);
    const wobbled = await withNoisyMath(NOISE, () => render(file));

    assert.equal(wobbled.svg, plain.svg, `${file} svg`);
    assert.equal(wobbled.html, plain.html, `${file} html`);
  }
});

// 근거: 이슈 #96 "출력 좌표와 keyTimes를 정해진 자릿수로 반올림". 어떤 숫자도 정해진 자릿수보다 길지 않다
test('outputs_never_carry_more_decimals_than_the_fixed_digits', async () => {
  const tooLong = new RegExp(`\\d\\.\\d{${LONGEST_DECIMALS + 1},}`);
  for (const file of sources) {
    const { svg, html } = await render(file);

    for (const [kind, text] of [['svg', svg], ['html', html]]) {
      const found = text.replace(CUSTOM_PROPERTY, '').match(new RegExp(`.{0,40}${tooLong.source}.{0,10}`));
      assert.equal(found, null, `${file} ${kind}: ${found?.[0]}`);
    }
  }
});

// 근거: 이슈 #96. 반올림 경계(12.25, 0.000005)가 1e-12 위아래 어느 쪽이어도 같은 값
test('rounding_is_stable_on_the_half_boundary', () => {
  const clock = createClock(1000000);

  for (const noise of [-NOISE, 0, NOISE]) {
    assert.equal(roundCoord(12.25 + noise), 12.3);
    assert.equal(roundCoord(0.05 + noise), 0.1);
    assert.equal(clock.keyTime(5 + noise * 1e6), clock.keyTime(5));
    assert.equal(clock.percent(5 + noise * 1e6), clock.percent(5));
  }
});
