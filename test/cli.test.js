import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

// cost: time O(f), heap O(1), stack O(1), io 2 + f
// vars: f = 폴더 안 파일 수(지울 때)
// basis: estimate
function withFolder(run) {
  const folder = mkdtempSync(join(tmpdir(), 'mutoscope-cli-'));
  try {
    return run(folder);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

test('main_run_through_symlink_prints_usage', () => {
  withFolder((folder) => {
    const link = join(folder, 'mutoscope');
    symlinkSync(CLI, link);

    const result = spawnSync(process.execPath, [link], { encoding: 'utf8' });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /usage/);
  });
});

test('main_render_writes_svg_and_html', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'a.muto'), 'flow right\nbox a "A"\nbox b "B"\na -> b\nstep "s"\n  a -> b "x"\n');

    const result = run(['render', 'a.muto', '--html'], folder);

    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(folder, 'a.svg')) && existsSync(join(folder, 'a.html')));
  });
});

test('main_check_error_writes_no_file_and_reports_line', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'bad.muto'), 'flow right\nbox a "A"\na -> zz\n');

    const result = run(['render', 'bad.muto'], folder);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /^bad\.muto:3: unknown node "zz"/m);
    assert.ok(!existsSync(join(folder, 'bad.svg')));
  });
});

test('main_json_prints_one_message_per_line', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'bad.muto'), 'flow right\nbox step "S"\nbox a "A"\na -> zz\n');

    const lines = run(['check', 'bad.muto', '--json'], folder).stdout.trim().split('\n');

    assert.equal(lines.length, 2);
    for (const line of lines) assert.equal(JSON.parse(line).check, 'syntax');
  });
});

test('main_gallery_writes_index_with_each_figure', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'a.muto'), 'flow right\nbox a "A"\n');
    writeFileSync(join(folder, 'b.muto'), 'chart bar\nseries s "S"\nrow "r" s=1\n');

    const result = run(['gallery', '.', '--out', 'out'], folder);

    assert.equal(result.status, 0, result.stderr);
    const index = readFileSync(join(folder, 'out', 'index.html'), 'utf8');
    assert.match(index, /src="a\.html"/);
    assert.match(index, /src="b\.html"/);
  });
});

test('main_json_lists_related_lines_and_check_number', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'warn.muto'), 'flow right\nbox a "A"\nbox b "B"\na -> b "보냄" quiet\nb -> a\nstep "s"\n  b -> a\n');

    const [message] = run(['check', 'warn.muto', '--json'], folder).stdout.trim().split('\n').map((l) => JSON.parse(l));

    assert.deepEqual([message.check, message.level, message.lines], [11, 'warning', [4]]);
  });
});

test('main_check_reports_syntax_and_glyph_errors_together', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'bad.muto'), 'flow right\nbox a "A 😀"\nbox b "B"\na -> cdex\n');

    const { stderr } = run(['check', 'bad.muto'], folder);

    assert.match(stderr, /bad\.muto:2: the font has no glyph/);
    assert.match(stderr, /bad\.muto:4: unknown node "cdex"/);
  });
});

test('main_missing_file_reports_one_line_and_checks_the_rest', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'ok.muto'), 'flow right\naspect 1.6\nbox a "A"\nbox b "B"\na -> b\n');

    const { stderr, status } = run(['check', 'nope.muto', 'ok.muto'], folder);

    assert.equal(status, 1);
    assert.equal(stderr.trim(), 'nope.muto: cannot read the file: ENOENT');
  });
});
