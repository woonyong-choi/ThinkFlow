import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { DOC_END, DOC_START, renderCheckTable } from '../src/check/doc.js';
import { CHECKS } from '../src/check/items.js';

const SRC = new URL('../src/', import.meta.url);

// cost: time O(f·n), heap O(n), stack O(d)
// vars: f = 파일 수, n = 파일 글자 수, d = 폴더 깊이
// basis: estimate
function sourceFiles(dir = SRC) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sourceFiles(new URL(`${e.name}/`, dir)) : e.name.endsWith('.js') ? [new URL(e.name, dir)] : []));
}

test('checkItems_numbers_run_from_1_without_gaps_and_codes_follow_the_numbers', () => {
  assert.deepEqual(CHECKS.map((c) => c.number), CHECKS.map((_, i) => i + 1));
  for (const c of CHECKS) assert.equal(c.code, `check-${c.number}`);
});

test('checkItems_every_item_has_a_title_a_criterion_and_known_severities', () => {
  for (const c of CHECKS) {
    assert.ok(c.title && c.criterion, c.code);
    assert.ok(c.severity.length && c.severity.every((s) => ['error', 'warning'].includes(s)), c.code);
  }
});

test('checkItems_scene_items_have_a_judge_and_source_items_do_not', () => {
  for (const c of CHECKS) assert.equal(typeof c.judge, c.stage === 'scene' ? 'function' : 'undefined', c.code);
  assert.deepEqual(CHECKS.filter((c) => c.stage === 'source').map((c) => c.number), [8, 11]);
});

test('checkItems_every_check_number_written_in_the_source_is_in_the_list', () => {
  const used = new Set();
  for (const file of sourceFiles()) for (const m of readFileSync(file, 'utf8').matchAll(/\[check (\d+)\]/g)) used.add(Number(m[1]));

  assert.deepEqual([...used].sort((a, b) => a - b), CHECKS.map((c) => c.number));
});

test('checkItems_figure_check_doc_table_equals_the_table_made_from_the_list', () => {
  const doc = readFileSync(new URL('../docs/design/figure-check.md', import.meta.url), 'utf8');
  const written = doc.slice(doc.indexOf(DOC_START) + DOC_START.length, doc.indexOf(DOC_END)).trim();

  assert.equal(written, renderCheckTable(), 'run npm run checkdoc to rewrite the table in docs/design/figure-check.md');
});
