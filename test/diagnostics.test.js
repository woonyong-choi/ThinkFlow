import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KINDS, OPTIONS, STATEMENTS, VALUES, VERSION } from '../src/source/grammar.js';
import { parseFigure } from '../src/source/parse.js';
import { createProblems, makeDiagnostic } from '../src/source/problems.js';
import { errorsOf } from './helpers.js';

const BASE = 'flow right\nbox a "A"\nbox b "B"\na -> b\n';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 표에 임시 항목을 넣고 일이 끝나면 지운다. 문법 표 하나로 모든 곳이 움직이는지 보려고 표를 직접 고친다.
function withEntry(table, name, entry, run) {
  table[name] = entry;
  try {
    return run();
  } finally {
    delete table[name];
  }
}

const errorsFor = (source) => {
  try {
    parseFigure(source);
    return [];
  } catch (error) {
    return error.problems;
  }
};

test('makeDiagnostic_has_severity_code_line_column_and_message', () => {
  const diagnostic = makeDiagnostic({ severity: 'warning', line: 2, message: 'text' }, {}, ['a', '  box x']);

  assert.deepEqual(diagnostic, { severity: 'warning', code: 'syntax', line: 2, column: 3, message: 'text' });
});

test('makeDiagnostic_moves_the_check_prefix_into_the_code', () => {
  const diagnostic = makeDiagnostic({ severity: 'error', line: 1, message: '[check 7] moving text leaves' }, { fix: { line: 1, column: 1, length: 1, text: 'x' } });

  assert.deepEqual([diagnostic.code, diagnostic.message, diagnostic.fix.text], ['check-7', 'moving text leaves', 'x']);
});

test('createProblems_keeps_errors_warnings_and_deprecations_apart', () => {
  const problems = createProblems('a');

  problems.error(1, 'e');
  problems.warn(1, 'w');
  problems.deprecate(1, 'd');

  assert.deepEqual([problems.errors, problems.warnings, problems.deprecations].map((list) => list[0].severity), ['error', 'warning', 'deprecated']);
});

test('lexer_tokens_carry_column_and_error_columns_point_at_the_token', () => {
  const [error] = errorsFor('flow right\nbox a "A"\na->b');

  assert.deepEqual([error.line, error.column], [3, 1]);
});

test('parseFigure_without_a_version_line_reads_as_version_1', () => {
  const { figure } = parseFigure(BASE);

  assert.equal(figure.version, 1);
});

test('parseFigure_version_line_sets_the_version_and_the_kind_follows', () => {
  const { figure } = parseFigure(`mutoscope 1\n# 주석\n${BASE}`);

  assert.deepEqual([figure.version, figure.kind, figure.line], [1, 'flow', 3]);
});

test('parseFigure_unknown_version_names_the_supported_versions', () => {
  const [error] = errorsFor(`mutoscope ${VERSION + 1}\n${BASE}`);

  assert.equal(error.code, 'unsupported-version');
  assert.match(error.message, /supports? .*version|reads grammar version/);
  assert.match(error.message, new RegExp(`version ${VERSION + 1}`));
});

test('parseFigure_malformed_version_line_is_an_error', () => {
  for (const line of ['mutoscope', 'mutoscope 0', 'mutoscope one', 'mutoscope 1 2', 'mutoscope "1"']) {
    assert.equal(errorsFor(`${line}\n${BASE}`)[0].code, 'invalid-version', line);
  }
});

test('parseFigure_version_line_must_be_first', () => {
  const errors = errorsOf(`${BASE}mutoscope 1\n`);

  assert.match(errors[0], /^5: the version line/);
});

test('parseFigure_version_line_alone_is_an_error', () => {
  assert.match(errorsOf('mutoscope 1\n')[0], /no figure/);
});

test('parseFigure_a_node_may_be_named_mutoscope', () => {
  assert.deepEqual(errorsOf('flow right\nbox mutoscope "도구"\nbox b "B"\nmutoscope -> b\n'), []);
});

test('parseFigure_statement_words_that_are_object_properties_are_unknown_statements_not_crashes', () => {
  assert.match(errorsOf('flow right\nconstructor a "A"')[0], /unknown statement "constructor"/);
});

test('normalize_deprecated_value_reads_as_replacement_and_gives_a_fix', () => {
  const entry = { since: 1, deprecated: { since: 1, replace: 'purple', note: 'use the new name' } };
  withEntry(VALUES.tone.items, 'mauve', entry, () => {
    const source = `${BASE}step "s"\n  a -> b\n  show b "x" tag="t" tone=mauve\n`;

    const { figure, deprecations } = parseFigure(source);

    assert.equal(figure.steps[0].beats[0].ops[0].row.tone, 'purple');
    assert.deepEqual(deprecations.map((d) => [d.severity, d.code, d.line, d.column]), [['deprecated', 'deprecated-value', 7, 27]]);
    assert.deepEqual(deprecations[0].fix, { line: 7, column: 27, length: 5, text: 'purple' });
    assert.match(deprecations[0].message, /tone value "mauve" is deprecated since version 1.*Use "purple".*use the new name/);
  });
});

test('normalize_deprecated_statement_word_option_key_and_kind_use_the_same_rule', () => {
  withEntry(STATEMENTS, 'oldbox', { since: 1, deprecated: { since: 1, replace: 'box' } }, () => {
    withEntry(OPTIONS, 'group.dir', { since: 1, type: 'word', values: 'direction', deprecated: { since: 1, replace: 'direction' } }, () => {
      withEntry(KINDS, 'diagram', { since: 1, deprecated: { since: 1, replace: 'flow' }, argument: 'direction' }, () => {
        const { figure, deprecations } = parseFigure('diagram down\noldbox a "A"\ngroup g "G" dir=right {\n  box b "B"\n}\n');

        assert.deepEqual([figure.kind, figure.nodes[0].shape, figure.groups[0].direction], ['flow', 'box', 'right']);
        assert.deepEqual(deprecations.map((d) => d.code), ['deprecated-kind', 'deprecated-statement', 'deprecated-option']);
        assert.deepEqual(deprecations.map((d) => d.fix.text), ['flow', 'box', 'direction']);
      });
    });
  });
});

test('normalize_entry_newer_than_the_file_version_asks_for_a_version_line', () => {
  withEntry(STATEMENTS, 'future', { since: VERSION + 1, section: 'declare', kinds: ['flow'] }, () => {
    const [error] = errorsFor(`${BASE}future x\n`);

    assert.equal(error.code, 'version-required');
    assert.match(error.message, new RegExp(`mutoscope ${VERSION + 1}`));
  });
});

test('normalize_names_in_name_places_are_never_replaced', () => {
  withEntry(STATEMENTS, 'oldbox', { since: 1, deprecated: { since: 1, replace: 'box' } }, () => {
    const { figure, deprecations } = parseFigure('flow right\nbox oldbox "이름"\nbox b "B"\noldbox -> b\n');

    assert.deepEqual([figure.nodes[0].id, deprecations.length], ['oldbox', 0]);
  });
});
