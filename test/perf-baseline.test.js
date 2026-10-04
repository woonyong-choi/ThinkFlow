// 성능 기준 파일: 입력 목록, 그림 내용 해시, 측정 코드 해시가 맞지 않으면 재지 않고 거부한다(scripts/perf-chips.mjs, docs/design/playback.md).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { withFolder } from './helpers.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCRIPT = join(ROOT, 'scripts/perf-chips.mjs');
const SOURCE = 'examples/bar.dap';
const sha256 = (path) => createHash('sha256').update(readFileSync(join(ROOT, path))).digest('hex');
// 지금 입력과 지금 측정 코드에 맞는 기준(합계는 비교까지 가지 않으므로 아무 값)
const validBaseline = () => ({ figures: 1, totalMs: 1, worstMs: 1, worstName: SOURCE, codeHash: 'a'.repeat(40), scriptHash: sha256('scripts/perf-chips.mjs'), inputs: { [SOURCE]: sha256(SOURCE) } });

// cost: time O(1), heap O(1), stack O(1), io 2
// vars: 기준 파일 하나와 프로세스 하나
// basis: estimate
// 기준 하나로 perf를 돌려 { code, out }을 돌려준다.
function compareWith(baseline) {
  return withFolder((folder) => {
    const file = join(folder, 'baseline.json');
    writeFileSync(file, JSON.stringify(baseline));
    const run = spawnSync(process.execPath, [SCRIPT, '--baseline', file], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
    return { code: run.status, out: run.stdout };
  });
}

// 근거: 이슈 #63 "성능 입력 목록·기준 코드 해시를 기록하고 다른 조건의 비교를 거부". 그림 내용이 달라졌으면 잰 합계가 코드 회귀율이 아니라서 재지 않는다
test('perf_baseline_with_a_changed_input_hash_is_refused_without_measuring', () => {
  const baseline = validBaseline();
  baseline.inputs[SOURCE] = '0'.repeat(64);

  const { code, out } = compareWith(baseline);

  assert.equal(code, 1);
  assert.match(out, /cannot compare: .*examples\/bar\.dap/);
});

// 근거: 이슈 #63. 측정 코드(재는 방법)가 달라진 기준과 비교하면 같은 조건이 아니라서 거부한다
test('perf_baseline_written_by_other_measuring_code_is_refused_without_measuring', () => {
  const baseline = validBaseline();
  baseline.scriptHash = '0'.repeat(64);

  const { code, out } = compareWith(baseline);

  assert.equal(code, 1);
  assert.match(out, /cannot compare: .*measuring code/);
});

// 근거: 이슈 #63. 입력 목록이나 코드 해시가 없는 낡은 기준은 비교하지 않는다
test('perf_baseline_without_inputs_or_code_hashes_is_refused', () => {
  const { inputs, ...withoutInputs } = validBaseline();
  const { codeHash, ...withoutCode } = validBaseline();

  assert.ok(inputs);
  assert.ok(codeHash);
  for (const baseline of [withoutInputs, withoutCode]) assert.equal(compareWith(baseline).code, 1);
});
