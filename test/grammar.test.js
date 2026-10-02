// 문법: 원본 읽기 규칙, 오류 진단, 판과 폐기, 문법 표와 문서 일치.
// 근거 표기: 설계 = docs/design 요구사항 표의 행, 계약 = 공개 문법과 진단 모양(figure-syntax.md), 버그 = 재현된 오류(이슈 번호나 커밋).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildFigure } from '../src/build.js';
import { DOC_END, DOC_START, renderGrammarTables } from '../src/source/grammar-doc.js';
import { KINDS, OPTIONS, STATEMENTS, VALUES, VERSION } from '../src/source/grammar.js';
import { parseFigure } from '../src/source/parse.js';
import { docExamples, errorsOf } from './helpers.js';

const BASE = 'flow right\nbox a "A"\nbox b "B"\na -> b\n';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 문법 표에 임시 항목을 넣고 일이 끝나면 지운다. 표 한 곳이 파서, 검증, migrate를 모두 움직이는지 보려고 표를 직접 고친다.
function withEntry(table, name, entry, run) {
  table[name] = entry;
  try {
    return run();
  } finally {
    delete table[name];
  }
}

const problemsOf = (source) => {
  try {
    parseFigure(source);
    return [];
  } catch (error) {
    return error.problems;
  }
};

// 근거: 설계 figure-syntax.md, figure-kinds.md, charts.md 요구사항 "문서의 모든 예시 원본이 오류와 경고 없이 읽힌다"
test('docExamples_every_design_doc_example_builds_without_errors_or_warnings', async () => {
  // 문서 예시의 경로 "../summary.json"이 test/fixtures/summary.json을 가리키게 하는 기준 폴더다.
  const baseDir = fileURLToPath(new URL('./fixtures/charts/', import.meta.url));

  for (const { file, source } of docExamples()) {
    const { warnings } = await buildFigure(source, { baseDir, strict: true });

    assert.deepEqual(warnings, [], `${file}: ${source.split('\n')[0]}`);
  }
});

