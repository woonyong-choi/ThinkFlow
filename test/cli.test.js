// CLI: 명령 결과 파일, 종료 코드, 오류 출력, --json 필드, gallery(docs/design/figure-check.md, playback.md). 호환 필드와 종료 코드는 compat.test.js.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runCli as run, withFolder } from './helpers.js';

const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const FLOW = 'flow right\nbox a "A"\nbox b "B"\na -> b\nstep "s"\n  a -> b "x"\n';
const BAR = 'chart bar\nseries s "S"\nrow "r" s=1\n';
// 한 번도 지나지 않는 quiet 선(경고 11번)이 있는 원본
const QUIET = 'flow right\nbox a "A"\nbox b "B"\na -> b "보냄" quiet\nb -> a\nstep "s"\n  b -> a\n';
const BAD = 'flow right\nbox a "A"\na -> zz\n';

// 근거: 계약 package.json bin "daphnis": 명령은 심볼릭 링크로 실행되어도 사용법을 낸다
test('main_run_through_symlink_prints_usage', () => {
  withFolder((folder) => {
    const link = join(folder, 'daphnis');
    symlinkSync(CLI, link);

    const result = spawnSync(process.execPath, [link], { encoding: 'utf8' });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /usage/);
  });
});

// 근거: 계약 playback.md 결과 "움직이는 SVG {이름}.svg 하나, --html이면 재생기 HTML"
test('main_render_writes_svg_and_html', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'a.dap'), FLOW);

    const result = run(['render', 'a.dap', '--html'], folder);

    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(folder, 'a.svg')) && existsSync(join(folder, 'a.html')));
  });
});

// 근거: 설계 figure-check.md 요구사항 "오류가 있으면 그림 파일을 쓰지 않는다", figure-syntax.md "오류를 모두 모아 알리고 파일을 쓰지 않는다"
test('main_render_with_an_error_writes_no_file_and_reports_the_line', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'bad.dap'), 'flow right\nbox a "A"\na -> zz\n');

    const result = run(['render', 'bad.dap'], folder);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /^bad\.dap:3: unknown node "zz"/m);
    assert.ok(!existsSync(join(folder, 'bad.svg')));
  });
});

// 근거: 감사 C1 "gallery --strict가 strict를 버림", C2 "빈 입력을 그림 0개인 정상 gallery로 만듦", C3 "오류 파일만 건너뛰고 나머지를 씀"(AGENTS "오류가 있으면 결과 파일을 쓰지 않음"), 옵션은 gallery가 받는 것만(figure-check.md 명령)
test('main_gallery_fails_without_writing_any_file_when_the_input_must_not_pass', () => {
  const cases = [
    { name: 'strict_warning', files: { 'q.dap': QUIET }, args: ['--strict'], status: 1, stderr: /q\.dap:4: .*quiet edge/ },
    { name: 'error_next_to_a_good_file', files: { 'good.dap': FLOW, 'bad.dap': BAD }, args: [], status: 1, stderr: /bad\.dap:3: unknown node "zz"/ },
    { name: 'no_dap_files', files: { 'note.txt': 'x' }, args: [], status: 1, stderr: /no \.dap files/ },
    { name: 'static_is_not_a_gallery_option', files: { 'good.dap': FLOW }, args: ['--static'], status: 2, stderr: /--static is not for gallery/ },
    { name: 'json_is_not_a_gallery_option', files: { 'good.dap': FLOW }, args: ['--json'], status: 2, stderr: /--json is not for gallery/ },
  ];
  for (const { name, files, args, status, stderr } of cases) {
    withFolder((folder) => {
      for (const [file, text] of Object.entries(files)) writeFileSync(join(folder, file), text);

      const result = run(['gallery', '.', '--out', 'out', ...args], folder);

      assert.equal(result.status, status, name);
      assert.match(result.stderr, stderr, name);
      assert.ok(!existsSync(join(folder, 'out')), `${name}: no result file`);
    });
  }
});

