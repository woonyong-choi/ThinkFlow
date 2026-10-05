// 접기가 문서의 `<details>` 태그를 세는 규칙 시험: 코드, 주석, 이스케이프, 인용과 목록 칸(docs/design/markdown.md 원본 접기 절 사용자 details). 결정: 이슈 #136.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findBlocks } from '../src/md.js';
import { detailsBefore } from '../src/md-tags.js';

const SOURCE = ['flow right', 'box a "A"'];
const block = (name, prefix = '') => [`\`\`\`dap name=${name}`, ...SOURCE, '```'].map((line) => `${prefix}${line}`).join('\n') + '\n';
// cost: time O(n·c), heap O(n), stack O(1)
// vars: n = 문서 줄 수, c = 열린 칸 수
// basis: estimate
// 문서의 블록마다 앞에 열린 사용자 details { depth, broken, brokenAt }
const depths = (text) => {
  const lines = text.split('\n');
  const fences = findBlocks(lines, true);
  const seen = detailsBefore(lines, fences, { blocks: new Set(fences.blocks.map((b) => b.open)), skip: new Set() });
  return fences.blocks.map((b) => seen.get(b.open));
};

// 근거: 이슈 #136 구현 기준 "코드 span(백틱 길이 맞춤 포함), 여러 줄 주석, 백슬래시 이스케이프, 실제 HTML 태그를 구별한다". md-tags.js 직접 호출이라 수정 전에는 실행할 수 없다
test('detailsBefore_counts_only_real_tags_outside_code_comments_and_escapes', () => {
  const none = [
    'Use `<details>` to fold.', 'Use `</details>` to close.', '<!-- <details> example -->', '<!--\n<details>\n-->', 'a <!-- x\ny <details> z --> b',
    '``a ` <details> b``', '```<details>```', 'Use `<details>\nspans lines` end', '\\<details> literal', '&lt;details&gt;', '# Heading `<details>`',
    'x\n\n    <details>', '```text\n<details>\n```', '~~~\n<details>\n~~~', '<details>\nx\n\n</details>', '<details>\n\n<!-- </details> -->\n\n</details>', '<!-- never closed\n<details>',
    '<details>\n`</details>`',
  ];
  const one = [
    'text <details> more', '<details open>', '<DETAILS>', '<details>\n<summary>s</summary>', '<!-- c --> <details>', 'a `x` <details>', '`<details>` and <details> after',
    '``<details>` x', '\\`<details>`', 'a <!-- <details> never closed', '<details>\n\n<!-- </details> -->',
  ];
  for (const [expected, texts] of [[0, none], [1, one]]) {
    for (const text of texts) {
      const [seen] = depths(`${text}\n\n${block('x')}`);
      assert.deepEqual([seen.depth, seen.broken], [expected, false], text);
    }
  }
});

// 근거: 이슈 #136 완료 조건 "인용·목록의 다른 문맥에 있는 태그를 현재 블록의 부모로 오인하지 않는다". md-tags.js 직접 호출이라 수정 전에는 실행할 수 없다
test('detailsBefore_treats_a_tag_as_the_parent_only_when_the_block_is_in_the_same_or_an_inner_quote_or_list_item', () => {
  const cases = [
    ['quote tag, block outside', `> <details>\n> text\n\n${block('x')}`, 0],
    ['quote tag, block in the quote', `> <details>\n>\n${block('x', '> ')}`, 1],
    ['top tag, block in a quote', `<details>\n\n${block('x', '> ')}`, 1],
    ['item tag, block outside the item', `- <details>\n\n${block('x')}`, 0],
    ['item tag, block in the item', `- <details>\n\n${block('x', '  ')}`, 1],
    ['item tag, block in the next item', `- <details>\n- second\n\n${block('x', '  ')}`, 0],
    ['tag in an item of a quote, block there', `> - <details>\n>\n${block('x', '>   ')}`, 1],
    ['ordered item tag, block in the item', `1. <details>\n\n${block('x', '   ')}`, 1],
    ['tag on a lazy continuation line stays in the quote', `> text\nlazy <details>\n\n${block('x')}`, 0],
    ['block start line ends the quote paragraph', `> text\n<details>\n\n${block('x')}`, 1],
  ];
  for (const [label, text, depth] of cases) assert.equal(depths(text).at(-1).depth, depth, label);
});

// 근거: 이슈 #136 완료 조건 "구조를 확정할 수 없으면 알린다". 짝 없는 닫는 태그의 줄 번호를 brokenAt이 담는다
test('detailsBefore_reports_the_first_unmatched_closing_tag_line_and_keeps_it_for_later_blocks', () => {
  const seen = depths(`> </details>\n\n${block('x')}\n</details>\n\n${block('y')}`);

  assert.deepEqual(seen.map(({ broken, brokenAt }) => [broken, brokenAt]), [[true, 1], [true, 1]]);
  assert.deepEqual(depths(`> <details>\n\n</details>\n\n${block('x')}`).map(({ brokenAt }) => brokenAt), [3]);
});