const MALFORMED = [
  // 설계 figure-syntax.md 요구사항 "세 부분 순서, 낱말 공백, 이름 형식, 값 형식을 어긴 줄을 줄 번호와 함께 알린다"
  { rule: '세 부분 순서', source: 'flow right\nbox a "A"\ntitle "t"', expect: /^3: .*must come before the declare part/ },
  { rule: '낱말 공백: 기호', source: 'flow right\nbox a "A"\nbox b "B"\na->b', expect: /put spaces around "->"/ },
  { rule: '낱말 공백: 붙은 화살표는 오류 하나(68ec356)', source: 'flow right\nbox a "A"\nbox b "B"\na ->b', expect: ['4: put spaces around "->" in "->b"'] },
  { rule: '낱말 공백: 선택 사항 등호', source: 'flow right\ngroup g "G" direction= down {\nbox a "A"\n}', expect: /without spaces around "="/ },
  { rule: '이름 형식: 끝 대시와 겹 대시', source: 'flow right\nbox a- "A"\nbox b--c "B"', expect: /not a valid name/, count: 2 },
  { rule: '이름 형식: 버린 선언이 이름 없음 오류를 더하지 않음(#5)', source: 'flow right\ngroup a "A" {\n  box Step "나"\n}\nbox c "C"\nStep -> c', count: 1, expect: /^3: "Step" is not a valid name/ },
  { rule: '이름 형식: 계열 이름 대문자', source: 'chart bar\nseries Quiet "A"\nrow "x" Quiet=1', expect: /^2: "Quiet" is not a valid series name/m },
  { rule: '이름 형식: 테이블 이름 대문자', source: 'data right\ntable Users "u" {\n  id bigint\n}', expect: /not a valid name/ },
  { rule: '이름 형식: 열 이름은 글자로 시작', source: 'data right\ntable u "u" {\n  1id bigint\n}', expect: /a column name uses letters/ },
  { rule: '값 형식: 빈 글(68ec356)', source: 'flow right\nbox a ""\nbox b "B" \nb -> a "  "', expect: /empty/i, count: 2 },
  { rule: '값 형식: 0인 시간', source: 'flow right\nspeed 0ms\nbox a "A"', expect: /speed as a time/ },
  { rule: '값 형식: 열 타입의 기호는 따옴표 글(#5)', source: 'data right\ntable t "T" {\n  name varchar(255)\n}', expect: /write a type with symbols as quoted text/ },
  { rule: '값 형식: 모르는 tone', source: 'flow right\nbox a "A"\nstep "s"\n  show a "x" tag="t" tone=pink', expect: /tone is one of purple, green, teal, gray/ },
  { rule: '값 형식: tag 없는 tone', source: 'flow right\nbox a "A"\nstep "s"\n  show a "x" tone=teal', expect: /tone colors a tag/ },
  { rule: '값 형식: clear로 시작하는 카드', source: 'flow right\nbox a "A"\nstep "s"\n  clear a', expect: /cannot start with clear/ },
  { rule: '값 형식: 종류를 모르면 첫 줄 오류만(68ec356)', source: '# 설명\nflo right\nbox a "A\n', count: 1, expect: /./ },
  { rule: '예상 못한 낱말: 객체 속성 이름이 낱말이어도 죽지 않음(68ec356)', source: 'flow right\nconstructor a "A"', expect: /unknown statement "constructor"/ },
  // 설계 figure-syntax.md 요구사항 "같은 방향 선 두 개, 자기 자신으로 가는 선, 그룹과 안 도형 사이 선을 막는다"
  { rule: '선: 같은 방향 두 개', source: 'flow right\nbox a "A"\nbox b "B"\na -> b\na -> b "x"', expect: /already an edge a -> b/ },
  { rule: '선: 자기 자신', source: 'flow right\nbox a "A"\na -> a', expect: /to itself/ },
  { rule: '선: 그룹과 안 도형', source: 'flow right\ngroup g "G" {\nbox a "A"\n}\ng -> a', expect: /join a group and a node inside it/ },
  // 설계 figure-kinds.md 요구사항 "종류 사이 규칙 표의 오류 칸마다 오류를 낸다", "start는 없거나 하나", "외래 키는 pk나 unique 열만"
  { rule: '종류: 순서 그림의 group', source: 'sequence\nbox a "A"\ngroup g "G" {\n}', expect: /"group" is not allowed in a sequence figure\. Remove the line/ },
  { rule: '종류: 상태 그림의 show', source: 'state down\nstate a "A"\nstart a\nstep "s"\n  show a "x"', expect: /"show" is not allowed in a state figure/ },
  { rule: '종류: 열 이름은 데이터 그림에만', source: 'flow right\nbox a "A"\nbox b "B"\na -> b\nstep "s"\n  a.x -> b.y', expect: /names a column, which only data figures have/ },
  { rule: '종류: 상태 start 둘', source: 'state down\nstate a "A"\nstate b "B"\nstart a\nstart b\na -> b "go"', expect: /already a start state/ },
  { rule: '종류: 외래 키는 pk나 unique만', source: 'data right\ntable a "a" {\n  id bigint pk\n  name varchar\n}\ntable b "b" {\n  a_name varchar fk=a.name\n}', expect: /pk or unique/ },
  { rule: '종류: 순서 그림 note는 바로 앞 메시지의 참여자만', source: 'sequence\nbox a "A"\nbox b "B"\nbox c "C"\nstep "s"\n  a -> b "m"\n  note c "x"', expect: /participants of the message above/ },
  { rule: '종류: 순서 그림은 참여자가 있어야 함(68ec356)', source: 'sequence\nstep "s"\n  wait 1s', expect: ['1: a sequence figure needs at least one participant'] },
  // 설계 charts.md 줄 표: point 줄의 x는 가로값 키
  { rule: '차트: 선 차트 계열 이름 x', source: 'chart line\nseries x "X"\npoint x=1 x=2', expect: /cannot be named "x"/ },
];

// 근거: 설계 figure-syntax.md, figure-kinds.md 요구사항 표(위 표의 rule 칸에 행별로 적음)
test('parseFigure_malformed_source_reports_the_line_and_the_rule', () => {
  for (const { rule, source, expect, count } of MALFORMED) {
    const errors = errorsOf(source);

    if (Array.isArray(expect)) assert.deepEqual(errors, expect, rule);
    else assert.match(errors.join('\n'), expect, rule);
    if (count) assert.equal(errors.length, count, `${rule}: ${errors.join(' | ')}`);
  }
});

