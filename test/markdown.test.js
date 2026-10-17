// torso md: 문서의 ```torso 블록을 SVG와 이미지 줄로 반영한다. 소유 표시, 낡은 파일 정리, 접기, 잠금, 쓰기 실패를 파일과 출력으로만 본다.
// 시험 이름 첫 낱말(M1~M13)이 요구사항 번호이고, 번호와 계약의 대응은 docs/design/expression-coverage.md의 시험 번호 표에 있다.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, readdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { findBlocks } from '../src/md.js';
import { cli, torso, read, snapshot, workspace } from './support.js';

const FENCE = '```';
const block = (name, body = 'title "Flow"\nbox a "A"\n') => `${FENCE}torso${name ? ` name=${name}` : ''}\n${torso(body)}${FENCE}\n`;
const doc = (...blocks) => `# Doc\n\nintro\n\n${blocks.join('\ntext between\n\n')}\nafter\n`;
const md = (dir, args, options) => cli(['md', ...args], { cwd: dir, ...options });
const svgs = (dir) => readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();

test('M1 a named block becomes {doc}-{name}.svg and a marked image line right below it, with the title as the alt text', (t) => {
  const dir = workspace(t, { 'doc.md': doc(block('flow')) });
  const run = md(dir, ['doc.md']);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(svgs(dir), ['doc-flow.svg']);
  const text = read(dir, 'doc.md');
  assert.match(text, /```\n\n!\[Flow\]\(doc-flow\.svg\)<!-- torso -->\n/);
  assert.equal(run.stdout.trim().split('\n').length, 2, 'the svg and the document are reported');
  assert.match(read(dir, 'doc-flow.svg'), /^<svg /);
});

test('M1 the SVG carries its owner as "torso md v2 {document path}" on its second line', (t) => {
  const dir = workspace(t, { 'doc.md': doc(block('flow')) });
  md(dir, ['doc.md']);
  assert.equal(read(dir, 'doc-flow.svg').split('\n')[1], '<!-- torso md v2 doc.md -->');
});

test('M2 running again changes nothing and prints nothing; --check agrees and an edit makes it fail without writing', (t) => {
  const dir = workspace(t, { 'doc.md': doc(block('flow')) });
  md(dir, ['doc.md']);
  const synced = snapshot(dir);
  const again = md(dir, ['doc.md']);
  assert.equal(again.status, 0);
  assert.equal(again.stdout, '');
  assert.deepEqual(snapshot(dir), synced);
  assert.equal(md(dir, ['doc.md', '--check']).status, 0);
  writeFileSync(join(dir, 'doc.md'), read(dir, 'doc.md').replace('box a "A"', 'box a "A2"'));
  const edited = snapshot(dir);
  const check = md(dir, ['doc.md', '--check']);
  assert.equal(check.status, 1);
  assert.match(check.stderr, /is out of date\. Run torso md to update it/);
  assert.deepEqual(snapshot(dir), edited, '--check writes nothing');
});

test('M3 renaming a block moves its figure: the new file appears, the old one this document owned is removed, the image line follows', (t) => {
  const dir = workspace(t, { 'doc.md': doc(block('flow')) });
  md(dir, ['doc.md']);
  writeFileSync(join(dir, 'doc.md'), read(dir, 'doc.md').replace('name=flow', 'name=path'));
  const run = md(dir, ['doc.md']);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(svgs(dir), ['doc-path.svg']);
  assert.match(run.stdout, /removed .*doc-flow\.svg/);
  assert.match(read(dir, 'doc.md'), /\]\(doc-path\.svg\)<!-- torso -->/);
  assert.doesNotMatch(read(dir, 'doc.md'), /doc-flow/);
});

test('M3 blocks without a name are numbered among themselves, and a named block keeps its file when unnamed ones come and go', (t) => {
  const dir = workspace(t, { 'doc.md': doc(block(''), block('keep'), block('')) });
  md(dir, ['doc.md']);
  assert.deepEqual(svgs(dir), ['doc-1.svg', 'doc-2.svg', 'doc-keep.svg']);
  const keep = read(dir, 'doc-keep.svg');
  writeFileSync(join(dir, 'doc.md'), doc(block('keep')));
  md(dir, ['doc.md']);
  assert.deepEqual(svgs(dir), ['doc-keep.svg']);
  assert.equal(read(dir, 'doc-keep.svg'), keep);
});

test('M4 files the tool does not own are never taken, overwritten or removed: no mark, another document, an old-style or foreign mark', (t) => {
  const user = '<svg xmlns="http://www.w3.org/2000/svg"/>\n';
  const marked = (mark) => `<svg xmlns="http://www.w3.org/2000/svg">\n<!-- ${mark} -->\n</svg>\n`;
  const cases = [['no mark', user], ['another document', marked('torso md v2 other.md')], ['an unversioned mark', marked('torso md doc.md')], ['a foreign mark', marked('mutoscope md v2 doc.md')]];
  for (const [what, content] of cases) {
    const dir = workspace(t, { 'doc.md': doc(block('flow')), 'doc-flow.svg': content });
    const before = snapshot(dir);
    const run = md(dir, ['doc.md']);
    assert.equal(run.status, 1, what);
    assert.match(run.stderr, /^doc\.md:\d+: /m, what);
    assert.deepEqual(snapshot(dir), before, `${what}: nothing was changed`);
    assert.equal(md(dir, ['doc.md', '--check']).status, 1, `${what}: --check reports the same conflict`);
  }
  // 소유하지 않은 낡은 이름은 정리하지 않는다
  const dir = workspace(t, { 'doc.md': doc(block('flow')), 'doc-old.svg': user, 'doc-older.svg': marked('torso md doc.md') });
  assert.equal(md(dir, ['doc.md']).status, 0);
  assert.deepEqual(svgs(dir), ['doc-flow.svg', 'doc-old.svg', 'doc-older.svg']);
});

test('M4 only marked image lines are the tool\'s: an unmarked image or one with another mark stays, and an orphaned marked line is removed', (t) => {
  const text = doc(block('flow')).replace('after', '![mine](mine.png)\n\n![theirs](theirs.svg)<!-- other -->\n\n![gone](old.svg)<!-- torso -->\n\nafter');
  const dir = workspace(t, { 'doc.md': text });
  assert.equal(md(dir, ['doc.md']).status, 0);
  const result = read(dir, 'doc.md');
  assert.match(result, /!\[mine\]\(mine\.png\)\n/);
  assert.match(result, /!\[theirs\]\(theirs\.svg\)<!-- other -->\n/);
  assert.doesNotMatch(result, /old\.svg/);
});

test('M4 other fences are not blocks: a muto fence, a torso line inside a text fence, and a block with a bad name option', (t) => {
  const foreign = `${FENCE}muto name=x\ntorso\nbox a "A"\n${FENCE}\n\n${'````'}text\n${FENCE}torso name=inside\ntorso\nbox a "A"\n${FENCE}\n${'````'}\n`;
  const dir = workspace(t, { 'doc.md': foreign });
  const before = snapshot(dir);
  const run = md(dir, ['doc.md']);
  assert.equal(run.status, 0);
  assert.deepEqual(snapshot(dir), before);
  const bad = workspace(t, { 'doc.md': `${FENCE}torso name=Bad_Name\ntorso\nbox a "A"\n${FENCE}\n` });
  const badRun = md(bad, ['doc.md']);
  assert.equal(badRun.status, 1);
  assert.deepEqual(svgs(bad), []);
});

test('M4 text the document shows literally is never read or rewritten: indented code, HTML comments, and a fence that a four-space line cannot close', (t) => {
  const source = torso('box a "A"');
  const literal = `${[
    '# Doc',
    'Indented code shows the tool\'s own lines:',
    `    ![Flow](doc-flow.svg)<!-- torso -->\n\n    ${FENCE}torso name=indented\n    ${source.replaceAll('\n', '\n    ').trimEnd()}\n    ${FENCE}`,
    '<!--\n![Old](doc-old.svg)<!-- torso -->',
    `<!--\n${FENCE}torso name=hidden\n${source}${FENCE}\n-->`,
    `\`\`\`\`text\n    \`\`\`\`\n${FENCE}torso name=inner\n${source}${FENCE}\n\`\`\`\``,
    ...['     ', '\t'].map((closer, k) => `  ${FENCE}text\n${closer}${FENCE}\n  ${FENCE}torso name=held${k}\n  ${source.replaceAll('\n', '\n  ').trimEnd()}\n  ${FENCE}`),
    'end',
  ].join('\n\n')}\n`;
  const dir = workspace(t, { 'doc.md': literal });
  const run = md(dir, ['doc.md']);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(read(dir, 'doc.md'), literal, 'every byte stays');
  assert.deepEqual(svgs(dir), [], 'nothing inside them is drawn');
  assert.equal(md(dir, ['doc.md', '--check']).status, 0);
});

test('M9 a fence is read where Markdown reads one: up to three spaces in, inside a list item whatever its indent, and behind ~~~', (t) => {
  const body = torso('title "Flow"\nbox a "A"').trimEnd();
  const fenced = (pad, name, fence = FENCE) => `${pad}${fence}torso name=${name}\n${body.replace(/^/gm, pad)}\n${pad}${fence}`;
  const text = `${['1.  step', fenced('    ', 'item'), fenced('', 'tilde', '~~~'), fenced('  ', 'two')].join('\n\n')}\n`;
  const dir = workspace(t, { 'doc.md': text });
  const run = md(dir, ['doc.md']);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(svgs(dir), ['doc-item.svg', 'doc-tilde.svg', 'doc-two.svg']);
  const result = read(dir, 'doc.md');
  assert.match(result, /\n {4}```\n\n {4}!\[Flow\]\(doc-item\.svg\)<!-- torso -->\n/, 'the list image line keeps the item indent');
  assert.match(result, /~~~\n\n!\[Flow\]\(doc-tilde\.svg\)<!-- torso -->\n/);
  assert.match(result, /\n {2}```\n\n {2}!\[Flow\]\(doc-two\.svg\)<!-- torso -->\n/);
  assert.equal(md(dir, ['doc.md']).stdout, '', 'a second run changes nothing');
});

test('M9 a closing fence is measured from its list or quote, not from the opener: the opener\'s own indent is not taken off, so five spaces or a tab never close', () => {
  const lines = (opener, closer, quoted = '') => [`${quoted}${opener}${FENCE}torso`, `${quoted}${opener}torso`, `${quoted}${opener}box a "A"`, `${quoted}${closer}${FENCE}`];
  // [opener indent, closer indent, closes?]. 목록 칸은 4칸(`1.  x`)이고 중첩 목록은 4칸(`- a` 안 `- b`)이다.
  const flat = [['', '', true], ['', '   ', true], ['', '    ', false], ['  ', '', true], ['  ', '   ', true], ['  ', '     ', false], ['  ', '\t', false], ['   ', '       ', false], ['', '\t', false]];
  for (const [opener, closer, closes] of flat) {
    const found = findBlocks(lines(opener, closer));
    assert.equal(found.blocks.length, closes ? 1 : 0, JSON.stringify({ opener, closer }));
    assert.equal(found.errors.length, closes ? 0 : 1, JSON.stringify({ opener, closer }));
  }
  const listed = [['    ', '    ', true], ['    ', '       ', true], ['    ', '        ', false], ['     ', '       ', true], ['     ', '        ', false], ['    ', '\t', true], ['    ', '\t   ', true], ['    ', '\t\t', false]];
  for (const [opener, closer, closes] of listed) {
    const found = findBlocks(['1.  step', '', ...lines(opener, closer)]);
    assert.equal(found.blocks.length, closes ? 1 : 0, JSON.stringify({ list: true, opener, closer }));
  }
  const nested = findBlocks(['- a', '  - b', '', ...lines('    ', '       ')]);
  assert.equal(nested.blocks.length, 1, 'a nested list item whose fence closes up to three spaces past the item');
  assert.equal(findBlocks(['- a', '  - b', '', ...lines('    ', '        ')]).blocks.length, 0);
  assert.equal(findBlocks(lines('  ', '      ', '> '), true).blocks.length, 0, 'the quote mark is not indentation');
  assert.equal(findBlocks(lines('  ', '   ', '> '), true).blocks.length, 1);
});

test('M9 a five-space or tab line cannot close a torso fence, so the document is reported and nothing is drawn or rewritten', (t) => {
  for (const closer of ['     ', '\t']) {
    const text = `intro\n\n  ${FENCE}torso name=open\n  torso\n  box a "A"\n${closer}${FENCE}\n`;
    const dir = workspace(t, { 'doc.md': text });
    const run = md(dir, ['doc.md']);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /^doc\.md:3: .*never closed/m);
    assert.equal(read(dir, 'doc.md'), text);
    assert.deepEqual(svgs(dir), []);
  }
});

test('M5 a block with an error reports the line in the document, writes nothing, and spares the good blocks of the same run', (t) => {
  const text = doc(block('good'), block('bad', 'box a ""\n'));
  const dir = workspace(t, { 'doc.md': text });
  const run = md(dir, ['doc.md']);
  assert.equal(run.status, 1);
  const bad = text.split('\n').findIndex((line) => line.includes('box a ""')) + 1;
  assert.match(run.stderr, new RegExp(`^doc\\.md:${bad}: `, 'm'));
  assert.deepEqual(snapshot(dir), snapshot(workspace(t, { 'doc.md': text })), 'not even the good block is written');
});

test('M6 two documents with the same name in different folders share --out-dir without eating each other\'s figures; the same figure name clashes', (t) => {
  const dir = workspace(t, { 'a/readme.md': doc(block('one')), 'b/readme.md': doc(block('two')) });
  assert.equal(md(dir, ['a/readme.md', 'b/readme.md', '--out-dir', 'out']).status, 0);
  assert.deepEqual(readdirSync(join(dir, 'out')), ['readme-one.svg', 'readme-two.svg']);
  // 한 문서만 다시 돌려도 다른 문서의 그림은 그대로다
  writeFileSync(join(dir, 'a/readme.md'), doc(block('one', 'title "Flow"\nbox a "CHANGED"\n')));
  assert.equal(md(dir, ['a/readme.md', '--out-dir', 'out']).status, 0);
  assert.deepEqual(readdirSync(join(dir, 'out')), ['readme-one.svg', 'readme-two.svg']);
  const clash = workspace(t, { 'a/readme.md': doc(block('same')), 'b/readme.md': doc(block('same')), 'c/README.md': doc(block('SAME'.toLowerCase())) });
  for (const inputs of [['a/readme.md', 'b/readme.md'], ['a/readme.md', 'c/README.md']]) {
    const before = snapshot(clash);
    const run = md(clash, [...inputs, '--out-dir', 'out']);
    assert.equal(run.status, 1, inputs.join(' '));
    assert.deepEqual(snapshot(clash), before, `${inputs.join(' ')}: nothing written`);
  }
});

test('M6 a document opened through a symbolic link owns the same figures as the real path', (t) => {
  const dir = workspace(t, { 'real/doc.md': doc(block('flow')) });
  symlinkSync(join(dir, 'real'), join(dir, 'alias'));
  assert.equal(md(dir, ['alias/doc.md']).status, 0);
  const owned = snapshot(dir);
  assert.equal(md(dir, ['real/doc.md']).status, 0);
  assert.deepEqual(snapshot(dir), owned);
  assert.equal(md(dir, ['real/doc.md', '--check']).status, 0);
});

test('M6 the image link is relative to the real document, so a folder or a document opened through a symbolic link still gets a link that resolves', (t) => {
  const dir = workspace(t, { 'real/sub/doc.md': doc(block('flow')), 'sub/b.md': doc(block('x')) });
  symlinkSync(join(dir, 'real/sub'), join(dir, 'alias'));
  assert.equal(md(dir, ['alias/doc.md', '--out-dir', 'out']).status, 0);
  assert.match(read(dir, 'real/sub/doc.md'), /\]\(\.\.\/\.\.\/out\/doc-flow\.svg\)<!-- torso -->/);
  assert.equal(md(dir, ['real/sub/doc.md', '--out-dir', 'out', '--check']).status, 0, 'the real path agrees with the alias');
  symlinkSync('sub/b.md', join(dir, 'a.md'));
  assert.equal(md(dir, ['a.md']).status, 0);
  assert.match(read(dir, 'sub/b.md'), /\]\(\.\.\/a-x\.svg\)<!-- torso -->/, 'the figure sits next to the link and the document one folder deeper');
});

test('M6 #176 two blocks whose figures are symbolic links to one file clash before any write: both links, the target and the document stay as they were', (t) => {
  const dir = workspace(t, { 'doc.md': doc(block('one'), block('two')) });
  assert.equal(md(dir, ['doc.md']).status, 0);
  unlinkSync(join(dir, 'doc-two.svg'));
  symlinkSync(join(dir, 'doc-one.svg'), join(dir, 'doc-two.svg'));
  writeFileSync(join(dir, 'doc.md'), read(dir, 'doc.md').replace('Flow', 'Changed'));
  const before = snapshot(dir);
  const run = md(dir, ['doc.md', '--json']);
  assert.equal(run.status, 1);
  const lines = run.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(lines.some((d) => /would be written twice: for .* and for /.test(d.message)), run.stdout);
  assert.deepEqual(snapshot(dir), before);
  assert.equal(md(dir, ['doc.md', '--check']).status, 1, '--check refuses it too');
  assert.deepEqual(snapshot(dir), before);
});

test('M6 a document and a symbolic link to it are one output: md a.md b.md is refused before any write, and each alone still works', (t) => {
  const dir = workspace(t, { 'b.md': doc(block('x')) });
  symlinkSync('b.md', join(dir, 'a.md'));
  const before = snapshot(dir);
  const run = md(dir, ['a.md', 'b.md', '--json']);
  assert.equal(run.status, 1);
  const lines = run.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(lines.some((d) => /would be written twice: for .* and for /.test(d.message)), run.stdout);
  assert.deepEqual(snapshot(dir), before, 'no figure, no document write');
  assert.equal(md(dir, ['b.md', 'a.md', '--check']).status, 1, '--check refuses the other order too');
  assert.deepEqual(snapshot(dir), before);
  // 사용자가 만든 링크는 그대로 두고 가리키는 문서를 바꾼다
  assert.equal(md(dir, ['a.md']).status, 0);
  assert.equal(lstatSync(join(dir, 'a.md')).isSymbolicLink(), true);
  assert.match(read(dir, 'b.md'), /<!-- torso -->/);
});

test('M11 a document that is a symbolic link to nothing is reported as unreadable and nothing is written', (t) => {
  const dir = workspace(t, { 'real.md': doc(block('x')) });
  symlinkSync('gone.md', join(dir, 'a.md'));
  const before = snapshot(dir);
  const run = md(dir, ['a.md', 'real.md', '--json']);
  assert.equal(run.status, 1);
  assert.ok(run.stdout.trim().split('\n').map((line) => JSON.parse(line)).some((d) => d.file === 'a.md' && d.code === 'io'), run.stdout);
  assert.deepEqual(snapshot(dir), before);
});

test('M3 an owned figure whose existing name differs from the new one only by letter case is the same file, not a stale one to remove', (t) => {
  // 블록 이름은 소문자뿐이라 문서에서 대소문자만 바꾼 이름은 만들 수 없다. 이 도구의 표시가 붙은 파일이 대문자 이름으로 이미 있는 경우(손으로 옮겼거나 옛 실행의 결과)를 쓴다.
  const owned = '<svg xmlns="http://www.w3.org/2000/svg">\n<!-- torso md v2 doc.md -->\n</svg>\n';
  const dir = workspace(t, { 'doc.md': doc(block('flow')), 'doc-Flow.svg': owned });
  if (!existsSync(join(dir, 'doc-flow.svg'))) return t.skip('this file system tells names apart by case');
  const run = md(dir, ['doc.md']);
  assert.equal(run.status, 0, run.stderr);
  assert.doesNotMatch(run.stdout, /removed/);
  assert.match(read(dir, 'doc.md'), /\]\(doc-flow\.svg\)<!-- torso -->/);
  assert.equal(svgs(dir).length, 1);
  assert.match(read(dir, 'doc-flow.svg'), /^<svg [\s\S]*torso md v2 doc\.md[\s\S]*Flow/, 'the figure the document points to exists and is the new figure');
  assert.equal(md(dir, ['doc.md']).stdout, '');
  assert.equal(md(dir, ['doc.md', '--check']).status, 0);
});

test('M11 a figure whose file is a symbolic link to nothing is not replaced by a plain file: one io diagnostic, exit 1, every file as it was', (t) => {
  const dir = workspace(t, { 'doc.md': doc(block('flow')) });
  symlinkSync(join(dir, 'gone.svg'), join(dir, 'doc-flow.svg'));
  const before = snapshot(dir);
  const run = md(dir, ['doc.md', '--json']);
  assert.equal(run.status, 1);
  const lines = run.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(lines.some((d) => d.code === 'io' && /symbolic link/.test(d.message)), run.stdout);
  assert.deepEqual(snapshot(dir), before);
});

test('M11 an --out-dir that is a file, or sits under one, is one io line and exit 1 before anything is written, --check included', (t) => {
  const dir = workspace(t, { 'doc.md': doc(block('flow')), 'plain.txt': 'a file' });
  const before = snapshot(dir);
  for (const out of ['plain.txt', 'plain.txt/inner']) {
    for (const extra of [[], ['--check']]) {
      const run = md(dir, ['doc.md', '--out-dir', out, ...extra]);
      assert.equal(run.status, 1, `${out} ${extra}`);
      assert.equal(run.stderr.trim().split('\n').length, 1, run.stderr);
      assert.match(run.stderr, new RegExp(`^${out}: cannot be used as --out-dir: `));
      assert.doesNotMatch(run.stderr, /\n\s+at |node:internal/);
      assert.deepEqual(snapshot(dir), before, 'nothing written, no lock left behind');
    }
  }
  assert.deepEqual(md(dir, ['doc.md', '--out-dir', 'plain.txt', '--json']).stdout.trim().split('\n').map((line) => JSON.parse(line).code), ['io']);
});

test('M12 --scene on a block with no scenes is refused with the block\'s line, as render refuses it; without --scene it is one still picture', (t) => {
  const dir = workspace(t, { 'doc.md': doc(block('flow')) });
  const before = snapshot(dir);
  const run = md(dir, ['doc.md', '--scene', '1', '--json']);
  assert.equal(run.status, 1);
  const [only, ...rest] = run.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(rest, []);
  assert.match(only.message, /--scene: no scene .*no scenes/);
  assert.ok(only.line >= 1);
  assert.deepEqual(snapshot(dir), before);
  assert.equal(md(dir, ['doc.md']).status, 0);
});

test('M7 --fold puts the picture first and the source in details; folding, unfolding and the plain run are each idempotent and unfolding restores the plain result byte for byte', (t) => {
  const dir = workspace(t, { 'doc.md': doc(block('flow'), block('')) });
  md(dir, ['doc.md']);
  const plain = read(dir, 'doc.md');
  const fold = md(dir, ['doc.md', '--fold']);
  assert.equal(fold.status, 0, fold.stderr);
  const folded = read(dir, 'doc.md');
  assert.match(folded, /<!-- torso fold v1 name=flow -->\n!\[Flow\]\(doc-flow\.svg\)<!-- torso -->\n\n<details>\n<summary>그림 원본<\/summary>\n\n```torso name=flow\n/);
  assert.match(folded, /<!-- \/torso fold v1 name=flow -->/);
  assert.match(folded, /<!-- torso fold v1 n=1 -->/);
  const afterFold = snapshot(dir);
  assert.equal(md(dir, ['doc.md', '--fold']).stdout, '');
  assert.equal(md(dir, ['doc.md']).stdout, '', 'a plain run keeps the fold');
  assert.deepEqual(snapshot(dir), afterFold);
  assert.equal(md(dir, ['doc.md', '--unfold']).status, 0);
  assert.equal(read(dir, 'doc.md'), plain);
  assert.equal(md(dir, ['doc.md', '--unfold']).stdout, '');
});

