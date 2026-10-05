// 호환: 판 1 고정 묶음, 옛 CLI 필드와 종료 코드, migrate. test/fixtures/compat/v1/의 파일은 판 1 문법으로 쓴 원본이고 앞으로 고치지 않는다.
// 새 판(깨지는 변경)이 생기면 v2 폴더를 더하고, 같은 판 안의 기능 추가는 새 파일을 더한다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { applyFixes, migrateSource } from '../src/migrate.js';
import { KINDS, OPTIONS, STATEMENTS, VALUES } from '../src/source/grammar.js';
import { tokenizeLine } from '../src/source/lexer.js';
import { createProblems } from '../src/source/problems.js';
import { runCli, withFolder } from './helpers.js';

const V1 = new URL('./fixtures/compat/v1/', import.meta.url);
const NAMES = readdirSync(V1).filter((name) => name.endsWith('.dap')).sort();
const SNAPSHOT = JSON.parse(readFileSync(new URL('structure.snapshot.json', V1), 'utf8'));

// 한 번도 지나지 않는 quiet 선(경고 11번)이 있는 원본
const QUIET_SOURCE = 'flow right\nbox a "A"\nbox b "B"\na -> b "보냄" quiet\nb -> a\nstep "s"\n  b -> a\n';
// 폐기된 tone 값(blue는 brand로, orange와 teal은 purple로 읽힌다)을 쓴 원본
const OLD_TONES = 'flow right\nbox a "A"\nstep "s"\n  show a "x" tag="t" tone=blue\n  show a "y" tag="u" tone=orange\n';

// 옛 도구 이름으로 쓴 판 표기 줄(`mutoscope 1`)의 폐기 진단. 고정 묶음의 요약은 이름이 바뀌기 전 값 그대로 두려고 세지 않는다.
const isRenamedVersionWord = (d) => d.code === 'deprecated-statement' && d.fix?.text === 'daphnis';

const sourceOf = (name) => readFileSync(new URL(name, V1), 'utf8');

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 구조 요약. 도형, 선, 박자, 계열 수처럼 그리는 방식이 바뀌어도 변하지 않는 숫자만 둔다.
function summarize({ figure, scene, timeline, deprecations }) {
  const beats = figure.steps.flatMap((step) => step.beats);
  const { chart } = figure;
  return {
    kind: figure.kind,
    chartType: figure.chartType ?? null,
    version: figure.version,
    deprecated: deprecations.filter((d) => !isRenamedVersionWord(d)).length,
    shapes: scene ? scene.items.length : 0,
    groups: scene ? scene.groups.length : 0,
    lines: scene ? scene.edges.length : 0,
    steps: figure.steps.length,
    beats: beats.length,
    moves: beats.reduce((sum, beat) => sum + beat.hops.length, 0),
    segments: timeline.segs.length,
    series: chart.series.map((s) => `${s.id}:${s.role}`),
    rows: chart.rows.length,
  };
}

// 근거: 설계 figure-syntax.md 요구사항 "옛 형식 원본이 오류 없이 읽히고 폐기 진단과 fix를 낸다", 호환 규칙 "고정 묶음"
test('compat_v1_every_fixture_builds_without_errors_and_matches_the_structure_snapshot', async () => {
  const actual = {};
  for (const name of NAMES) actual[name] = summarize(await buildFigure(sourceOf(name), { baseDir: V1.pathname }));

  assert.deepEqual(actual, SNAPSHOT);
});

