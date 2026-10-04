// md 명령: 문서 안 ```dap 블록의 SVG와 이미지 줄(docs/design/markdown.md). 멱등, 이름 안정, 오류 시 미기록, --check 종료 코드는 그 문서의 요구사항 표다.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runCli as run, withFolder } from './helpers.js';

const FLOW = 'flow right\ntitle "Request path"\nbox a "Client"\nbox b "Server"\na -> b "GET"\nstep "s"\n  a -> b\n';
const BAR = 'chart bar\ntitle "Latency"\nseries s "S"\nrow "r" s=1\n';
const doc = (...blocks) => `# Doc\n\n${blocks.join('\n')}\nend\n`;
const block = (info, source) => `\`\`\`dap${info ? ` ${info}` : ''}\n${source}\`\`\`\n`;
const read = (folder, name) => readFileSync(join(folder, name), 'utf8');
const put = (folder, name, text) => writeFileSync(join(folder, name), text);

// 근거: 요구사항 "블록 바로 아래 이미지 줄을 넣고 대체 글은 title을 쓴다", "같은 결과가 반복되어야 한다(멱등)"
test('md_render_adds_an_image_line_below_the_block_and_a_second_run_changes_nothing', () => {
  withFolder((folder) => {
    put(folder, 'doc.md', doc(block('name=flow', FLOW)));

    const first = run(['md', 'doc.md'], folder);
    const markdown = read(folder, 'doc.md');
    const svgTime = statSync(join(folder, 'doc-flow.svg')).mtimeMs;
    const second = run(['md', 'doc.md'], folder);

    assert.equal(first.status, 0, first.stderr);
    assert.match(markdown, /```\n\n!\[Request path\]\(doc-flow\.svg\)<!-- dap -->\n\nend\n$/);
    assert.equal(second.status, 0);
    assert.equal(second.stdout, '', '다시 돌리면 쓴 파일이 없다');
    assert.equal(read(folder, 'doc.md'), markdown);
    assert.equal(statSync(join(folder, 'doc-flow.svg')).mtimeMs, svgTime);
  });
});

// 근거: 요구사항 "블록 이름을 달면 순서가 바뀌어도 이미지가 안정적이다"
test('md_named_block_keeps_its_svg_when_another_block_is_inserted_before_it', () => {
  withFolder((folder) => {
    put(folder, 'doc.md', doc(block('name=flow', FLOW)));
    run(['md', 'doc.md'], folder);
    const before = read(folder, 'doc-flow.svg');

    put(folder, 'doc.md', read(folder, 'doc.md').replace('# Doc\n', `# Doc\n\n${block('', BAR)}`));
    const result = run(['md', 'doc.md'], folder);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(read(folder, 'doc-flow.svg'), before);
    assert.ok(existsSync(join(folder, 'doc-1.svg')), '이름 없는 블록은 순번 이름이다');
    assert.match(read(folder, 'doc.md'), /!\[Request path\]\(doc-flow\.svg\)/);
  });
});

// 근거: 요구사항 "이름이 바뀌어도 오래된 SVG를 정리한다". 이 도구가 만들지 않은 같은 접두사 파일은 지우지 않는다
test('md_rename_removes_the_stale_svg_but_not_a_hand_made_file_with_the_same_prefix', () => {
  withFolder((folder) => {
    put(folder, 'doc.md', doc(block('name=flow', FLOW)));
    put(folder, 'doc-hand.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    put(folder, 'doc-other.md', doc(block('name=flow', FLOW)));
    run(['md', 'doc.md', 'doc-other.md'], folder);

    put(folder, 'doc.md', read(folder, 'doc.md').replace('name=flow', 'name=path'));
    const result = run(['md', 'doc.md'], folder);

    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(folder, 'doc-path.svg')));
    assert.ok(!existsSync(join(folder, 'doc-flow.svg')), '오래된 SVG는 지운다');
    assert.ok(existsSync(join(folder, 'doc-hand.svg')), '손으로 만든 파일은 둔다');
    assert.ok(existsSync(join(folder, 'doc-other-flow.svg')), '접두사가 같은 다른 문서의 SVG는 둔다');
    assert.match(read(folder, 'doc.md'), /\(doc-path\.svg\)/);
  });
});

// 근거: 요구사항 "블록이 없어진 이미지 줄을 지우고 SVG도 정리한다"
test('md_removed_block_removes_its_image_line_and_svg_but_a_marked_line_inside_a_text_fence_stays', () => {
  withFolder((folder) => {
    const example = '````text\n![x](x.svg)<!-- dap -->\n````\n';
    put(folder, 'doc.md', doc(block('name=flow', FLOW), example));
    run(['md', 'doc.md'], folder);

    put(folder, 'doc.md', read(folder, 'doc.md').replace(block('name=flow', FLOW), ''));
    const result = run(['md', 'doc.md'], folder);

    assert.equal(result.status, 0, result.stderr);
    assert.ok(!existsSync(join(folder, 'doc-flow.svg')));
    assert.ok(!read(folder, 'doc.md').includes('doc-flow.svg'));
    assert.ok(read(folder, 'doc.md').includes(example));
  });
});

