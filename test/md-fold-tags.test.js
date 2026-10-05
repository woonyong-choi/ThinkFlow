// md --fold가 `<details>` 태그를 실제 HTML 문맥으로 세는지 확인하는 명령 시험(docs/design/markdown.md 원본 접기 절 사용자 details). 결정: 이슈 #136, #39.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { runCli as run, withFolder } from './helpers.js';

const SOURCE = 'flow right\nbox a "A"\n';
const read = (folder, name = 'doc.md') => readFileSync(join(folder, name), 'utf8');
const put = (folder, text, name = 'doc.md') => writeFileSync(join(folder, name), text);
const block = (name, prefix = '') => `${prefix}\`\`\`dap name=${name}\n${SOURCE.trimEnd().split('\n').map((line) => `${prefix}${line}`).join('\n')}\n${prefix}\`\`\`\n`;
const wrapped = (text, name) => text.includes(`<!-- daphnis fold v1 name=${name} -->`);
// 근거: 이슈 #136 재현 1~3과 완료 조건 "세 반례가 수정 전에 실패하고 수정 뒤 접히며, 설명 문장은 그대로다"
test('md_fold_folds_a_block_after_a_sentence_that_only_mentions_a_details_tag_and_keeps_the_sentence', () => {
  const sentences = ['Use `<details>` to fold code.', 'Use `</details>` to close it.', '<!-- <details> example -->'];
  for (const sentence of sentences) {
    withFolder((folder) => {
      const original = `${sentence}\n\n${block('one')}`;
      put(folder, original);

      const fold = run(['md', 'doc.md', '--fold'], folder);
      const folded = read(folder);
      const again = run(['md', 'doc.md', '--fold'], folder);
      const check = run(['md', 'doc.md', '--check', '--fold'], folder);
      const unfold = run(['md', 'doc.md', '--unfold'], folder);

      assert.equal(fold.status, 0, `${sentence}: ${fold.stderr}`);
      assert.ok(wrapped(folded, 'one'), sentence);
      assert.ok(folded.startsWith(`${sentence}\n\n<!-- daphnis fold v1 name=one -->\n![one](doc-one.svg)<!-- dap -->\n\n<details>\n`), '설명 문장과 그 줄바꿈은 그대로다');
      assert.equal(again.stdout, '', `${sentence}: 다시 접어도 바뀌지 않는다`);
      assert.equal(unfold.status, 0, unfold.stderr);
      assert.equal(check.status, 0, `${sentence}: 접은 문서는 --check --fold가 통과한다`);
      assert.equal(read(folder), `${original}\n![one](doc-one.svg)<!-- dap -->\n`, `${sentence}: 풀면 원문에 그림 줄만 더해진다`);
    });
  }
});

// 근거: 이슈 #136 완료 조건 "인용·목록의 다른 문맥에 있는 태그를 현재 블록의 부모로 오인하지 않는다", "코드 span, 여러 줄 주석, 이스케이프, 실제 HTML 태그를 구별한다"(CLI). 한 문서에 문맥을 이어 두고 접힌 블록과 접히지 않은 블록을 확인한다
test('md_fold_wraps_only_the_blocks_outside_a_real_details_across_text_contexts_and_stays_consistent', () => {
  const parts = [
    'Use `<details>` to fold.\n\n' + block('a'),
    'Use `</details>` to close.\n\n' + block('b'),
    '<!--\n<details>\n-->\n\n' + block('c'),
    '\\<details> escaped\n\n' + block('d'),
    'code:\n\n    <details>\n\n' + block('e'),
    '<details>\n<summary>mine</summary>\n\n' + block('f') + '\n</details>\n',
    '> <details>\n>\n' + block('g', '> ') + '>\n> </details>\n',
    '> <details>\n> unclosed in this quote\n\n' + block('h'),
    '- <details>\n\n' + block('i', '  '),
    '- next item\n\n' + block('j'),
  ];
  const original = `# Doc\n\n${parts.join('\n')}`;
  const inside = ['f', 'g', 'i'];
  withFolder((folder) => {
    put(folder, original);
    assert.equal(run(['md', 'doc.md', '--unfold'], folder).status, 0);
    const plain = read(folder);
    put(folder, original);

    const fold = run(['md', 'doc.md', '--fold'], folder);
    const folded = read(folder);
    const again = run(['md', 'doc.md', '--fold'], folder);
    const kept = run(['md', 'doc.md'], folder);
    const check = run(['md', 'doc.md', '--check', '--fold'], folder);
    const keepCheck = run(['md', 'doc.md', '--check'], folder);
    run(['md', 'doc.md', '--unfold'], folder);

    assert.equal(fold.status, 0, fold.stderr);
    for (const name of 'abcdefghij') assert.equal(wrapped(folded, name), !inside.includes(name), `블록 ${name}`);
    for (const line of original.split('\n')) assert.ok(folded.includes(line), `원문 줄이 남는다: ${line}`);
    assert.equal(again.stdout + kept.stdout, '', '다시 접기와 옵션 없는 실행은 바꾸지 않는다');
    assert.equal(check.status + keepCheck.status, 0, '두 --check가 통과한다');
    assert.equal(read(folder), plain, '풀면 접기 전에 한 번 돌린 문서와 바이트 단위로 같다');
  });
});

// 근거: 이슈 #136 완료 조건 "구조를 확정할 수 없으면 지금처럼 추측하지 않고 위치와 이유를 알린다". 짝 없는 닫는 태그는 인용 안이어도 그 줄 번호로 알린다. 인용 안에서 연 태그를 인용 밖에서 닫는 것도 짝이 없는 것이다
test('md_fold_reports_the_line_of_an_unmatched_closing_tag_in_a_quote_or_after_its_quote_ended', () => {
  const docs = [
    [`# Doc\n\n> </details>\n\n${block('one')}`, 3],
    [`# Doc\n\n> <details>\n\n</details>\n\n${block('one')}`, 5],
  ];
  for (const [text, line] of docs) {
    withFolder((folder) => {
      put(folder, text);

      const fold = run(['md', 'doc.md', '--fold'], folder);

      assert.equal(fold.status, 1);
      assert.match(fold.stderr, new RegExp(`doc\\.md:\\d+: .*the </details> on line ${line} has no matching <details>`));
      assert.equal(read(folder), text);
      assert.equal(run(['md', 'doc.md', '--check'], folder).status, 1, '옵션이 없으면 접지 않으므로 오류가 아니라 갱신 필요다');
    });
  }
});