// 근거: 감사 C1 반대 사례 "경고만 있는 원본은 --strict 없이는 통과하고, --strict 뒤에 다른 옵션이 붙어도 gallery가 받는 옵션은 그대로 받는다"
test('main_gallery_still_writes_the_files_for_a_warning_without_strict_and_accepts_its_options', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'q.dap'), QUIET);

    const plain = run(['gallery', '.', '--out', 'plain'], folder);
    const flagged = run(['gallery', '.', '--out', 'flagged', '--html', '--no-deprecated'], folder);

    for (const [result, out] of [[plain, 'plain'], [flagged, 'flagged']]) {
      assert.equal(result.status, 0, result.stderr);
      assert.ok(['q.svg', 'q.html', 'index.html', 'document.html'].every((file) => existsSync(join(folder, out, file))), out);
    }
  });
});

// 근거: 설계 figure-check.md 요구사항 "--json 출력이 한 줄에 메시지 하나다"와 진단 필드 { file, line, ..., severity, code, column }
test('main_json_prints_one_message_per_line_with_the_documented_fields', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'bad.dap'), 'flow right\nbox Step "S"\nbox a "A"\na -> zz\n');

    const lines = run(['check', 'bad.dap', '--json'], folder).stdout.trim().split('\n');

    assert.equal(lines.length, 2);
    for (const line of lines) assert.deepEqual(Object.keys(JSON.parse(line)), ['file', 'line', 'lines', 'check', 'level', 'message', 'severity', 'code', 'column']);
    assert.deepEqual(lines.map((line) => JSON.parse(line).code), ['syntax', 'syntax']);
  });
});

// 근거: 버그 68ec356 "덧붙는 오류를 줄이면서도 문법 오류와 글꼴 없는 글자 오류를 함께 알린다", 설계 figure-syntax.md "오류를 모두 모아 알린다"
test('main_check_reports_syntax_and_glyph_errors_together', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'bad.dap'), 'flow right\nbox a "A 😀"\nbox b "B"\na -> cdex\n');

    const { stderr } = run(['check', 'bad.dap'], folder);

    assert.match(stderr, /bad\.dap:2: the font has no glyph/);
    assert.match(stderr, /bad\.dap:4: unknown node "cdex"/);
  });
});

// 근거: 버그 68ec356 "읽을 수 없는 파일은 한 줄 메시지로 알리고 나머지 파일은 계속 검사한다"
test('main_missing_file_reports_one_line_and_checks_the_rest', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'ok.dap'), 'flow right\naspect 1.6\nbox a "A"\nbox b "B"\na -> b\n');

    const { stderr, status } = run(['check', 'nope.dap', 'ok.dap'], folder);

    assert.equal(status, 1);
    assert.equal(stderr.trim(), 'nope.dap: cannot read the file: ENOENT');
  });
});

// 근거: 설계 playback.md 요구사항 "재생기 안에는 그림 바탕 판이 없고, SVG 파일에만 있다"(점 격자 없는 둥근 판)
test('main_render_svg_keeps_the_rounded_plate_and_the_html_player_has_none', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'b.dap'), BAR);

    const result = run(['render', 'b.dap', '--html'], folder);
    const svg = readFileSync(join(folder, 'b.svg'), 'utf8');
    const html = readFileSync(join(folder, 'b.html'), 'utf8');

    assert.equal(result.status, 0, result.stderr);
    assert.match(svg, /<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" rx="\d+" fill="var\(--color-bg\)" stroke="var\(--color-plate-border\)"/);
    assert.ok(!html.includes('<rect width="100%" height="100%"'));
    for (const text of [svg, html]) assert.ok(!text.includes('fl-dots'));
  });
});