// 근거: 계약 AGENTS "오류가 있으면 결과 파일을 쓰지 않음", gallery와 같은 계약. 반대 사례: 좋은 블록 옆의 나쁜 블록, strict 경고, 틀린 설명 글자, 같은 이름
test('md_fails_without_writing_any_file_when_the_input_must_not_pass', () => {
  const cases = [
    { name: 'error_next_to_a_good_block', text: doc(block('name=ok', FLOW), block('', 'flow right\nbox a "A"\na -> zz\n')), args: [], stderr: /^doc\.md:16: unknown node "zz"/m },
    { name: 'strict_warning', text: doc(block('', BAR)), args: ['--strict'], stderr: /^doc\.md:4: .*unit/m },
    { name: 'unknown_fence_option', text: doc(block('title=x', FLOW)), args: [], stderr: /^doc\.md:3: unknown option "title=x"/m },
    { name: 'uppercase_name', text: doc(block('name=Flow', FLOW)), args: [], stderr: /^doc\.md:3: block name "Flow"/m },
    { name: 'duplicate_name', text: doc(block('name=a', FLOW), block('name=a', BAR)), args: [], stderr: /^doc\.md:13: .*is also written for doc\.md:3/m },
    { name: 'unclosed_fence', text: '```dap\nflow right\n', args: [], stderr: /^doc\.md:1: the dap fence is never closed/m },
  ];
  for (const { name, text, args, stderr } of cases) {
    withFolder((folder) => {
      put(folder, 'doc.md', text);

      const result = run(['md', 'doc.md', ...args], folder);

      assert.equal(result.status, 1, `${name}: ${result.stderr}`);
      assert.match(result.stderr, stderr, name);
      assert.equal(read(folder, 'doc.md'), text, `${name}: 문서를 바꾸지 않는다`);
      assert.ok(!existsSync(join(folder, 'doc-1.svg')) && !existsSync(join(folder, 'doc-a.svg')) && !existsSync(join(folder, 'doc-ok.svg')), `${name}: SVG를 쓰지 않는다`);
    });
  }
});

// 근거: 요구사항 "--check는 갱신이 필요하면 종료 1, 아니면 0이고 아무 파일도 쓰지 않는다(CI용)"
test('md_check_exits_1_when_an_update_is_needed_and_writes_nothing', () => {
  withFolder((folder) => {
    const text = doc(block('name=flow', FLOW));
    put(folder, 'doc.md', text);

    const unrendered = run(['md', 'doc.md', '--check'], folder);
    const noFiles = !existsSync(join(folder, 'doc-flow.svg')) && read(folder, 'doc.md') === text;
    run(['md', 'doc.md'], folder);
    const current = run(['md', 'doc.md', '--check'], folder);
    put(folder, 'doc.md', read(folder, 'doc.md').replace('"GET"', '"POST"'));
    const edited = run(['md', 'doc.md', '--check'], folder);
    run(['md', 'doc.md'], folder);
    put(folder, 'doc.md', read(folder, 'doc.md').replace('name=flow', 'name=path'));
    run(['md', 'doc.md'], folder);
    put(folder, 'doc-flow.svg', '<!-- daphnis md doc.md -->');
    const stale = run(['md', 'doc.md', '--check'], folder);

    assert.equal(unrendered.status, 1);
    assert.match(unrendered.stderr, /doc-flow\.svg: is out of date/);
    assert.ok(noFiles);
    assert.equal(current.status, 0, current.stderr);
    assert.equal(edited.status, 1, '블록을 고치면 SVG가 낡았다');
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /doc-flow\.svg: is a stale figure/);
  });
});

// 근거: 요구사항 "--out-dir로 SVG 위치를 바꾼다. 이미지 주소는 문서 기준 상대 경로"
test('md_out_dir_writes_svgs_there_and_links_them_relative_to_the_document', () => {
  withFolder((folder) => {
    put(folder, 'doc.md', doc(block('name=flow', FLOW)));

    const result = run(['md', 'doc.md', '--out-dir', 'images/figs'], folder);

    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(folder, 'images/figs/doc-flow.svg')));
    assert.match(read(folder, 'doc.md'), /\]\(images\/figs\/doc-flow\.svg\)/);
    assert.equal(run(['md', 'doc.md', '--out-dir', 'images/figs', '--check'], folder).status, 0);
  });
});

// 근거: 요구사항 "dap 블록만 대상이다". 다른 울타리 안의 dap 줄과 목록 안 들여쓴 블록
test('md_ignores_dap_inside_other_fences_and_renders_an_indented_block_in_a_list', () => {
  withFolder((folder) => {
    const nested = '````text\n```dap\nflow right\nbox a "A"\n```\n````\n';
    const listed = '- item\n\n  ```dap\n  flow right\n  box a "A"\n  ```\n';
    put(folder, 'doc.md', doc(nested, listed));

    const result = run(['md', 'doc.md'], folder);

    assert.equal(result.status, 0, result.stderr);
    assert.ok(!existsSync(join(folder, 'doc-2.svg')), 'text 울타리 안 블록은 그리지 않는다');
    assert.ok(existsSync(join(folder, 'doc-1.svg')));
    assert.match(read(folder, 'doc.md'), /\n {2}!\[doc figure 1\]\(doc-1\.svg\)<!-- dap -->\n/);
  });
});

// 근거: 계약 CLI 옵션은 명령마다 받는 것만(D08 추가만). md 전용 옵션은 다른 명령에서, 파일 명령 옵션은 md에서 거절한다
test('md_options_are_refused_by_the_wrong_command', () => {
  withFolder((folder) => {
    for (const args of [['render', 'a.dap', '--check'], ['check', 'a.dap', '--out-dir', 'x'], ['md', 'doc.md', '--out', 'x'], ['md', 'doc.md', '--html']]) {
      const result = run(args, folder);

      assert.equal(result.status, 2, args.join(' '));
      assert.match(result.stderr, /is (only for|not for) md/);
    }
  });
});

