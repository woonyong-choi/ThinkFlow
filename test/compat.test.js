// 호환 고정 묶음. test/fixtures/compat/v1/의 파일은 판 1 문법으로 쓴 원본이고 앞으로 고치지 않는다.
// 새 판(깨지는 변경)이 생기면 v2 폴더를 더하고, 같은 판 안의 기능 추가는 새 파일을 더한다.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildFigure } from '../src/build.js';
import { KINDS, OPTIONS, STATEMENTS, VALUES } from '../src/source/grammar.js';
import { tokenizeLine } from '../src/source/lexer.js';
import { createProblems } from '../src/source/problems.js';

const V1 = new URL('./fixtures/compat/v1/', import.meta.url);
const NAMES = readdirSync(V1).filter((name) => name.endsWith('.muto')).sort();
const SNAPSHOT = JSON.parse(readFileSync(new URL('structure.snapshot.json', V1), 'utf8'));

// 한 번도 지나지 않는 quiet 선(경고 11번)이 있는 원본
const QUIET_SOURCE = 'flow right\nbox a "A"\nbox b "B"\na -> b "보냄" quiet\nb -> a\nstep "s"\n  b -> a\n';

const sourceOf = (name) => readFileSync(new URL(name, V1), 'utf8');

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 구조 요약. 도형, 선, 박자, 계열 수처럼 그리는 방식이 바뀌어도 변하지 않는 숫자만 둔다.
function summarize({ figure, scene, timeline, deprecations }) {
  const beats = figure.steps.flatMap((step) => step.beats);
  const { chart } = figure;
  return {
    kind: figure.kind,
    chartType: figure.chartType ?? null,
    version: figure.version,
    deprecated: deprecations.length,
    shapes: scene ? scene.items.length : 0,
    groups: scene ? scene.groups.length : 0,
    lines: scene ? scene.edges.length : 0,
    steps: figure.steps.length,
    beats: beats.length,
    moves: beats.reduce((sum, beat) => sum + beat.hops.length, 0),
    segments: timeline.segs.length,
    series: chart.series.map((s) => `${s.id}:${s.role}`),
    rows: chart.rows.length,
  };
}

test('compat_v1_every_fixture_builds_with_zero_errors', async () => {
  for (const name of NAMES) {
    await assert.doesNotReject(buildFigure(sourceOf(name), { baseDir: V1.pathname }), name);
  }
});

test('compat_v1_structure_summaries_match_the_snapshot', async () => {
  const actual = {};
  for (const name of NAMES) actual[name] = summarize(await buildFigure(sourceOf(name), { baseDir: V1.pathname }));

  assert.deepEqual(actual, SNAPSHOT);
});

test('compat_v1_has_the_originals_from_main_and_the_old_form_cases', () => {
  const mains = NAMES.filter((name) => name.startsWith('main-'));
  const olds = NAMES.filter((name) => name.startsWith('old-'));

  assert.equal(mains.length, 12);
  assert.ok(olds.includes('old-tone-blue-orange.muto') && olds.some((name) => name.startsWith('old-roles-omitted')));
});

test('compat_v1_old_forms_report_only_deprecated_never_errors_or_warnings', async () => {
  const tones = await buildFigure(sourceOf('old-tone-blue-orange.muto'));

  assert.deepEqual(tones.deprecations.map((d) => d.severity), ['deprecated', 'deprecated']);
  assert.deepEqual(tones.warnings, []);
  for (const name of NAMES.filter((n) => n.startsWith('old-roles-omitted'))) {
    const { deprecations, warnings } = await buildFigure(sourceOf(name));

    assert.deepEqual([deprecations, warnings], [[], []], name);
  }
});

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 고정 묶음 원본 글자 수
// basis: estimate
// 고정 묶음이 쓰는 낱말: 문장 낱말, 그림 종류, 선택 사항 키, 값 없는 낱말, 값.
function usedWords() {
  const used = { heads: new Set(), keys: new Set(), words: new Set(), values: new Set() };
  for (const name of NAMES) {
    let isTimeline = false;
    sourceOf(name).split('\n').forEach((text, i) => {
      const tokens = tokenizeLine(text, i + 1, createProblems());
      if (!tokens.length) return;
      const [head, second] = tokens;
      if (head.type === 'word' && second?.type === 'arrow') used.heads.add(isTimeline ? 'hop' : 'edge');
      else if (head.type === 'word') used.heads.add(head.value);
      if (head.value === 'step') isTimeline = true;
      for (const t of tokens) {
        if (t.type === 'option') [used.keys.add(t.key), used.values.add(t.value)];
        else if (t.type === 'word') used.words.add(t.value);
      }
    });
  }
  return used;
}

test('compat_v1_covers_every_word_option_and_value_in_the_grammar_table', () => {
  const used = usedWords();
  const missing = [];
  for (const word of Object.keys(STATEMENTS)) if (!used.heads.has(word)) missing.push(`statement ${word}`);
  for (const kind of Object.keys(KINDS)) if (!used.heads.has(kind)) missing.push(`kind ${kind}`);
  for (const key of Object.keys(OPTIONS)) {
    const [, name] = key.split('.');
    if (!used.keys.has(name) && !used.words.has(name)) missing.push(`option ${key}`);
  }
  for (const [list, { items }] of Object.entries(VALUES)) {
    for (const name of Object.keys(items)) if (!used.values.has(name) && !used.words.has(name)) missing.push(`value ${list}.${name}`);
  }

  assert.deepEqual(missing, [], 'add a new .muto file to test/fixtures/compat/v1 that uses each missing entry (never edit the existing ones)');
});

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
// CLI를 실행해 { status, stdout, stderr }를 돌려준다.
const cli = (args) => spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli.js', import.meta.url)), ...args], { encoding: 'utf8' });

test('compat_cli_json_keeps_the_old_fields_with_old_values_next_to_the_new_ones', () => {
  const old = cli(['check', new URL('old-tone-blue-orange.muto', V1).pathname, '--json']);
  const folder = mkdtempSync(join(tmpdir(), 'mutoscope-quiet-'));
  const QUIET = join(folder, 'quiet.muto');
  writeFileSync(QUIET, QUIET_SOURCE);
  const quiet = cli(['check', QUIET, '--json']);
  rmSync(folder, { recursive: true, force: true });
  const [first] = old.stdout.trim().split('\n').map((line) => JSON.parse(line));
  const [warning] = quiet.stdout.trim().split('\n').map((line) => JSON.parse(line));

  assert.deepEqual([first.line, first.lines, first.check, first.level], [7, [7], 'syntax', 'warning']);
  assert.deepEqual([first.severity, first.code, first.column, first.fix.text], ['deprecated', 'deprecated-value', 30, 'teal']);
  assert.deepEqual([warning.check, warning.level, warning.lines, warning.severity, warning.code], [11, 'warning', [4], 'warning', 'check-11']);
});

test('compat_cli_old_options_and_exit_codes_still_work', () => {
  const file = new URL('main-bar.muto', V1).pathname;
  const out = mkdtempSync(join(tmpdir(), 'mutoscope-compat-'));
  try {
    assert.equal(cli(['check', file, '--strict', '--json']).status, 0);
    assert.equal(cli(['render', file, '--static', '--html', '--out', out]).status, 0);
    assert.equal(cli(['check', 'missing.muto']).status, 1);
    assert.equal(cli([]).status, 2);
    assert.equal(cli(['check', file, '--unknown']).status, 2);
    writeFileSync(join(out, 'quiet.muto'), QUIET_SOURCE);
    assert.equal(cli(['check', join(out, 'quiet.muto'), '--strict']).status, 1);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
