// md 명령의 원본 접기(--fold, --unfold)와 옵션 없는 실행의 접힘 유지, 목록·인용 안 블록(docs/design/markdown.md 원본 접기). 결정: 이슈 #39.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { findBlocks } from '../src/md.js';
import { escapeHtml, inspectFold, joinLines, layoutDocument } from '../src/md-fold.js';
import { runCli as run, withFolder } from './helpers.js';

const FLOW = 'flow right\ntitle "Request path"\nbox a "Client"\nbox b "Server"\na -> b "GET"\nstep "s"\n  a -> b\n';
const BAR = 'chart bar\ntitle "Latency"\nseries s "S"\nrow "r" s=1\n';
const read = (folder, name = 'doc.md') => readFileSync(join(folder, name), 'utf8');
const put = (folder, text, name = 'doc.md') => writeFileSync(join(folder, name), text);
const snapshot = (folder) => Object.fromEntries(readdirSync(folder).filter((name) => !name.startsWith('.')).sort().map((name) => [name, read(folder, name)]));
const USER = '<details>\n<summary>mine</summary>\n\nhand written\n\n</details>\n\n![mine](mine.png)\n\n';
const DOC = `# Doc\n\nintro\n\n${USER}\`\`\`dap name=flow\n${FLOW}\`\`\`\n\nmiddle\n\n\`\`\`dap\n${BAR}\`\`\`\n\nend\n`;

// 근거: 이슈 #39 완료 조건 "접기, 접기 해제, 옵션 생략 각각을 두 번 실행해 두 번째에는 변경이 없다"
test('md_fold_unfold_and_keep_each_change_nothing_on_the_second_run', () => {
  const cases = [['--fold', false], ['--unfold', true], ['', true], ['', false]];
  for (const [flag, startFolded] of cases) {
    withFolder((folder) => {
      put(folder, DOC);
      if (startFolded) run(['md', 'doc.md', '--fold'], folder);
      const flags = flag ? [flag] : [];
      const first = run(['md', 'doc.md', ...flags], folder);
      const before = snapshot(folder);
      const second = run(['md', 'doc.md', ...flags], folder);
      const label = `${flag || '옵션 없음'}, 시작 ${startFolded ? '접힘' : '접지 않음'}`;

      assert.equal(first.status, 0, first.stderr);
      assert.equal(second.status, 0, second.stderr);
      assert.equal(second.stdout, '', `${label}: 다시 돌리면 쓴 파일이 없다`);
      assert.deepEqual(snapshot(folder), before, label);
      assert.equal(run(['md', 'doc.md', '--check', ...flags], folder).status, 0, label);
    });
  }
});

// 근거: 이슈 #39 완료 조건 "접기 후 해제하면 원본 코드와 사용자 작성 부분이 바이트 단위로 보존된다". 사용자 details, 이미지, 문단과 4개짜리 울타리 안의 표식 예시를 포함한다
test('md_fold_then_unfold_restores_the_document_byte_for_byte_and_keeps_user_parts', () => {
  withFolder((folder) => {
    const example = '````text\n<!-- daphnis fold v1 name=x -->\n```dap\n````\n\n';
    put(folder, DOC + example);
    run(['md', 'doc.md'], folder);
    const plain = read(folder);

    const folded = run(['md', 'doc.md', '--fold'], folder);
    const mid = read(folder);
    const unfolded = run(['md', 'doc.md', '--unfold'], folder);

    assert.equal(folded.status, 0, folded.stderr);
    assert.notEqual(mid, plain);
    assert.equal(unfolded.status, 0, unfolded.stderr);
    assert.equal(read(folder), plain);
    for (const kept of [USER.trimEnd(), `\`\`\`dap name=flow\n${FLOW}\`\`\``, `\`\`\`dap\n${BAR}\`\`\``, example.trimEnd()]) assert.ok(mid.includes(kept) && plain.includes(kept), kept);
  });
});