// 근거: 요구사항 "줄바꿈을 보존한다". CRLF 문서도 블록을 찾고 CRLF로 다시 쓰며 두 번째 실행은 바꾸지 않는다
test('md_keeps_crlf_line_endings_and_stays_idempotent', () => {
  withFolder((folder) => {
    put(folder, 'doc.md', doc(block('name=flow', FLOW)).replaceAll('\n', '\r\n'));

    const first = run(['md', 'doc.md'], folder);
    const markdown = read(folder, 'doc.md');

    assert.equal(first.status, 0, first.stderr);
    assert.match(markdown, /!\[Request path\]\(doc-flow\.svg\)<!-- dap -->\r\n/);
    assert.ok(!/[^\r]\n/.test(markdown), '모든 줄바꿈이 CRLF다');
    assert.equal(run(['md', 'doc.md', '--check'], folder).status, 0);
  });
});

// 근거: 설계 markdown.md 호환 "옛 이름". 옛 울타리(muto)와 옛 이미지 표시를 같은 블록으로 읽어 새 표시로 고쳐 쓰고 폐기 안내를 낸다
test('md_reads_the_old_fence_and_old_image_mark_and_rewrites_the_mark_with_a_deprecation_notice', () => {
  withFolder((folder) => {
    put(folder, 'doc.md', `${doc(block('name=flow', FLOW)).replace('```dap', '```muto')}`.replace('\nend', '\n![x](doc-flow.svg)<!-- muto -->\nend'));

    const result = run(['md', 'doc.md'], folder);
    const markdown = read(folder, 'doc.md');

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /^doc\.md:3: deprecated: the code block language "muto" is now "dap"/m);
    assert.match(markdown, /!\[Request path\]\(doc-flow\.svg\)<!-- dap -->/);
    assert.doesNotMatch(markdown, /<!-- muto -->/);
    assert.equal(markdown.match(/doc-flow\.svg/g).length, 1);
  });
});

const SVG_NAMES = ['readme-one.svg', 'readme-two.svg'];
// cost: time O(1), heap O(1), stack O(1), io 4
// basis: estimate
// 같은 이름의 문서 둘(a/readme.md, b/readme.md)을 만들고 서로 다른 블록 이름을 준다. 출력 폴더는 out이다.
const twinDocs = (folder, names = ['one', 'two']) => {
  for (const [i, dir] of ['a', 'b'].entries()) {
    mkdirSync(join(folder, dir), { recursive: true });
    put(folder, `${dir}/readme.md`, doc(block(`name=${names[i]}`, FLOW)));
  }
};

// 근거: 이슈 #70 "동명 문서가 출력 폴더를 공유하면 다른 문서의 SVG를 지운다". 문서를 따로따로 돌려도 서로의 SVG와 이미지 줄이 남는다
test('md_same_named_documents_sharing_an_out_dir_keep_each_others_svg_when_run_one_after_another', () => {
  withFolder((folder) => {
    twinDocs(folder);

    const first = run(['md', 'a/readme.md', '--out-dir', 'out'], folder);
    const second = run(['md', 'b/readme.md', '--out-dir', 'out'], folder);
    const again = run(['md', 'a/readme.md', '--out-dir', 'out'], folder);

    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.doesNotMatch(second.stdout, /removed/);
    assert.equal(again.stdout, '', '멱등: 다시 돌려도 쓰거나 지운 것이 없다');
    for (const name of SVG_NAMES) assert.ok(existsSync(join(folder, 'out', name)), name);
    assert.match(read(folder, 'a/readme.md'), /\(\.\.\/out\/readme-one\.svg\)/);
    assert.match(read(folder, 'b/readme.md'), /\(\.\.\/out\/readme-two\.svg\)/);
  });
});

// 근거: 이슈 #70 "한 번에 두 문서를 넘기는 경우, 입력 순서 반전, 멱등 재실행". 소유 표시는 문서 경로 기준이라 이름이 바뀌면 자기 SVG만 지운다
test('md_same_named_documents_given_together_in_either_order_keep_both_svgs_and_only_remove_their_own_stale_one', () => {
  withFolder((folder) => {
    twinDocs(folder);

    for (const order of [['a/readme.md', 'b/readme.md'], ['b/readme.md', 'a/readme.md'], ['a/readme.md', 'b/readme.md']]) {
      const result = run(['md', ...order, '--out-dir', 'out'], folder);
      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(result.stdout, /removed/);
      for (const name of SVG_NAMES) assert.ok(existsSync(join(folder, 'out', name)), `${order.join(' ')}: ${name}`);
    }
    assert.equal(run(['md', 'a/readme.md', 'b/readme.md', '--out-dir', 'out', '--check'], folder).status, 0);

    put(folder, 'a/readme.md', read(folder, 'a/readme.md').replace('name=one', 'name=three'));
    const renamed = run(['md', 'b/readme.md', 'a/readme.md', '--out-dir', 'out'], folder);

    assert.equal(renamed.status, 0, renamed.stderr);
    assert.ok(!existsSync(join(folder, 'out/readme-one.svg')), '자기 문서의 낡은 SVG는 지운다');
    assert.ok(existsSync(join(folder, 'out/readme-two.svg')) && existsSync(join(folder, 'out/readme-three.svg')));
  });
});