test('M7 the summary text is escaped as text; fold options conflict or lack their partner as usage errors', (t) => {
  const dir = workspace(t, { 'doc.md': doc(block('flow')) });
  assert.equal(md(dir, ['doc.md', '--fold', '--fold-title', '<b>&"x\'']).status, 0);
  assert.match(read(dir, 'doc.md'), /<summary>&lt;b&gt;&amp;&quot;x&#39;<\/summary>|<summary>&lt;b&gt;&amp;&quot;x&#x27;<\/summary>|<summary>&lt;b&gt;&amp;&quot;x&apos;<\/summary>/);
  const before = snapshot(dir);
  for (const args of [['doc.md', '--fold', '--unfold'], ['doc.md', '--fold-title', 'x'], ['doc.md', '--fold', '--fold-title', '  '], ['doc.md', '--fold', '--fold-title', 'a\nb']]) {
    assert.equal(md(dir, args).status, 2, args.join(' '));
  }
  assert.deepEqual(snapshot(dir), before);
});

test('M7 a details element the user wrote is never rewritten, and a block inside it keeps its plain layout under --fold', (t) => {
  const text = `# Doc\n\n<details>\n<summary>mine</summary>\n\n${block('flow')}\n</details>\n`;
  const dir = workspace(t, { 'doc.md': text });
  assert.equal(md(dir, ['doc.md', '--fold']).status, 0);
  const result = read(dir, 'doc.md');
  assert.doesNotMatch(result, /torso fold/);
  assert.match(result, /<summary>mine<\/summary>/);
  assert.match(result, /!\[Flow\]\(doc-flow\.svg\)<!-- torso -->/);
  assert.equal(md(dir, ['doc.md', '--unfold']).stdout, '', 'unfold leaves a user details alone');
});

test('M8 line endings: untouched lines keep their ending and new lines use CRLF when the document has any', (t) => {
  const crlf = doc(block('flow')).replaceAll('\n', '\r\n');
  const dir = workspace(t, { 'doc.md': crlf });
  assert.equal(md(dir, ['doc.md']).status, 0);
  const result = read(dir, 'doc.md');
  assert.equal(result.replaceAll('\r\n', '').includes('\n'), false, 'no bare LF');
  assert.match(result, /\]\(doc-flow\.svg\)<!-- torso -->\r\n/);
  const mixed = workspace(t, { 'doc.md': doc(block('flow')).replace('intro\n', 'intro\r\n') });
  md(mixed, ['doc.md']);
  assert.match(read(mixed, 'doc.md'), /intro\r\n/);
  assert.match(read(mixed, 'doc.md'), /<!-- torso -->\r\n/, 'new lines follow the document once it has any CRLF');
});

