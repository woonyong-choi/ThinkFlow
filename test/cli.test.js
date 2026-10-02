import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

// cost: time O(f), heap O(1), stack O(1), io 2 + f
// vars: f = 폴더 안 파일 수(지울 때)
// basis: estimate
function withFolder(run) {
  const folder = mkdtempSync(join(tmpdir(), 'mutoscope-cli-'));
  try {
    return run(folder);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

test('main_run_through_symlink_prints_usage', () => {
  withFolder((folder) => {
    const link = join(folder, 'mutoscope');
    symlinkSync(CLI, link);

    const result = spawnSync(process.execPath, [link], { encoding: 'utf8' });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /usage/);
  });
});

test('main_render_writes_svg_and_html', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'a.muto'), 'flow right\nbox a "A"\nbox b "B"\na -> b\nstep "s"\n  a -> b "x"\n');

    const result = run(['render', 'a.muto', '--html'], folder);

    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(folder, 'a.svg')) && existsSync(join(folder, 'a.html')));
  });
});

test('main_render_draws_rounded_backdrop_without_dot_grid', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'a.muto'), 'flow right\nbox a "A"\nbox b "B"\na -> b\nstep "s"\n  a -> b "x"\n');

    const result = run(['render', 'a.muto', '--html'], folder);

    assert.equal(result.status, 0, result.stderr);
    for (const file of ['a.svg', 'a.html']) assert.ok(!readFileSync(join(folder, file), 'utf8').includes('fl-dots'));
    assert.match(readFileSync(join(folder, 'a.svg'), 'utf8'), /<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" rx="\d+" fill="var\(--color-bg\)" stroke="var\(--color-plate-border\)"/);
  });
});

test('main_check_error_writes_no_file_and_reports_line', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'bad.muto'), 'flow right\nbox a "A"\na -> zz\n');

    const result = run(['render', 'bad.muto'], folder);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /^bad\.muto:3: unknown node "zz"/m);
    assert.ok(!existsSync(join(folder, 'bad.svg')));
  });
});

test('main_json_prints_one_message_per_line', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'bad.muto'), 'flow right\nbox Step "S"\nbox a "A"\na -> zz\n');

    const lines = run(['check', 'bad.muto', '--json'], folder).stdout.trim().split('\n');

    assert.equal(lines.length, 2);
    for (const line of lines) assert.deepEqual(Object.keys(JSON.parse(line)), ['file', 'line', 'lines', 'check', 'level', 'message', 'severity', 'code', 'column']);
    assert.deepEqual(lines.map((line) => JSON.parse(line).code), ['syntax', 'syntax']);
  });
});

test('main_gallery_writes_index_with_each_figure', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'a.muto'), 'flow right\nbox a "A"\n');
    writeFileSync(join(folder, 'b.muto'), 'chart bar\nseries s "S"\nrow "r" s=1\n');

    const result = run(['gallery', '.', '--out', 'out'], folder);

    assert.equal(result.status, 0, result.stderr);
    const index = readFileSync(join(folder, 'out', 'index.html'), 'utf8');
    assert.match(index, /src="a\.html"/);
    assert.match(index, /src="b\.html"/);
  });
});

test('main_gallery_head_shows_file_name_and_kind_and_the_title_only_for_figures_without_a_drawn_title', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'a.muto'), 'flow right\ntitle "흐름 제목"\nbox a "A"\n');
    writeFileSync(join(folder, 'b.muto'), 'chart bar\ntitle "차트 제목"\nseries s "S"\nrow "r" s=1\n');

    assert.equal(run(['gallery', '.', '--out', 'out'], folder).status, 0);

    for (const page of ['index', 'document']) {
      const html = readFileSync(join(folder, 'out', `${page}.html`), 'utf8');
      assert.match(html, /<h2><span class="title">흐름 제목<\/span><code class="name">a\.muto<\/code><span class="kind">flow<\/span><\/h2>/);
      assert.match(html, /<h2><code class="name">b\.muto<\/code><span class="kind">bar<\/span><\/h2>/);
    }
  });
});