// 근거: 이슈 #70 "어떤 파일도 한 실행의 쓰기 대상과 삭제 대상에 동시에 들어가지 않는다". 이슈 #102 이후 다른 문서의 SVG에는 같은 실행에서도 쓰지 못하므로, 한 문서가 놓은 이름을 다른 문서가 이어받으려면 놓는 실행이 먼저다
test('md_never_removes_a_file_that_another_document_writes_and_a_handover_needs_the_release_run_first', () => {
  withFolder((folder) => {
    twinDocs(folder, ['x', 'y']);
    run(['md', 'a/readme.md', '--out-dir', 'out'], folder);
    put(folder, 'b/readme.md', read(folder, 'b/readme.md').replace('name=y', 'name=x'));
    put(folder, 'a/readme.md', read(folder, 'a/readme.md').replace('name=x', 'name=z'));

    const together = run(['md', 'a/readme.md', 'b/readme.md', '--out-dir', 'out'], folder);

    assert.equal(together.status, 1);
    assert.match(together.stderr, /readme-x\.svg already exists and was made for another document/);
    assert.ok(existsSync(join(folder, 'out/readme-x.svg')), '오류가 나면 지우지도 않는다');
    assert.ok(!existsSync(join(folder, 'out/readme-z.svg')));

    assert.equal(run(['md', 'a/readme.md', '--out-dir', 'out'], folder).status, 0);
    assert.ok(!existsSync(join(folder, 'out/readme-x.svg')), '자기 문서의 낡은 SVG는 지운다');
    const handover = run(['md', 'b/readme.md', '--out-dir', 'out'], folder);

    assert.equal(handover.status, 0, handover.stderr);
    assert.match(read(folder, 'out/readme-x.svg'), /<!-- daphnis md v2 \.\.\/b\/readme\.md -->/);
    assert.match(read(folder, 'out/readme-z.svg'), /<!-- daphnis md v2 \.\.\/a\/readme\.md -->/);
    assert.equal(run(['md', 'a/readme.md', 'b/readme.md', '--out-dir', 'out', '--check'], folder).status, 0);
  });
});

// 근거: 이슈 #102 "이름과 블록 이름이 같은 두 문서를 차례로 반영하면 두 번째가 쓰기 전에 충돌 오류로 끝나고 첫 문서의 SVG와 이미지 줄은 그대로다"
test('md_second_document_with_the_same_name_and_block_name_fails_before_writing_and_leaves_the_first_intact', () => {
  withFolder((folder) => {
    twinDocs(folder, ['one', 'one']);
    put(folder, 'b/readme.md', read(folder, 'b/readme.md').replace('"Client"', '"BBB"'));
    run(['md', 'a/readme.md', '--out-dir', 'out'], folder);
    const svg = read(folder, 'out/readme-one.svg');
    const first = read(folder, 'a/readme.md');
    const second = read(folder, 'b/readme.md');

    const result = run(['md', 'b/readme.md', '--out-dir', 'out'], folder);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /^b\/readme\.md:3: .*readme-one\.svg already exists and was made for another document, or its mark does not name this document \(\.\.\/a\/readme\.md\)\. Give the block a different name=, or write this document to a different --out-dir/m);
    assert.equal(read(folder, 'out/readme-one.svg'), svg);
    assert.equal(read(folder, 'a/readme.md'), first);
    assert.equal(read(folder, 'b/readme.md'), second, '실패한 문서에는 이미지 줄도 넣지 않는다');
  });
});

// 근거: 이슈 #102 "두 문서를 한 번에, 역순으로, 같은 문서를 거듭 반영해도 다른 문서 SVG를 쓰거나 지우지 않는다. 같은 문서 반복은 성공하고 멱등"
test('md_same_block_name_in_two_documents_given_together_in_either_order_writes_nothing_and_the_owner_can_rerun', () => {
  withFolder((folder) => {
    twinDocs(folder, ['one', 'one']);
    run(['md', 'a/readme.md', '--out-dir', 'out'], folder);
    const svg = read(folder, 'out/readme-one.svg');
    const second = read(folder, 'b/readme.md');

    for (const order of [['a/readme.md', 'b/readme.md'], ['b/readme.md', 'a/readme.md']]) {
      const result = run(['md', ...order, '--out-dir', 'out'], folder);
      assert.equal(result.status, 1, order.join(' '));
    }
    const reverse = run(['md', 'b/readme.md', '--out-dir', 'out', '--check'], folder);
    const again = run(['md', 'a/readme.md', '--out-dir', 'out'], folder);

    assert.equal(reverse.status, 1, '--check도 충돌을 오류로 알린다');
    assert.match(reverse.stderr, /already exists and was made for another document/);
    assert.equal(again.status, 0, again.stderr);
    assert.equal(again.stdout, '', '같은 문서 반복은 아무것도 쓰지 않는다');
    assert.equal(read(folder, 'out/readme-one.svg'), svg);
    assert.equal(read(folder, 'b/readme.md'), second);
  });
});