test('M9 a quoted block is read only when it already carries the tool\'s mark or an option asks; a plain run leaves the document byte for byte', (t) => {
  const quoted = '# Doc\n\n> ```torso name=q\n> torso\n> box a "A"\n> ```\n';
  const dir = workspace(t, { 'doc.md': quoted });
  assert.equal(md(dir, ['doc.md']).status, 0);
  assert.equal(read(dir, 'doc.md'), quoted);
  assert.deepEqual(svgs(dir), []);
  assert.equal(md(dir, ['doc.md', '--fold']).status, 0);
  assert.deepEqual(svgs(dir), ['doc-q.svg']);
  assert.match(read(dir, 'doc.md'), /^> <!-- torso fold v1 name=q -->$/m);
});

test('M10 two runs at once: a live lock refuses with md-locked and changes nothing; a lock whose process is gone is cleared', (t) => {
  const dir = workspace(t, { 'doc.md': doc(block('flow')) });
  const lock = (pid, host = hostname()) => `${JSON.stringify({ pid, host, created: new Date().toISOString(), nonce: 'test-nonce' })}\n`;
  writeFileSync(join(dir, '.torso-md.lock'), lock(process.pid));
  const before = snapshot(dir);
  const busy = md(dir, ['doc.md', '--json']);
  assert.equal(busy.status, 1);
  assert.equal(JSON.parse(busy.stdout.trim().split('\n')[0]).code, 'md-locked');
  assert.deepEqual(snapshot(dir), before);
  assert.equal(md(dir, ['doc.md', '--check']).status, 1, '--check does not lock, and reports the missing figure instead');
  writeFileSync(join(dir, '.torso-md.lock'), lock(process.pid, 'some-other-host'));
  assert.equal(md(dir, ['doc.md']).status, 1, 'a lock from another host is never cleared automatically');
  const finished = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' });
  writeFileSync(join(dir, '.torso-md.lock'), lock(finished.pid));
  const cleared = md(dir, ['doc.md']);
  assert.equal(cleared.status, 0, cleared.stderr);
  assert.deepEqual(readdirSync(dir).filter((f) => f.startsWith('.')), [], 'the lock is gone afterwards');
});