// 근거: 설계 figure-syntax.md 요구사항 "옛 형식 원본이 오류 없이 읽히고 폐기 진단과 fix를 낸다"
test('compat_v1_old_forms_report_only_deprecated_never_errors_or_warnings', async () => {
  const tones = await buildFigure(sourceOf('old-tone-blue-orange.dap'));

  assert.deepEqual(tones.deprecations.map((d) => [d.severity, d.code, d.fix.text]), [['deprecated', 'deprecated-value', 'brand'], ['deprecated', 'deprecated-value', 'purple']]);
  assert.deepEqual(tones.warnings, []);
  for (const name of NAMES.filter((n) => n.startsWith('old-roles-omitted'))) {
    const { deprecations, warnings } = await buildFigure(sourceOf(name));

    assert.deepEqual([deprecations, warnings], [[], []], name);
  }
});

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 줄 첫 낱말이 선택 사항을 찾을 범위들. 선 줄은 첫 낱말이 이름이라 화살표로 가르고, 테이블 안 줄은 열이다.
function scopesOf({ head, second, isTimeline, isInTable }) {
  if (isInTable) return ['column'];
  if (head.type === 'word' && second?.type === 'arrow') return [isTimeline ? 'hop' : 'edge'];
  return STATEMENTS[head.value]?.scopes ?? [head.value];
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 고정 묶음 원본 글자 수
// basis: estimate
// 고정 묶음이 쓰는 낱말: 문장 낱말, 그림 종류, 선택 사항(`범위.이름`), 값 없는 낱말, 값.
// 선택 사항은 쓴 줄의 범위로 센다. 이름만 세면 `grid.rows`가 `item.rows`까지 쓴 것으로 센다(감사 C5).
function usedWords() {
  const used = { heads: new Set(), options: new Set(), words: new Set(), values: new Set() };
  for (const name of NAMES) {
    let isTimeline = false;
    let isInTable = false;
    sourceOf(name).split('\n').forEach((text, i) => {
      const tokens = tokenizeLine(text, i + 1, createProblems());
      if (!tokens.length) return;
      const [head, second] = tokens;
      if (head.type === 'close') isInTable = false;
      const scopes = scopesOf({ head, second, isTimeline, isInTable });
      if (head.value === 'table' && tokens.at(-1).type === 'open') isInTable = true;
      // 읽기 식(`대상:=원천`)은 문장 낱말이 아니라 식이라, 어느 줄이든 `:=`가 든 낱말이 있으면 쓴 것으로 센다. `on` 줄에서는 `대상:` 키의 선택 사항으로 읽힌다.
      if (tokens.some((t) => t.type === 'option' && (t.value.includes(':=') || t.key.endsWith(':')))) used.heads.add(':=');
      if (head.type === 'word' && second?.type === 'arrow') used.heads.add(isTimeline ? 'hop' : 'edge');
      else if (head.type === 'word') used.heads.add(head.value);
      if (head.value === 'step') isTimeline = true;
      for (const t of tokens) {
        const optionName = t.type === 'option' ? t.key : t.type === 'word' ? t.value : undefined;
        for (const scope of scopes) if (optionName !== undefined && `${scope}.${optionName}` in OPTIONS) used.options.add(`${scope}.${optionName}`);
        if (t.type === 'option') used.values.add(t.value);
        else if (t.type === 'word') used.words.add(t.value);
        // 값 목록을 가진 글 선택 사항(`status="도형=종류"`)은 글 안의 `=` 뒤 낱말이 값이다.
        if (t.type === 'option' && t.valueType === 'text' && scopes.some((scope) => OPTIONS[`${scope}.${t.key}`]?.values)) for (const [, kind] of t.value.matchAll(/=\s*([\w-]+)/g)) used.values.add(kind);
      }
    });
  }
  return used;
}

// 근거: 계약 figure-syntax.md 호환 규칙 "고정 묶음": 문법 표의 모든 항목이 묶음에 쓰인다
test('compat_v1_covers_every_word_option_and_value_in_the_grammar_table', () => {
  const used = usedWords();
  const missing = [];
  for (const word of Object.keys(STATEMENTS)) if (!used.heads.has(word)) missing.push(`statement ${word}`);
  for (const kind of Object.keys(KINDS)) if (!used.heads.has(kind)) missing.push(`kind ${kind}`);
  for (const key of Object.keys(OPTIONS)) if (!used.options.has(key)) missing.push(`option ${key}`);
  for (const [list, { items }] of Object.entries(VALUES)) {
    for (const name of Object.keys(items)) if (!used.values.has(name) && !used.words.has(name)) missing.push(`value ${list}.${name}`);
  }

  assert.deepEqual(missing, [], 'add a new .dap file to test/fixtures/compat/v1 that uses each missing entry (never edit the existing ones)');
});

// 근거: 계약 figure-check.md와 figure-syntax.md 진단 모양: --json은 새 필드와 옛 필드(lines, check, level)를 함께 낸다
test('compat_cli_json_keeps_the_old_fields_with_old_values_next_to_the_new_ones', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'quiet.dap'), QUIET_SOURCE);
    const old = runCli(['check', new URL('old-tone-blue-orange.dap', V1).pathname, '--json']);
    const quiet = runCli(['check', join(folder, 'quiet.dap'), '--json']);
    const [first] = old.stdout.trim().split('\n').map((line) => JSON.parse(line));
    const [warning] = quiet.stdout.trim().split('\n').map((line) => JSON.parse(line));

    assert.deepEqual([first.line, first.lines, first.check, first.level], [7, [7], 'syntax', 'warning']);
    assert.deepEqual([first.severity, first.code, first.column, first.fix.text], ['deprecated', 'deprecated-value', 30, 'brand']);
    assert.deepEqual([warning.check, warning.level, warning.lines, warning.severity, warning.code, warning.line, warning.column], [11, 'warning', [4], 'warning', 'check-11', 4, 1]);
  });
});

