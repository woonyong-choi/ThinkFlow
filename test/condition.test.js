// 흐름 조건식 파서와 계산기(src/source/condition.js)의 문법, 오류, 임의 코드 실행 금지(docs/design/figure-syntax.md 조건과 대기).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CONDITION_MAX, evalCondition, parseCondition } from '../src/source/condition.js';

const IDS = ['n', 'm', 'holder', 'mode'];

// cost: time O(c), heap O(c), stack O(d)
// vars: c = 조건 글자 수, d = 괄호 깊이
// basis: estimate
// 조건 글을 읽고 값 글자 표(texts)로 계산한 결과. 읽기에 실패하면 { error }다.
function run(text, texts = {}) {
  const parsed = parseCondition(text, IDS);
  if (parsed.error) return parsed;
  return evalCondition(parsed.ast, (id) => texts[id]);
}

// 근거: 계약 "조건식은 값 이름, 숫자, '낱말', 비교(=, !=, <, <=, >, >=), &&, ||, !, 괄호만 쓴다", 설계 figure-syntax.md 조건과 대기 문법
test('parseCondition_reads_every_comparison_with_numbers_and_words', () => {
  const texts = { n: '3', m: '3', holder: 'A', mode: 'open' };
  const cases = [
    ['n=3', true], ['n=4', false], ['n!=4', true], ['n<4', true], ['n<3', false], ['n<=3', true], ['n>2', true], ['n>3', false], ['n>=3', true],
    ['n=m', true], ['n<m', false], ['3=n', true], ['2<n', true], ['-1<n', true], ['n>=2.5', true],
    ["holder='A'", true], ["holder!='A'", false], ["'A'=holder", true], ["mode='open'", true], ['holder!=mode', true], ['holder=holder', true],
    ['n = 3', true], ["holder = 'A'", true],
  ];

  for (const [text, expected] of cases) assert.deepEqual(run(text, texts), { value: expected }, text);
});

// 근거: 문법 "조건 = 항 { || 항 }, 항 = 요소 { && 요소 }, 요소 = ! 요소 | ( 조건 ) | 피연산자 비교 피연산자"
test('parseCondition_binds_and_tighter_than_or_and_not_to_one_comparison_and_groups_with_parentheses', () => {
  const texts = { n: '1', m: '0', holder: 'A', mode: 'open' };

  assert.deepEqual(run('n=1 || m=1 && n=0', texts), { value: true }, '&&가 먼저: n=1 || (m=1 && n=0)');
  assert.deepEqual(run('(n=1 || m=1) && n=0', texts), { value: false }, '괄호가 먼저');
  assert.deepEqual(run('!n=1', texts), { value: false }, '!는 비교 하나에 건다');
  assert.deepEqual(run('!n=0 && m=0', texts), { value: true }, '!n=0 이 먼저 반전되고 && 가 이어진다');
  assert.deepEqual(run('!!n=1', texts), { value: true });
  assert.deepEqual(run('!(n=1 && m=0)', texts), { value: false });
  assert.deepEqual(run("((n=1)) && !(holder='B') || mode='x'", texts), { value: true });
  assert.deepEqual(run("n=1&&holder='A'||m=5", texts), { value: true }, '공백 없이도 읽는다');
});

// 근거: 문법 "조건은 200자 이하다. 평가 비용에 상한을 두기 위해서다"
test('parseCondition_accepts_200_characters_and_rejects_201', () => {
  const pad = (length) => `n=1${' && n=1'.repeat(Math.floor((length - 3) / 7))}${' '.repeat((length - 3) % 7)}`;

  assert.equal(CONDITION_MAX, 200);
  assert.equal(pad(200).length, 200);
  assert.deepEqual(run(pad(200), { n: '1' }), { value: true });
  assert.match(run(pad(201)).error, /at most 200 characters/);
});

