// 값 유지(`keep`), 단계 시작 재설정(단계 `set=`), 읽기 식(`:=`)과 같은 시각의 읽기·쓰기 순서(docs/design/playback.md 단계 사이 값 유지, 이벤트 순서, figure-syntax.md 값 유지와 읽기).
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { parseFigure } from '../src/source/parse.js';
import { runCli, withFolder } from './helpers.js';

const EXAMPLES = new URL('../examples/', import.meta.url);
// 값 셋(숫자 둘, 낱말 하나)과 큐 하나. 값 줄은 14~21줄, 단계는 그 뒤에 붙인다.
const BASE = 'flow right\nbox a "A"\nbox b "B"\nvalue n "개수" on=b\nvalue m "복사" on=a from=7\nvalue w "낱말" on=a from=x\nqueue q "큐" slots=5\na -> b\nb -> a\n';
const LINES = BASE.split('\n').length - 1;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
// 원본의 오류 진단 목록 { code, line, message }. 오류가 없으면 빈 목록이다.
async function errorsOf(source) {
  try {
    await buildFigure(source);
    return [];
  } catch (error) {
    return error.problems;
  }
}

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 값 줄 수
// basis: estimate
// 값 줄 가운데 이름이 id인 것의 단계 시작 값(initial) 목록
const initialsOf = (timeline, id) => timeline.values.filter((row) => row.id === id).map((row) => row.initial);

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 값 줄 수
// basis: estimate
// 값 줄 하나의 변화 글 목록
const changesOf = (timeline, id, si = 0) => timeline.values.find((row) => row.id === id && row.si === si).changes.map(([, text]) => text);

// 근거: 이슈 #118 완료 조건 "keep한 값, keep하지 않은 값, 재설정을 건 값, 첫 단계, 한 바퀴 뒤 재시작", 설계 playback.md 단계 사이 값 유지
test('buildFigure_keep_starts_from_the_value_the_step_before_ended_with_and_other_values_return_to_from', async () => {
  const { timeline } = await buildFigure(`${BASE}on b n+1, m+10\nstep "하나"\n  a -> b\nstep "둘" keep="n"\n  a -> b\nstep "셋"\n  a -> b\n`);

  assert.deepEqual(initialsOf(timeline, 'n'), ['0', '1', '0']);
  assert.deepEqual(initialsOf(timeline, 'm'), ['7', '7', '7']);
  assert.deepEqual(changesOf(timeline, 'n', 1), ['2']);
});

// 근거: 설계 figure-syntax.md 값 유지와 읽기 "재설정이 앞 단계의 값보다 우선하고, keep하지 않은 값에 적으면 from 대신 그 식의 결과에서 시작한다"
test('buildFigure_step_set_wins_over_keep_and_starts_a_value_that_is_not_kept_from_its_own_result', async () => {
  const { timeline } = await buildFigure(`${BASE}on b n+1\nstep "하나"\n  a -> b\nstep "둘" keep="n" set="n=9, m+1"\n  a -> b\nstep "셋" keep="n" set="n+5"\n  a -> b\nstep "넷"\n  a -> b\n`);

  assert.deepEqual(initialsOf(timeline, 'n'), ['0', '9', '15', '0']);
  assert.deepEqual(initialsOf(timeline, 'm'), ['7', '8', '7', '7']);
  assert.deepEqual(changesOf(timeline, 'n', 1), ['10'], '재설정은 변화가 아니라 시작 값이라 밝히지 않는다');
  assert.deepEqual(timeline.values.find((row) => row.id === 'n' && row.si === 1).flashes.length, 1);
});

// 근거: 설계 playback.md 단계 사이 값 유지 "첫 단계와 그림 전체의 되풀이는 늘 선언한 from에서 시작한다", 시간표가 앞 단계를 몰라도 시작 값을 담는다
test('buildFigure_first_step_and_the_restart_after_a_lap_start_from_from_and_only_the_first_step_set_changes_it', async () => {
  const kept = `${BASE}on b n+1\nstep "하나" set="m=3"\n  a -> b\nstep "둘" keep="n, m"\n  a -> b\nstep "셋" keep="n"\n  a -> b\n`;
  const first = (await buildFigure(kept)).timeline;
  const again = (await buildFigure(kept)).timeline;

  assert.deepEqual(initialsOf(first, 'n'), ['0', '1', '2']);
  assert.deepEqual(initialsOf(first, 'm'), ['3', '3', '7']);
  assert.deepEqual(first.values, again.values, '같은 입력은 같은 값 결과');
  // 한 바퀴를 마친 값(n=3)이 다음 바퀴의 첫 단계로 넘어가지 않는다. 첫 단계는 시간표가 담은 initial에서 시작한다.
  assert.equal(changesOf(first, 'n', 2).at(-1), '3');
  assert.equal(first.values.find((row) => row.si === 0 && row.id === 'n').periods[0][2], '0');
});