// 근거: 계약 figure-syntax.md 호환 규칙: 명령과 옵션 이름, 종료 코드는 추가만 한다. --strict는 경고도 실패, --write는 migrate만
test('compat_cli_old_options_and_exit_codes_still_work', () => {
  withFolder((folder) => {
    const file = new URL('main-bar.dap', V1).pathname;
    writeFileSync(join(folder, 'quiet.dap'), QUIET_SOURCE);

    assert.equal(runCli(['check', file, '--strict', '--json']).status, 0);
    assert.equal(runCli(['render', file, '--static', '--html', '--out', folder]).status, 0);
    assert.equal(runCli(['check', 'missing.dap']).status, 1);
    assert.equal(runCli([]).status, 2);
    assert.equal(runCli(['check', file, '--unknown']).status, 2);
    assert.equal(runCli(['check', file, '--write']).status, 2);
    assert.equal(runCli(['check', join(folder, 'quiet.dap'), '--strict']).status, 1);
  });
});

// 근거: 설계 figure-syntax.md 호환 규칙 "migrate는 진단의 fix를 그대로 적용한다"
test('applyFixes_replaces_several_places_on_one_line_and_writes_one_fix_for_the_same_place', () => {
  const fixes = [
    { line: 1, column: 1, length: 3, text: 'longer' },
    { line: 1, column: 9, length: 1, text: 'z' },
  ];
  const same = { line: 1, column: 1, length: 1, text: 'b' };

  assert.equal(applyFixes('abc def x\nkeep', fixes), 'longer def z\nkeep');
  assert.equal(applyFixes('a', [same, { ...same }]), 'b');
});

// 근거: 설계 figure-syntax.md 호환 규칙 "새 폐기 항목은 표에 replace만 적으면 된다"
test('migrateSource_applies_any_deprecated_entry_in_the_table_without_special_code', () => {
  STATEMENTS.oldbox = { since: 1, deprecated: { since: 1, replace: 'box' } };
  OPTIONS['group.dir'] = { since: 1, type: 'word', values: 'direction', deprecated: { since: 1, replace: 'direction' } };
  KINDS.diagram = { since: 1, argument: 'direction', deprecated: { since: 1, replace: 'flow' } };
  try {
    const { text, count } = migrateSource('diagram down\noldbox a "A"\ngroup g "G" dir=right {\n  box b "B"\n}\n');

    assert.equal(text, 'flow down\nbox a "A"\ngroup g "G" direction=right {\n  box b "B"\n}\n');
    assert.equal(count, 3);
  } finally {
    delete STATEMENTS.oldbox;
    delete OPTIONS['group.dir'];
    delete KINDS.diagram;
  }
});

