// 상태 그림: 박자마다 밝아지는 선이 문법의 선(a -> b)과 같다. 처음 점과 끝 겹원 선이 선 번호를 밀면 안 된다.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { buildFigure } from '../src/build.js';

const DIRS = ['../examples/', './fixtures/compat/v1/', './fixtures/layout/'].map((dir) => new URL(dir, import.meta.url));
const STATE_SOURCE = ['state right', 'state a "A"', 'state b "B"', 'state c "C"', 'start a', 'final c', 'a -> b "go"', 'b -> c "end"', 'step "s"', '  a -> b', '  b -> c', ''].join('\n');

// cost: time O(b·h), heap O(b), stack O(1)
// vars: b = 박자 수, h = 박자의 이동 수
// basis: estimate
// 박자마다 이동 줄의 양 끝과 그 이동이 밝히는 선(edgesOn)의 장면 선 끝이 같은지 보고, 어긋난 곳의 설명을 모은다.
function mismatches(result) {
  const { figure, scene, timeline } = result;
  const found = [];
  const beats = figure.steps.flatMap((step) => step.beats).filter((beat) => beat.hops.length);
  let k = 0;
  for (const seg of timeline.segs) {
    if (!seg.hops.length) continue;
    const beat = beats[k++];
    beat.hops.forEach((hop, h) => {
      const edge = scene.edges[seg.hops[h].edge];
      const ends = new Set([edge.from, edge.to]);
      if (!ends.has(hop.from) || !ends.has(hop.to)) found.push(`step ${seg.si} beat ${seg.bi}: ${hop.from} -> ${hop.to} lights ${edge.from} -> ${edge.to}`);
      if (!seg.edgesOn.includes(seg.hops[h].edge)) found.push(`step ${seg.si} beat ${seg.bi}: edge ${seg.hops[h].edge} is not on`);
    });
  }
  return found;
}

test('buildTimeline_state_with_start_and_final_lights_the_edge_the_move_line_names', async () => {
  const result = await buildFigure(STATE_SOURCE, { strict: true });
  assert.deepEqual(mismatches(result), []);
  assert.deepEqual(result.timeline.segs.map((seg) => seg.edgesOn), [[0], [0, 1]]);
});

test('layoutGraph_state_scene_keeps_the_declared_edges_first_and_the_marks_after_them', async () => {
  const { scene } = await buildFigure(STATE_SOURCE, { strict: true });
  assert.deepEqual(scene.edges.map((e) => `${e.from}>${e.to}`), ['a>b', 'b>c', '__start>a', 'c>__final0']);
});

test('buildTimeline_every_state_source_lights_the_edges_its_move_lines_name', async () => {
  let checked = 0;
  for (const dir of DIRS) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.muto'))) {
      const source = readFileSync(new URL(file, dir), 'utf8');
      if (!/^state\b/m.test(source.replace(/^mutoscope.*\n/, ''))) continue;
      assert.deepEqual(mismatches(await buildFigure(source, { baseDir: dir.pathname })), [], file);
      checked += 1;
    }
  }
  assert.ok(checked >= 3, `상태 그림 ${checked}개`);
});