// 근거: 계약 "임의의 JavaScript는 없다", 설계 figure-syntax.md 조건과 대기 "함수 호출, 산술, 대입, 임의의 JavaScript는 문법에 없다"
test('parseCondition_runs_no_code_and_rejects_everything_outside_the_grammar', () => {
  globalThis.__conditionRan = false;
  const hostile = [
    'process.exit(1)', 'globalThis.__conditionRan = true', 'n=1; globalThis.__conditionRan = true', 'constructor', '__proto__=1', 'n=1 ? 1 : 2', '(n=1)()', 'n+1=2', 'n=1+1', 'n==1', 'n===1', 'n=`1`', 'n="1"', 'a.b=1', 'n=[1]', 'n={}',
    'import("x")', 'n=1 and m=1', 'n=1 or m=1', 'not n=1', 'n=1 &', 'n=1 |', 'n=1 ||', '', '   ', '(', ')', 'n=', '=1', 'n 1', 'n=1 m=1', '1=1', "'a'='a'", 'n=1 n', "n=''", "n='a b'", "n='abcdefghi'", "n='5'", "n<'x'", "'x'>n",
  ];

  for (const text of hostile) {
    const result = run(text, { n: '1', m: '1', holder: 'A', mode: 'x' });

    assert.equal(typeof result.error, 'string', `"${text}"는 오류다`);
  }
  assert.equal(globalThis.__conditionRan, false);
  delete globalThis.__conditionRan;
});

// 근거: 설계 figure-syntax.md "조건 처리는 자체 파서. eval이나 Function 등 임의 JavaScript 실행 금지"
test('condition_modules_never_call_eval_or_the_Function_constructor', () => {
  for (const file of ['../src/source/condition.js', '../src/flow-events.js', '../src/event-budget.js']) {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');

    assert.doesNotMatch(text, /\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(|\bvm\./, file);
  }
});

// 근거: 계약 "없는 값과 조건 문법 오류는 syntax" — 이름 오타에는 비슷한 이름을 제안한다
test('parseCondition_names_the_unknown_value_and_suggests_a_close_one', () => {
  assert.match(run('holdr=1').error, /unknown value "holdr"\. Did you mean "holder"\?/);
  assert.match(run("moda='x'").error, /unknown value "moda"/);
});

// 근거: 계약 "비교의 한쪽 이상은 값 이름이어야 한다, < 계열에 낱말을 쓰면 그 줄의 오류"
test('parseCondition_requires_a_value_on_one_side_and_numbers_for_ordered_comparisons', () => {
  assert.match(run('1<2').error, /needs a value name on at least one side/);
  assert.match(run("mode<'x'").error, /compares numbers/);
  assert.match(run("mode>=holder", { mode: 'x', holder: 'y' }).error ?? '', /^$/, '값 이름끼리는 읽힌다(종류는 계산할 때 본다)');
});

// 근거: 계약 "숫자와 낱말 비교는 value-type" — 조용히 거짓이 되지 않는다
test('evalCondition_reports_a_number_against_a_word_and_a_word_with_an_ordered_comparison_instead_of_false', () => {
  const texts = { n: '3', m: '4', holder: 'A', mode: 'open' };

  assert.match(run("n='x'", texts).typeError, /"n" holds 3, but 'x' is a word\. A number and a word cannot be compared/);
  assert.match(run('n=3 && holder=1', texts).typeError, /"holder" holds the word "A", but 1 is a number/);
  assert.match(run('holder<mode', texts).typeError, /< compares numbers, but "holder" holds the word "A" and "mode" holds the word "open"\. Use = or != for words/);
  assert.match(run('n=holder', texts).typeError, /A number and a word cannot be compared/);
  assert.deepEqual(run('n<m', texts), { value: true });
});

// 근거: 계산은 짧게 끊지 않아 종류가 맞지 않는 비교를 늘 알아낸다(같은 입력은 같은 결과)
test('evalCondition_evaluates_every_comparison_so_a_type_error_is_never_hidden_by_a_short_circuit', () => {
  const texts = { n: '1', holder: 'A' };

  assert.ok(run('n=2 && holder=1', texts).typeError, '앞이 거짓이어도 뒤의 종류 오류를 알린다');
  assert.ok(run('n=1 || holder=1', texts).typeError, '앞이 참이어도 뒤의 종류 오류를 알린다');
});

// 근거: 조건이 읽는 값 목록은 대기를 다시 평가할 때를 정한다(참조한 값이 바뀐 뒤)
test('parseCondition_lists_each_value_it_reads_once', () => {
  assert.deepEqual(parseCondition("n=1 && (n<m || holder='A')", IDS).refs.sort(), ['holder', 'm', 'n']);
  assert.deepEqual(parseCondition('n=m', IDS).refs.sort(), ['m', 'n']);
});