test('M11 a figure that cannot be written is one diagnostic and exit 1, with the document and every other file as they were', (t) => {
  const dir = workspace(t, { 'doc.md': doc(block('one'), block('two')), 'doc-two.svg/keep.txt': 'a folder in the way' });
  const before = snapshot(dir);
  const run = md(dir, ['doc.md', '--json']);
  assert.equal(run.status, 1);
  const lines = run.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(lines.length >= 1, 'the failure is reported as a diagnostic');
  assert.doesNotMatch(run.stderr, /\n\s+at |node:internal/);
  assert.deepEqual(snapshot(dir), before);
});

test('M11 a read-only output folder fails before anything is replaced: diagnostic code io, document and figures untouched', (t) => {
  if (process.getuid?.() === 0) return t.skip('running as root: permission bits do not stop writes');
  const dir = workspace(t, { 'doc.md': doc(block('flow')), 'out/keep.txt': 'x' });
  chmodSync(join(dir, 'out'), 0o555);
  try {
    const before = snapshot(dir);
    const run = md(dir, ['doc.md', '--out-dir', 'out', '--json']);
    assert.equal(run.status, 1);
    assert.ok(run.stdout.trim().split('\n').map((line) => JSON.parse(line)).some((d) => d.code === 'io'), run.stdout);
    assert.deepEqual(snapshot(dir), before);
    assert.deepEqual(readdirSync(join(dir, 'out')), ['keep.txt'], 'no temporary files left behind');
  } finally {
    chmodSync(join(dir, 'out'), 0o755);
  }
});

