import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { acquireLocks } from '../src/md-lock.js';
import { cli, read, snapshot, workspace } from './support.js';

const document = '# Doc\n\n```thinkflow\nthinkflow\nbox a "A"\n```\n';
const lockText = (pid) => JSON.stringify({ pid, host: hostname(), created: new Date().toISOString(), nonce: 'old-lock' });

test('M10 stale cleanup serializes a second contender before it can replace the lock', (t) => {
  const dir = workspace(t, { 'doc.md': document });
  const path = join(fs.realpathSync(dir), '.thinkflow-md.lock');
  const dead = spawnSync(process.execPath, ['-e', '']);
  assert.equal(dead.status, 0);
  fs.writeFileSync(path, lockText(dead.pid));
  const rename = fs.renameSync;
  let contender;
  let first;
  let entered = false;
  fs.renameSync = function (from, to, ...args) {
    if (from === path && !entered) {
      entered = true;
      contender = acquireLocks([dir]);
    }
    return rename(from, to, ...args);
  };
  syncBuiltinESMExports();
  try {
    first = acquireLocks([dir]);
    assert.ok(entered, 'the first process reached stale cleanup');
    assert.ok(contender.busy, 'the contender must not acquire during stale cleanup');
    assert.ok(first.release, 'the first process replaces the stale lock');
    const owner = read(dir, '.thinkflow-md.lock');
    assert.equal(JSON.parse(owner).pid, process.pid);
    assert.ok(acquireLocks([dir]).busy, 'a third contender cannot enter the protected write');
    assert.equal(read(dir, '.thinkflow-md.lock'), owner, 'contenders leave the held lock in place');
  } finally {
    fs.renameSync = rename;
    syncBuiltinESMExports();
    first?.release?.();
    contender?.release?.();
  }
});

test('M10 a leftover acquisition guard requires manual recovery and leaves all files unchanged', (t) => {
  const dir = workspace(t, { 'doc.md': document });
  fs.mkdirSync(join(dir, '.thinkflow-md.lock.guard'));
  const before = snapshot(dir);
  const run = cli(['md', 'doc.md', '--json'], { cwd: dir });
  assert.equal(run.status, 1);
  const problem = JSON.parse(run.stdout.trim());
  assert.equal(problem.code, 'md-locked');
  assert.match(problem.message, /guard directory by hand/);
  assert.deepEqual(snapshot(dir), before);
});

test('M10 a held document folder also blocks writes to a different SVG output folder', (t) => {
  const dir = workspace(t, { 'doc.md': document, '.thinkflow-md.lock': lockText(process.pid) });
  const before = snapshot(dir);
  const run = cli(['md', 'doc.md', '--out-dir', 'figures', '--json'], { cwd: dir });
  assert.equal(run.status, 1);
  assert.equal(JSON.parse(run.stdout.trim()).code, 'md-locked');
  assert.deepEqual(snapshot(dir), before);
});
