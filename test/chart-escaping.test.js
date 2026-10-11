import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build, descendants, findAll, parseMarkup, textContent, thinkflow, toHtml, toSvg } from './support.js';

const hostile = '<b>unsafe</b>';
const chart = (kind) => thinkflow(`chart c "C" ${kind} {
  x "x(u)"
  series a "${kind === 'dumbbell' ? hostile : 'A'}"
  series b "B"
  row "r" a=${kind === 'dumbbell' ? 1 : '-'} b=2
  ${kind === 'dumbbell' ? '' : `missing "${hostile}"`}
}`);

for (const kind of ['stacked', 'percent', 'dumbbell']) {
  test(`I1 ${kind} missing text and narrow series summaries remain text in SVG and HTML`, async () => {
    const result = await build(chart(kind));
    for (const isStatic of [true, false]) {
      const dom = parseMarkup(await toSvg(result, { isStatic }));
      assert.equal(findAll(dom, (node) => node.tag === 'b').length, 0);
      assert.ok(findAll(dom, (node) => node.tag === 'text').some((node) => textContent(node).includes(hostile)));
    }
    const dom = parseMarkup(await toHtml(result, kind), { html: true });
    assert.equal(findAll(dom, (node) => node.tag === 'b').length, 0);
    const narrow = descendants(dom).find((node) => node.tag === 'template' && /\bfl-narrow\b/.test(node.attrs.class ?? ''));
    assert.ok(narrow, 'the generated HTML includes the narrow layout');
    assert.ok(findAll(narrow, (node) => node.tag === 'text').some((node) => textContent(node).includes(hostile)), 'the narrow layout preserves the literal text');
  });
}