// 근거: 이슈 #102 "표식이 없는 파일이면 쓰기 전에 오류를 내고 아무 파일도 쓰지 않는다". 손으로 만든 그림은 덮어쓰지 않는다
test('md_refuses_to_overwrite_an_existing_svg_without_a_mark_and_writes_no_file_of_the_run', () => {
  withFolder((folder) => {
    put(folder, 'doc.md', doc(block('name=one', FLOW), block('name=two', FLOW)));
    put(folder, 'doc-one.svg', '<svg xmlns="http://www.w3.org/2000/svg"><!-- hand made --></svg>\n');
    const markdown = read(folder, 'doc.md');

    const result = run(['md', 'doc.md'], folder);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /doc\.md:3: .*doc-one\.svg already exists and has no daphnis md mark/);
    assert.match(read(folder, 'doc-one.svg'), /hand made/);
    assert.ok(!existsSync(join(folder, 'doc-two.svg')), '같은 실행의 다른 SVG도 쓰지 않는다');
    assert.equal(read(folder, 'doc.md'), markdown);
  });
});

// 근거: 이슈 #102 삭제 재현 "x--y/readme.md와 x%2D-y/readme.md를 차례로 반영하면 두 번째가 첫 문서의 그림을 지운다"
test('md_documents_at_x_dash_dash_y_and_x_percent_2d_dash_y_do_not_remove_each_others_svg', () => {
  withFolder((folder) => {
    for (const [i, [left, right]] of [['x--y', 'x%2D-y'], ['a--', 'a%2D-']].entries()) {
      for (const [dir, name] of [[left, `first${i}`], [right, `second${i}`]]) {
        mkdirSync(join(folder, dir), { recursive: true });
        put(folder, `${dir}/readme.md`, doc(block(`name=${name}`, FLOW)));
      }

      const first = run(['md', `${left}/readme.md`, '--out-dir', 'out'], folder);
      const second = run(['md', `${right}/readme.md`, '--out-dir', 'out'], folder);

      assert.equal(first.status, 0, first.stderr);
      assert.equal(second.status, 0, second.stderr);
      assert.doesNotMatch(second.stdout, /removed/);
      assert.ok(existsSync(join(folder, `out/readme-first${i}.svg`)) && existsSync(join(folder, `out/readme-second${i}.svg`)));
      assert.equal(run(['md', `${left}/readme.md`, `${right}/readme.md`, '--out-dir', 'out', '--check'], folder).status, 0);
    }
  });
});

// 근거: 이슈 #102 "%, --, 한글, 상대 경로를 섞은 경로의 표식이 서로 다르다". 표식은 XML 주석 규칙을 지키고 `%`가 없는 경로의 표식은 이전과 같다
test('md_marks_of_paths_mixing_percent_double_dash_hangul_and_relative_segments_differ_and_stay_valid_xml_comments', () => {
  withFolder((folder) => {
    mkdirSync(join(folder, 'a'));
    const dirs = ['x--y', 'x%2D-y', 'x%252D-y', 'x---y', '한글--문서', '100%', 'plain', 'a/../b-', 'a--', 'a%2D-'];
    for (const [i, dir] of dirs.entries()) {
      mkdirSync(join(folder, dir), { recursive: true });
      put(folder, `${dir}/readme.md`, doc(block(`name=n${i}`, FLOW)));
      const result = run(['md', `${dir}/readme.md`, '--out-dir', 'out'], folder);
      assert.equal(result.status, 0, `${dir}: ${result.stderr}`);
      assert.doesNotMatch(result.stdout, /removed/, dir);
    }

    const marks = dirs.map((_, i) => /<!-- daphnis md v2 (.*) -->/.exec(read(folder, `out/readme-n${i}.svg`)));
    assert.ok(marks.every(Boolean));
    assert.equal(new Set(marks.map((mark) => mark[1])).size, dirs.length, '표식이 서로 다르다');
    for (const mark of marks) assert.doesNotMatch(mark[0].slice(4, -3), /--/, `${mark[0]}: 주석 안에 --가 없다`);
    assert.equal(marks[6][1], '../plain/readme.md', '%와 연속 -가 없는 경로는 이전 표식과 글자가 같다');
    assert.equal(marks[1][1], '../x%252D-y/readme.md');
    assert.equal(marks[0][1], '../x%2D-y/readme.md');
    assert.equal(marks[5][1], '../100%25/readme.md');
    assert.equal(run(['md', ...dirs.map((dir) => `${dir}/readme.md`), '--out-dir', 'out', '--check'], folder).status, 0);
  });
});

// 근거: 이슈 #102 "옛 표식이 든 SVG는 소유가 분명할 때만 지운다". 옛 인코딩은 `%`를 그대로 두어 `%`가 든 경로에서 모호하다
test('md_removes_a_stale_svg_with_an_old_mark_only_when_the_owner_is_unambiguous', () => {
  withFolder((folder) => {
    mkdirSync(join(folder, 'x--y'));
    mkdirSync(join(folder, 'plain'));
    put(folder, 'x--y/readme.md', doc(block('name=keep', FLOW)));
    put(folder, 'plain/readme.md', doc(block('name=stay', FLOW)));
    mkdirSync(join(folder, 'out'));
    const old = (owner, tool = 'mutoscope') => `<svg xmlns="http://www.w3.org/2000/svg">\n<!-- ${tool} md ${owner} -->\n</svg>\n`;
    put(folder, 'out/readme-gone.svg', old('../plain/readme.md'));
    put(folder, 'out/readme-gonedap.svg', old('../plain/readme.md', 'daphnis'));
    put(folder, 'out/readme-ambiguous.svg', old('../x%2D-y/readme.md'));
    put(folder, 'out/readme-ambiguousdap.svg', old('../x%2D-y/readme.md', 'daphnis'));
    put(folder, 'out/readme-percent.svg', old('../x%252D-y/readme.md'));
    put(folder, 'out/readme-foreign.svg', old('../other/readme.md'));

    const result = run(['md', 'plain/readme.md', 'x--y/readme.md', '--out-dir', 'out'], folder);

    assert.equal(result.status, 0, result.stderr);
    for (const name of ['gone', 'gonedap']) assert.ok(!existsSync(join(folder, `out/readme-${name}.svg`)), `${name}: 소유가 분명한 판 번호 없는 표식은 지운다`);
    for (const name of ['ambiguous', 'ambiguousdap', 'percent', 'foreign']) assert.ok(existsSync(join(folder, `out/readme-${name}.svg`)), `${name}: 모호하거나 남의 것이면 둔다`);
    assert.equal(run(['md', 'plain/readme.md', 'x--y/readme.md', '--out-dir', 'out', '--check'], folder).status, 0);
  });
});