// 근거: 설계 playback.md 요구사항 "gallery가 문서 미리보기를 쓴다"와 layout.md 카드 머리 "파일 이름과 꼬리표, 그림이 제목을 그리지 않을 때만 제목"
test('main_gallery_writes_the_index_and_the_document_preview_with_each_figure_and_a_card_head', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'a.dap'), 'flow right\ntitle "흐름 제목"\nbox a "A"\n');
    writeFileSync(join(folder, 'b.dap'), 'chart bar\ntitle "차트 제목"\nseries s "S"\nrow "r" s=1\n');

    const result = run(['gallery', '.', '--out', 'out'], folder);
    const page = (name) => readFileSync(join(folder, 'out', `${name}.html`), 'utf8');

    assert.equal(result.status, 0, result.stderr);
    assert.match(page('index'), /src="\.\/a\.html"/);
    assert.match(page('index'), /src="\.\/b\.html"/);
    assert.match(page('index'), /href="document\.html"/);
    assert.match(page('document'), /<img src="\.\/a\.svg"/);
    assert.match(page('document'), /<img src="\.\/b\.svg"/);
    for (const name of ['index', 'document']) {
      assert.match(page(name), /<h2><span class="title">흐름 제목<\/span><code class="name">a\.dap<\/code><span class="kind">flow<\/span><\/h2>/);
      assert.match(page(name), /<h2><code class="name">b\.dap<\/code><span class="kind">bar<\/span><\/h2>/);
      for (const mode of ['system', 'light', 'dark']) assert.match(page(name), new RegExp(`data-mode="${mode}"`));
    }
  });
});

const NAMED_BOX = (id) => `flow right\ntitle "${id} figure"\nbox a "A"\n`;
const iframeSrcs = (page) => [...page.matchAll(/<iframe src="([^"]+)"/g)].map((m) => m[1].replace(/^\.\//, ''));

// 근거: 이슈 #73 "갤러리 예약 이름(index, document) 원본이 목록 파일을 덮어쓴다". 모든 원본의 재생 화면과 목록 파일은 서로 다른 출력 파일이다
test('main_gallery_keeps_a_source_named_index_or_document_apart_from_the_list_and_preview_files', () => {
  withFolder((folder) => {
    for (const name of ['index', 'document', 'plain']) writeFileSync(join(folder, `${name}.dap`), NAMED_BOX(name));

    const result = run(['gallery', '.', '--out', 'out'], folder);
    const read = (file) => readFileSync(join(folder, 'out', file), 'utf8');
    const srcs = iframeSrcs(read('index.html'));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(srcs.length, 3);
    assert.ok(!srcs.includes('index.html') && !srcs.includes('document.html'), `재생 화면이 목록 파일을 가리킨다: ${srcs}`);
    assert.equal(new Set(srcs).size, 3);
    for (const [src, name] of srcs.map((src, i) => [src, ['document', 'index', 'plain'][i]])) {
      assert.ok(read(src).includes(`${name} figure`), `${src}는 ${name} 그림의 재생 화면이다`);
      assert.ok(!read(src).includes('<iframe'), `${src}는 목록이 아니다`);
    }
    assert.match(read('document.html'), /<img src="\.\/index\.svg"/);
    assert.ok(existsSync(join(folder, 'out', 'index.svg')) && existsSync(join(folder, 'out', 'document.svg')));
  });
});

// 근거: 이슈 #73 완료 조건 "출력 이름 충돌을 쓰기 전에 검증한다, 충돌 시 기존 파일 보존"
test('main_gallery_refuses_clashing_output_names_before_writing_and_keeps_existing_files', () => {
  const cases = [{ name: 'player_name_taken', files: ['index', 'index-player'] }];
  for (const { name, files } of cases) {
    withFolder((folder) => {
      for (const file of files) writeFileSync(join(folder, `${file}.dap`), NAMED_BOX(file));
      mkdirSync(join(folder, 'out'));
      writeFileSync(join(folder, 'out', 'index.html'), 'keep');

      const result = run(['gallery', '.', '--out', 'out'], folder);

      assert.equal(result.status, 1, name);
      assert.match(result.stderr, /would be written twice/, name);
      assert.deepEqual(readdirSync(join(folder, 'out')), ['index.html'], name);
      assert.equal(readFileSync(join(folder, 'out', 'index.html'), 'utf8'), 'keep', name);
    });
  }
});

