// 성능 기준 파일은 계측이 끝나는 동안 다른 작업이 먼저 만들었어도 덮어쓰지 않는다.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { ROOT, workspace } from './support.js';

const SENTINEL = 'baseline written by another process\n';
// 실제 계측과 쓰기 경로를 통과하되 계측 목록만 예제 하나로 좁힌다. 측정 첫 읽기는 존재 확인 뒤이므로 경쟁 파일을 만들 시점이 확정된다.
const PRELOAD = `
import fs from 'node:fs';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { join, resolve } from 'node:path';
const root = process.cwd();
const source = join(root, 'examples', 'box.thinkflow');
const output = process.env.THINKFLOW_PERF_OUTPUT;
const read = fs.readFileSync;
const list = fs.readdirSync;
const write = fs.writeFileSync;
const exec = cp.execFileSync;
let entered = false;
fs.readdirSync = function(path, ...args) {
  const dir = resolve(String(path));
  if (dir === join(root, 'examples')) return ['box.thinkflow'];
  if (['docs/assets', 'docs/assets/showcase'].some(name => dir === join(root, name))) return [];
  return list.call(this, path, ...args);
};
fs.readFileSync = function(path, ...args) {
  if (resolve(String(path)) === source && !entered) {
    entered = true;
    if (process.env.THINKFLOW_PERF_RACE === '1') write(output, ${JSON.stringify(SENTINEL)}, { flag: 'wx' });
  }
  return read.call(this, path, ...args);
};
cp.execFileSync = function(file, args, ...rest) {
  if (file === 'git' && args.join(' ') === 'status --porcelain') return '';
  return exec.call(this, file, args, ...rest);
};
syncBuiltinESMExports();
`;

function measure(t, race) {
  const dir = workspace(t, { 'preload.mjs': PRELOAD });
  const output = join(dir, 'baseline.json');
  const run = spawnSync(process.execPath, ['--import', join(dir, 'preload.mjs'), 'scripts/perf-chips.mjs', '--write', output], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, THINKFLOW_PERF_OUTPUT: output, THINKFLOW_PERF_RACE: race ? '1' : '0' },
  });
  return { run, output };
}

test('G4 a baseline created during measurement is preserved and --write fails', (t) => {
  const { run, output } = measure(t, true);
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /not written: .* already exists and is not overwritten/);
  assert.equal(readFileSync(output, 'utf8'), SENTINEL);
});

test('G4 --write still creates a new baseline with the measured input and provenance', (t) => {
  const { run, output } = measure(t, false);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const baseline = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(baseline.figures, 1);
  assert.deepEqual(Object.keys(baseline.inputs), ['examples/box.thinkflow']);
  for (const key of ['codeHash', 'scriptHash']) assert.match(baseline[key], /^[a-f0-9]+$/);
  assert.match(run.stdout, /baseline written to/);
});