test('M12 --static writes a still picture and --scene picks the scene', (t) => {
  const scenes = 'title "Two"\nbox a "A"\nbox b "B"\na -> b\nscene "first" mode=static\n  a -> b\nscene "second" mode=once\n  b -> a\n';
  const dir = workspace(t, { 'doc.md': doc(block('flow', scenes)) });
  md(dir, ['doc.md', '--static', '--scene', 'second']);
  const svg = read(dir, 'doc-flow.svg');
  assert.match(svg, /data-mode="static"/);
  assert.match(svg, /data-scene="1"/);
});

test('M13 --json reports each problem as one line with the six fields, and options that belong to other commands are usage errors', (t) => {
  const dir = workspace(t, { 'doc.md': doc(block('bad', 'box a ""\n')) });
  const run = md(dir, ['doc.md', '--json']);
  const lines = run.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.ok(lines.length >= 1);
  for (const line of lines) assert.deepEqual(Object.keys(line).sort(), ['code', 'column', 'file', 'line', 'message', 'severity']);
  for (const option of ['--html', '--title', '--out']) assert.equal(md(dir, ['doc.md', option, 'x']).status, 2, option);
  assert.equal(cli(['render', 'x.torso', '--check']).status, 2);
});

const THREE = 'title "Three"\nbox a "A"\nbox b "B"\na -> b\nscene "first" mode=static\n  a -> b\nscene "second" mode=once\n  b -> a\nscene "third" mode=loop\n  a -> b\n';
const region = (text) => text.slice(text.indexOf('<!-- torso scenes'), text.indexOf('<!-- /torso scenes'));

