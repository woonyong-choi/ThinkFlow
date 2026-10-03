// CLI: 명령 결과 파일, 종료 코드, 오류 출력, --json 필드, gallery(docs/design/figure-check.md, playback.md). 호환 필드와 종료 코드는 compat.test.js.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
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

// 근거: 계약 package.json bin "mutoscope": 명령은 심볼릭 링크로 실행되어도 사용법을 낸다
test('main_run_through_symlink_prints_usage', () => {
  withFolder((folder) => {
    const link = join(folder, 'mutoscope');
    symlinkSync(CLI, link);

    const result = spawnSync(process.execPath, [link], { encoding: 'utf8' });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /usage/);
  });
});

// 근거: 계약 playback.md 결과 "움직이는 SVG {이름}.svg 하나, --html이면 재생기 HTML"
test('main_render_writes_svg_and_html', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'a.muto'), FLOW);

    const result = run(['render', 'a.muto', '--html'], folder);

    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(folder, 'a.svg')) && existsSync(join(folder, 'a.html')));
  });
});

// 근거: 설계 figure-check.md 요구사항 "오류가 있으면 그림 파일을 쓰지 않는다", figure-syntax.md "오류를 모두 모아 알리고 파일을 쓰지 않는다"
test('main_render_with_an_error_writes_no_file_and_reports_the_line', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'bad.muto'), 'flow right\nbox a "A"\na -> zz\n');

    const result = run(['render', 'bad.muto'], folder);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /^bad\.muto:3: unknown node "zz"/m);
    assert.ok(!existsSync(join(folder, 'bad.svg')));
  });
});

// 근거: 감사 C1 "gallery --strict가 strict를 버림", C2 "빈 입력을 그림 0개인 정상 gallery로 만듦", C3 "오류 파일만 건너뛰고 나머지를 씀"(AGENTS "오류가 있으면 결과 파일을 쓰지 않음"), 옵션은 gallery가 받는 것만(figure-check.md 명령)
test('main_gallery_fails_without_writing_any_file_when_the_input_must_not_pass', () => {
  const cases = [
    { name: 'strict_warning', files: { 'q.muto': QUIET }, args: ['--strict'], status: 1, stderr: /q\.muto:4: .*quiet edge/ },
    { name: 'error_next_to_a_good_file', files: { 'good.muto': FLOW, 'bad.muto': BAD }, args: [], status: 1, stderr: /bad\.muto:3: unknown node "zz"/ },
    { name: 'no_muto_files', files: { 'note.txt': 'x' }, args: [], status: 1, stderr: /no \.muto files/ },
    { name: 'static_is_not_a_gallery_option', files: { 'good.muto': FLOW }, args: ['--static'], status: 2, stderr: /--static is not for gallery/ },
    { name: 'json_is_not_a_gallery_option', files: { 'good.muto': FLOW }, args: ['--json'], status: 2, stderr: /--json is not for gallery/ },
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
    writeFileSync(join(folder, 'q.muto'), QUIET);

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
    writeFileSync(join(folder, 'bad.muto'), 'flow right\nbox Step "S"\nbox a "A"\na -> zz\n');

    const lines = run(['check', 'bad.muto', '--json'], folder).stdout.trim().split('\n');

    assert.equal(lines.length, 2);
    for (const line of lines) assert.deepEqual(Object.keys(JSON.parse(line)), ['file', 'line', 'lines', 'check', 'level', 'message', 'severity', 'code', 'column']);
    assert.deepEqual(lines.map((line) => JSON.parse(line).code), ['syntax', 'syntax']);
  });
});

// 근거: 버그 68ec356 "덧붙는 오류를 줄이면서도 문법 오류와 글꼴 없는 글자 오류를 함께 알린다", 설계 figure-syntax.md "오류를 모두 모아 알린다"
test('main_check_reports_syntax_and_glyph_errors_together', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'bad.muto'), 'flow right\nbox a "A 😀"\nbox b "B"\na -> cdex\n');

    const { stderr } = run(['check', 'bad.muto'], folder);

    assert.match(stderr, /bad\.muto:2: the font has no glyph/);
    assert.match(stderr, /bad\.muto:4: unknown node "cdex"/);
  });
});

// 근거: 버그 68ec356 "읽을 수 없는 파일은 한 줄 메시지로 알리고 나머지 파일은 계속 검사한다"
test('main_missing_file_reports_one_line_and_checks_the_rest', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'ok.muto'), 'flow right\naspect 1.6\nbox a "A"\nbox b "B"\na -> b\n');

    const { stderr, status } = run(['check', 'nope.muto', 'ok.muto'], folder);

    assert.equal(status, 1);
    assert.equal(stderr.trim(), 'nope.muto: cannot read the file: ENOENT');
  });
});

// 근거: 설계 playback.md 요구사항 "재생기 안에는 그림 바탕 판이 없고, SVG 파일에만 있다"(점 격자 없는 둥근 판)
test('main_render_svg_keeps_the_rounded_plate_and_the_html_player_has_none', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'b.muto'), BAR);

    const result = run(['render', 'b.muto', '--html'], folder);
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
    writeFileSync(join(folder, 'a.muto'), 'flow right\ntitle "흐름 제목"\nbox a "A"\n');
    writeFileSync(join(folder, 'b.muto'), 'chart bar\ntitle "차트 제목"\nseries s "S"\nrow "r" s=1\n');

    const result = run(['gallery', '.', '--out', 'out'], folder);
    const page = (name) => readFileSync(join(folder, 'out', `${name}.html`), 'utf8');

    assert.equal(result.status, 0, result.stderr);
    assert.match(page('index'), /src="a\.html"/);
    assert.match(page('index'), /src="b\.html"/);
    assert.match(page('index'), /href="document\.html"/);
    assert.match(page('document'), /<img src="a\.svg"/);
    assert.match(page('document'), /<img src="b\.svg"/);
    for (const name of ['index', 'document']) {
      assert.match(page(name), /<h2><span class="title">흐름 제목<\/span><code class="name">a\.muto<\/code><span class="kind">flow<\/span><\/h2>/);
      assert.match(page(name), /<h2><code class="name">b\.muto<\/code><span class="kind">bar<\/span><\/h2>/);
      for (const mode of ['system', 'light', 'dark']) assert.match(page(name), new RegExp(`data-mode="${mode}"`));
    }
  });
});