// 근거: 설계 figure-syntax.md 값 유지와 읽기 "keep이 넘기는 것은 값 글자뿐이다. 값 줄의 밝힘은 넘기지 않는다"
test('buildFigure_keep_carries_only_the_value_text_and_not_the_flash', async () => {
  const { timeline } = await buildFigure(`${BASE}on b n+1\nstep "하나"\n  a -> b\nstep "둘" keep="n"\n  say "멈춤"\n`);
  const second = timeline.values.find((row) => row.id === 'n' && row.si === 1);

  assert.equal(second.initial, '1');
  assert.deepEqual([second.changes, second.flashes], [[], []]);
});

// 근거: 이슈 #118 계약 "읽기 식 대상:=원천", 설계 playback.md 이벤트 순서 "그래서 set=\"a:=b, b:=a\"는 두 값을 맞바꾼다"
test('buildFigure_swaps_two_values_with_one_read_set_because_reads_happen_before_the_writes', async () => {
  const { timeline } = await buildFigure(`${BASE.replace('from=7', 'from=2').replace('"개수" on=b', '"개수" on=b from=1')}step "s"\n  a -> b set="n:=m, m:=n"\n`);

  assert.deepEqual([changesOf(timeline, 'n'), changesOf(timeline, 'm')], [['2'], ['1']]);
  // 반대 사례: 박자를 나눠 차례로 쓰면 m이 이미 바뀐 n(2)을 읽어 m은 그대로 2다
  const sequential = await buildFigure(`${BASE.replace('from=7', 'from=2').replace('"개수" on=b', '"개수" on=b from=1')}step "s"\n  a -> b set="n:=m"\n  b -> a set="m:=n"\n`);
  assert.deepEqual([changesOf(sequential.timeline, 'n'), changesOf(sequential.timeline, 'm')], [['2'], []]);
});

// 근거: 설계 playback.md 이벤트 순서 표 "같은 시각의 on 줄이 set=보다 앞", 식에 든 읽기는 갱신을 시작하는 시점의 값을 읽는다
test('buildFigure_a_read_set_sees_the_on_line_write_of_the_same_moment_and_reads_the_start_of_its_own_update', async () => {
  const { timeline } = await buildFigure(`${BASE.replace('a -> b\n', 'on b n+10\na -> b\n')}step "s"\n  a -> b set="m:=n"\nstep "t"\n  a -> b set="n+1, m:=n"\n`);

  assert.deepEqual(changesOf(timeline, 'm', 0), ['10'], 'on 줄의 쓰기가 같은 시각 set=의 읽기에 보인다');
  assert.deepEqual([changesOf(timeline, 'n', 1), changesOf(timeline, 'm', 1)], [['11'], ['10']], '같은 set=의 n+1은 m:=n의 읽기에 보이지 않고, 같은 시각의 연쇄는 마지막 글 하나로 보인다');
});

// 근거: 이슈 #118 완료 조건 "바로 앞 갱신의 쓰기가 다음 갱신에 보이는 원본", 설계 playback.md 이벤트 순서 "앞 이벤트의 쓰기는 뒤 이벤트가 읽는다"
test('buildFigure_the_write_of_the_update_before_is_read_by_the_next_update_in_declaration_order', async () => {
  const same = 'step "s"\n  a -> b time=1s set="n=5" & a -> b time=1s set="m:=n"\n';
  const flipped = 'step "s"\n  a -> b time=1s set="m:=n" & a -> b time=1s set="n=5"\n';
  const first = await buildFigure(`${BASE}${same}`);
  const second = await buildFigure(`${BASE}${flipped}`);

  assert.deepEqual([changesOf(first.timeline, 'n'), changesOf(first.timeline, 'm')], [['5'], ['5']]);
  assert.deepEqual([changesOf(second.timeline, 'n'), changesOf(second.timeline, 'm')], [['5'], ['0']], '읽기가 먼저 선언되면 바뀌기 전 값을 읽는다');
});

// 근거: 설계 playback.md 이벤트 순서 "같은 시각의 갱신 연쇄는 값 줄에 그 시각의 마지막 글 하나로 보인다"
test('buildFigure_a_value_that_returns_to_its_text_within_one_moment_shows_no_change', async () => {
  const { timeline } = await buildFigure(`${BASE}step "s"\n  a -> b time=1s set="w=y" & a -> b time=1s set="w=x, n:=n"\n`);

  assert.deepEqual(changesOf(timeline, 'w'), []);
});

