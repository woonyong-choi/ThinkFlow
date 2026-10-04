// README가 보이는 `daphnis md` 예가 실제 출력과 같은지, 영어 README와 한국어 README가 같은 예를 쓰는지.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runCli, withFolder } from './helpers.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (name) => readFileSync(join(ROOT, name), 'utf8');
const EXAMPLE_BLOCK = /````text\n(```dap name=request\n[\s\S]*?```)\n````/;
const IMAGE_LINE = /`(!\[request\]\(guide-request\.svg\)<!-- dap -->)`/;

// 근거: 이슈 #63 "README md 대체 글 예". README의 dap 블록을 그대로 돌리면 README가 적은 이미지 줄이 나온다
test('readme_md_example_produces_the_image_line_it_shows', () => {
  const [block] = EXAMPLE_BLOCK.exec(read('README.md').replace(/^ {3}/gm, '')).slice(1);
  const shown = IMAGE_LINE.exec(read('README.md'))[1];

  withFolder((folder) => {
    writeFileSync(join(folder, 'guide.md'), `${block}\n`);
    const run = runCli(['md', 'guide.md'], folder);

    assert.equal(run.status, 0, run.stderr);
    assert.ok(readFileSync(join(folder, 'guide.md'), 'utf8').includes(shown), shown);
    assert.ok(existsSync(join(folder, 'guide-request.svg')));
  });
});

// 근거: 이슈 #63 "README 영·한 일대일". 두 README가 같은 이미지 줄을 보인다
test('readme_english_and_korean_show_the_same_md_image_line', () => {
  assert.equal(IMAGE_LINE.exec(read('README.ko.md'))?.[1], IMAGE_LINE.exec(read('README.md'))[1]);
});

// 근거: 이슈 #63 "--out-dir 설명". --out-dir은 SVG를 옮기지 않고 새 폴더에 쓴다. 문서 옆의 옛 SVG는 남는다
test('md_out_dir_writes_into_the_folder_and_leaves_the_svg_next_to_the_document', () => {
  withFolder((folder) => {
    writeFileSync(join(folder, 'guide.md'), '```dap name=request\nflow right\nbox a "A"\nbox b "B"\na -> b\n```\n');
    assert.equal(runCli(['md', 'guide.md'], folder).status, 0);
    assert.equal(runCli(['md', 'guide.md', '--out-dir', 'images'], folder).status, 0);

    assert.ok(existsSync(join(folder, 'images/guide-request.svg')));
    assert.ok(existsSync(join(folder, 'guide-request.svg')), 'SVG next to the document stays');
    assert.ok(readFileSync(join(folder, 'guide.md'), 'utf8').includes('(images/guide-request.svg)'));
  });
});