// 근거: 이슈 #73. 대소문자만 다른 `INDEX.html`은 대소문자를 가리지 않는 파일 시스템에서 `index.html`과 같은 파일이다
test('main_gallery_treats_reserved_names_case_insensitively', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'INDEX.dap'), NAMED_BOX('INDEX'));

    const result = run(['gallery', '.', '--out', 'out'], folder);
    const srcs = iframeSrcs(readFileSync(join(folder, 'out', 'index.html'), 'utf8'));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(srcs.length, 1);
    assert.notEqual(srcs[0].toLowerCase(), 'index.html');
    assert.ok(readFileSync(join(folder, 'out', srcs[0]), 'utf8').includes('INDEX figure'));
  });
});

// 근거: 이슈 완료 조건 "옛 명령 mutoscope가 같은 그림을 낸다", D08 별칭. 옛 이름으로 실행하면 stderr에만 폐기 안내를 쓴다
test('main_old_command_name_renders_the_same_svg_and_only_stderr_gets_the_deprecation_notice', () => {
  withFolder((folder) => {
    const link = join(folder, 'mutoscope');
    symlinkSync(CLI, link);
    writeFileSync(join(folder, 'a.dap'), FLOW);

    const current = spawnSync(process.execPath, [CLI, 'render', 'a.dap', '--out', 'new'], { cwd: folder, encoding: 'utf8' });
    const old = spawnSync(process.execPath, [link, 'render', 'a.dap', '--out', 'old'], { cwd: folder, encoding: 'utf8' });
    const json = spawnSync(process.execPath, [link, 'check', 'a.dap', '--json'], { cwd: folder, encoding: 'utf8' });

    assert.equal(current.stderr, '');
    assert.equal(old.status, 0, old.stderr);
    assert.match(old.stderr, /deprecated: the "mutoscope" command is now "daphnis"/);
    assert.equal(readFileSync(join(folder, 'old/a.svg'), 'utf8'), readFileSync(join(folder, 'new/a.svg'), 'utf8'));
    assert.equal(json.stdout, '');
    assert.match(json.stderr, /deprecated/);
  });
});

// 근거: 이슈 결정 "`.muto`는 계속 읽고 폐기 안내만 낸다". 같은 그림이고 종료 코드는 그대로, 안내는 새 확장자를 알린다
test('cli_old_extension_is_read_with_only_a_deprecation_notice', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'a.dap'), FLOW);
    writeFileSync(join(folder, 'b.muto'), FLOW);

    const result = run(['render', 'b.muto'], folder);
    run(['render', 'a.dap'], folder);
    const gallery = run(['gallery', '.', '--out', 'out'], folder);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /^b\.muto: deprecated: the \.muto extension is now \.dap\. Rename the file to b\.dap$/m);
    assert.ok(readFileSync(join(folder, 'b.svg'), 'utf8').replace('<title>b</title>', '<title>a</title>') === readFileSync(join(folder, 'a.svg'), 'utf8'), '같은 원본이면 이름 말고는 같은 SVG');
    assert.equal(gallery.status, 0, gallery.stderr);
    assert.match(readFileSync(join(folder, 'out/index.html'), 'utf8'), /<code class="name">b\.muto<\/code>/);
  });
});

const CHECK_TIMEOUT_MS = 5000;
const nestedGroups = (inner, outer = 'g') => `flow right\ngroup ${outer} "G" {\ngroup ${inner} "H" {\nbox a "A"\n}\n}\nbox b "B"\na -> b\n`;