// 근거: 설계 figure-syntax.md 값 유지와 읽기 "원천은 값 이름이고 참조 값과 큐도 된다"
test('buildFigure_reads_a_reference_value_and_a_queue_and_a_reference_follows_what_was_read_into_its_target', async () => {
  const source = 'flow right\nbox a "A"\nbox b "B"\nvalue n "개수" on=a from=4\nvalue r "참조" on=a ref=n\nvalue c "복사" on=b\nqueue q "큐" slots=5 from=2\na -> b\nstep "s"\n  a -> b set="c:=r, n:=q"\n';
  const { timeline } = await buildFigure(source);

  assert.deepEqual([changesOf(timeline, 'c'), changesOf(timeline, 'n'), changesOf(timeline, 'r')], [['4'], ['2'], ['2']]);
});

// 근거: 설계 figure-syntax.md 값 유지와 읽기 "id=낱말의 = 뒤는 어떤 낱말이든 값 글자", "옛 원본의 값 글자는 바뀌지 않는다"
test('buildFigure_a_word_after_equals_stays_a_value_text_even_when_it_looks_like_a_value_name_or_a_read', async () => {
  const { timeline } = await buildFigure(`${BASE}step "s"\n  a -> b time=1s set="w=n" & b -> a time=2s set="w=a:=b"\n`);

  assert.deepEqual(changesOf(timeline, 'w'), ['n', 'a:=b']);
});

// 근거: 이슈 #118 완료 조건 "새 기능을 쓰지 않는 원본의 값 초기화, 값 갱신 순서, 시간표가 바뀌지 않고 이벤트 처리 비용이 붙지 않는다"
test('parseFigure_a_source_without_the_new_syntax_has_no_read_flag_no_keep_and_no_step_set_so_the_old_value_path_runs', async () => {
  for (const name of readdirSync(EXAMPLES).filter((file) => file.endsWith('.dap'))) {
    const { figure } = parseFigure(readFileSync(new URL(name, EXAMPLES), 'utf8'));

    assert.equal(figure.hasRead, false, name);
    assert.ok(figure.steps.every((step) => step.keep.length === 0 && step.sets.length === 0), name);
  }
  const { figure: used } = parseFigure(`${BASE}step "s"\n  a -> b set="m:=n"\n`);
  assert.equal(used.hasRead, true);
});

// 근거: 설계 playback.md 기존 원본과의 호환 "한 원본 안에서도 쓰지 않은 단계의 결과는 바뀌지 않는다"
test('buildFigure_a_step_without_the_new_syntax_keeps_its_result_when_another_step_of_the_figure_uses_it', async () => {
  const tail = 'step "끝"\n  a -> b time=1s set="n=1" & a -> b time=1s set="n=2"\n';
  const plain = await buildFigure(`${BASE}step "하나"\n  a -> b set="m=1"\n${tail}`);
  const mixed = await buildFigure(`${BASE}step "하나"\n  a -> b set="m:=n"\n${tail}`);

  // 같은 시각 두 쓰기는 옛 경로에서 변화 둘로 남는다. 읽기가 든 단계에서만 한 글로 합친다.
  assert.deepEqual(changesOf(plain.timeline, 'n', 1), ['1', '2']);
  assert.deepEqual(plain.timeline.values.filter((row) => row.si === 1), mixed.timeline.values.filter((row) => row.si === 1));
});

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 오류 원본 수
// basis: estimate
// 오류 원본마다 { name, source, line, code, message }. 줄 번호는 BASE 뒤에 붙인 줄로 센다.
const ERROR_CASES = [
  { name: 'keep_unknown_value', body: 'step "하나"\n  a -> b\nstep "둘" keep="nn"\n  a -> b\n', line: LINES + 3, message: /unknown value "nn"\. Did you mean "n"\?/ },
  { name: 'keep_reference_value', base: BASE.replace('a -> b\n', 'value r "참조" on=a ref=n\na -> b\n'), body: 'step "하나"\n  a -> b\nstep "둘" keep="r"\n  a -> b\n', line: LINES + 4, message: /"r" is a reference to "n", so it follows that value\. Keep "n" instead/ },
  { name: 'keep_twice', body: 'step "하나"\n  a -> b\nstep "둘" keep="n, m, n"\n  a -> b\n', line: LINES + 3, message: /"n" is kept twice/ },
  { name: 'keep_on_the_first_step', body: 'step "하나" keep="n"\n  a -> b\n', line: LINES + 1, message: /first step has none/ },
  { name: 'keep_item_that_is_not_a_name', body: 'step "하나"\n  a -> b\nstep "둘" keep="n, 1x"\n  a -> b\n', line: LINES + 3, message: /keep is a list of value names .* Found "1x"/ },
  { name: 'read_into_a_reference_value', base: BASE.replace('a -> b\n', 'value r "참조" on=a ref=n\na -> b\n'), body: 'step "하나"\n  a -> b set="r:=m"\n', line: LINES + 3, message: /"r" is a reference to "n"\. Set "n" instead/ },
  { name: 'read_from_an_unknown_value', body: 'step "하나"\n  a -> b set="n:=mm"\n', line: LINES + 2, message: /unknown value "mm"\. Did you mean "m"\?/ },
  { name: 'read_source_that_is_not_a_name', body: 'step "하나"\n  a -> b set="n:=5"\n', line: LINES + 2, message: /write a read as target:=source/ },
  { name: 'read_in_an_on_line_from_an_unknown_value', base: BASE.replace('a -> b\n', 'on b n:=zz\na -> b\n'), body: 'step "하나"\n  a -> b\n', line: LINES - 1, message: /unknown value "zz"/ },
  { name: 'step_set_with_a_node', body: 'step "하나" set="n=1@a"\n  a -> b\n', line: LINES + 1, message: /takes no @node/ },
  { name: 'step_set_into_a_reference_value', base: BASE.replace('a -> b\n', 'value r "참조" on=a ref=n\na -> b\n'), body: 'step "하나" set="r=1"\n  a -> b\n', line: LINES + 2, message: /"r" is a reference to "n"/ },
  { name: 'sum_on_a_value_that_reads_a_word', body: 'step "하나"\n  a -> b set="n:=w"\nstep "둘"\n  a -> b set="n+1"\n', line: LINES + 4, message: /does a sum, but "n" holds a word/ },
];