// 근거: 이슈 #102 "옛 표식 SVG는 소유가 분명할 때만" 쓰기에도 같은 판정. 모호한 옛 표식 파일에는 쓰지 않는다
test('md_does_not_write_over_an_svg_with_an_ambiguous_old_mark_but_rewrites_one_with_a_clear_old_mark', () => {
  withFolder((folder) => {
    mkdirSync(join(folder, 'x--y'));
    mkdirSync(join(folder, 'plain'));
    put(folder, 'x--y/readme.md', doc(block('name=one', FLOW)));
    put(folder, 'plain/readme.md', doc(block('name=two', FLOW)));
    mkdirSync(join(folder, 'out'));
    const old = (owner, tool = 'mutoscope') => `<svg xmlns="http://www.w3.org/2000/svg">\n<!-- ${tool} md ${owner} -->\n</svg>\n`;
    put(folder, 'out/readme-one.svg', old('../x%2D-y/readme.md', 'daphnis'));
    put(folder, 'out/readme-two.svg', old('../plain/readme.md'));

    // 옛 구현이 `x%2D-y/readme.md`로 만든 SVG(표시는 `daphnis md ../x%2D-y/readme.md`)다. `x--y/readme.md`의 새 표식과 글자가 같아도 판 번호가 없으니 소유로 보지 않는다
    const ambiguous = run(['md', 'x--y/readme.md', '--out-dir', 'out'], folder);
    const clear = run(['md', 'plain/readme.md', '--out-dir', 'out'], folder);

    assert.equal(ambiguous.status, 1);
    assert.match(ambiguous.stderr, /readme-one\.svg already exists and was made for another document/);
    assert.equal(read(folder, 'out/readme-one.svg'), old('../x%2D-y/readme.md', 'daphnis'));
    assert.equal(clear.status, 0, clear.stderr);
    assert.match(read(folder, 'out/readme-two.svg'), /<!-- daphnis md v2 \.\.\/plain\/readme\.md -->/);
  });
});

// 근거: 이슈 #102 "같은 문서를 거듭 반영하면 두 번째부터 파일 내용이 바뀌지 않는다". 판 번호 없는 자기 SVG는 새 표식으로 한 번 다시 쓰고 그 뒤는 그대로다
test('md_rewrites_its_own_svg_with_an_unversioned_mark_once_and_then_stays_unchanged', () => {
  withFolder((folder) => {
    put(folder, 'doc.md', doc(block('name=flow', FLOW)));
    run(['md', 'doc.md'], folder);
    put(folder, 'doc-flow.svg', read(folder, 'doc-flow.svg').replace('<!-- daphnis md v2 doc.md -->', '<!-- daphnis md doc.md -->'));

    const upgrade = run(['md', 'doc.md'], folder);
    const text = read(folder, 'doc-flow.svg');
    const again = run(['md', 'doc.md'], folder);

    assert.equal(upgrade.status, 0, upgrade.stderr);
    assert.match(text, /<!-- daphnis md v2 doc\.md -->/);
    assert.doesNotMatch(text, /<!-- daphnis md doc\.md -->/);
    assert.equal(again.stdout, '');
    assert.equal(read(folder, 'doc-flow.svg'), text);
  });
});

// 폴더 안 모든 파일의 내용. 실패한 실행 전후를 바이트 단위로 비교한다
const snapshot = (folder, dir = '') => Object.fromEntries(readdirSync(join(folder, dir), { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? Object.entries(snapshot(folder, path)) : [[path, readFileSync(join(folder, path)).toString('hex')]];
}));

// 근거: 이슈 #102 "충돌 오류가 난 실행은 SVG와 문서를 하나도 바꾸지 않는다". 충돌 없는 문서가 같은 실행에 있어도 쓰지 않는다
test('md_conflict_leaves_every_file_of_the_run_byte_identical_even_for_documents_without_a_conflict', () => {
  withFolder((folder) => {
    twinDocs(folder, ['one', 'one']);
    mkdirSync(join(folder, 'c'));
    put(folder, 'c/readme.md', doc(block('name=fresh', FLOW)));
    run(['md', 'a/readme.md', '--out-dir', 'out'], folder);
    const before = snapshot(folder);

    const result = run(['md', 'c/readme.md', 'b/readme.md', '--out-dir', 'out'], folder);

    assert.equal(result.status, 1);
    assert.deepEqual(snapshot(folder), before);
    assert.ok(!existsSync(join(folder, 'out/readme-fresh.svg')));
  });
});

