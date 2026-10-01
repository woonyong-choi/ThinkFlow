import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseFigure } from '../src/source/parse.js';
import { docExamples, errorsOf } from './helpers.js';

test('parseFigure_doc_examples_read_without_errors_or_warnings', () => {
  const examples = docExamples().filter(({ source }) => !source.includes('data "'));

  for (const { file, source } of examples) {
    const { warnings } = parseFigure(source);
    assert.deepEqual(warnings, [], `${file}: ${source.split('\n')[0]}`);
  }
});

test('parseFigure_unknown_name_suggests_nearest', () => {
  const errors = errorsOf('flow right\nbox codex "C"\nbox engine "E"\nengine -> cdex');

  assert.match(errors[0], /^4: unknown node "cdex"\. Did you mean "codex"\? Declared: codex, engine$/);
});

test('parseFigure_symbol_without_spaces_is_error', () => {
  assert.match(errorsOf('flow right\nbox a "A"\nbox b "B"\na->b')[0], /put spaces around "->"/);
});

test('parseFigure_option_with_spaces_around_equals_is_error', () => {
  assert.match(errorsOf('flow right\ngroup g "G" direction= down {\nbox a "A"\n}')[0], /without spaces around "="/);
});

test('parseFigure_reserved_word_as_name_is_error', () => {
  assert.match(errorsOf('flow right\nbox step "S"')[0], /"step" is a reserved word/);
});

test('parseFigure_header_after_declaration_is_error', () => {
  assert.match(errorsOf('flow right\nbox a "A"\ntitle "t"')[0], /must come before the declare part/);
});

test('parseFigure_same_direction_edge_twice_is_error', () => {
  assert.match(errorsOf('flow right\nbox a "A"\nbox b "B"\na -> b\na -> b "x"').join(), /already an edge a -> b/);
});

test('parseFigure_self_edge_and_group_inner_edge_are_errors', () => {
  const errors = errorsOf('flow right\ngroup g "G" {\nbox a "A"\n}\na -> a\ng -> a').join('\n');

  assert.match(errors, /to itself/);
  assert.match(errors, /join a group and a node inside it/);
});

test('parseFigure_hop_prefers_same_direction_then_reverse', () => {
  const both = parseFigure('flow right\nbox a "A"\nbox b "B"\na -> b\nb -> a\nstep "s"\n  b -> a').figure;
  const single = parseFigure('flow right\nbox a "A"\nbox b "B"\na -> b\nstep "s"\n  b -> a').figure;

  assert.deepEqual([both.steps[0].beats[0].hops[0].edge, both.steps[0].beats[0].hops[0].isBack], [1, false]);
  assert.deepEqual([single.steps[0].beats[0].hops[0].edge, single.steps[0].beats[0].hops[0].isBack], [0, true]);
});

test('parseFigure_kind_rules_reject_lines_from_other_kinds', () => {
  assert.match(errorsOf('sequence\nbox a "A"\ngroup g "G" {\n}')[0], /"group" is not allowed in a sequence figure\. Remove the line/);
  assert.match(errorsOf('state down\nstate a "A"\nstart a\nstep "s"\n  show a "x"').join(), /"show" is not allowed in a state figure/);
});

test('parseFigure_sequence_note_follows_message_participant', () => {
  const source = 'sequence\nbox a "A"\nbox b "B"\nbox c "C"\nstep "s"\n  a -> b "m"\n  note c "x"';

  assert.match(errorsOf(source)[0], /participants of the message above/);
});

test('parseFigure_state_needs_one_start', () => {
  assert.match(errorsOf('state down\nstate a "A"\nstate b "B"\na -> b "go"').join(), /needs one "start/);
});

test('parseFigure_data_foreign_key_must_point_to_pk', () => {
  const source = 'data right\ntable a "a" {\n  id bigint pk\n  name varchar\n}\ntable b "b" {\n  a_name varchar fk=a.name\n}';

  assert.match(errorsOf(source)[0], /pk or unique/);
});

test('parseFigure_table_column_may_use_reserved_word', () => {
  const { figure } = parseFigure('data right\ntable orders "orders" {\n  state varchar\n  id bigint pk\n}');

  assert.deepEqual(figure.nodes[0].columns.map((c) => c.name), ['state', 'id']);
});

test('parseFigure_card_tone_without_tag_and_first_clear_are_errors', () => {
  assert.match(errorsOf('flow right\nbox a "A"\nstep "s"\n  show a "x" tone=blue')[0], /tone colors a tag/);
  assert.match(errorsOf('flow right\nbox a "A"\nstep "s"\n  clear a').join(), /cannot start with clear/);
});

test('parseFigure_zero_time_is_error', () => {
  assert.match(errorsOf('flow right\nspeed 0ms\nbox a "A"')[0], /speed as a time/);
});

test('parseFigure_all_errors_are_reported_together', () => {
  const errors = errorsOf('flow right\nbox step "S"\nbox a "A"\na -> zz\na->b');

  assert.equal(errors.length, 3);
});

test('tokenizeLine_hash_outside_quotes_starts_comment', () => {
  const errors = errorsOf('flow right\nbox api "API"# 설명\nbox b "B#1"\napi -> b# 쓰기');

  assert.deepEqual(errors, []);
});

test('readSeries_flag_word_as_series_id_is_error', () => {
  const errors = errorsOf('chart bar\nseries quiet "A"\nrow "x" quiet=1');

  assert.ok(errors.some((e) => e.startsWith('2: "quiet" is not a valid series name')), errors.join('\n'));
});

test('parseFigure_crlf_bom_and_unicode_space_read_as_spaces', () => {
  const sources = ['flow right\r\nbox a "A"\r\n', '\ufeffflow right\nbox a "A"', 'flow right\nbox a "A"\u00a0\nbox\u3000b "B"'];

  const results = sources.map((source) => errorsOf(source));

  assert.deepEqual(results, [[], [], []]);
});

test('parseFigure_glued_arrow_gives_one_error', () => {
  const errors = errorsOf('flow right\nbox a "A"\nbox b "B"\na ->b');

  assert.deepEqual(errors, ['4: put spaces around "->" in "->b"']);
});

test('parseFigure_unknown_kind_reports_only_first_line', () => {
  const errors = errorsOf('# 설명\nflo right\nbox a "A\n');

  assert.deepEqual(errors.length, 1);
});

test('parseFigure_id_with_trailing_or_double_dash_is_error', () => {
  const errors = errorsOf('flow right\nbox a- "A"\nbox b--c "B"');

  assert.equal(errors.length, 2, errors.join('\n'));
});

test('parseFigure_column_name_outside_data_figure_is_error', () => {
  const errors = errorsOf('flow right\nbox a "A"\nbox b "B"\na -> b\nstep "s"\n  a.x -> b.y');

  assert.ok(errors.some((e) => e.includes('names a column, which only data figures have')), errors.join('\n'));
});

test('validateFigure_self_transition_only_in_state_figures', () => {
  const state = errorsOf('state right\nstate a "A"\nstart a\na -> a "retry"');
  const flow = errorsOf('flow right\nbox a "A"\na -> a');

  assert.deepEqual([state, flow.length], [[], 1]);
});