test('M14 a block with several scenes writes every scene from one build: the first keeps the name, the others get .scene-N, and each keeps its own mode', (t) => {
  const dir = workspace(t, { 'doc.md': doc(block('flow', THREE)) });
  const run = md(dir, ['doc.md']);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(svgs(dir), ['doc-flow.scene-2.svg', 'doc-flow.scene-3.svg', 'doc-flow.svg']);
  for (const [file, scene, mode] of [['doc-flow.svg', 0, 'static'], ['doc-flow.scene-2.svg', 1, 'once'], ['doc-flow.scene-3.svg', 2, 'loop']]) {
    const svg = read(dir, file);
    assert.match(svg, new RegExp(`data-scene="${scene}" data-mode="${mode}"`), file);
    assert.equal(svg.split('\n')[1], '<!-- torso md v2 doc.md -->');
  }
  const text = read(dir, 'doc.md');
  assert.match(text, /```\n\n!\[Three\]\(doc-flow\.svg\)<!-- torso -->\n<!-- torso scenes v1 name=flow -->\n<details>\n<summary>second<\/summary>\n\n!\[Three \(second\)\]\(doc-flow\.scene-2\.svg\)<!-- torso -->\n\n<\/details>\n<details>\n<summary>third<\/summary>\n\n!\[Three \(third\)\]\(doc-flow\.scene-3\.svg\)<!-- torso -->\n\n<\/details>\n<!-- \/torso scenes v1 name=flow -->\n\ntext between|after/);
  const done = snapshot(dir);
  assert.equal(md(dir, ['doc.md']).stdout, '');
  assert.equal(md(dir, ['doc.md', '--check']).status, 0);
  assert.deepEqual(snapshot(dir), done);
});

test('M14 --scene keeps the single choice and removes the scene list and its files; --static makes every scene still; dropping to one scene does the same', (t) => {
  const dir = workspace(t, { 'doc.md': doc(block('flow', THREE)) });
  md(dir, ['doc.md', '--static']);
  for (const file of svgs(dir)) assert.match(read(dir, file), /data-mode="static"/, file);
  const run = md(dir, ['doc.md', '--scene', 'second']);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(svgs(dir), ['doc-flow.svg']);
  assert.match(run.stdout, /removed .*doc-flow\.scene-2\.svg/);
  assert.match(read(dir, 'doc-flow.svg'), /data-scene="1"/);
  assert.doesNotMatch(read(dir, 'doc.md'), /torso scenes/);
  assert.equal(md(dir, ['doc.md']).status, 0);
  assert.deepEqual(svgs(dir), ['doc-flow.scene-2.svg', 'doc-flow.scene-3.svg', 'doc-flow.svg']);
  writeFileSync(join(dir, 'doc.md'), read(dir, 'doc.md').replace(/scene "third"[^`]*/, ''));
  assert.equal(md(dir, ['doc.md']).status, 0);
  assert.deepEqual(svgs(dir), ['doc-flow.scene-2.svg', 'doc-flow.svg']);
  assert.equal(md(dir, ['doc.md', '--check']).status, 0);
});

test('M14 the scene list is its own owned span: --fold keeps it outside the fold marks, --unfold restores the plain bytes, and a user details around it is untouched', (t) => {
  const dir = workspace(t, { 'doc.md': doc(block('flow', THREE), block('')) });
  md(dir, ['doc.md']);
  const plain = read(dir, 'doc.md');
  assert.equal(md(dir, ['doc.md', '--fold']).status, 0);
  const folded = read(dir, 'doc.md');
  assert.match(folded, /<!-- \/torso fold v1 name=flow -->\n<!-- torso scenes v1 name=flow -->\n<details>\n<summary>second/);
  const afterFold = snapshot(dir);
  assert.equal(md(dir, ['doc.md']).stdout, '');
  assert.equal(md(dir, ['doc.md', '--fold']).stdout, '');
  assert.deepEqual(snapshot(dir), afterFold);
  assert.equal(md(dir, ['doc.md', '--unfold']).status, 0);
  assert.equal(read(dir, 'doc.md'), plain);

  const user = `# Doc\n\n<details>\n<summary>mine</summary>\n\n${block('flow', THREE)}\n</details>\n\n${block('other')}`;
  const mixed = workspace(t, { 'doc.md': user });
  assert.equal(md(mixed, ['doc.md', '--fold']).status, 0, 'a block after the scene list is still told apart from a user details');
  const result = read(mixed, 'doc.md');
  assert.match(result, /<summary>mine<\/summary>/);
  assert.match(result, /<!-- torso fold v1 name=other -->/);
  assert.doesNotMatch(result, /<!-- torso fold v1 name=flow -->/, 'inside a user details the block is not folded');
  assert.equal(md(mixed, ['doc.md', '--fold']).stdout, '');
});

test('M14 quoted and listed blocks and CRLF documents get the scene list with their own prefix and line ending, idempotently', (t) => {
  const quoted = ['# Doc', '', '> ```torso name=flow', ...torso(THREE).trimEnd().split('\n').map((l) => `> ${l}`), '> ```', ''].join('\n');
  const listed = ['# Doc', '', '- item', '', '  ```torso name=flow', ...torso(THREE).trimEnd().split('\n').map((l) => `  ${l}`), '  ```', ''].join('\n');
  for (const [name, text, args, prefix] of [['quote', quoted, ['--fold'], '> '], ['list', listed, [], '  '], ['crlf', doc(block('flow', THREE)).replace(/\n/g, '\r\n'), [], '']]) {
    const dir = workspace(t, { 'doc.md': text });
    const run = md(dir, ['doc.md', ...args]);
    assert.equal(run.status, 0, `${name}: ${run.stderr}`);
    const result = read(dir, 'doc.md');
    assert.match(result, new RegExp(`${prefix}<!-- torso scenes v1 name=flow -->`), name);
    if (name === 'crlf') assert.doesNotMatch(result.replace(/\r\n/g, ''), /\n/, 'every line keeps CRLF');
    const done = snapshot(dir);
    assert.equal(md(dir, ['doc.md', ...args]).stdout, '', name);
    assert.deepEqual(snapshot(dir), done, name);
    assert.equal(md(dir, ['doc.md', ...args, '--check']).status, 0, name);
  }
});