// 근거: 이슈 #39 결정 "그림을 먼저 두고 바로 뒤의 details 안에 원본 코드 블록을 그대로 둔다. 기본 summary는 그림 원본"
test('md_fold_puts_the_figure_first_and_the_block_inside_details_with_the_default_summary', () => {
  withFolder((folder) => {
    put(folder, '# Doc\n\ntext\n```dap name=flow\n' + FLOW + '```\nafter\n');

    const result = run(['md', 'doc.md', '--fold'], folder);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(read(folder), `# Doc\n\ntext\n<!-- daphnis fold v1 name=flow -->\n![Request path](doc-flow.svg)<!-- dap -->\n\n<details>\n<summary>그림 원본</summary>\n\n\`\`\`dap name=flow\n${FLOW}\`\`\`\n\n</details>\n<!-- /daphnis fold v1 name=flow -->\n\nafter\n`);
  });
});

// 근거: 이슈 #39 결정 "제목 사용자 지정은 텍스트로 받아 HTML 특수 문자를 이스케이프한다". 한글 제목, 제목 바꾸기, 제목 생략 때 유지
test('md_fold_title_is_escaped_text_and_an_existing_title_stays_when_the_option_is_omitted', () => {
  withFolder((folder) => {
    put(folder, `\`\`\`dap name=flow\n${FLOW}\`\`\`\n`);

    run(['md', 'doc.md', '--fold', '--fold-title', '원본 <b>보기</b> & "그림"'], folder);
    assert.match(read(folder), /<summary>원본 &lt;b&gt;보기&lt;\/b&gt; &amp; &quot;그림&quot;<\/summary>/);
    const kept = run(['md', 'doc.md', '--fold'], folder);
    assert.equal(kept.stdout, '', '제목을 생략하면 그대로다');
    assert.equal(run(['md', 'doc.md', '--fold', '--fold-title', '원본'], folder).status, 0);
    assert.match(read(folder), /<summary>원본<\/summary>/);
    assert.equal(run(['md', 'doc.md'], folder).stdout, '', '옵션이 없으면 접힘과 제목을 지킨다');
  });
});

// 근거: 이슈 #39 결정 "--fold와 --unfold는 함께 쓰면 인자 오류". 제목은 --fold와만, 다른 명령은 이 옵션을 받지 않는다
test('md_fold_options_are_argument_errors_when_combined_or_misplaced', () => {
  withFolder((folder) => {
    put(folder, `\`\`\`dap\n${BAR}\`\`\`\n`);
    for (const args of [['md', 'doc.md', '--fold', '--unfold'], ['md', 'doc.md', '--fold-title', 'x'], ['md', 'doc.md', '--unfold', '--fold-title', 'x'], ['md', 'doc.md', '--fold', '--fold-title', ' '], ['render', 'a.dap', '--fold'], ['check', 'a.dap', '--unfold']]) {
      const result = run(args, folder);

      assert.equal(result.status, 2, args.join(' '));
      assert.deepEqual(Object.keys(snapshot(folder)), ['doc.md'], '아무것도 쓰지 않는다');
    }
    assert.match(run(['md', 'doc.md', '--fold', '--unfold'], folder).stderr, /--fold and --unfold cannot be used together/);
  });
});

// 근거: 이슈 #39 완료 조건 "여러 블록, 긴 울타리, CRLF". 줄바꿈이 섞인 문서도 블록 본문 바이트가 그대로이고 새 줄은 CRLF다
test('md_fold_keeps_crlf_and_the_block_bytes_in_a_document_with_mixed_line_endings', () => {
  withFolder((folder) => {
    const wide = '````dap name=wide\nflow right\nbox a "A"\n````';
    const body = `# Doc\r\n\r\n${wide.replaceAll('\n', '\r\n')}\r\n\r\n\`\`\`dap name=flow\n${FLOW}\`\`\`\r\nend\r\n`;
    put(folder, body);

    const folded = run(['md', 'doc.md', '--fold'], folder);
    const text = read(folder);

    assert.equal(folded.status, 0, folded.stderr);
    assert.ok(text.includes(wide.replaceAll('\n', '\r\n')), '긴 울타리 블록은 그대로');
    assert.ok(text.includes(`\`\`\`dap name=flow\n${FLOW}\`\`\`\r\n\r\n</details>\r\n<!-- /daphnis fold v1 name=flow -->\r\n`), '본문의 LF는 그대로고 새 줄은 CRLF다');
    assert.match(text, /<!-- daphnis fold v1 name=wide -->\r\n/);
    assert.equal(run(['md', 'doc.md', '--check', '--fold'], folder).status, 0);
    run(['md', 'doc.md', '--unfold'], folder);
    assert.ok(read(folder).includes(wide.replaceAll('\n', '\r\n') + '\r\n'));
    assert.equal(run(['md', 'doc.md', '--check', '--unfold'], folder).status, 0);
  });
});

