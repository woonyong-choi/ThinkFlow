// 차트 계열 역할(role=main|compare)의 문법, 검증, 색과 순서, 예제 사이 일관성.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { parseFigure } from '../src/source/parse.js';
import { tokens } from '../src/tokens.js';
import { errorsOf } from './helpers.js';

const EXAMPLES = new URL('../examples/', import.meta.url);
const ASSETS = new URL('../docs/assets/', import.meta.url);
const BAR = 'chart bar\nx "값(%)"\nseries a "A" role=main\nseries b "B" role=compare\nrow "r" a=5 b=3\n';

// cost: time O(f), heap O(f), stack O(1), io f
// vars: f = 원본 파일 수
// basis: estimate
// 예제와 문서 그림의 .muto 원본 목록.
function sources() {
  return [EXAMPLES, ASSETS].flatMap((dir) => readdirSync(dir).filter((name) => name.endsWith('.muto')).map((name) => ({ name, text: readFileSync(new URL(name, dir), 'utf8') })));
}

test('parseFigure_series_role_is_read_with_or_without_key', () => {
  const { chart } = parseFigure('chart bar\nx "값(%)"\nseries a "A" key="k" role=compare\nseries b "B" role=main\nrow "r" a=1 b=2\n').figure;

  assert.deepEqual(chart.series.map((s) => [s.id, s.key, s.role]), [['b', 'b', 'main'], ['a', 'k', 'compare']]);
});

test('parseFigure_series_role_errors_name_the_rule', () => {
  const two = (a, b) => errorsOf(`chart bar\nx "값(%)"\nseries a "A"${a}\nseries b "B"${b}\nrow "r" a=1 b=2\n`).join('\n');

  assert.deepEqual(errorsOf(`chart bar\nx "값(%)"\nseries a "A" role=main\nseries b "B"\nrow "r" a=1 b=2\n`), []);
  assert.match(two(' role=main', ' role=main'), /one role=main and one role=compare/);
  assert.match(two(' role=compare', ' role=compare'), /one role=main and one role=compare/);
  assert.match(two(' role=other', ' role=compare'), /role is one of main, compare. Found "other"/);
  assert.match(errorsOf('chart bar\nx "값(%)"\nseries a "A" role=compare\nrow "r" a=1\n').join(), /one series shows it as main/);
  assert.deepEqual(errorsOf('chart bar\nx "값(%)"\nseries a "A"\nrow "r" a=1\n'), []);
});

test('parseFigure_series_without_role_take_the_roles_in_declaration_order_as_before_roles_existed', () => {
  const roles = (type, rows) => parseFigure(`chart ${type}\nx "값(%)"\nseries a "A"\nseries b "B"\n${rows}\n`).figure.chart.series.map((s) => [s.id, s.role]);

  assert.deepEqual(roles('bar', 'row "r" a=1 b=2'), [['a', 'main'], ['b', 'compare']]);
  assert.deepEqual(roles('line', 'point x=1 a=1 b=2'), [['a', 'main'], ['b', 'compare']]);
  assert.deepEqual(roles('dumbbell', 'row "r" a=1 b=2'), [['a', 'compare'], ['b', 'main']]);
});

test('parseFigure_one_series_with_a_role_leaves_the_other_the_remaining_role', () => {
  const roles = (a, b) => parseFigure(`chart bar\nx "값(%)"\nseries a "A"${a}\nseries b "B"${b}\nrow "r" a=1 b=2\n`).figure.chart.series.map((s) => [s.id, s.role]);

  assert.deepEqual(roles(' role=compare', ''), [['b', 'main'], ['a', 'compare']]);
  assert.deepEqual(roles('', ' role=main'), [['b', 'main'], ['a', 'compare']]);
});