// 근거: 이슈 #118 완료 조건 "진단이 줄 번호와 code와 함께 나오고 오류가 있으면 결과 파일이 없다", 계약 "없는 값, 참조 값을 keep하거나 :=의 대상으로 씀, keep 중복, 첫 단계의 keep은 syntax 오류"
test('buildFigure_each_value_keep_and_read_mistake_is_a_syntax_error_on_its_own_line', async () => {
  for (const { name, base = BASE, body, line, message } of ERROR_CASES) {
    const errors = await errorsOf(`${base}${body}`);

    assert.equal(errors.length, 1, `${name}: ${errors.map((e) => e.message).join(' | ')}`);
    assert.deepEqual([errors[0].code, errors[0].line], ['syntax', line], name);
    assert.match(errors[0].message, message, name);
  }
});

// 근거: 계약 "keep은 flow 그림의 값에만 쓴다"(값 선언은 flow 전용이라 다른 그림에는 keep할 값이 없다)
test('buildFigure_keep_and_step_set_in_a_figure_without_values_are_errors', async () => {
  const source = 'sequence\nperson a "A"\nperson b "B"\nstep "하나"\n  a -> b "x"\nstep "둘" keep="n" set="n=1"\n  b -> a "y"\n';
  const errors = await errorsOf(source);

  assert.deepEqual(errors.map((e) => [e.code, e.line]), [['syntax', 6], ['syntax', 6]]);
  assert.match(errors[0].message, /keep belongs to flow figures only/);
  assert.match(errors[1].message, /set belongs to flow figures only/);
});

// 근거: 계약 "큐에 정수가 아닌 글을 읽어 넣으면 실행 때 value-type 오류", 설계 figure-syntax.md 추가 문법 표 진단 code
test('buildFigure_reading_a_non_integer_text_into_a_queue_is_a_value_type_error_at_run_time_on_that_line', async () => {
  const word = await errorsOf(`${BASE}step "s"\n  a -> b set="q:=w"\n`);
  const decimal = await errorsOf(`${BASE.replace('value n "개수" on=b', 'value n "개수" on=b from=1.5')}step "s"\n  a -> b set="q:=n"\n`);
  const whole = await errorsOf(`${BASE}step "s"\n  a -> b set="q:=m"\n`);

  assert.deepEqual(word.map((e) => [e.code, e.line]), [['value-type', LINES + 2]]);
  assert.match(word[0].message, /"q" is a queue .* but "w" holds "x"/);
  assert.deepEqual(decimal.map((e) => [e.code, e.line]), [['value-type', LINES + 2]]);
  assert.deepEqual(whole, [], '정수는 큐에 들어간다');
});