const VALID = [
  // 계약 figure-syntax.md: 이름 자리에서는 예약어를 이름으로 쓴다(#6)
  { form: '모든 이름 자리의 예약어', source: 'flow right\nbox data "데이터"\nbox store "저장"\nbox q1 "1분기"\nbox step "단계"\nbox title "제목"\ndata -> store\nstep -> q1\nstep "s"\n  show title "x"\n  data -> store' },
  { form: '데이터 그림의 예약어 이름', source: 'data right\ntable row "행" {\n  id bigint pk\n}\ntable key "키" {\n  id bigint pk\n  row_id bigint fk=row.id\n}\nstep "s"\n  light row.id key' },
  { form: '상태 그림의 start와 final 이름', source: 'state right\nstate start "시작"\nstate final "끝"\nstart start\nfinal final\nstart -> final "go"\nstep "s"\n  light start' },
  { form: '순서 그림의 note 이름', source: 'sequence\nbox x "X"\nbox note "N"\nstep "s"\n  x -> note "m"\n  note note "n"' },
  { form: '선택 사항 낱말 이름', source: 'flow right\nbox quiet "q"\nbox dashed "d"\nquiet -> dashed "x" quiet dashed\nstep "s"\n  quiet -> dashed' },
  { form: '열 이름 pk와 unique', source: 'data right\ntable pk "t" {\n  pk bigint pk\n  unique varchar unique\n}' },
  { form: '계열 이름 reveal 낱말', source: 'chart bar\nseries mono "A"\nrow "r" mono=1\nstep "s"\n  reveal mono' },
  { form: '낱말 mutoscope 이름', source: 'flow right\nbox mutoscope "도구"\nbox b "B"\nmutoscope -> b\n' },
  // 계약 figure-syntax.md: 열 이름은 대문자와 예약어를 허용한다(#6)
  { form: '열 이름 대문자와 외래 키', source: 'data right\ntable users "users" {\n  userId bigint pk\n  createdAt timestamp\n}\ntable posts "posts" {\n  authorId bigint fk=users.userId\n}' },
  { form: '열 이름 예약어', source: 'data right\ntable orders "orders" {\n  state varchar\n  id bigint pk\n}' },
  // 계약 figure-syntax.md: start는 없어도 되고 상태는 자기 자신으로 갈 수 있다(#6, d25c8b0)
  { form: 'start 없는 상태 그림', source: 'state down\nstate a "A"\nstate b "B"\na -> b "go"' },
  { form: '상태 그림의 자기 전이', source: 'state right\nstate a "A"\nstart a\na -> a "retry"' },
  // 계약 figure-syntax.md: 주석, 줄바꿈, 공백 (68ec356에서 CR, BOM, 유니코드 공백이 낱말 나누기를 멈추게 했다)
  { form: '따옴표 밖 #은 주석', source: 'flow right\nbox api "API"# 설명\nbox b "B#1"\napi -> b# 쓰기' },
  { form: 'CRLF', source: 'flow right\r\nbox a "A"\r\n' },
  { form: 'BOM', source: '﻿flow right\nbox a "A"' },
  { form: '유니코드 공백', source: 'flow right\nbox a "A" \nbox　b "B"' },
  { form: '새 tone 이름', source: 'flow right\nbox a "A"\nstep "s"\n  show a "x" tag="t" tone=teal' },
];

// 근거: 계약 figure-syntax.md 문법(예약어 이름, 열 이름, start, 주석, 줄바꿈)과 버그 68ec356, #6
test('parseFigure_valid_forms_read_without_errors', () => {
  for (const { form, source } of VALID) assert.deepEqual(errorsOf(source), [], form);
});

// 근거: 설계 figure-syntax.md 요구사항 "선언하지 않은 이름과 비슷한 이름을 함께 알린다"
test('parseFigure_unknown_name_suggests_the_nearest_declared_name', () => {
  const errors = errorsOf('flow right\nbox codex "C"\nbox engine "E"\nengine -> cdex');

  assert.match(errors[0], /^4: unknown node "cdex"\. Did you mean "codex"\? Declared: codex, engine$/);
});