test('M14 a scene name is written as text and the alt text, whatever it holds', (t) => {
  const odd = 'title "Odd"\nbox a "A"\nbox b "B"\na -> b\nscene "first" mode=static\n  a -> b\nscene "x <i>&y --> z" mode=static\n  b -> a\n';
  const dir = workspace(t, { 'doc.md': doc(block('flow', odd)) });
  const run = md(dir, ['doc.md']);
  assert.equal(run.status, 0, run.stderr);
  const list = region(read(dir, 'doc.md'));
  assert.doesNotMatch(list.match(/<summary>.*<\/summary>/g).join(''), /<i>/);
  assert.match(list, /<summary>x &lt;i&gt;&amp;y --&gt; z<\/summary>|<summary>x &lt;i&gt;&amp;y --&amp;gt; z<\/summary>/);
  assert.equal(md(dir, ['doc.md', '--check']).status, 0);
});

test('M14 a damaged scene mark is diagnosed and nothing is written, --check included; a user details and an unmarked image beside the list stay', (t) => {
  const dir = workspace(t, { 'doc.md': doc(block('flow', THREE)) });
  md(dir, ['doc.md']);
  const good = read(dir, 'doc.md');
  const user = '<details>\n<summary>mine</summary>\n\nnote\n\n</details>\n\n![mine](mine.png)\n';
  writeFileSync(join(dir, 'doc.md'), good.replace('after\n', `after\n${user}`));
  assert.equal(md(dir, ['doc.md', '--scene', '1']).status, 0);
  assert.match(read(dir, 'doc.md'), /<summary>mine<\/summary>\n\nnote[\s\S]*!\[mine\]\(mine\.png\)\n$/);
  writeFileSync(join(dir, 'doc.md'), good);
  for (const broken of [good.replace('</details>\n<!-- /torso scenes', '<!-- /torso scenes'), good.replace('<!-- /torso scenes v1 name=flow -->', '<!-- /torso scenes v1 name=other -->'), good.replace('torso scenes v1', 'torso scenes v9'), good.replace('<summary>second</summary>\n', '<summary>second</summary>\nuser line\n')]) {
    writeFileSync(join(dir, 'doc.md'), broken);
    const before = snapshot(dir);
    for (const args of [[], ['--check'], ['--scene', '1']]) {
      const run = md(dir, ['doc.md', ...args, '--json']);
      assert.equal(run.status, 1, args.join(' '));
      assert.ok(run.stdout.trim().split('\n').map((l) => JSON.parse(l)).some((d) => d.code === 'md-fold' && /scenes mark/.test(d.message)), run.stdout);
      assert.deepEqual(snapshot(dir), before);
    }
  }
});

test('M14 a block that is removed takes its scene list and files with it, and a scene list in a text fence is only text', (t) => {
  const shown = '````text\n<!-- torso scenes v1 name=x -->\nnot intact\n````\n';
  const dir = workspace(t, { 'doc.md': `${doc(block('flow', THREE))}${shown}` });
  assert.equal(md(dir, ['doc.md']).status, 0);
  writeFileSync(join(dir, 'doc.md'), read(dir, 'doc.md').replace(/```torso[\s\S]*?\n```\n/, '').replace(/!\[Three\]\(doc-flow\.svg\)<!-- torso -->\n/, ''));
  const run = md(dir, ['doc.md']);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(svgs(dir), []);
  assert.doesNotMatch(read(dir, 'doc.md'), /name=flow|\.svg/);
  assert.ok(read(dir, 'doc.md').endsWith(shown), 'the fenced example is untouched');
});

test('M14 a scene list shown inside opaque HTML (pre, script, style, textarea, CDATA; a comment cannot hold a mark, its first --> ends it) is the user\'s text: kept byte for byte, no diagnostic, with or without a real block', (t) => {
  const shown = '<!-- torso scenes v1 name=x -->\n<details>\n<summary>Scene</summary>\n\n![x](x.scene-2.svg)<!-- torso -->\n\n</details>\n<!-- /torso scenes v1 name=x -->\n';
  const wraps = [['<pre>\n', '</pre>\n'], ['<script>\n', '</script>\n'], ['<style>\n', '</style>\n'], ['<textarea>\n', '</textarea>\n'], ['<![CDATA[\n', ']]>\n']];
  for (const [open, close] of wraps) {
    const text = `# Doc\n\n${open}${shown}${close}\nafter\n`;
    const bare = workspace(t, { 'doc.md': text });
    for (const args of [[], ['--check'], ['--fold'], ['--unfold']]) {
      const run = md(bare, ['doc.md', ...args]);
      assert.equal(run.status, 0, `${open.trim()} ${args.join(' ')}: ${run.stderr}`);
      assert.equal(read(bare, 'doc.md'), text, `${open.trim()} ${args.join(' ')}`);
    }
    const mixed = workspace(t, { 'doc.md': `${text}\n${block('flow', THREE)}` });
    assert.equal(md(mixed, ['doc.md']).status, 0);
    const result = read(mixed, 'doc.md');
    assert.ok(result.startsWith(text), `${open.trim()} stays above the block`);
    assert.deepEqual(svgs(mixed), ['doc-flow.scene-2.svg', 'doc-flow.scene-3.svg', 'doc-flow.svg']);
    assert.equal(md(mixed, ['doc.md', '--scene', '1']).status, 0);
    assert.ok(read(mixed, 'doc.md').startsWith(text), 'removing the generated list leaves the shown one');
  }
});

test('M14 an opaque element opened inside a blank-ended HTML block (div, details) keeps its text across blank lines until it closes; generated lists next to it still work', (t) => {
  const shown = '<!-- torso scenes v1 name=x -->\n<details>\n<summary>Scene</summary>\n\n![x](x.scene-2.svg)<!-- torso -->\n\n</details>\n<!-- /torso scenes v1 name=x -->\n';
  const nests = [`<div>\n<pre>\n${shown}</pre>\n</div>\n`, `<details>\n<pre>\n${shown}</pre>\n</details>\n`, `<div>\n<script>\n${shown}</script>\n</div>\n`, `<details>\n<summary>s</summary>\n\n<pre>\n${shown}</pre>\n\n</details>\n`, `<div><pre>\n${shown}</pre></div>\n`, `<div>\n<PRE class="a">\n${shown}</PRE>\n</div>\n`];
  for (const nest of nests) {
    const text = `# Doc\n\n${nest}\nafter\n`;
    const bare = workspace(t, { 'doc.md': text });
    for (const args of [[], ['--check'], ['--fold'], ['--unfold']]) {
      const run = md(bare, ['doc.md', ...args]);
      assert.equal(run.status, 0, `${nest.split('\n')[1]} ${args.join(' ')}: ${run.stderr}`);
      assert.equal(read(bare, 'doc.md'), text, `${nest.split('\n')[1]} ${args.join(' ')}`);
    }
    // 닫힌 뒤의 블록은 정상으로 만들어지고, 다시 돌려도 같으며, 걷으면 보인 예시만 남는다. 이름을 줄 때 이어진 블록 둘도 각자 구간을 갖는다.
    const mixed = workspace(t, { 'doc.md': `${text}\n${block('flow', THREE)}\n${block('two', THREE)}` });
    assert.equal(md(mixed, ['doc.md']).status, 0);
    const done = snapshot(mixed);
    assert.equal(md(mixed, ['doc.md']).stdout, '');
    assert.equal(md(mixed, ['doc.md', '--check']).status, 0);
    assert.deepEqual(snapshot(mixed), done);
    assert.equal(read(mixed, 'doc.md').split('<!-- torso scenes v1 name=').length - 1, 3, 'the shown one and two generated');
    assert.equal(md(mixed, ['doc.md', '--scene', '1']).status, 0);
    assert.ok(read(mixed, 'doc.md').startsWith(text));
    assert.equal(read(mixed, 'doc.md').split('<!-- torso scenes v1 name=').length - 1, 1);
  }
});