// 근거: 이슈 #71 "중첩 그룹에 같은 이름을 쓰면 파서가 멈춘다". 제한 시간 안에 syntax 오류와 중복 선언 줄을 돌려주고, 이름만 바꾼 대조군은 통과한다
test('check_nested_group_with_the_same_name_returns_a_syntax_error_with_the_declaration_line_in_time', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'duplicate.dap'), nestedGroups('g'));
    writeFileSync(join(folder, 'control.dap'), nestedGroups('h'));

    const duplicate = spawnSync(process.execPath, [CLI, 'check', 'duplicate.dap', '--json'], { cwd: folder, encoding: 'utf8', timeout: CHECK_TIMEOUT_MS });
    const control = spawnSync(process.execPath, [CLI, 'check', 'control.dap', '--json'], { cwd: folder, encoding: 'utf8', timeout: CHECK_TIMEOUT_MS });

    assert.equal(duplicate.error, undefined, '제한 시간 안에 끝난다');
    assert.equal(duplicate.status, 1);
    const found = duplicate.stdout.trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(found.length, 1, '중복 하나만 알린다');
    assert.equal(found[0].code, 'syntax');
    assert.equal(found[0].line, 3);
    assert.match(found[0].message, /the name "g" is already used \(line 2\)/);
    assert.equal(control.status, 0, control.stderr);
  });
});

// 근거: 이슈 #71 "부모 관계에 순환이 생기는 경로". 바깥 그룹 이름을 더 깊은 곳에서 다시 선언해도, 같은 이름의 형제나 도형을 써도 유한 시간에 중복 오류가 된다
test('check_duplicate_names_end_in_a_duplicate_error_for_every_nesting_shape', () => {
  const cases = [
    { name: 'two_levels_down', source: 'flow right\ngroup g "G" {\ngroup h "H" {\ngroup g "I" {\nbox a "A"\n}\n}\n}\nbox b "B"\na -> b\n', line: 4, first: 2 },
    { name: 'siblings', source: 'flow right\ngroup g "G" {\nbox a "A"\n}\ngroup g "H" {\nbox c "C"\n}\na -> c\n', line: 5, first: 2 },
    { name: 'node_inside_group_of_same_name', source: 'flow right\ngroup g "G" {\nbox g "A"\n}\nbox b "B"\ng -> b\n', line: 2, first: 3 },
  ];
  withFolder((folder) => {
    for (const { name, source, line, first } of cases) {
      writeFileSync(join(folder, `${name}.dap`), source);

      const result = spawnSync(process.execPath, [CLI, 'check', `${name}.dap`, '--json'], { cwd: folder, encoding: 'utf8', timeout: CHECK_TIMEOUT_MS });

      assert.equal(result.error, undefined, `${name}: 제한 시간 안에 끝난다`);
      assert.equal(result.status, 1, name);
      const messages = result.stdout.trim().split('\n').map((entry) => JSON.parse(entry));
      assert.deepEqual(messages.map((m) => [m.line, m.code]), [[line, 'syntax']], name);
      assert.match(messages[0].message, new RegExp(`already used \\(line ${first}\\)`), name);
    }
  });
});

// 근거: 이슈 #71 "순환 방문도 방어한다". 부모가 순환인 모형이 검증에 들어와도 멈추지 않고 순환을 알리는 예외로 끝난다
test('validateFigure_stops_with_a_cycle_error_instead_of_looping_on_a_parent_cycle', () => {
  const script = `
    import { validateFigure } from ${JSON.stringify(new URL('../src/source/validate.js', import.meta.url).href)};
    import { createProblems } from ${JSON.stringify(new URL('../src/source/problems.js', import.meta.url).href)};
    const figure = { kind: 'flow', nodes: [{ id: 'a', parent: 'g', line: 4 }, { id: 'b', line: 7 }], groups: [{ id: 'g', parent: 'g', line: 2 }], edges: [{ from: 'a', to: 'b', line: 8 }], values: [], steps: [], rejectedNames: new Set(), chart: { series: [] } };
    try { validateFigure(figure, createProblems()); console.log('returned'); } catch (error) { console.log(error.message); }
  `;

  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: CHECK_TIMEOUT_MS });

  assert.equal(result.error, undefined, '제한 시간 안에 끝난다');
  assert.match(result.stdout, /parent cycle/);
});

