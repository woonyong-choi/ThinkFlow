// 시험 전용 훅(node --import). 첫 rename 직전에 DAPHNIS_TEST_READY 파일을 만들고 DAPHNIS_TEST_RELEASE 파일이 생길 때까지 멈춘다.
// md 명령의 쓰기 구간에 다른 프로세스를 끼워 넣는 시험이 수정 전후 같은 코드로 돈다.
import fs, { existsSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const { DAPHNIS_TEST_READY: ready, DAPHNIS_TEST_RELEASE: release } = process.env;
const original = fs.renameSync;
let paused = false;
fs.renameSync = (from, to) => {
  if (!paused) {
    paused = true;
    writeFileSync(ready, '');
    const cell = new Int32Array(new SharedArrayBuffer(4));
    while (!existsSync(release)) Atomics.wait(cell, 0, 0, 10);
  }
  return original(from, to);
};
syncBuiltinESMExports();