// 근거: 설계 figure-syntax.md 요구사항 "이동은 같은 방향 선을 먼저, 없으면 반대 방향 선을 거꾸로 따라간다"
test('parseFigure_hop_follows_the_same_direction_edge_first_then_the_reverse_one', () => {
  const both = parseFigure('flow right\nbox a "A"\nbox b "B"\na -> b\nb -> a\nstep "s"\n  b -> a').figure.steps[0].beats[0].hops[0];
  const single = parseFigure('flow right\nbox a "A"\nbox b "B"\na -> b\nstep "s"\n  b -> a').figure.steps[0].beats[0].hops[0];

  assert.deepEqual([both.edge, both.isBack], [1, false]);
  assert.deepEqual([single.edge, single.isBack], [0, true]);
});

// 근거: 설계 figure-syntax.md 요구사항 "오류를 모두 모아 알리고 파일을 쓰지 않는다"(파일 쓰기는 cli.test.js)
test('parseFigure_all_errors_are_reported_together', () => {
  const errors = errorsOf('flow right\nbox Step "S"\nbox a "A"\na -> zz\na->b');

  assert.equal(errors.length, 3);
});

// 근거: 계약 figure-syntax.md 글 안 백틱: 짝이 맞지 않으면 그 줄의 오류
test('buildFigure_unpaired_backtick_is_an_error_at_its_line', async () => {
  await assert.rejects(buildFigure('flow\nbox a "가 `x"\n', {}), (error) => /not paired/.test(error.problems[0].message) && error.problems[0].line === 2);
});

// 근거: 계약 figure-syntax.md 진단의 모양 { severity, code, line, column, message }
test('parseFigure_error_diagnostic_has_severity_code_line_column_and_message', () => {
  const [error] = problemsOf('flow right\nbox a "A"\na->b');

  assert.deepEqual(error, { severity: 'error', code: 'syntax', line: 3, column: 1, message: 'put spaces around "->" in "a->b"' });
});

// 근거: 계약 figure-syntax.md 호환 규칙 "판": 판 줄이 없으면 판 1, 있으면 그 판으로 읽고, 첫 문장이어야 하며, 이름으로도 쓸 수 있다
test('parseFigure_version_line_sets_the_version_and_defaults_to_1', () => {
  assert.equal(parseFigure(BASE).figure.version, 1);
  const { figure } = parseFigure(`mutoscope 1\n# 주석\n${BASE}`);
  assert.deepEqual([figure.version, figure.kind, figure.line], [1, 'flow', 3]);
  assert.match(errorsOf(`${BASE}mutoscope 1\n`)[0], /^5: the version line/);
  assert.match(errorsOf('mutoscope 1\n')[0], /no figure/);
});

// 근거: 계약 figure-syntax.md 호환 규칙: 진단 code unsupported-version, invalid-version, version-required
test('parseFigure_version_problems_have_a_stable_code', () => {
  const [unsupported] = problemsOf(`mutoscope ${VERSION + 1}\n${BASE}`);
  assert.equal(unsupported.code, 'unsupported-version');
  assert.match(unsupported.message, new RegExp(`version ${VERSION + 1}`));
  for (const line of ['mutoscope', 'mutoscope 0', 'mutoscope one', 'mutoscope 1 2', 'mutoscope "1"']) assert.equal(problemsOf(`${line}\n${BASE}`)[0].code, 'invalid-version', line);
  withEntry(STATEMENTS, 'future', { since: VERSION + 1, section: 'declare', kinds: ['flow'] }, () => {
    const [error] = problemsOf(`${BASE}future x\n`);

    assert.equal(error.code, 'version-required');
    assert.match(error.message, new RegExp(`mutoscope ${VERSION + 1}`));
  });
});