// 근거: 이슈 #69 "갤러리 파일명이 URL 스킴으로 해석된다". 목록과 문서 미리보기가 파일명을 href와 src에 경로 조각 인코딩과 `./` 접두로만 쓴다
test('gallery_links_a_scheme_like_file_name_only_as_an_encoded_explicit_relative_path', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'javascript:parent.__daphnisAudit=1;void(0).dap'), FLOW);
    writeFileSync(join(folder, 'javascript:parent.__daphnisAudit=2;void(0).muto'), FLOW);

    const result = run(['gallery', '.', '--out', 'out'], folder);

    assert.equal(result.status, 0, result.stderr);
    for (const page of ['index.html', 'document.html']) {
      const html = readFileSync(join(folder, 'out', page), 'utf8');
      const links = [...html.matchAll(/\b(?:href|src)="([^"]*)"/g)].map((m) => m[1]).filter((url) => !url.startsWith('data:') && !['index.html', 'document.html'].includes(url));
      assert.ok(links.length > 0, page);
      assert.deepEqual(links.filter((url) => !url.startsWith('./')), [], `${page}: 모든 파일 링크는 ./로 시작한다`);
      assert.ok(!/(?:href|src)="javascript/i.test(html), `${page}: 스킴으로 시작하는 링크가 없다`);
      assert.ok(html.includes('./javascript%3Aparent.__daphnisAudit%3D1%3Bvoid%280%29') && html.includes('./javascript%3Aparent.__daphnisAudit%3D2%3Bvoid%280%29'), `${page}: 경로 조각은 퍼센트 인코딩이다`);
    }
  });
});

// 근거: 설계 charts.md "머리와 선언 줄": 잘못된 차트 헤더는 지원하는 종류를 알려 주는 1번 줄 구문 오류다
test('check_chart_header_without_or_with_a_wrong_type_is_a_line_1_syntax_error_not_an_internal_one', () => {
  withFolder((folder) => {
    for (const [source, found] of [['chart\n', ''], ['chart bogus\n', 'bogus'], ['chart bogus\nrow "A" s=1\n', 'bogus']]) {
      writeFileSync(join(folder, 'h.dap'), source);

      const result = run(['check', 'h.dap', '--json'], folder);
      const diagnostics = result.stdout.trim().split('\n').map((line) => JSON.parse(line));

      assert.equal(result.status, 1, source);
      assert.deepEqual(diagnostics.map((d) => [d.code, d.line]), [['syntax', 1]], `${source}: ${result.stdout}`);
      assert.match(diagnostics[0].message, /bar, .*heatmap/, source);
      if (found) assert.ok(diagnostics[0].message.includes(`"${found}"`), diagnostics[0].message);
    }
  });
});

// 근거: 계약 figure-syntax.md 호환 규칙: 확장자 폐기 안내는 옛 확장자 입력 파일마다 한 번이다
test('cli_migrate_reports_the_old_extension_once_per_input_file_and_none_for_the_new_extension', () => {
  withFolder((folder) => {
    for (const name of ['legacy.muto', 'other.muto', 'current.dap']) writeFileSync(join(folder, name), FLOW);
    const countOf = (stream, name) => stream.split('\n').filter((line) => line.includes('deprecated-extension') && line.includes(name)).length;

    const one = run(['migrate', 'legacy.muto', '--json'], folder);
    const many = run(['migrate', 'legacy.muto', 'other.muto', 'current.dap', '--json'], folder);
    const text = run(['migrate', 'legacy.muto'], folder);

    assert.equal(one.status, 0, one.stderr);
    assert.equal(countOf(one.stderr + one.stdout, 'legacy.muto'), 1, one.stderr);
    assert.deepEqual([countOf(many.stderr + many.stdout, 'legacy.muto'), countOf(many.stderr + many.stdout, 'other.muto'), countOf(many.stderr + many.stdout, 'current.dap')], [1, 1, 0]);
    assert.equal(text.stderr.split('\n').filter((line) => line.includes('the .muto extension')).length, 1, text.stderr);
    assert.equal(text.stdout, '');
  });
});