test('main_gallery_has_theme_buttons_and_applies_color_scheme_to_root', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'a.muto'), 'flow right\nbox a "A"\n');

    assert.equal(run(['gallery', '.', '--out', 'out'], folder).status, 0);

    const index = readFileSync(join(folder, 'out', 'index.html'), 'utf8');
    for (const mode of ['system', 'light', 'dark']) assert.match(index, new RegExp(`data-mode="${mode}"`));
    for (const label of ['시스템', '라이트', '다크']) assert.match(index, new RegExp(`>${label}</button>`));
    assert.match(index, /root\.style\.colorScheme = mode/);
    assert.match(index, /localStorage\.setItem\(THEME_KEY/);
    assert.match(index, /:root \{\s*color-scheme: light dark;/);
  });
});

test('main_json_gives_severity_check_code_and_position', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'warn.muto'), 'flow right\nbox a "A"\nbox b "B"\na -> b "보냄" quiet\nb -> a\nstep "s"\n  b -> a\n');

    const [message] = run(['check', 'warn.muto', '--json'], folder).stdout.trim().split('\n').map((l) => JSON.parse(l));

    assert.deepEqual([message.code, message.severity, message.line, message.column], ['check-11', 'warning', 4, 1]);
  });
});

test('main_check_reports_syntax_and_glyph_errors_together', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'bad.muto'), 'flow right\nbox a "A 😀"\nbox b "B"\na -> cdex\n');

    const { stderr } = run(['check', 'bad.muto'], folder);

    assert.match(stderr, /bad\.muto:2: the font has no glyph/);
    assert.match(stderr, /bad\.muto:4: unknown node "cdex"/);
  });
});

test('main_missing_file_reports_one_line_and_checks_the_rest', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'ok.muto'), 'flow right\naspect 1.6\nbox a "A"\nbox b "B"\na -> b\n');

    const { stderr, status } = run(['check', 'nope.muto', 'ok.muto'], folder);

    assert.equal(status, 1);
    assert.equal(stderr.trim(), 'nope.muto: cannot read the file: ENOENT');
  });
});

test('main_gallery_writes_document_preview_with_img_per_figure_and_link_from_index', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'a.muto'), 'flow right\nbox a "A"\n');
    writeFileSync(join(folder, 'b.muto'), 'chart bar\nseries s "S"\nrow "r" s=1\n');

    assert.equal(run(['gallery', '.', '--out', 'out'], folder).status, 0);

    const doc = readFileSync(join(folder, 'out', 'document.html'), 'utf8');
    assert.match(doc, /<img src="a\.svg"/);
    assert.match(doc, /<img src="b\.svg"/);
    for (const mode of ['system', 'light', 'dark']) assert.match(doc, new RegExp(`data-mode="${mode}"`));
    assert.match(readFileSync(join(folder, 'out', 'index.html'), 'utf8'), /href="document\.html"/);
  });
});

test('main_html_player_has_no_figure_plate_and_card_parts_share_bg_but_svg_keeps_plate', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'b.muto'), 'chart bar\nseries s "S"\nrow "r" s=1\n');

    assert.equal(run(['render', 'b.muto', '--html'], folder).status, 0);

    const html = readFileSync(join(folder, 'b.html'), 'utf8');
    const svg = readFileSync(join(folder, 'b.svg'), 'utf8');
    assert.ok(!html.includes('<rect width="100%" height="100%"'));
    for (const selector of ['\\.fl-figure', '\\.fl-canvas', '\\.fl-foot', 'html\\.embedded body']) assert.match(html, new RegExp(`${selector} \\{[^}]*background: var\\(--color-bg\\);`));
    assert.match(svg, /<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" rx="\d+" fill="var\(--color-bg\)" stroke="var\(--color-plate-border\)" stroke-width="1"\/>/);
  });
});

test('main_gallery_document_preview_centers_each_figure_paragraph', () => {
  const doc = readFileSync(new URL('../src/styles/document.css', import.meta.url), 'utf8');

  assert.match(doc, /\.figure \{\s*text-align: center;/);
});
