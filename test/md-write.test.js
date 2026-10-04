// md 명령의 쓰기 실패: SVG를 모두 먼저 놓고 원문을 마지막에 바꾸며, 실패하면 원문과 산출물이 일관된다(docs/design/markdown.md 쓰기 순서와 실패 절).
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, readdirSync, readFileSync, renameSync, statSync, symlinkSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { runMd } from '../src/md-run.js';
import { runCli as run, withFolder } from './helpers.js';

const FLOW = 'flow right\ntitle "Request path"\nbox a "Client"\nbox b "Server"\na -> b "GET"\nstep "s"\n  a -> b\n';
const BAR = 'chart bar\ntitle "Latency"\nseries s "S"\nrow "r" s=1\n';
const block = (info, source) => `\`\`\`dap ${info}\n${source}\`\`\`\n`;
const DOC = `# Doc\n\n${block('name=flow', FLOW)}${block('name=bar', BAR)}end\n`;
const names = (folder) => readdirSync(folder).sort();

// cost: time O(1), heap O(1), stack O(1), io 3
// basis: estimate
// 파일 쓰기 도구. 이름이 맞는 파일에 `fail`이 정한 동작(`write`, `rename`, `unlink`)이 오면 EACCES로 실패하고 나머지는 실제로 한다. 실패한 호출은 calls에 남는다.
function injected(fail) {
  const calls = [];
  const guard = (kind, real) => (path, ...rest) => {
    const target = String(kind === 'rename' ? rest[0] : path);
    calls.push(`${kind} ${target.split('/').pop()}`);
    if (fail(kind, target)) throw Object.assign(new Error(`EACCES: injected ${kind}`), { code: 'EACCES' });
    return real(path, ...rest);
  };
  return { calls, io: { mkdir: (path) => mkdirSync(path, { recursive: true }), writeFile: guard('write', (path, text, mode) => writeFileSync(path, text, mode === undefined ? undefined : { mode })), rename: guard('rename', renameSync), unlink: guard('unlink', unlinkSync) } };
}

// cost: time O(1), heap O(m), stack O(1)
// vars: m = 낸 글 수
// basis: estimate
// runMd를 안에서 돌리며 글 출력(문자열)만 모은다. 시험 실행기가 stdout으로 보내는 Buffer 이벤트는 그대로 둔다. { status, stdout, stderr }.
async function runIn(folder, args, io) {
  const out = { stdout: [], stderr: [] };
  const originals = { stdout: process.stdout.write, stderr: process.stderr.write };
  for (const stream of ['stdout', 'stderr']) {
    process[stream].write = (chunk, ...rest) => (typeof chunk === 'string' ? out[stream].push(chunk) > 0 : originals[stream].call(process[stream], chunk, ...rest));
  }
  try {
    const status = await runMd({ command: 'md', inputs: [join(folder, 'doc.md')], flags: new Set(), ...args }, io);
    return { status, stdout: out.stdout.join(''), stderr: out.stderr.join('') };
  } finally {
    process.stdout.write = originals.stdout;
    process.stderr.write = originals.stderr;
  }
}

// 근거: 이슈 #72 "SVG 쓰기가 실패해도 원문에 링크가 먼저 들어간다". SVG 쓰기 실패는 원문을 바꾸지 않고 종료 1, 진단 code io다
test('runMd_leaves_the_document_unchanged_and_reports_io_when_an_svg_cannot_be_written', async () => {
  await withFolder(async (folder) => {
    writeFileSync(join(folder, 'doc.md'), DOC);
    const { io, calls } = injected((kind, target) => kind === 'write' && target.includes('doc-bar.svg'));

    const result = await runIn(folder, { flags: new Set(['json']) }, io);

    assert.equal(result.status, 1);
    assert.equal(readFileSync(join(folder, 'doc.md'), 'utf8'), DOC);
    assert.deepEqual(names(folder), ['doc.md'], '새 SVG도 임시 파일도 남지 않는다');
    assert.ok(calls.some((call) => call.startsWith('write ') && call.includes('doc-bar.svg')));
  });
});

// 근거: 이슈 #72 완료 조건. 진단은 code io와 경로, 글 출력은 `경로: 메시지`
test('runMd_reports_the_failed_path_with_code_io_in_text_and_json', async () => {
  await withFolder(async (folder) => {
    writeFileSync(join(folder, 'doc.md'), DOC);
    const fail = (kind, target) => kind === 'write' && target.includes('doc-flow.svg');

    const text = await runIn(folder, {}, injected(fail).io);
    const json = await runIn(folder, { flags: new Set(['json']) }, injected(fail).io);
    const diagnostic = JSON.parse(json.stdout.trim().split('\n').at(-1));

    assert.match(text.stderr, /doc-flow\.svg[^\n]*: cannot write the file: EACCES/);
    assert.equal(diagnostic.code, 'io');
    assert.equal(diagnostic.severity, 'error');
    assert.match(diagnostic.file, /doc-flow\.svg/);
  });
});

// 근거: 이슈 #72 "교체·삭제 중 실패도 원문과 산출물의 일관성을 보존한다(단계별 실패 주입)". 원문 교체(rename)가 실패하면 이미 놓은 새 SVG를 되돌린다
test('runMd_removes_the_new_svgs_when_replacing_the_document_fails', async () => {
  await withFolder(async (folder) => {
    writeFileSync(join(folder, 'doc.md'), DOC);
    const { io } = injected((kind, target) => kind === 'rename' && target.endsWith('doc.md'));

    const result = await runIn(folder, {}, io);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /doc\.md: cannot write the file: EACCES/);
    assert.equal(readFileSync(join(folder, 'doc.md'), 'utf8'), DOC);
    assert.deepEqual(names(folder), ['doc.md']);
  });
});