// 근거: 이슈 #39 완료 조건 "목록, 인용 안 블록을 처리한다"와 결정 "문맥의 들여쓰기와 접두사를 유지한다"
test('md_fold_keeps_the_list_indent_and_the_quote_prefix_and_unfold_restores_them', () => {
  withFolder((folder) => {
    const list = `- item\n\n  \`\`\`dap name=inlist\n  ${BAR.replaceAll('\n', '\n  ').trimEnd()}\n  \`\`\`\n\n- next\n`;
    const quote = `> note\n>\n> \`\`\`dap name=inquote\n> ${BAR.replaceAll('\n', '\n> ').trimEnd()}\n> \`\`\`\n\nend\n`;
    put(folder, `${list}\n${quote}`);
    run(['md', 'doc.md', '--unfold'], folder);
    const plain = read(folder);

    const folded = run(['md', 'doc.md', '--fold'], folder);
    const text = read(folder);

    assert.equal(folded.status, 0, folded.stderr);
    assert.match(text, /\n {2}<!-- daphnis fold v1 name=inlist -->\n {2}!\[Latency\]\(doc-inlist\.svg\)<!-- dap -->\n\n {2}<details>\n {2}<summary>그림 원본<\/summary>\n\n {2}```dap name=inlist\n/);
    assert.match(text, /\n> <!-- daphnis fold v1 name=inquote -->\n> !\[Latency\]\(doc-inquote\.svg\)<!-- dap -->\n>\n> <details>\n> <summary>그림 원본<\/summary>\n>\n> ```dap name=inquote\n/);
    assert.match(text, /\n> <\/details>\n> <!-- \/daphnis fold v1 name=inquote -->\n\nend\n/);
    run(['md', 'doc.md', '--unfold'], folder);
    assert.equal(read(folder), plain);
  });
});

// 근거: 이슈 #39 결정 "사용자 details 안의 블록은 중복으로 감싸지 않고 현재 위치에서 그림만 갱신한다. --unfold도 사용자 details는 풀지 않는다"
test('md_fold_leaves_a_block_inside_a_user_details_in_place_and_never_unwraps_user_details', () => {
  withFolder((folder) => {
    const inner = `<details>\n<summary>원본 보기</summary>\n\n\`\`\`dap name=flow\n${FLOW}\`\`\`\n\n</details>\n`;
    put(folder, `# Doc\n\n${inner}\nend\n`);

    const fold = run(['md', 'doc.md', '--fold'], folder);
    const text = read(folder);
    const unfold = run(['md', 'doc.md', '--unfold'], folder);
    const keep = run(['md', 'doc.md'], folder);

    assert.equal(fold.status, 0, fold.stderr);
    assert.ok(!text.includes('daphnis fold'), '중복으로 감싸지 않는다');
    assert.ok(text.includes('<summary>원본 보기</summary>'));
    assert.equal(text.match(/<details>/g).length, 1);
    assert.match(text, /```\n\n!\[Request path\]\(doc-flow\.svg\)<!-- dap -->\n\n<\/details>/, '그림은 그 자리에서 갱신한다');
    assert.equal(read(folder), text);
    assert.equal(unfold.stdout + keep.stdout, '');
  });
});

// 근거: 이슈 #39 완료 조건 "생성한 details와 사용자 details를 구분하고, 표식이 손상되거나 모호하면 사용자 내용을 삭제하지 않는다"
test('md_fold_refuses_damaged_or_ambiguous_marks_and_changes_no_file', () => {
  const damages = {
    'the start mark is gone': (text) => text.replace('<!-- daphnis fold v1 name=flow -->\n', ''),
    'the end mark is gone': (text) => text.replace('<!-- /daphnis fold v1 name=flow -->\n', ''),
    'a hand written line sits inside the wrapper': (text) => text.replace('</details>\n', 'my note\n\n</details>\n'),
    'the ids of the two marks differ': (text) => text.replace('<!-- /daphnis fold v1 name=flow -->', '<!-- /daphnis fold v1 name=other -->'),
    'the version is unknown': (text) => text.replaceAll('daphnis fold v1', 'daphnis fold v9'),
    'the image line is gone': (text) => text.replace(/!\[.*<!-- dap -->\n\n/, ''),
  };
  for (const [name, damage] of Object.entries(damages)) {
    withFolder((folder) => {
      put(folder, `# Doc\n\n\`\`\`dap name=flow\n${FLOW}\`\`\`\n`);
      run(['md', 'doc.md', '--fold'], folder);
      put(folder, damage(read(folder)));
      const before = snapshot(folder);

      for (const flags of [['--fold'], ['--unfold'], [], ['--check', '--fold']]) {
        const result = run(['md', 'doc.md', ...flags], folder);

        assert.equal(result.status, 1, `${name} ${flags.join(' ')}`);
        assert.match(result.stderr, /doc\.md:\d+: .*daphnis fold|doc\.md:\d+: .*dap block/s, name);
        assert.deepEqual(snapshot(folder), before, `${name}: 사용자 내용과 모든 파일이 그대로다`);
      }
    });
  }
});