// 근거: 계약 figure-syntax.md 호환 규칙 "폐기": 폐기 값은 새 이름으로 읽고 deprecated 진단과 fix(줄, 열, 길이, 글)를 낸다
test('parseFigure_deprecated_value_reads_as_its_replacement_and_gives_a_fix', () => {
  const entry = { since: 1, deprecated: { since: 1, replace: 'purple', note: 'use the new name' } };
  withEntry(VALUES.tone.items, 'mauve', entry, () => {
    const { figure, deprecations } = parseFigure(`${BASE}step "s"\n  a -> b\n  show b "x" tag="t" tone=mauve\n`);

    assert.equal(figure.steps[0].beats[0].ops[0].row.tone, 'purple');
    assert.deepEqual(deprecations.map((d) => [d.severity, d.code, d.line, d.column]), [['deprecated', 'deprecated-value', 7, 27]]);
    assert.deepEqual(deprecations[0].fix, { line: 7, column: 27, length: 5, text: 'purple' });
    assert.match(deprecations[0].message, /tone value "mauve" is deprecated since version 1.*Use "purple".*use the new name/);
  });
});

// 근거: 계약 figure-syntax.md 호환 규칙 "폐기": 낱말, 선택 사항 키, 그림 종류도 같은 규칙. 이름 자리의 글은 바꾸지 않는다
test('parseFigure_deprecated_statement_option_and_kind_read_as_replacements_but_names_are_kept', () => {
  withEntry(STATEMENTS, 'oldbox', { since: 1, deprecated: { since: 1, replace: 'box' } }, () => {
    withEntry(OPTIONS, 'group.dir', { since: 1, type: 'word', values: 'direction', deprecated: { since: 1, replace: 'direction' } }, () => {
      withEntry(KINDS, 'diagram', { since: 1, deprecated: { since: 1, replace: 'flow' }, argument: 'direction' }, () => {
        const { figure, deprecations } = parseFigure('diagram down\noldbox a "A"\ngroup g "G" dir=right {\n  box b "B"\n}\n');
        const named = parseFigure('flow right\nbox oldbox "이름"\nbox b "B"\noldbox -> b\n');

        assert.deepEqual([figure.kind, figure.nodes[0].shape, figure.groups[0].direction], ['flow', 'box', 'right']);
        assert.deepEqual(deprecations.map((d) => d.code), ['deprecated-kind', 'deprecated-statement', 'deprecated-option']);
        assert.deepEqual([named.figure.nodes[0].id, named.deprecations.length], ['oldbox', 0]);
      });
    });
  });
});

// 근거: 계약 figure-syntax.md 호환 규칙: 문법 표의 항목마다 판이 현재 판 이하이고, 값 없는 낱말(flag)은 별칭을 두지 않는다
test('grammar_every_entry_has_a_valid_version_and_flags_have_no_deprecated_alias', () => {
  const entries = [...Object.entries(KINDS), ...Object.entries(STATEMENTS), ...Object.entries(OPTIONS), ...Object.entries(VALUES).flatMap(([list, { items }]) => Object.entries(items).map(([name, item]) => [`${list}.${name}`, item]))];

  for (const [name, item] of entries) assert.ok(Number.isInteger(item.since) && item.since >= 1 && item.since <= VERSION, name);
  for (const [key, option] of Object.entries(OPTIONS)) if (option.type === 'flag') assert.equal(option.deprecated, undefined, key);
});

// 근거: 설계 figure-syntax.md 요구사항 "문법 표와 이 문서의 표가 같다"
test('grammarDoc_figure_syntax_tables_equal_the_tables_made_from_the_grammar', () => {
  const doc = readFileSync(new URL('../docs/design/figure-syntax.md', import.meta.url), 'utf8');
  const written = doc.slice(doc.indexOf(DOC_START) + DOC_START.length, doc.indexOf(DOC_END)).trim();
  const tables = renderGrammarTables();

  assert.equal(written, tables, 'run npm run grammar to rewrite the tables in docs/design/figure-syntax.md');
  for (const word of Object.keys(STATEMENTS)) assert.ok(tables.includes(`\`${STATEMENTS[word].display ?? word}\``), word);
  for (const key of Object.keys(OPTIONS)) assert.ok(tables.includes(`\`${key}\``), key);
});

// 근거: 규칙 docs-integration.md 변환과 검사 "원본과 만든 그림 함께 커밋": README 예시 원본은 만든 그림의 원본과 같다
test('readme_example_equals_the_source_of_the_rendered_asset', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const block = /```text\n(flow right[\s\S]*?)```/.exec(read('../README.md'))[1];

  assert.equal(block, read('../docs/assets/how-it-works.muto'));
});