// 근거: 이슈 #72 단계별 실패 주입. 이미 있던 SVG를 덮어쓴 뒤 다음 SVG 교체가 실패하면 앞의 SVG는 옛 내용으로 돌아간다
test('runMd_restores_an_overwritten_svg_when_a_later_replacement_fails', async () => {
  await withFolder(async (folder) => {
    writeFileSync(join(folder, 'doc.md'), DOC);
    await runIn(folder, {}, injected(() => false).io);
    const before = { bar: readFileSync(join(folder, 'doc-bar.svg'), 'utf8'), flow: readFileSync(join(folder, 'doc-flow.svg'), 'utf8'), doc: readFileSync(join(folder, 'doc.md'), 'utf8') };
    const edited = before.doc.replace('title "Latency"', 'title "Latency 2"').replace('title "Request path"', 'title "Path 2"');
    writeFileSync(join(folder, 'doc.md'), edited);
    const { io } = injected((kind, target) => kind === 'rename' && target.endsWith('doc-bar.svg'));

    const result = await runIn(folder, {}, io);

    assert.equal(result.status, 1);
    assert.equal(readFileSync(join(folder, 'doc-flow.svg'), 'utf8'), before.flow, '앞서 바꾼 SVG를 되돌린다');
    assert.equal(readFileSync(join(folder, 'doc-bar.svg'), 'utf8'), before.bar);
    assert.equal(readFileSync(join(folder, 'doc.md'), 'utf8'), edited);
    assert.deepEqual(names(folder), ['doc-bar.svg', 'doc-flow.svg', 'doc.md']);
  });
});

// 근거: 이슈 #72 "원문 쓰기도 임시 파일 후 rename". 원문은 임시 파일을 거쳐 바뀌고 모드와 심볼릭 링크가 유지된다
test('runMd_replaces_the_document_through_a_temp_file_and_keeps_its_mode_and_symlink', async () => {
  await withFolder(async (folder) => {
    mkdirSync(join(folder, 'real'));
    writeFileSync(join(folder, 'real', 'doc.md'), DOC);
    chmodSync(join(folder, 'real', 'doc.md'), 0o600);
    symlinkSync(join(folder, 'real', 'doc.md'), join(folder, 'doc.md'));
    const { io, calls } = injected(() => false);

    const result = await runIn(folder, {}, io);

    assert.equal(result.status, 0, result.stderr);
    assert.ok(lstatSync(join(folder, 'doc.md')).isSymbolicLink(), '링크를 파일로 바꾸지 않는다');
    assert.match(readFileSync(join(folder, 'real', 'doc.md'), 'utf8'), /doc-flow\.svg/);
    assert.equal(statSync(join(folder, 'real', 'doc.md')).mode & 0o777, 0o600);
    assert.ok(calls.some((call) => /^rename .*doc\.md$/.test(call)) && !calls.some((call) => call === 'write doc.md'), '원문을 바로 쓰지 않는다');
    assert.ok(calls.indexOf(calls.find((call) => call.includes('doc-flow.svg'))) < calls.findIndex((call) => /^rename .*doc\.md$/.test(call)), 'SVG를 먼저 놓는다');
  });
});

// 근거: 이슈 #72. 낡은 SVG 삭제가 실패해도 문서와 새 SVG는 일관된 새 상태로 남고 종료 1과 진단 io로 알린다(삭제는 마지막 단계)
test('runMd_keeps_the_new_state_and_reports_io_when_removing_a_stale_svg_fails', async () => {
  await withFolder(async (folder) => {
    writeFileSync(join(folder, 'doc.md'), DOC);
    await runIn(folder, {}, injected(() => false).io);
    writeFileSync(join(folder, 'doc.md'), readFileSync(join(folder, 'doc.md'), 'utf8').replace('name=bar', 'name=bars'));
    const { io } = injected((kind) => kind === 'unlink');

    const result = await runIn(folder, {}, io);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /doc-bar\.svg: cannot remove the file: EACCES/);
    assert.match(readFileSync(join(folder, 'doc.md'), 'utf8'), /doc-bars\.svg/);
    assert.ok(existsSync(join(folder, 'doc-bars.svg')));
  });
});

// 근거: 이슈 #72 재현 3~4. 출력 폴더만 읽기 전용이면 원문이 바뀌지 않는다(권한이 듣지 않는 환경이면 건너뛴다)
test('md_with_a_read_only_out_dir_exits_1_and_leaves_the_document_unchanged', (context) => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'doc.md'), DOC);
    mkdirSync(join(folder, 'out'));
    chmodSync(join(folder, 'out'), 0o500);
    try {
      writeFileSync(join(folder, 'out', 'probe'), '');
      context.skip('이 환경은 읽기 전용 폴더에도 쓸 수 있다');
      return;
    } catch {
      // 권한이 듣는 환경
    }
    try {
      const result = run(['md', 'doc.md', '--out-dir', 'out'], folder);

      assert.equal(result.status, 1);
      assert.match(result.stderr, /cannot write the file: EACCES/);
      assert.equal(readFileSync(join(folder, 'doc.md'), 'utf8'), DOC);
    } finally {
      chmodSync(join(folder, 'out'), 0o700);
    }
    assert.deepEqual(readdirSync(join(folder, 'out')), []);
  });
});
