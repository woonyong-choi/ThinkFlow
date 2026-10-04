// design-tokens 패키지(공통 의미·기본 토큰)의 정본을 읽고, daphnis 정본과 이름이 겹치는지 찾는다.
// 설치가 안 되어 있으면 읽지 못하므로 `npm ci`부터 한다.
import { createRequire } from 'node:module';
import { readJson } from './read-json.mjs';

const PACKAGE = '@woonyong-choi/design-tokens';

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
/** 설치된 패키지의 정본 파일 경로 둘. 설치가 없으면 안내와 함께 오류를 던진다. */
export function commonTokenPaths() {
  const require = createRequire(import.meta.url);
  try {
    return { light: require.resolve(`${PACKAGE}/source`), dark: require.resolve(`${PACKAGE}/source-dark`) };
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    throw new Error(`${PACKAGE} is not installed: run npm ci`);
  }
}

// cost: time O(n), heap O(n), stack O(d), io 2
// vars: n = 정본 글자 수, d = 묶음 깊이
// basis: estimate
/** 공통 토큰 정본을 키 순서를 지키는 Map 둘(light, dark)로 읽는다. */
export function readCommonTokens() {
  const { light, dark } = commonTokenPaths();
  return { light: readJson(light), dark: readJson(dark) };
}

// cost: time O(t), heap O(t), stack O(d)
// vars: t = 토큰 수, d = 묶음 깊이
// basis: estimate
/** 정본(Map)의 토큰 이름(`color.fg`)을 모두 모은다. */
export function tokenNames(node, path = [], out = new Set()) {
  for (const [key, child] of node) {
    if (key.startsWith('$') || !(child instanceof Map)) continue;
    if (child.has('$value')) out.add([...path, key].join('.'));
    else tokenNames(child, [...path, key], out);
  }
  return out;
}

// cost: time O(t), heap O(t), stack O(d)
// vars: t = 두 정본의 토큰 수, d = 묶음 깊이
// basis: estimate
/** daphnis 정본(`local.light`, `local.dark`)이 공통 토큰과 같은 이름으로 다시 정의한 토큰 이름 목록(정렬, 중복 없음). */
export function findRedefined(local, common) {
  const commonNames = tokenNames(common.light);
  const localNames = new Set([...tokenNames(local.light), ...tokenNames(local.dark)]);
  return [...localNames].filter((name) => commonNames.has(name)).sort();
}
