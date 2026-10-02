import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { applyFixes, migrateSource, previewDiff } from '../src/migrate.js';
import { KINDS, OPTIONS, STATEMENTS } from '../src/source/grammar.js';
import { parseFigure } from '../src/source/parse.js';

const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const OLD = 'flow right\nbox a "A"\nstep "s"\n  show a "x" tag="t" tone=blue\n  show a "y" tag="u" tone=orange\n';

// cost: time O(f), heap O(1), stack O(1), io f + 2
// vars: f = 폴더 안 파일 수(지울 때)
// basis: estimate
function withFolder(run) {
  const folder = mkdtempSync(join(tmpdir(), 'mutoscope-migrate-'));
  try {
    return run(folder);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

test('applyFixes_replaces_several_places_on_one_line_without_shifting_the_earlier_ones', () => {
  const fixes = [
    { line: 1, column: 1, length: 3, text: 'longer' },
    { line: 1, column: 9, length: 1, text: 'z' },
  ];

  assert.equal(applyFixes('abc def x\nkeep', fixes), 'longer def z\nkeep');
});

test('applyFixes_writes_one_fix_for_the_same_place', () => {
  const fix = { line: 1, column: 1, length: 1, text: 'b' };

  assert.equal(applyFixes('a', [fix, { ...fix }]), 'b');
});

test('previewDiff_lists_only_changed_lines_and_is_empty_for_no_change', () => {
  assert.equal(previewDiff('a\nb\nc', 'a\nB\nc', 'f.muto'), '--- f.muto\n+++ f.muto (migrated)\n@@ line 2 @@\n-b\n+B');
  assert.equal(previewDiff('a', 'a', 'f.muto'), '');
});

test('migrateSource_rewrites_old_tones_and_the_result_has_no_diagnostics', () => {
  const { text, count } = migrateSource(OLD);
  const { warnings, deprecations } = parseFigure(text);

  assert.equal(count, 2);
  assert.deepEqual([text.includes('tone=teal'), text.includes('tone=purple'), warnings, deprecations], [true, true, [], []]);
});

test('migrateSource_leaves_a_current_file_unchanged', () => {
  const current = 'flow right\nbox a "A"\n';

  assert.deepEqual(migrateSource(current), { text: current, count: 0 });
});

test('migrateSource_refuses_a_file_with_errors', () => {
  const { errors, text } = migrateSource(`${OLD}a -> zz\n`);

  assert.equal(text, undefined);
  assert.ok(errors.length);
});

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

test('cli_migrate_previews_a_diff_and_does_not_touch_the_file', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'old.muto'), OLD);

    const result = run(['migrate', 'old.muto'], folder);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^--- old\.muto\n\+\+\+ old\.muto \(migrated\)\n@@ line 4 @@\n-  show a "x" tag="t" tone=blue\n\+  show a "x" tag="t" tone=teal\n@@ line 5 @@/);
    assert.equal(readFileSync(join(folder, 'old.muto'), 'utf8'), OLD);
  });
});

test('cli_migrate_write_fixes_the_file_and_check_then_reports_nothing_even_with_no_deprecated', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'old.muto'), OLD);

    const written = run(['migrate', 'old.muto', '--write'], folder);
    const checked = run(['check', 'old.muto', '--strict', '--no-deprecated'], folder);

    assert.equal(written.status, 0, written.stderr);
    assert.equal(readFileSync(join(folder, 'old.muto'), 'utf8'), OLD.replace('tone=blue', 'tone=teal').replace('tone=orange', 'tone=purple'));
    assert.deepEqual([checked.status, checked.stderr], [0, '']);
  });
});

test('cli_migrate_does_not_write_a_file_with_errors', () => {
  withFolder((folder) => {
    const broken = `${OLD}a -> zz\n`;
    writeFileSync(join(folder, 'bad.muto'), broken);

    const result = run(['migrate', 'bad.muto', '--write'], folder);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /^bad\.muto:6: unknown node "zz"/m);
    assert.equal(readFileSync(join(folder, 'bad.muto'), 'utf8'), broken);
  });
});

test('cli_write_flag_is_only_for_migrate', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'a.muto'), 'flow right\nbox a "A"\n');

    assert.equal(run(['check', 'a.muto', '--write'], folder).status, 2);
  });
});

test('cli_check_prints_deprecated_and_no_deprecated_fails_on_it', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'old.muto'), OLD);

    const plain = run(['check', 'old.muto', '--strict'], folder);
    const strict = run(['check', 'old.muto', '--no-deprecated'], folder);
    const json = run(['check', 'old.muto', '--json'], folder).stdout.trim().split('\n').map((line) => JSON.parse(line));

    assert.equal(plain.status, 0);
    assert.match(plain.stderr, /^old\.muto:4: deprecated: tone value "blue" is deprecated/m);
    assert.equal(strict.status, 1);
    assert.match(strict.stderr, /^old\.muto:4: tone value "blue" is deprecated/m);
    assert.deepEqual(json.map((d) => [d.severity, d.code, d.line, d.column, d.fix.text]), [['deprecated', 'deprecated-value', 4, 27, 'teal'], ['deprecated', 'deprecated-value', 5, 27, 'purple']]);
  });
});
