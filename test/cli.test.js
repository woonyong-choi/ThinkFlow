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
  const folder = mkdtempSync(join(tmpdir(), 'd2-flow-cli-'));
  try {
    return run(folder);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

test('main_run_through_symlink_prints_usage', () => {
  withFolder((folder) => {
    const link = join(folder, 'd2-flow');
    symlinkSync(CLI, link);

    const result = spawnSync(process.execPath, [link], { encoding: 'utf8' });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /usage/);
  });
});

test('main_render_writes_svg_and_html', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'a.flow'), 'flow right\nbox a "A"\nbox b "B"\na -> b\nstep "s"\n  a -> b "x"\n');

    const result = run(['render', 'a.flow', '--html'], folder);

    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(folder, 'a.svg')) && existsSync(join(folder, 'a.html')));
  });
});

test('main_check_error_writes_no_file_and_reports_line', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'bad.flow'), 'flow right\nbox a "A"\na -> zz\n');

    const result = run(['render', 'bad.flow'], folder);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /^bad\.flow:3: unknown node "zz"/m);
    assert.ok(!existsSync(join(folder, 'bad.svg')));
  });
});

test('main_json_prints_one_message_per_line', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'bad.flow'), 'flow right\nbox step "S"\nbox a "A"\na -> zz\n');

    const lines = run(['check', 'bad.flow', '--json'], folder).stdout.trim().split('\n');

    assert.equal(lines.length, 2);
    for (const line of lines) assert.equal(JSON.parse(line).check, 'syntax');
  });
});

test('main_gallery_writes_index_with_each_figure', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'a.flow'), 'flow right\nbox a "A"\n');
    writeFileSync(join(folder, 'b.flow'), 'chart bar\nseries s "S"\nrow "r" s=1\n');

    const result = run(['gallery', '.', '--out', 'out'], folder);

    assert.equal(result.status, 0, result.stderr);
    const index = readFileSync(join(folder, 'out', 'index.html'), 'utf8');
    assert.match(index, /src="a\.html"/);
    assert.match(index, /src="b\.html"/);
  });
});