// 근거: 이슈 #39 구현 기준 "구조를 확정할 수 없는 입력은 추측해 고치지 않고 위치와 이유를 알린다". 앞에 짝 없는 </details>가 있으면 --fold가 사용자 details 안인지 알 수 없다
test('md_fold_reports_the_position_when_it_cannot_tell_whether_a_block_is_in_a_user_details', () => {
  withFolder((folder) => {
    const text = `# Doc\n\n</details>\n\n\`\`\`dap name=flow\n${FLOW}\`\`\`\n`;
    put(folder, text);

    const fold = run(['md', 'doc.md', '--fold'], folder);

    assert.equal(fold.status, 1);
    assert.match(fold.stderr, /doc\.md:5: .*cannot tell whether this block is inside a <details>/);
    assert.equal(read(folder), text);
    assert.equal(run(['md', 'doc.md'], folder).status, 0, '옵션이 없으면 접지 않으므로 알 필요가 없다');
  });
});

// 근거: 이슈 #39 구현 기준 "--check와 실제 쓰기는 같은 변환 계획". 상태 셋과 옵션 셋의 모든 조합에서 --check 판정이 실제 변환 결과와 같고 --check는 쓰지 않는다
test('md_fold_check_agrees_with_the_real_run_for_every_state_and_option', () => {
  const starts = { plain: (folder) => put(folder, DOC), folded: (folder) => { put(folder, DOC); run(['md', 'doc.md', '--fold'], folder); }, 'unfolded with figures': (folder) => { put(folder, DOC); run(['md', 'doc.md'], folder); } };
  for (const [state, start] of Object.entries(starts)) {
    for (const flags of [['--fold'], ['--unfold'], []]) {
      withFolder((folder) => {
        start(folder);
        const before = snapshot(folder);

        const check = run(['md', 'doc.md', '--check', ...flags], folder);
        const untouched = snapshot(folder);
        const real = run(['md', 'doc.md', ...flags], folder);
        const changed = JSON.stringify(snapshot(folder)) !== JSON.stringify(before);

        assert.deepEqual(untouched, before, `${state} ${flags}: --check는 쓰지 않는다`);
        assert.equal(check.status, changed ? 1 : 0, `${state} ${flags}`);
        assert.equal(real.status, 0, real.stderr);
        assert.equal(run(['md', 'doc.md', '--check', ...flags], folder).status, 0);
      });
    }
  }
});

// 근거: 이슈 #39 구현 기준 "블록 식별자". 표식이 온전한 감싸기는 블록 이름이 바뀌거나 앞에 이름 없는 블록이 끼어도 같은 감싸기로 읽고 표식의 식별자만 맞춘다
test('md_fold_renames_the_mark_id_of_an_intact_wrapper_when_the_block_is_renamed', () => {
  withFolder((folder) => {
    put(folder, `\`\`\`dap name=flow\n${FLOW}\`\`\`\n`);
    run(['md', 'doc.md', '--fold'], folder);

    put(folder, read(folder).replace('```dap name=flow', '```dap name=path'));
    const result = run(['md', 'doc.md'], folder);

    assert.equal(result.status, 0, result.stderr);
    assert.match(read(folder), /<!-- daphnis fold v1 name=path -->[\s\S]*<!-- \/daphnis fold v1 name=path -->/);
    assert.equal(read(folder).match(/<details>/g).length, 1);
  });
});

