// md 명령의 파일 쓰기. 쓸 파일을 모두 같은 폴더의 임시 이름으로 먼저 놓고, 하나도 빠짐없이 놓였을 때만 rename으로 제자리에 바꾼다(docs/design/markdown.md 쓰기 순서와 실패).
// 파일 하나의 rename은 원자적이지만 여러 파일 전체는 트랜잭션이 아니다. 중간에 실패하면 이미 바꾼 파일을 메모리에 둔 옛 내용으로 되돌리고, 되돌리지 못한 파일은 알린다.
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { realPath } from './md-owner.js';

/**
 * 파일 시스템 동작 한 벌. 쓰기와 되돌리기는 이 객체로만 파일 시스템을 만진다.
 * mkdir은 새로 만든 가장 바깥 폴더의 경로(없으면 undefined)를 돌려주고, rmdir은 빈 폴더만 지운다. 실패 때 이번 실행이 만든 폴더를 치우는 데 쓴다.
 */
export const FILE_IO = {
  mkdir: (path) => mkdirSync(path, { recursive: true }),
  writeFile: (path, text, mode) => writeFileSync(path, text, mode === undefined ? undefined : { mode }),
  rename: renameSync,
  unlink: unlinkSync,
  rmdir: rmdirSync,
};

// cost: time O(d), heap O(n), stack O(d), io d
// vars: d = 경로 깊이, n = 경로 글자 수
// basis: estimate
/**
 * 쓸 파일 경로를 겹침 비교용 키로 바꾼다. 이미 있는 심볼릭 링크 파일은 가리키는 실제 파일로 풀고(commitWrites가 바꾸는 파일과 같다), 폴더는 실제 경로로 풀고, 파일 이름은 NFC 정규화 뒤 소문자로 낮춘다.
 * 서로 다른 이름의 링크가 같은 파일을 가리키면 같은 키다. 대소문자나 정규화만 다른 이름을 같은 파일로 치는 파일 시스템에서도 같은 결과가 나오게 항상 그렇게 비교한다.
 * 깨진 링크는 풀 곳이 없어 링크 자신의 경로로 센다(그 링크를 쓰려는 일은 commitWrites가 거절한다).
 */
export function outputKey(path) {
  const real = linkTarget(path) ?? path;
  return join(realPath(dirname(real)), basename(real)).normalize('NFC').toLowerCase();
}

// cost: time O(d), heap O(n), stack O(1), io 2
// vars: d = 경로 깊이, n = 경로 글자 수
// basis: estimate
// 경로가 심볼릭 링크이면 링크를 끝까지 따라간 실제 경로. 링크가 아니거나 없으면, 그리고 끝까지 가지 못하는 깨진 링크이면 undefined다.
function linkTarget(path) {
  try {
    return lstatSync(path).isSymbolicLink() ? realpathSync(path) : undefined;
  } catch {
    return undefined;
  }
}

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
// 경로가 심볼릭 링크 자신인지(가리키는 곳이 없어도).
export function isLink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 임시 파일 이름. 대상과 같은 폴더라 rename이 폴더를 건너지 않는다.
const tempName = (target, n) => join(dirname(target), `.${basename(target)}.${process.pid}.${n}.tmp`);

// cost: time O(n), heap O(n), stack O(1), io 3
// vars: n = 파일 글자 수
// basis: estimate
// 쓸 파일 하나의 준비 정보. 심볼릭 링크 문서는 링크가 가리키는 실제 파일을 바꾸고(링크를 파일로 바꾸지 않는다), 이미 있는 파일은 옛 내용과 모드를 기억한다.
// 깨진 링크는 가리키는 파일이 없어 링크를 파일로 바꾸는 수밖에 없으므로 쓰지 않고 거절한다.
function describe({ path, text }, n) {
  const exists = existsSync(path);
  if (!exists && isLink(path)) throw new Error('it is a symbolic link that points to no file');
  const target = exists ? realpathSync(path) : path;
  return { target, text, temp: tempName(target, n), before: exists ? readFileSync(target, 'utf8') : undefined, mode: exists ? statSync(target).mode & 0o777 : undefined };
}

// cost: time O(1), heap O(1), stack O(1), io 2
// basis: estimate
// 바꿔 둔 파일 하나를 옛 상태로 돌린다. 새로 만든 파일은 지우고, 있던 파일은 옛 내용을 임시 파일로 놓아 rename한다. 못 돌리면 그 경로를 돌려준다.
function restore(item, io) {
  try {
    if (item.before === undefined) io.unlink(item.target);
    else {
      io.writeFile(item.temp, item.before, item.mode);
      io.rename(item.temp, item.target);
    }
    return undefined;
  } catch {
    return item.target;
  }
}

// cost: time O(f), heap O(f), stack O(1), io f
// vars: f = 임시 파일 수
// basis: estimate
// 임시 파일을 지운다. 이미 없거나 못 지워도 넘어간다.
function discard(items, io) {
  for (const { temp } of items) {
    try {
      io.unlink(temp);
    } catch {
      // 못 지운 임시 파일은 다음 실행에 영향이 없다(이름에 프로세스 번호가 있다)
    }
  }
}

// cost: time O(f), heap O(1), stack O(1), io f
// vars: f = 이번 실행이 만든 폴더 수
// basis: estimate
// 이번 실행이 새로 만든 폴더를 안쪽부터 지운다. created는 { top, leaf }이고 top은 새로 만든 가장 바깥 폴더, leaf는 파일이 들어갈 폴더다. 비어 있지 않은 폴더는 지워지지 않으니 거기서 멈춘다.
function removeCreated(created, io) {
  for (const { top, leaf } of created.reverse()) {
    try {
      for (let path = leaf; !relative(resolve(top), resolve(path)).startsWith('..'); path = dirname(path)) {
        io.rmdir(path);
        if (resolve(path) === resolve(top)) break;
      }
    } catch {
      // 비어 있지 않거나 이미 없는 폴더는 그대로 둔다
    }
  }
}

// cost: time O(f·out), heap O(f·out), stack O(1), io 4f
// vars: f = 쓸 파일 수, out = 파일 글자 수
// basis: estimate
/**
 * 파일들을 쓴다. 앞에서부터 순서대로 제자리에 바꾸므로 SVG를 앞에, 문서를 뒤에 넣는다.
 * 1단계에서 임시 파일을 모두 놓는다. 하나라도 실패하면 대상은 하나도 안 바뀐다. 2단계에서 rename으로 바꾸다 실패하면 바꾼 파일을 옛 상태로 돌린다.
 * @param writes { path, text }[]
 * @param io FILE_IO와 같은 모양
 * @returns 성공이면 { error: undefined }, 실패면 { error, path, unrestored }. path는 실패한 파일이고 unrestored는 되돌리지 못한 파일들이다
 */
export function commitWrites(writes, io) {
  const staged = [];
  const placed = [];
  const created = [];
  let current;
  try {
    for (const [n, write] of writes.entries()) {
      current = write.path;
      const item = describe(write, n);
      const made = io.mkdir(dirname(item.target));
      if (typeof made === 'string') created.push({ top: made, leaf: dirname(item.target) });
      staged.push(item);
      io.writeFile(item.temp, item.text, item.mode);
    }
    for (const item of staged) {
      current = item.target;
      io.rename(item.temp, item.target);
      placed.push(item);
    }
    return { error: undefined };
  } catch (error) {
    discard(staged.filter((item) => !placed.includes(item)), io);
    const unrestored = placed.reverse().map((item) => restore(item, io)).filter(Boolean);
    removeCreated(created, io);
    return { error, path: current, unrestored };
  }
}
