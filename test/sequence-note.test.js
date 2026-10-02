// 순서 그림에서 메모 상자가 같은 행의 화살표와 그 라벨을 가리지 않는다(docs/design/layout.md 순서 그림 배치).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { buildFigure } from '../src/build.js';
import { checkFigure } from '../src/check.js';
import { CHIP_CLEAR } from '../src/chip.js';
import { sizePill } from '../src/measure/sizes.js';
import { createProblems } from '../src/source/problems.js';

const EXAMPLES = new URL('../examples/', import.meta.url);
const FIXTURES = new URL('./fixtures/layout/', import.meta.url);
const COMPAT = new URL('./fixtures/compat/v1/', import.meta.url);

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// cost: time O(n·e·p), heap O(n), stack O(1)
// vars: n = 메모 수, e = 같은 행 선 수, p = 경로 점 수
// basis: estimate
// 메모 상자와, 같은 행 화살표(선 두께 포함)와 라벨 알약이 닿는 쌍. 간격은 CHIP_CLEAR를 지킨다.
function collisions(scene) {
  const hits = [];
  for (const note of scene.notes) {
    const padded = { x: note.x - CHIP_CLEAR, y: note.y - CHIP_CLEAR, w: note.w + CHIP_CLEAR * 2, h: note.h + CHIP_CLEAR * 2 };
    for (const edge of scene.edges.filter((e) => e.index === note.m)) {
      const pill = sizePill(edge.label);
      const label = { x: edge.labelAt.x - pill.w / 2, y: edge.labelAt.y - pill.h / 2, w: pill.w, h: pill.h };
      if (overlaps(padded, label)) hits.push(`${note.text} / label ${edge.label}`);
      const xs = edge.points.map((p) => p.x);
      const ys = edge.points.map((p) => p.y);
      const line = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      if (overlaps(padded, line)) hits.push(`${note.text} / arrow ${edge.from} -> ${edge.to}`);
    }
  }
  return hits;
}

const sequenceSources = () =>
  [EXAMPLES, FIXTURES, COMPAT].flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.muto')).map((f) => ({ file: f, source: readFileSync(new URL(f, dir), 'utf8') }))).filter(({ source }) => /^sequence\b/m.test(source.replace(/^mutoscope.*\n/, '')));

test('layoutSequence_every_sequence_source_keeps_notes_clear_of_the_same_row_arrow_and_label', async () => {
  const sources = sequenceSources();
  assert.ok(sources.length >= 2, `순서 그림 ${sources.length}개`);
  for (const { file, source } of sources) {
    const { scene } = await buildFigure(source, { strict: true });
    assert.deepEqual(collisions(scene), [], file);
  }
});

test('layoutSequence_note_on_the_sender_stacks_above_the_arrow_label_instead_of_covering_it', async () => {
  const source = ['sequence', 'box a "호출"', 'box b "응답"', 'step "s" "c"', '  a -> b "긴 요청 라벨이 있는 메시지"', '  note a "보내는 쪽 메모가 화살표 위를 지나간다"', ''].join('\n');
  const { scene } = await buildFigure(source, { strict: true });
  assert.deepEqual(collisions(scene), []);
  const [note] = scene.notes;
  assert.ok(note.y + note.h < scene.edges[0].labelAt.y, '메모가 라벨 위에 있다');
});

test('layoutSequence_note_beside_the_arrow_keeps_one_row_height', async () => {
  const source = ['sequence', 'box a "호출"', 'box b "응답"', 'step "s" "c"', '  a -> b "요청"', '  note b "받는 쪽 메모"', ''].join('\n');
  const { scene } = await buildFigure(source, { strict: true });
  assert.deepEqual(collisions(scene), []);
  const [note] = scene.notes;
  assert.ok(note.y < scene.edges[0].points[0].y, '메모와 화살표가 같은 행에 놓인다');
});

const FIGURE = ['sequence', 'box a "호출"', 'box b "응답"', 'box c "저장"', 'step "s" "c"', '  a -> b "요청 라벨"', '  note a "메모"', '  b -> c "저장 요청"', ''].join('\n');

// cost: time O(check), heap O(s), stack O(1)
// vars: check = 그림 검사 시간, s = 도형 수
// basis: estimate
// 장면의 메모를 옮겨 만든 겹침을 그림 검사가 알리는지 본다. 배치가 겹침을 만들지 않으므로 장면을 직접 고친다.
async function checkMoved(move) {
  const { figure, scene, timeline } = await buildFigure(FIGURE, { strict: true });
  move(scene);
  const problems = createProblems(FIGURE);
  checkFigure({ figure, scene, timeline }, problems);
  return [...problems.errors, ...problems.warnings].filter((d) => d.code === 'check-12');
}

test('checkFigure_note_laid_over_the_row_label_or_arrow_is_check_12_error', async () => {
  const found = await checkMoved((scene) => {
    const [label] = scene.edges;
    Object.assign(scene.notes[0], { x: label.labelAt.x - scene.notes[0].w / 2, y: label.labelAt.y - scene.notes[0].h / 2 });
  });
  assert.ok(found.some((d) => d.severity === 'error' && /covers the label "요청 라벨"/.test(d.message)), JSON.stringify(found));
  assert.ok(found.some((d) => d.severity === 'error' && /covers the arrow of message a -> b/.test(d.message)));
});

test('checkFigure_note_outside_the_figure_is_check_12_error_and_crossing_a_lifeline_is_a_warning', async () => {
  const outside = await checkMoved((scene) => { scene.notes[0].x = -50; });
  assert.ok(outside.some((d) => d.severity === 'error' && /leaves the figure/.test(d.message)));
  const crossing = await checkMoved((scene) => {
    const other = scene.lifelines.find((l) => l.id === 'c');
    scene.notes[0].x = other.x - 10;
    scene.notes[0].y = other.y1 + 1;
  });
  assert.ok(crossing.some((d) => d.severity === 'warning' && /crosses the lifeline of "c"/.test(d.message)), JSON.stringify(crossing));
});

test('layoutSequence_self_message_note_on_the_first_participant_stays_inside_the_figure', async () => {
  const source = ['sequence', 'box a "A"', 'box b "B"', 'step "s"', '  a -> a "자기 호출"', '  note a "왼쪽 첫 참여자의 아주 긴 메모가 왼쪽으로 삐져나가는지 본다 이 글은 길다"', '  a -> b "요청"', ''].join('\n');
  const { scene } = await buildFigure(source, { strict: true });
  assert.ok(scene.notes[0].x >= 0);
  assert.deepEqual(collisions(scene), []);
});
