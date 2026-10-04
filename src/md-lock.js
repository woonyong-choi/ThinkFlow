// md 명령의 출력 폴더 잠금(docs/design/markdown.md 동시 실행). 같은 출력 폴더에 두 프로세스가 동시에 쓰지 못하게 폴더마다 잠금 파일을 배타적으로 만든다.
// 잠금 파일은 JSON 한 덩어리로 주인 프로세스 번호(pid), 호스트 이름, 만든 시각, 무작위 nonce를 적는다. nonce가 이 잠금의 신원이라 치우거나 풀 때 자기 것인지 가린다.
// 같은 호스트에서 주인 pid가 ESRCH로 확실히 없을 때만 낡은 잠금을 치운다. 그 밖(살아 있음, 권한 오류, 다른 호스트, 읽을 수 없음)은 지우지 않고 진단으로 끝낸다.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { realPath } from './md-owner.js';

export const LOCK_NAME = '.daphnis-md.lock';

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
// 잠금 파일의 내용. 읽지 못하거나 형식이 틀리면 undefined다.
export function readLock(path) {
  try {
    const info = JSON.parse(readFileSync(path, 'utf8'));
    const ok = Number.isInteger(info.pid) && info.pid > 0 && typeof info.host === 'string' && typeof info.nonce === 'string' && typeof info.created === 'string';
    return ok ? info : undefined;
  } catch {
    return undefined;
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 그 번호의 프로세스 상태. 'gone'은 ESRCH로 확실히 없음, 'denied'는 권한이 없어 알 수 없음(EPERM), 'alive'는 살아 있음이다. 번호가 다른 프로세스에 다시 쓰였으면 'alive'로 보인다(지우지 않는 쪽이다).
function pidState(pid) {
  try {
    process.kill(pid, 0);
    return 'alive';
  } catch (error) {
    if (error.code === 'ESRCH') return 'gone';
    return error.code === 'EPERM' ? 'denied' : 'alive';
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 지우면 안 되는 잠금을 알리는 결과. 진단 글은 잠금 파일 경로, 주인 정보, 직접 지우는 방법을 담는다.
function refusal(path, info, reason) {
  const owner = info ? `pid ${info.pid} on host ${info.host}, created ${info.created}` : 'owner unknown';
  return { busy: { path, message: `${reason} (${owner}). If no daphnis md is running, delete this file by hand and run again` } };
}

// cost: time O(1), heap O(1), stack O(1), io 4
// basis: estimate
// 읽어 둔 낡은 잠금(seen)을 치운다. 바로 지우지 않고 고유 이름으로 rename한 뒤 그 파일의 nonce가 읽어 둔 것과 같을 때만 지운다. 다르면 그 사이에 다른 프로세스가 새 잠금을 잡은 것이라 되돌리지 않고 진단으로 끝낸다. 치웠으면 undefined다.
function clearStale(path, seen, hooks) {
  hooks.beforeClear?.(path);
  const moved = `${path}.${randomUUID()}.stale`;
  try {
    renameSync(path, moved);
  } catch {
    return undefined;
  }
  if (readLock(moved)?.nonce === seen.nonce) {
    unlinkSync(moved);
    return undefined;
  }
  return refusal(path, readLock(moved), `the lock changed while it was being cleared; the new one was moved to ${moved} and left as it was`);
}

// cost: time O(1), heap O(1), stack O(1), io 5
// basis: estimate
// 잠금 파일 하나를 잡는다. 잡으면 { held: { path, nonce } }, 못 잡으면 { busy }, 폴더에 만들 수 없으면(권한 등) 빈 결과다(쓰기 단계가 같은 이유로 알린다).
function lockOne(dir, hooks) {
  const path = join(dir, LOCK_NAME);
  const info = { pid: process.pid, host: hostname(), created: new Date().toISOString(), nonce: randomUUID() };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(path, `${JSON.stringify(info)}\n`, { flag: 'wx' });
      return { held: { path, nonce: info.nonce } };
    } catch (error) {
      if (error.code !== 'EEXIST') return {};
    }
    const seen = readLock(path);
    if (!seen) return refusal(path, undefined, 'the lock file cannot be read or has an unknown format');
    if (seen.host !== info.host) return refusal(path, seen, 'the lock belongs to another host, so it is not cleared automatically');
    const state = pidState(seen.pid);
    if (state !== 'gone') return refusal(path, seen, state === 'alive' ? 'another daphnis md is writing to this folder' : 'the lock owner cannot be checked (permission denied), so it is not cleared automatically');
    const refused = clearStale(path, seen, hooks);
    if (refused) return refused;
  }
  return refusal(path, readLock(path), 'the lock was taken again while it was being cleared');
}

// cost: time O(h), heap O(1), stack O(1), io 2h
// vars: h = 잡은 잠금 수
// basis: estimate
/** 잡은 잠금을 푼다. 파일의 nonce가 자기 것일 때만 지운다. 다른 프로세스의 잠금이거나 이미 없으면 아무것도 지우지 않는다. */
export function releaseHeld(held) {
  for (const { path, nonce } of held) {
    if (readLock(path)?.nonce !== nonce) continue;
    try {
      unlinkSync(path);
    } catch {
      // 이미 없으면 풀 것이 없다
    }
  }
}

// cost: time O(d), heap O(d), stack O(1), io 6d
// vars: d = 출력 폴더 수
// basis: estimate
/**
 * 출력 폴더마다 잠금을 잡는다. 없는 폴더는 만든다(실패하면 그 폴더는 건너뛴다).
 * 하나라도 못 잡으면 이미 잡은 것을 풀고 { busy: { path, message } }를 돌려준다. 모두 잡으면 { release }를 돌려주고, release는 자기 nonce의 잠금만 풀며 이 호출이 만든 빈 폴더를 치운다.
 * @param hooks 시험이 경쟁 상황을 재현하는 자리({ beforeClear })
 */
export function acquireLocks(dirs, hooks = {}) {
  const held = [];
  const made = [];
  // cost: time O(d), heap O(1), stack O(1), io 3d
  // vars: d = 잡은 잠금 수
  // basis: estimate
  const release = () => {
    releaseHeld(held.splice(0));
    for (const { first, dir } of made.splice(0).reverse()) removeEmpty(dir, first);
  };
  for (const dir of [...new Set(dirs.map(realPath))].sort()) {
    let first;
    try {
      first = mkdirSync(dir, { recursive: true });
    } catch {
      continue;
    }
    if (first) made.push({ first, dir });
    const lock = lockOne(dir, hooks);
    if (lock.busy) {
      release();
      return { busy: lock.busy };
    }
    if (lock.held) held.push(lock.held);
  }
  return { release };
}

// cost: time O(d), heap O(1), stack O(1), io d
// vars: d = 만든 폴더 깊이
// basis: estimate
// 이 실행이 만든 폴더 중 비어 있는 것을 안쪽부터 치운다. 비어 있지 않으면 거기서 멈춘다.
function removeEmpty(dir, first) {
  for (let path = dir; ; path = dirname(path)) {
    try {
      rmdirSync(path);
    } catch {
      return;
    }
    if (path === first) return;
  }
}
