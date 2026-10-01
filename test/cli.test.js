import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

test('main_run_through_symlink_prints_usage', () => {
  withFolder((folder) => {
    const link = join(folder, 'd2-flow');
    symlinkSync(CLI, link);

    const result = spawnSync(process.execPath, [link], { encoding: 'utf8' });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /d2-flow/);
  });
});

test('main_option_without_value_fails', () => {
  const result = spawnSync(process.execPath, [CLI, 'a.d2', '--layout'], { encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /--layout/);
});

test('main_unknown_layout_fails', () => {
  const result = spawnSync(process.execPath, [CLI, 'a.d2', '--layout', 'grid'], { encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /elk/);
});

test('main_gallery_across_folders_links_each_figure', () => {
  withFolder((folder) => {
    mkdirSync(join(folder, 'one'));
    mkdirSync(join(folder, 'two'));
    writeFileSync(join(folder, 'one', 'a.d2'), 'a -> b\n#@ step s\n#@ a -> b\n');
    writeFileSync(join(folder, 'two', 'b.d2'), 'c -> d\n#@ step s\n#@ c -> d\n');

    const result = spawnSync(process.execPath, [CLI, 'one/a.d2', 'two/b.d2', '--html-only', '--gallery'], { cwd: folder, encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
    const index = readFileSync(join(folder, 'one', 'index.html'), 'utf8');
    assert.match(index, /src="a\.html"/);
    assert.match(index, /src="\.\.\/two\/b\.html"/);
  });
});
