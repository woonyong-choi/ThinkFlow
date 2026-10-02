// 사용자 이름과 배치 내부 이름이 부딪히지 않는다. 내부 이름은 원본 이름 규칙(소문자, 숫자, `-`)에 없는 `_`를 쓴다.
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFigure } from '../src/build.js';

test('layoutGraph_node_named_root_is_laid_out_like_any_other_name', async () => {
  const source = ['flow right', 'box root "루트"', 'box leaf "잎"', 'root -> leaf "내려감"', 'step "s"', '  root -> leaf', ''].join('\n');
  const { scene } = await buildFigure(source, { strict: true });
  assert.deepEqual(scene.items.map((it) => it.id), ['root', 'leaf']);
  assert.ok(scene.items[0].x < scene.items[1].x);
});

test('layoutGraph_group_and_node_named_root_inside_a_group_still_build', async () => {
  const source = ['flow down', 'group tree "계층" {', '  external root "루트 서버" "."', '  external tld "TLD 서버" ".com"', '}', 'box resolver "리졸버"', 'resolver -> root "질의"', 'resolver -> tld "질의"', ''].join('\n');
  const { scene } = await buildFigure(source, { strict: true });
  assert.equal(scene.groups.length, 1);
  assert.equal(scene.edges.length, 2);
});

test('layoutGraph_group_named_root_keeps_its_children_and_parent', async () => {
  const source = ['flow right', 'group root "그룹" {', '  box a "A"', '  box b "B"', '}', 'a -> b', ''].join('\n');
  const { scene } = await buildFigure(source, { strict: true });
  assert.equal(scene.groups[0].id, 'root');
  assert.ok(scene.items.every((it) => it.parent === 'root'));
});