// 근거: 이슈 #102 "같은 실행에서 대소문자만 다른 출력 이름은 쓰기 전에 오류다". 블록 이름은 소문자만 받으므로 문서 파일 이름으로 만든다. NFC와 NFD도 같은 이름으로 친다
test('md_output_names_that_differ_only_in_case_or_unicode_form_conflict_before_writing', () => {
  withFolder((folder) => {
    mkdirSync(join(folder, 'p'));
    mkdirSync(join(folder, 'q'));
    for (const [first, second] of [['Doc.md', 'doc.md'], ['caf\u00e9.md', 'cafe\u0301.md']]) {
      put(folder, `p/${first}`, doc(block('name=one', FLOW)));
      put(folder, `q/${second}`, doc(block('name=one', FLOW)));
      const before = snapshot(folder);

      const result = run(['md', `p/${first}`, `q/${second}`, '--out-dir', 'out'], folder);

      assert.equal(result.status, 1, first);
      assert.match(result.stderr, /is also written for p\/.*Give the block a different name=/, first);
      assert.deepEqual(snapshot(folder), before, first);
      assert.ok(!existsSync(join(folder, 'out')), first);
    }
  });
});

// 근거: 이슈 #102 "심볼릭 링크로 가리킨 같은 문서와 출력 폴더는 같은 소유로 본다"
test('md_treats_a_document_and_an_out_dir_opened_through_symlinks_as_the_same_owner', () => {
  withFolder((folder) => {
    mkdirSync(join(folder, 'real'));
    mkdirSync(join(folder, 'out'));
    put(folder, 'real/readme.md', doc(block('name=one', FLOW)));
    symlinkSync(join(folder, 'real'), join(folder, 'alias'));
    symlinkSync(join(folder, 'out'), join(folder, 'outalias'));
    run(['md', 'real/readme.md', '--out-dir', 'out'], folder);
    const svg = read(folder, 'out/readme-one.svg');

    const viaAlias = run(['md', 'alias/readme.md', '--out-dir', 'outalias'], folder);
    const again = run(['md', 'alias/readme.md', '--out-dir', 'outalias'], folder);

    assert.equal(viaAlias.status, 0, viaAlias.stderr);
    assert.doesNotMatch(viaAlias.stdout, /removed/);
    assert.equal(read(folder, 'out/readme-one.svg'), svg, '별칭으로 열어도 같은 표식이라 SVG는 그대로다');
    assert.equal(again.stdout, '');
    assert.equal(run(['md', 'real/readme.md', 'alias/readme.md', '--out-dir', 'out', '--check'], folder).status, 1, '같은 문서를 두 번 넘기면 같은 SVG를 두 번 쓰려는 오류다');
  });
});

// 마크다운 쓰기가 일어나는 구간을 고정하는 훅. 첫 rename 직전에 준비 표시 파일을 만들고 해제 파일이 생길 때까지 멈춘다
const PAUSE = new URL('./fixtures/pause-first-rename.mjs', import.meta.url).pathname;
const CLI = new URL('../src/cli.js', import.meta.url).pathname;
const exists = (path) => existsSync(path);
// cost: time O(t), heap O(1), stack O(1)
// vars: t = 기다리는 시간(최대 60초, 10ms 간격 확인)
// basis: estimate
// 조건이 참이 될 때까지 기다린다(최대 60초). 고정 시간 sleep이 아니라 조건을 확인하며 돈다
const until = async (condition, what) => {
  for (const start = Date.now(); !condition() && Date.now() - start < 60000;) await new Promise((resolve) => { setTimeout(resolve, 10); });
  assert.ok(condition(), what);
};
// cost: time O(out), heap O(out), stack O(1), io 1
// vars: out = 자식 프로세스 출력 글자 수
// basis: estimate
const startPaused = (args, folder) => {
  const child = spawn(process.execPath, ['--import', PAUSE, CLI, ...args], { cwd: folder, env: { ...process.env, DAPHNIS_TEST_READY: join(folder, 'ready'), DAPHNIS_TEST_RELEASE: join(folder, 'release') }, stdio: ['ignore', 'pipe', 'pipe'] });
  const done = new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('exit', (status) => resolve({ status, stdout, stderr }));
  });
  return { child, done };
};