// 근거: 설계 figure-syntax.md 요구사항 "migrate가 고친 원본에 오류와 폐기가 남지 않는다"
test('cli_migrate_previews_a_diff_and_write_fixes_the_file_so_check_reports_nothing', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'old.dap'), OLD_TONES);

    const preview = runCli(['migrate', 'old.dap'], folder);
    const untouched = readFileSync(join(folder, 'old.dap'), 'utf8');
    const written = runCli(['migrate', 'old.dap', '--write'], folder);
    const checked = runCli(['check', 'old.dap', '--strict', '--no-deprecated'], folder);

    assert.equal(preview.status, 0, preview.stderr);
    assert.match(preview.stdout, /^--- old\.dap\n\+\+\+ old\.dap \(migrated\)\n@@ line 4 @@\n-  show a "x" tag="t" tone=blue\n\+  show a "x" tag="t" tone=brand\n@@ line 5 @@/);
    assert.equal(untouched, OLD_TONES);
    assert.equal(written.status, 0, written.stderr);
    assert.equal(readFileSync(join(folder, 'old.dap'), 'utf8'), OLD_TONES.replace('tone=blue', 'tone=brand').replace('tone=orange', 'tone=purple'));
    assert.deepEqual([checked.status, checked.stderr], [0, '']);
  });
});

// 근거: 설계 figure-syntax.md 호환 규칙 "원본에 오류가 있으면 아무것도 쓰지 않는다"
test('cli_migrate_does_not_write_a_file_with_errors', () => {
  withFolder((folder) => {
    const broken = `${OLD_TONES}a -> zz\n`;
    writeFileSync(join(folder, 'bad.dap'), broken);

    const result = runCli(['migrate', 'bad.dap', '--write'], folder);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /^bad\.dap:6: unknown node "zz"/m);
    assert.equal(readFileSync(join(folder, 'bad.dap'), 'utf8'), broken);
  });
});

// 근거: 계약 figure-syntax.md 진단 표: deprecated는 파일을 쓰고 표준 오류에 남기며 --no-deprecated일 때만 실패한다
test('cli_check_prints_deprecated_and_only_no_deprecated_fails_on_it', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'old.dap'), OLD_TONES);

    const plain = runCli(['check', 'old.dap', '--strict'], folder);
    const strict = runCli(['check', 'old.dap', '--no-deprecated'], folder);

    assert.equal(plain.status, 0);
    assert.match(plain.stderr, /^old\.dap:4: deprecated: tone value "blue" is deprecated/m);
    assert.equal(strict.status, 1);
    assert.match(strict.stderr, /^old\.dap:4: tone value "blue" is deprecated/m);
  });
});

// 근거: 설계 figure-syntax.md 호환 규칙 "옛 이름". 옛 판 표기 `mutoscope 1`은 같은 그림으로 읽고 폐기 진단과 fix를 내며 migrate가 고친다
test('compat_old_name_version_line_reads_the_same_figure_reports_deprecated_and_migrates', async () => {
  const body = 'flow right\nbox a "A"\nbox b "B"\na -> b\nstep "s"\n  a -> b\n';
  const old = await buildFigure(`mutoscope 1\n${body}`);
  const current = await buildFigure(`daphnis 1\n${body}`);
  const migrated = migrateSource(`mutoscope 1\n${body}`);

  assert.deepEqual(old.deprecations.map((d) => [d.severity, d.code, d.line, d.fix.text]), [['deprecated', 'deprecated-statement', 1, 'daphnis']]);
  assert.deepEqual([current.deprecations, old.warnings], [[], []]);
  assert.deepEqual(summarize(old), summarize(current));
  assert.equal(migrated.text, `daphnis 1\n${body}`);
});
