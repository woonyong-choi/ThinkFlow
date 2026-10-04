// md 명령의 파일 쓰기. 쓸 파일을 모두 같은 폴더의 임시 이름으로 먼저 놓고, 하나도 빠짐없이 놓였을 때만 rename으로 제자리에 바꾼다(docs/design/markdown.md 쓰기 순서와 실패).
// 파일 하나의 rename은 원자적이지만 여러 파일 전체는 트랜잭션이 아니다. 중간에 실패하면 이미 바꾼 파일을 메모리에 둔 옛 내용으로 되돌리고, 되돌리지 못한 파일은 알린다.
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** 실제 파일 시스템 동작. 시험은 같은 모양의 객체로 바꿔 실패를 주입한다. */
export const FILE_IO = {
  mkdir: (path) => mkdirSync(path, { recursive: true }),
  writeFile: (path, text, mode) => writeFileSync(path, text, mode === undefined ? undefined : { mode }),
  rename: renameSync,
  unlink: unlinkSync,
};

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 임시 파일 이름. 대상과 같은 폴더라 rename이 폴더를 건너지 않는다.
const tempName = (target, n) => join(dirname(target), `.${basename(target)}.${process.pid}.${n}.tmp`);

// cost: time O(n), heap O(n), stack O(1), io 3
// vars: n = 파일 글자 수
// basis: estimate
// 쓸 파일 하나의 준비 정보. 심볼릭 링크 문서는 링크가 가리키는 실제 파일을 바꾸고(링크를 파일로 바꾸지 않는다), 이미 있는 파일은 옛 내용과 모드를 기억한다.
function describe({ path, text }, n) {
  const exists = existsSync(path);
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
  let current;
  try {
    for (const [n, write] of writes.entries()) {
      current = write.path;
      const item = describe(write, n);
      io.mkdir(dirname(item.target));
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
    return { error, path: current, unrestored };
  }
}
