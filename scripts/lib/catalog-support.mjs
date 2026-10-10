// 예제 원본이 상대 경로로 읽는 자료(사용자 아이콘 파일, JSON 값). 갤러리가 원본과 함께 내려받게 하려고 원본의 낱말에서 모은다.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { posix } from 'node:path';

// cost: time O(n), heap O(f), stack O(1)
// vars: n = 원본 글자 수, f = 자료 파일 수
// basis: estimate
/**
 * 원본이 읽는 자료 파일의 상대 경로 목록(중복 없이 쓰인 순서). `icons 이름 "폴더"`로 등록한 세트의 `icon=이름:파일`은 `폴더/파일.svg`이고, `data "경로"`는 그 경로다.
 * 경로는 예제 폴더 안이어야 한다. 폴더 밖(`..`)이나 절대 경로는 게시한 갤러리에서 풀리지 않으므로 오류다.
 * @param root 자료를 찾는 폴더(예제 폴더). 없는 파일도 오류다
 */
export function supportFiles(source, root) {
  const sets = new Map([...source.matchAll(/^\s*icons\s+(\S+)\s+"([^"]+)"/gm)].map(([, name, folder]) => [name, folder]));
  const files = [
    ...[...source.matchAll(/\bicon=([\w-]+):([\w-]+)/g)].filter(([, set]) => sets.has(set)).map(([, set, name]) => posix.join(sets.get(set), `${name}.svg`)),
    ...[...source.matchAll(/^\s*data\s+"([^"]+)"/gm)].map(([, path]) => posix.normalize(path)),
  ];
  for (const file of files) {
    assert.ok(!posix.isAbsolute(file) && !file.startsWith('..'), `${file} must stay inside the examples folder so the published gallery can resolve it`);
    assert.ok(existsSync(posix.join(root, file)), `${file} is missing from ${root}`);
  }
  return [...new Set(files)];
}