// 근거: 계약 "읽기는 실행 때 값 종류 오류": 점이 닿지 못하는 이벤트의 읽기는 실행되지 않는다
test('buildFigure_a_read_into_a_queue_that_never_runs_in_the_step_is_not_a_value_type_error', async () => {
  const errors = await errorsOf(`${BASE}step "s" for=1s\n  track a -> b time=5s set="q:=w"\n`);

  assert.deepEqual(errors, []);
});

// 근거: 이슈 #118 완료 조건 "오류가 있으면 결과 파일이 없다": 문법 오류와 실행 때 오류 모두 종료 코드 1, 줄 번호와 code, 파일 없음
test('main_render_with_a_keep_or_read_error_exits_1_with_the_line_and_code_and_writes_no_file', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'syntax.dap'), `${BASE}step "하나"\n  a -> b\nstep "둘" keep="nn"\n  a -> b\n`);
    writeFileSync(join(folder, 'run.dap'), `${BASE}step "s"\n  a -> b set="q:=w"\n`);

    const syntax = runCli(['render', 'syntax.dap', '--html'], folder);
    const run = runCli(['check', 'run.dap', '--json'], folder);
    const [diagnostic] = run.stdout.trim().split('\n').map((line) => JSON.parse(line));

    assert.equal(syntax.status, 1);
    assert.match(syntax.stderr, new RegExp(`^syntax\\.dap:${LINES + 3}: unknown value "nn"`, 'm'));
    assert.deepEqual([existsSync(join(folder, 'syntax.svg')), existsSync(join(folder, 'syntax.html'))], [false, false]);
    assert.equal(run.status, 1);
    assert.deepEqual([diagnostic.code, diagnostic.line], ['value-type', LINES + 2]);
    assert.equal(runCli(['render', 'run.dap'], folder).status, 1);
    assert.ok(!existsSync(join(folder, 'run.svg')));
  });
});

// 근거: 이슈 #118 완료 조건 "같은 입력은 같은 값 결과를 만든다"
test('buildFigure_the_same_source_builds_the_same_values_every_time', async () => {
  const source = `${BASE}on b n+1, m:=n\nstep "하나"\n  a -> b set="w:=m"\nstep "둘" keep="n, w" set="m:=w"\n  b -> a set="n+1, w:=n"\n`;
  const [one, two] = [await buildFigure(source), await buildFigure(source)];

  assert.deepEqual(one.timeline.values, two.timeline.values);
  assert.deepEqual(one.timeline.segs, two.timeline.segs);
});

// 근거: 설계 figure-check.md 14번 "단계 시작 값의 글자와 큐 값도 센다"(단계 set=의 재설정이 상한을 넘는 시작 값을 만들 수 있다)
test('buildFigure_check_14_counts_the_start_value_a_step_set_makes', async () => {
  const queue = await buildFigure(`${BASE}step "s"\n  a -> b\nstep "t" set="q=9"\n  a -> b\n`);
  const long = await errorsOf(`${BASE}step "s" set="n+999999999"\n  a -> b\n`);

  assert.deepEqual(queue.warnings.map((w) => [w.code, w.line]), [['check-14', 7]], '경고는 큐를 선언한 줄에 난다');
  assert.match(queue.warnings[0].message, /queue "q" reaches 9, over its 5 slots/);
  assert.deepEqual(long.map((e) => [e.code, e.line]), [['check-14', 4]], '오류는 값을 선언한 줄에 난다');
  assert.match(long[0].message, /reaches "999999999", over 8 characters/);
});

// 근거: 설계 figure-syntax.md 시간 흐름 `step ... keep= set= status=`: 한 단계 줄에 값 유지와 도형 상태를 함께 쓴다
test('buildFigure_keep_and_status_in_one_step_both_apply', async () => {
  const { timeline } = await buildFigure(`${BASE}on b n+1\nstep "하나"\n  a -> b\nstep "둘" keep="n" status="b=ok"\n  a -> b\nstep "셋"\n  a -> b\n`);
  const statusOf = (si) => timeline.segs.filter((seg) => seg.si === si).map((seg) => seg.status ?? []);

  assert.deepEqual(initialsOf(timeline, 'n'), ['0', '1', '0']);
  assert.deepEqual(statusOf(1).flat().map((s) => [s.node, s.kind]), [['b', 'ok']]);
  assert.deepEqual([statusOf(0).flat(), statusOf(2).flat()], [[], []], '상태는 그 단계에서만 보인다');
});
