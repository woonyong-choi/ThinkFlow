// 아이콘: 기본 세트 표와 파일, 사용자 세트 읽기와 안전한 SVG만 남기기(docs/design/layout.md 아이콘).
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { ICON_NAMES } from '../src/icons/index.js';
import { sanitizeIcon } from '../src/icons/sanitize.js';
import { withFolder } from './helpers.js';

const ICONS = new URL('../src/icons/', import.meta.url);

// 근거: 설계 layout.md 아이콘 "개념 이름과 브랜드 이름은 names.json 표 하나에서 찾고, 파일은 색을 currentColor로만 바꾼 것이다. 로고(logo--*)와 공급자 서비스 아이콘은 넣지 않는다"
test('icons_bundled_set_files_match_the_name_table_and_carry_no_logos_or_fixed_colors', () => {
  for (const file of Object.values(ICON_NAMES)) {
    const path = new URL(`${file}.svg`, ICONS);

    assert.ok(existsSync(path), file);
    assert.ok(/^(carbon|simple-icons)\//.test(file) && !file.includes('logo--'), file);
    assert.match(readFileSync(path, 'utf8'), /fill="currentColor"/);
    assert.doesNotMatch(readFileSync(path, 'utf8'), /fill="#|stroke="#/);
  }
  assert.ok(readFileSync(new URL('../../NOTICE', ICONS), 'utf8').includes('color only'));
});

// 근거: 설계 layout.md 아이콘 "NOTICE에 상표 문구가 있고, 넣은 브랜드 파일 수가 NOTICE와 맞는다"
test('icons_notice_states_the_trademark_notice_and_counts_every_bundled_file', () => {
  const notice = readFileSync(new URL('../../NOTICE', ICONS), 'utf8');
  const count = (dir) => Object.values(ICON_NAMES).filter((file) => file.startsWith(`${dir}/`)).length;

  assert.match(notice, /trademarks of their respective owners/);
  assert.ok(notice.includes(`${count('simple-icons')} icons`) && notice.includes(`${count('carbon')} icons`));
});

// 근거: 설계 layout.md 아이콘 "사용자 세트의 SVG는 허용한 요소만 남기고 색은 currentColor다. 코드와 외부 자원은 오류다"
test('sanitizeIcon_keeps_shapes_recolors_them_and_rejects_scripts_and_external_references', () => {
  const ok = sanitizeIcon('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>t</title><rect x="1" y="1" width="4" height="4" fill="#123456" id="x"/></svg>');

  assert.deepEqual(ok.viewBox, [0, 0, 24, 24]);
  assert.ok(ok.body.includes('fill="currentColor"') && !ok.body.includes('#123456'));
  for (const bad of ['<script>alert(1)</script>', '<image href="http://x/y.png"/>', '<use href="#a"/>', '<foreignObject/>']) {
    assert.throws(() => sanitizeIcon(`<svg viewBox="0 0 1 1">${bad}</svg>`), /not supported|outside tags/, bad);
  }
  assert.throws(() => sanitizeIcon('<svg viewBox="0 0 1 1"><path d="M0 0" onload="x()"/></svg>'), /not supported/);
});

// 근거: 설계 figure-syntax.md 아이콘 절 "icons 이름 폴더로 등록한 세트는 icon=세트:이름으로 쓰고, 파일이 없으면 그 줄의 오류다"
test('buildFigure_user_icon_set_loads_the_file_and_reports_a_missing_one_at_its_line', async () => {
  await withFolder(async (folder) => {
    mkdirSync(join(folder, 'set'));
    writeFileSync(join(folder, 'set', 'lb.svg'), '<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg>');
    const source = (name) => `flow right\nicons mine "set"\nbox a "A" icon=mine:${name} badge="LB"`;
    const { scene } = await buildFigure(source('lb'), { baseDir: folder, strict: true });

    assert.ok(scene.items[0].decor.items.some((i) => i.kind === 'icon'));
    await assert.rejects(buildFigure(source('none'), { baseDir: folder }), (e) => e.problems[0].line === 3 && /the file does not exist/.test(e.problems[0].message));
  });
});
