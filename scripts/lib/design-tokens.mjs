// 검증된 테마 배포본을 읽고 렌더러 토큰과 이름이 겹치는지 찾는다.
import { fileURLToPath } from 'node:url';
import { verifyTheme } from '../theme-snapshot.mjs';
import { readJson } from './read-json.mjs';

// cost: time O(n), heap O(n), stack O(1), io f
// vars: n = 테마 바이트 수, f = 테마 파일 수
// basis: estimate
/** 해시 검증을 통과한 공통 토큰 파일 경로 둘을 반환한다. */
export function commonTokenPaths() {
  const meta = verifyTheme();
  if (meta.id !== 'base') throw new Error('daphnis requires the base theme');
  return {
    light: fileURLToPath(new URL('../../src/design-theme/renderer.tokens.json', import.meta.url)),
    dark: fileURLToPath(new URL('../../src/design-theme/renderer.tokens.dark.json', import.meta.url)),
  };
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
