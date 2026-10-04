// md 출력 폴더 잠금의 내부 함수(src/md-lock.js)를 직접 부르는 시험. 공개 명령 계약은 md.test.js가 본다.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runCli as run, withFolder } from './helpers.js';
import { acquireLocks, LOCK_NAME, readLock, releaseHeld } from '../src/md-lock.js';

const LOCK_MODULE = new URL('../src/md-lock.js', import.meta.url).href;
const HOLDER = `import { acquireLocks } from '${LOCK_MODULE}'; const l = acquireLocks([process.argv[1]]); process.stdout.write(l.busy ? 'busy\\n' : 'held\\n'); process.stdin.resume(); process.stdin.on('end', () => { l.release?.(); });`;
const FLOW = 'flow right\nbox a "A"\nbox b "B"\na -> b\n';
const DOC = `# Doc\n\n\`\`\`dap name=one\n${FLOW}\`\`\`\nend\n`;

// 별도 프로세스가 출력 폴더 잠금을 잡는다. 입력이 닫히면 풀고 끝난다
const hold = (dir) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--input-type=module', '-e', HOLDER, dir], { stdio: ['pipe', 'pipe', 'inherit'] });
  child.on('error', reject);
  const done = new Promise((finish) => child.on('exit', finish));
  child.stdout.once('data', (data) => resolve({ child, done, line: String(data).trim() }));
});

// 근거: 이슈 #102 "강제 종료(SIGKILL) 뒤 재실행에서 낡은 잠금을 자동 정리한다". 자기가 띄운 자식 프로세스만 종료한다
test('lock_left_by_a_killed_process_is_cleared_by_the_next_run', () => withFolder(async (folder) => {
  writeFileSync(join(folder, 'doc.md'), DOC);
  const { child, done, line } = await hold(folder);
  assert.equal(line, 'held');
  assert.equal(readLock(join(folder, LOCK_NAME)).pid, child.pid);
  const blocked = run(['md', 'doc.md'], folder);
  assert.equal(blocked.status, 1);
  assert.ok(blocked.stderr.includes(`pid ${child.pid} on host ${hostname()}`), blocked.stderr);

  child.kill('SIGKILL');
  await done;
  assert.ok(existsSync(join(folder, LOCK_NAME)), '강제 종료는 잠금을 남긴다');
  const after = run(['md', 'doc.md'], folder);

  assert.equal(after.status, 0, after.stderr);
  assert.ok(!existsSync(join(folder, LOCK_NAME)));
  assert.deepEqual(readdirSync(folder).filter((name) => name.includes('lock')), []);
}));

// 근거: 이슈 #102 "해제는 자기 nonce가 든 잠금만 지운다. 다른 프로세스의 잠금 해제 시도는 아무것도 지우지 않는다"
test('release_removes_only_a_lock_that_carries_its_own_nonce', () => withFolder(async (folder) => {
  const { child, done } = await hold(folder);
  try {
    const path = join(realpathSync(folder), LOCK_NAME);
    const theirs = readFileSync(path, 'utf8');

    releaseHeld([{ path, nonce: 'someone-else' }]);
    const mine = acquireLocks([folder]);

    assert.equal(readFileSync(path, 'utf8'), theirs, '다른 nonce의 해제 시도는 아무것도 지우지 않는다');
    assert.equal(mine.busy.path, path);
    assert.equal(readFileSync(path, 'utf8'), theirs, '잡지 못한 쪽의 정리도 남의 잠금을 지우지 않는다');
  } finally {
    child.stdin.end();
  }
  await done;
  const path = join(folder, LOCK_NAME);
  assert.ok(!existsSync(path), '주인은 자기 잠금을 푼다');
  const again = acquireLocks([folder]);
  assert.ok(again.release);
  again.release();
  assert.ok(!existsSync(path));
}));

// 근거: 이슈 #102 "확인과 삭제 사이 경쟁: 정리 직전에 다른 프로세스가 새 잠금을 잡았다면 새 소유자의 잠금을 지우지 않는다". 훅이 정리 직전에 새 잠금을 놓는다
test('clearing_a_stale_lock_never_deletes_a_lock_a_new_owner_took_just_before', () => withFolder(async (folder) => {
  const path = join(folder, LOCK_NAME);
  const stale = { pid: 2 ** 22 + 12345, host: hostname(), created: '2026-01-01T00:00:00.000Z', nonce: 'stale' };
  const fresh = { pid: process.pid, host: hostname(), created: '2026-02-02T00:00:00.000Z', nonce: 'fresh' };
  writeFileSync(path, `${JSON.stringify(stale)}\n`);
  const text = `${JSON.stringify(fresh)}\n`;

  const result = acquireLocks([folder], { beforeClear: () => writeFileSync(path, text) });

  assert.ok(result.busy, '새 잠금이 있으면 낡은 잠금으로 보고 지우지 않고 진단으로 끝낸다');
  assert.match(result.busy.message, /changed while it was being cleared/);
  const kept = readdirSync(folder).filter((name) => name.endsWith('.stale'));
  assert.equal(kept.length, 1, '옮겨 둔 새 잠금은 지우지 않고 남긴다');
  assert.equal(readFileSync(join(folder, kept[0]), 'utf8'), text);
  assert.ok(result.busy.message.includes(kept[0]), '진단이 남긴 파일을 알린다');
}));