// 근거: 이슈 #102 "같은 출력 폴더에 두 프로세스가 동시에 쓰면 하나만 쓰고 다른 하나는 파일을 바꾸기 전에 오류로 끝난다". 공개 명령 두 개를 실제로 띄우고, 첫 프로세스를 첫 rename 직전에 훅으로 멈춘 채 두 번째를 돌린다
test('md_second_process_on_the_same_out_dir_fails_before_changing_files_while_the_first_is_writing', () => withFolder(async (folder) => {
  twinDocs(folder, ['one', 'one']);
  mkdirSync(join(folder, 'c'));
  put(folder, 'c/readme.md', doc(block('name=other', FLOW)));
  assert.equal(run(['md', 'c/readme.md', '--out-dir', 'out'], folder).status, 0);
  const other = snapshot(folder, 'out');
  const second = read(folder, 'b/readme.md');
  const first = startPaused(['md', 'a/readme.md', '--out-dir', 'out'], folder);
  await until(() => exists(join(folder, 'ready')), '첫 프로세스가 쓰기 직전에 멈춘다');

  const blocked = run(['md', 'b/readme.md', '--out-dir', 'out'], folder);
  const during = snapshot(folder, 'out');
  writeFileSync(join(folder, 'release'), '');
  const result = await first.done;

  assert.equal(blocked.status, 1, blocked.stdout + blocked.stderr);
  assert.match(blocked.stderr, /\.daphnis-md\.lock: another daphnis md is writing to this folder \(pid \d+ on host /);
  assert.equal(read(folder, 'b/readme.md'), second, '막힌 실행은 문서를 바꾸지 않는다');
  assert.ok(!('out/readme-one.svg' in during), '막힌 실행이 끝난 시점에 첫 프로세스의 SVG는 아직 놓이기 전이다');
  for (const [name, hex] of Object.entries(other)) assert.equal(during[name], hex, `${name}: 다른 문서의 출력은 그대로다`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(read(folder, 'out/readme-one.svg'), /<!-- daphnis md v2 \.\.\/a\/readme\.md -->/);
  assert.match(read(folder, 'a/readme.md'), /\(\.\.\/out\/readme-one\.svg\)/);
  assert.equal(read(folder, 'b/readme.md'), second);
  for (const [name, hex] of Object.entries(other)) assert.equal(snapshot(folder, 'out')[name], hex, `${name}: 끝난 뒤에도 그대로다`);
  assert.ok(!existsSync(join(folder, 'out/.daphnis-md.lock')), '끝나면 잠금을 푼다');
}));

// 잠금 파일을 손으로 만든다. 공개 명령이 이 잠금을 어떻게 다루는지 본다
const lockText = (over = {}) => `${JSON.stringify({ pid: process.pid, host: hostname(), created: '2026-01-01T00:00:00.000Z', nonce: 'n1', ...over })}\n`;
const LOCK = 'out/.daphnis-md.lock';
// cost: time O(1), heap O(1), stack O(1), io 4
// basis: estimate
const lockSetup = (folder, text) => {
  put(folder, 'doc.md', doc(block('name=one', FLOW)));
  mkdirSync(join(folder, 'out'));
  put(folder, LOCK, text);
  return { markdown: read(folder, 'doc.md'), lock: text };
};
const deadPid = () => new Promise((resolve) => {
  const child = spawn(process.execPath, ['-e', '']);
  child.on('exit', () => resolve(child.pid));
});

// 근거: 이슈 #102 "EPERM, 다른 호스트, 읽을 수 없거나 형식이 틀린 잠금, pid가 살아 있는 경우는 자동 삭제하지 않고 진단으로 끝낸다"
test('md_does_not_clear_a_lock_that_is_alive_foreign_unreadable_or_unverifiable_and_names_the_file_and_owner', () => withFolder(async (folder) => {
  const cases = [
    ['살아 있는 주인', lockText(), /another daphnis md is writing to this folder \(pid \d+ on host .*, created 2026-01-01T00:00:00\.000Z\)\. If no daphnis md is running, delete this file by hand/],
    ['다른 호스트', lockText({ host: 'another-host.invalid', pid: await deadPid() }), /belongs to another host, so it is not cleared automatically \(pid \d+ on host another-host\.invalid/],
    ['형식이 틀림', 'not json\n', /cannot be read or has an unknown format \(owner unknown\)/],
    ['필드 없음', '{"pid":1}\n', /cannot be read or has an unknown format/],
  ];
  let eperm = false;
  try {
    process.kill(1, 0);
  } catch (error) {
    eperm = error.code === 'EPERM';
  }
  if (eperm) cases.push(['권한 오류(pid 1)', lockText({ pid: 1 }), /cannot be checked \(permission denied\)/]);
  for (const [name, text, message] of cases) {
    const { markdown } = lockSetup(folder, text);

    const result = run(['md', 'doc.md', '--out-dir', 'out'], folder);

    assert.equal(result.status, 1, name);
    assert.match(result.stderr, message, name);
    assert.ok(result.stderr.includes('out/.daphnis-md.lock'), name);
    assert.equal(read(folder, LOCK), text, `${name}: 잠금 파일은 그대로다`);
    assert.equal(read(folder, 'doc.md'), markdown, name);
    assert.ok(!existsSync(join(folder, 'out/doc-one.svg')), name);
    rmSync(join(folder, LOCK));
    rmSync(join(folder, 'out'), { recursive: true });
  }
}));

// 근거: 이슈 #102 "같은 호스트이고 pid 조회가 ESRCH일 때만 자동 정리한다". 끝난 자기 자식 프로세스의 번호를 쓴다
test('md_clears_a_lock_of_a_dead_process_on_the_same_host_and_a_normal_or_failed_run_leaves_no_lock', () => withFolder(async (folder) => {
  lockSetup(folder, lockText({ pid: await deadPid() }));

  const cleared = run(['md', 'doc.md', '--out-dir', 'out'], folder);

  assert.equal(cleared.status, 0, cleared.stderr);
  assert.ok(!existsSync(join(folder, LOCK)), '성공한 실행 뒤 잠금이 없다');
  const leftovers = readdirSync(join(folder, 'out')).filter((name) => name.includes('lock'));
  assert.deepEqual(leftovers, [], '치운 낡은 잠금 파일도 남지 않는다');

  put(folder, 'doc.md', doc(block('name=one', FLOW), block('name=one', FLOW)));
  const failed = run(['md', 'doc.md', '--out-dir', 'out'], folder);

  assert.equal(failed.status, 1);
  assert.ok(!existsSync(join(folder, LOCK)), '오류로 끝난 실행 뒤에도 잠금이 없다');
  assert.equal(run(['md', 'doc.md', '--out-dir', 'out', '--check'], folder).status, 1);
  put(folder, 'doc.md', doc(block('name=one', FLOW)));
  assert.equal(run(['md', 'doc.md', '--out-dir', 'out'], folder).status, 0, '다시 돌리면 된다');
}));