// 근거: 이슈 #39 구현 기준 "접기 후 사용자 이미지와 주변 문단은 고치거나 이동하지 않는다". 표식 없는 이미지 줄은 접어도 그대로다
test('md_fold_does_not_touch_a_user_image_line_next_to_the_block', () => {
  withFolder((folder) => {
    const text = `before\n\n![mine](mine.png)\n\`\`\`dap name=flow\n${FLOW}\`\`\`\n![theirs](theirs.png)\n\nafter\n`;
    put(folder, text);

    run(['md', 'doc.md', '--fold'], folder);
    const folded = read(folder);
    run(['md', 'doc.md', '--unfold'], folder);

    assert.ok(folded.startsWith('before\n\n![mine](mine.png)\n<!-- daphnis fold'));
    assert.ok(folded.includes('<!-- /daphnis fold v1 name=flow -->\n![theirs](theirs.png)\n\nafter\n') || folded.includes('-->\n\n![theirs](theirs.png)\n\nafter\n'));
    assert.ok(read(folder).includes('![mine](mine.png)\n```dap name=flow') && read(folder).includes('![theirs](theirs.png)'));
  });
});

// 근거: 이슈 #39 완료 조건 "인용 안 블록을 처리한다". --unfold나 --fold를 준 실행은 인용 안 dap 블록을 그림으로 만들고 이미지 줄에 인용 표시를 붙인다
test('md_with_an_fold_option_draws_a_dap_block_inside_a_block_quote_and_keeps_the_quote_prefix', () => {
  withFolder((folder) => {
    put(folder, `> \`\`\`dap name=q\n> ${BAR.replaceAll('\n', '\n> ').trimEnd()}\n> \`\`\`\n\ntext\n`);

    const first = run(['md', 'doc.md', '--unfold'], folder);
    const second = run(['md', 'doc.md', '--unfold'], folder);

    assert.equal(first.status, 0, first.stderr);
    assert.match(read(folder), /> ```\n>\n> !\[Latency\]\(doc-q\.svg\)<!-- dap -->\n\ntext\n/);
    assert.equal(second.stdout, '');
  });
});

// 근거: AGENTS.md "기존 명령의 옵션과 출력은 바꾸지 않고 추가만"과 결정 "접기 옵션이 없는 새 문서는 지금처럼". 옵션 없는 실행은 표식 없는 인용 안 블록을 읽지 않고, 인용 안 표식 줄도 지우지 않으며, 인용 안 울타리 오류도 내지 않는다(인용 블록이 없던 판과 같은 결과)
test('md_without_an_option_ignores_unmarked_blocks_in_a_quote_exactly_as_before', () => {
  withFolder((folder) => {
    const head = `# Doc\n\n\`\`\`dap name=flow\n${FLOW}\`\`\`\n\nmiddle\n`;
    const quote = `\n> \`\`\`dap name=q\n> ${BAR.replaceAll('\n', '\n> ').trimEnd()}\n> \`\`\`\n>\n> note\n>\n> ![x](x.svg)<!-- dap -->\n\n> \`\`\`dap name=broken\n> chart bar\nnot quoted\n\nend\n`;
    put(folder, head + quote);
    put(folder, head, 'plain.md');
    run(['md', 'plain.md'], folder);

    const result = run(['md', 'doc.md'], folder);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(read(folder), read(folder, 'plain.md').replace('plain-flow.svg', 'doc-flow.svg').replace('middle\n', 'middle\n' + quote));
    assert.deepEqual(readdirSync(folder).sort(), ['doc-flow.svg', 'doc.md', 'plain-flow.svg', 'plain.md']);
    assert.equal(run(['md', 'doc.md', '--check'], folder).status, 0);
  });
});

// 근거: 이슈 #39 규칙 "인용 안 블록에 이미 이 도구의 표식이 있으면 옵션 없이도 처리한다". 접은 인용 블록과 이미지 줄이 있는 인용 블록은 옵션 없는 실행이 그림을 갱신한다
test('md_without_an_option_updates_a_quoted_block_that_already_carries_a_daphnis_mark', () => {
  for (const start of ['--fold', '--unfold']) {
    withFolder((folder) => {
      put(folder, `> \`\`\`dap name=q\n> ${BAR.replaceAll('\n', '\n> ').trimEnd()}\n> \`\`\`\n\nend\n`);
      run(['md', 'doc.md', start], folder);
      put(folder, read(folder).replace('title "Latency"', 'title "Latency 2"').replace('> title "Latency"', '> title "Latency 2"'));

      const result = run(['md', 'doc.md'], folder);

      assert.equal(result.status, 0, result.stderr);
      assert.match(read(folder), /!\[Latency 2\]\(doc-q\.svg\)/, start);
      assert.equal(read(folder).includes('<details>'), start === '--fold');
      assert.equal(run(['md', 'doc.md'], folder).stdout, '');
    });
  }
});

// 근거: 이슈 #39 구현 기준 "구조를 확정할 수 없는 입력은 추측해 고치지 않고 위치와 이유를 알린다". 옵션을 준 실행에서 인용 안 울타리가 인용 표시 없는 줄을 만나면 닫힌 것으로 읽지 않는다
test('md_with_an_fold_option_reports_a_quoted_fence_that_loses_its_quote_mark_before_it_closes', () => {
  withFolder((folder) => {
    const text = `> \`\`\`dap name=q\n> chart bar\nnot quoted\n\`\`\`\n`;
    put(folder, text);

    const result = run(['md', 'doc.md', '--unfold'], folder);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /doc\.md:1: the dap fence inside a block quote ends before its closing fence/);
    assert.equal(read(folder), text);
    assert.equal(run(['md', 'doc.md'], folder).status, 0, '옵션이 없으면 새 오류가 없다');
  });
});

