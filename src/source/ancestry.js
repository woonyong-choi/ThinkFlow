// 부모 사슬을 따라가는 곳이 함께 쓰는 순환 방어. 그룹 부모가 서로를 가리키면 사슬이 끝나지 않아 멈추는 대신 오류로 끝낸다.
import assert from 'node:assert/strict';

// cost: time O(limit), heap O(limit), stack O(1)
// vars: limit = 부모가 될 수 있는 항목 수
// basis: estimate
/**
 * start에서 시작해 next(id)로 위로 올라가며 거친 id 목록(start 포함, 끝은 부모가 없는 곳)을 돌려준다.
 * 사슬이 limit보다 길어지면 같은 id를 되밟은 것이라 부모 순환 오류를 던진다.
 * @param next id의 부모 id를 돌려주는 함수. 없으면 undefined
 */
export function walkUp(start, next, limit) {
  const chain = [];
  for (let id = start; id !== undefined; id = next(id)) {
    chain.push(id);
    assert.ok(chain.length <= limit, `parent cycle through "${id}"`);
  }
  return chain;
}
