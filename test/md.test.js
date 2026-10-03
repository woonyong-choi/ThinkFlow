// md 명령: 문서 안 ```muto 블록의 SVG와 이미지 줄(docs/design/markdown.md). 멱등, 이름 안정, 오류 시 미기록, --check 종료 코드는 그 문서의 요구사항 표다.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { runCli as run, withFolder } from './helpers.js';

const FLOW = 'flow right\ntitle "Request path"\nbox a "Client"\nbox b "Server"\na -> b "GET"\nstep "s"\n  a -> b\n';
const BAR = 'chart bar\ntitle "Latency"\nseries s "S"\nrow "r" s=1\n';
const doc = (...blocks) => `# Doc\n\n${blocks.join('\n')}\nend\n`;
const block = (info, source) => `\`\`\`muto${info ? ` ${info}` : ''}\n${source}\`\`\`\n`;
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
    assert.match(markdown, /```\n\n!\[Request path\]\(doc-flow\.svg\)<!-- muto -->\n\nend\n$/);
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
    const example = '````text\n![x](x.svg)<!-- muto -->\n````\n';
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
    { name: 'unclosed_fence', text: '```muto\nflow right\n', args: [], stderr: /^doc\.md:1: the muto fence is never closed/m },
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
    put(folder, 'doc-flow.svg', '<!-- mutoscope md doc.md -->');
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

// 근거: 요구사항 "muto 블록만 대상이다". 다른 울타리 안의 muto 줄과 목록 안 들여쓴 블록
test('md_ignores_muto_inside_other_fences_and_renders_an_indented_block_in_a_list', () => {
  withFolder((folder) => {
    const nested = '````text\n```muto\nflow right\nbox a "A"\n```\n````\n';
    const listed = '- item\n\n  ```muto\n  flow right\n  box a "A"\n  ```\n';
    put(folder, 'doc.md', doc(nested, listed));

    const result = run(['md', 'doc.md'], folder);

    assert.equal(result.status, 0, result.stderr);
    assert.ok(!existsSync(join(folder, 'doc-2.svg')), 'text 울타리 안 블록은 그리지 않는다');
    assert.ok(existsSync(join(folder, 'doc-1.svg')));
    assert.match(read(folder, 'doc.md'), /\n {2}!\[doc figure 1\]\(doc-1\.svg\)<!-- muto -->\n/);
  });
});

// 근거: 계약 CLI 옵션은 명령마다 받는 것만(D08 추가만). md 전용 옵션은 다른 명령에서, 파일 명령 옵션은 md에서 거절한다
test('md_options_are_refused_by_the_wrong_command', () => {
  withFolder((folder) => {
    for (const args of [['render', 'a.muto', '--check'], ['check', 'a.muto', '--out-dir', 'x'], ['md', 'doc.md', '--out', 'x'], ['md', 'doc.md', '--html']]) {
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
    assert.match(markdown, /!\[Request path\]\(doc-flow\.svg\)<!-- muto -->\r\n/);
    assert.ok(!/[^\r]\n/.test(markdown), '모든 줄바꿈이 CRLF다');
    assert.equal(run(['md', 'doc.md', '--check'], folder).status, 0);
  });
});