// 근거: 이슈 #39 구현 기준 "줄바꿈 형식 유지". 옵션 없는 실행도 줄바꿈이 섞인 문서의 손대지 않은 줄을 CRLF로 바꾸지 않는다
test('md_keeps_the_line_ending_of_every_untouched_line_in_a_mixed_document', () => {
  withFolder((folder) => {
    put(folder, `# Doc\r\nlf line\n\`\`\`dap name=flow\n${FLOW}\`\`\`\r\nend\n`);

    const result = run(['md', 'doc.md'], folder);

    assert.equal(result.status, 0, result.stderr);
    assert.ok(read(folder).startsWith(`# Doc\r\nlf line\n\`\`\`dap name=flow\n${FLOW}\`\`\`\r\n`));
    assert.ok(read(folder).endsWith('\r\nend\n'));
  });
});

// 새 함수를 직접 부르는 시험: HTML 이스케이프
test('escapeHtml_replaces_the_five_html_special_characters_only', () => {
  assert.equal(escapeHtml(`a & b < c > d " e ' f 그림`), 'a &amp; b &lt; c &gt; d &quot; e &#39; f 그림');
  assert.equal(escapeHtml('원본 보기'), '원본 보기');
});

// 새 함수를 직접 부르는 시험: 계획과 배치. 접힌 감싸기는 읽어 내고, 이미지 주소는 새로 쓰고, 본문 줄과 그 줄바꿈은 그대로 둔다
test('layoutDocument_rewrites_the_figure_and_wrapper_lines_and_copies_block_lines_with_their_own_line_endings', () => {
  const lines = ['<!-- daphnis fold v1 name=a -->', '![old](old.svg)<!-- dap -->', '', '<details>', '<summary>mine</summary>', '', '```dap name=a', 'chart', '```', '', '</details>', '<!-- /daphnis fold v1 name=a -->', ''];
  const ends = ['\r\n', '\r\n', '\r\n', '\r\n', '\r\n', '\r\n', '\r\n', '\n', '\r\n', '\r\n', '\r\n', '\r\n', ''];
  const found = findBlocks(lines);
  const inspected = inspectFold(lines, found, 'keep');

  const out = layoutDocument({ lines, ends }, { ...inspected, fenced: found.fenced }, { mode: 'keep', title: undefined, images: [{ alt: 'new', href: 'new.svg' }] });

  assert.deepEqual(inspected.errors, []);
  assert.equal(inspected.items[0].wrapper.summary, 'mine');
  assert.equal(joinLines(out, '\r\n'), lines.map((line, i) => line + ends[i]).join('').replace('![old](old.svg)', '![new](new.svg)'));
  const unfolded = layoutDocument({ lines, ends }, { ...inspected, fenced: found.fenced }, { mode: 'unfold', images: [{ alt: 'new', href: 'new.svg' }] });
  assert.equal(joinLines(unfolded, '\r\n'), '```dap name=a\r\nchart\n```\r\n\r\n![new](new.svg)<!-- dap -->\r\n');
});