test('buildFigure_old_dumbbell_without_roles_reveals_the_first_series_first_without_error', async () => {
  const source = 'chart dumbbell\nx "값(%)"\nseries base "전"\nseries ours "후"\nrow "r" base=9 ours=2\nstep "s"\n  reveal base\nstep "t"\n  reveal ours\n';

  const { chart } = await buildFigure(source);

  assert.match(chart.body, /chart-before/);
});

test('parseFigure_single_series_without_role_is_main', () => {
  assert.equal(parseFigure('chart bar\nx "값(%)"\nseries a "A"\nrow "r" a=1\n').figure.chart.series[0].role, 'main');
});

test('buildFigure_bar_and_line_put_main_first_whatever_the_declaration_order', async () => {
  const swapped = BAR.replace('series a "A" role=main\nseries b "B" role=compare', 'series b "B" role=compare\nseries a "A" role=main');
  const { chart } = await buildFigure(swapped);
  const legend = [...chart.body.matchAll(/class="chart-legend">([^<]+)</g)].map((m) => m[1]);

  assert.deepEqual(legend, ['A', 'B']);
});

test('buildFigure_dumbbell_starts_at_compare_ends_at_main_and_legend_lists_main_first', async () => {
  const source = 'chart dumbbell\nx "값(%)"\nseries ours "O" role=main\nseries base "B" role=compare\nrow "r" ours=2 base=9\nstep "s"\n  reveal base\n  reveal ours\n';
  const { chart, timeline } = await buildFigure(source);
  const legend = [...chart.body.matchAll(/class="chart-legend">([^<]+)</g)].map((m) => m[1]);

  assert.deepEqual(legend, ['O', 'B']);
  assert.match(chart.body, new RegExp(`<g class="cs-0">.*?class="chart-before pop"`, 's'));
  assert.equal(timeline.segs.at(-1).series.length, 2);
  assert.match(errorsOf('chart dumbbell\nx "값(%)"\nseries ours "O" role=main\nseries base "B" role=compare\nrow "r" ours=2 base=9\nstep "s"\n  reveal ours\n  reveal base\n').join(), /reveal "base" before "ours". The arrow starts from the compare series/);
});

test('buildFigure_bar_lets_the_author_reveal_compare_before_main_while_the_legend_stays_main_first', async () => {
  const { chart } = await buildFigure(`${BAR}step "전"\n  reveal b\nstep "후"\n  reveal a\n`);
  const legend = [...chart.body.matchAll(/class="chart-legend">([^<]+)</g)].map((m) => m[1]);

  assert.deepEqual(errorsOf(`${BAR}step "전"\n  reveal b\nstep "후"\n  reveal a\n`), []);
  assert.deepEqual(legend, ['A', 'B']);
});

test('drawChart_series_color_follows_the_role_not_the_declaration_order', async () => {
  const first = await buildFigure(BAR);
  const swapped = await buildFigure(BAR.replace('series a "A" role=main\nseries b "B" role=compare', 'series b "B" role=compare\nseries a "A" role=main'));
  const fills = (body) => [...body.matchAll(/<rect [^>]*height="12"[^>]*fill="([^"]+)" class="grow"/g)].map((m) => m[1]);

  assert.deepEqual(fills(first.chart.body), [tokens.color.data.main, tokens.color.data.compare]);
  assert.deepEqual(fills(swapped.chart.body), fills(first.chart.body));
});

test('examples_same_series_label_and_id_have_the_same_role_in_every_source', () => {
  const byLabel = new Map();
  const byId = new Map();
  for (const { name, text } of sources().filter(({ text }) => /^chart /.test(text))) {
    for (const s of parseFigure(text).figure.chart.series) {
      for (const [table, key] of [[byLabel, s.label], [byId, s.id]]) {
        const seen = table.get(key);
        assert.ok(seen === undefined || seen.role === s.role, `${name}: "${key}" is ${s.role} but ${seen?.name} has ${seen?.role}`);
        table.set(key, { name, role: s.role });
      }
    }
  }

  assert.ok(byLabel.size >= 4);
});