test('M14 protected element text is consumed once: tags and fences inside it are never read, and only what follows the closing tag is', (t) => {
  const literal = '<div>\n<script>\nconst x = "<pre> <details>"; </script>\n</div>\n';
  const mixed = workspace(t, { 'doc.md': `# Doc\n\n${literal}\n${block('flow', THREE)}` });
  assert.equal(md(mixed, ['doc.md', '--fold']).status, 0);
  const folded = read(mixed, 'doc.md');
  assert.match(folded, /<!-- torso fold v1 name=flow -->/, 'the string <details> opened nothing');
  assert.match(folded, /<!-- torso scenes v1 name=flow -->/, 'the string <pre> hid nothing after the closing tag');
  const done = snapshot(mixed);
  assert.equal(md(mixed, ['doc.md', '--fold']).stdout, '');
  assert.deepEqual(snapshot(mixed), done);
  assert.equal(md(mixed, ['doc.md', '--unfold', '--scene', '1']).status, 0);
  assert.ok(read(mixed, 'doc.md').startsWith(`# Doc\n\n${literal}`));
  assert.doesNotMatch(read(mixed, 'doc.md'), /torso scenes/);

  for (const open of ['<script>', '<pre>', '<style>', '<textarea>']) {
    const name = open.slice(1, -1);
    const shown = `<div>\n${open}\n\n${block('literal', 'box a "A"\n')}\n</${name}>\n</div>\n`;
    const dir = workspace(t, { 'doc.md': `# Doc\n\n${shown}\nafter\n` });
    for (const args of [[], ['--fold'], ['--unfold']]) {
      const run = md(dir, ['doc.md', ...args]);
      assert.equal(run.status, 0, `${open} ${args.join(' ')}: ${run.stderr}`);
      assert.equal(read(dir, 'doc.md'), `# Doc\n\n${shown}\nafter\n`, `${open} ${args.join(' ')}`);
      assert.deepEqual(svgs(dir), [], 'a fence inside protected text is not a block');
    }
  }
});

test('M14 protected element text lasts only as long as the quote or list item that opened it: a real block after the container ends is still read, and a fence inside it is not', (t) => {
  const fenced = (prefix) => ['torso name=lit', 'box a "A"'].flatMap((line, k) => (k ? [`${prefix}${line}`] : [`${prefix}\`\`\`${line}`])).concat(`${prefix}\`\`\``).join('\n');
  const real = `${block('real', 'box b "B"\n')}`;
  const cases = [
    ['quote ended by an unmarked line', `> <pre>\n> user example\n\n${real}`],
    ['fence inside an open quote element, real block after', `> <pre>\n>\n${fenced('> ')}\n> </pre>\n\n${real}`],
    ['quote never closes the element before it ends', `> <script>\n> const x = "<pre>";\n\n${real}`],
    ['list item ended by a dedented line', `- <pre>\n  user example\n\n${real}`],
    ['fence inside an open list item element', `- <pre>\n  x\n\n${fenced('  ')}\n  </pre>\n\n${real}`],
  ];
  for (const [name, body] of cases) {
    const dir = workspace(t, { 'doc.md': `# Doc\n\n${body}` });
    const run = md(dir, ['doc.md', '--fold']);
    assert.equal(run.status, 0, `${name}: ${run.stderr}`);
    assert.deepEqual(svgs(dir), ['doc-real.svg'], name);
    const text = read(dir, 'doc.md');
    assert.match(text, /<!-- torso fold v1 name=real -->/, name);
    assert.doesNotMatch(text, /name=lit -->|doc-lit/, name);
    assert.equal(md(dir, ['doc.md', '--fold']).stdout, '', name);
  }
});

test('M14 scene files go through the same ownership, collision and write checks as the first: a foreign file, a clash, or a failed write leaves everything as it was', (t) => {
  const dir = workspace(t, { 'doc.md': doc(block('flow', THREE)), 'doc-flow.scene-3.svg': '<svg>mine</svg>\n' });
  let before = snapshot(dir);
  let run = md(dir, ['doc.md', '--json']);
  assert.equal(run.status, 1);
  assert.ok(run.stdout.trim().split('\n').map((l) => JSON.parse(l)).some((d) => /doc-flow\.scene-3\.svg already exists/.test(d.message) && d.line >= 1), run.stdout);
  assert.deepEqual(snapshot(dir), before);

  const blocked = workspace(t, { 'doc.md': doc(block('flow', THREE)), 'doc-flow.scene-2.svg/keep.txt': 'a folder in the way' });
  before = snapshot(blocked);
  run = md(blocked, ['doc.md', '--json']);
  assert.equal(run.status, 1);
  assert.ok(run.stdout.trim().length > 0, 'the folder in the way is diagnosed');
  assert.deepEqual(snapshot(blocked), before, 'the first figure and the document are not written either');

  const other = workspace(t, { 'x/doc.md': doc(block('flow', THREE)), 'y/doc.md': doc(block('flow', THREE)) });
  md(other, ['x/doc.md', '--out-dir', 'out']);
  unlinkSync(join(other, 'out', 'doc-flow.svg'));
  before = snapshot(other);
  run = md(other, ['y/doc.md', '--out-dir', 'out']);
  assert.equal(run.status, 1, 'y/doc.md may not take the scene files x/doc.md made');
  assert.match(run.stderr, /doc-flow\.scene-2\.svg already exists and was made for another document/);
  assert.deepEqual(snapshot(other), before);
});
