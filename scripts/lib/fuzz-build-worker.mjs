// fuzz-layout이 그림 하나씩 만드는 작업 스레드. 원본을 받아 실패 메시지(없으면 undefined)를 돌려준다.
import { parentPort } from 'node:worker_threads';
import { buildFigure } from '../../src/build.js';

// cost: time O(build), heap O(build), stack O(1)
// vars: build = 그림 하나를 만드는 비용
// basis: estimate
async function failureOf(source) {
  try {
    await buildFigure(source);
    return undefined;
  } catch (error) {
    return error.problems ? error.problems.map((p) => p.message).join(' | ') : `THROW ${error.message}`;
  }
}

parentPort.on('message', async (source) => parentPort.postMessage(await failureOf(source)));
