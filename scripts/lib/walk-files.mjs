// 검사할 파일을 찾고 정렬하는 함수들. check-tokens.mjs가 쓴다.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { CSS_EXTS, SCRIPT_EXTS, SKIP_DIRS, TOKEN_FILES } from './tokens-patterns.mjs';

// cost: time O(f), heap O(d), stack O(d), io f
// vars: f = 파일 수, d = 폴더 깊이
// basis: estimate
/** 검사할 파일 경로. 폴더는 정렬 순서로 내려가고, 한 폴더의 파일을 하위 폴더보다 먼저 낸다. */
export function* iterFiles(targets) {
  for (const target of targets) {
    if (isFile(target)) {
      yield target;
      continue;
    }
    if (isDirectory(target)) yield* walkFiles(target);
  }
}

// cost: time O(f), heap O(d), stack O(d), io f
// vars: f = 폴더 아래 파일 수, d = 폴더 깊이
// basis: estimate
export function* walkFiles(folder) {
  const { files, dirs } = listFolder(folder);
  for (const name of files) {
    const ext = extname(name).toLowerCase();
    if (!TOKEN_FILES.has(name) && (CSS_EXTS.has(ext) || SCRIPT_EXTS.has(ext))) yield joinPath(folder, name);
  }
  for (const name of dirs) {
    if (!SKIP_DIRS.has(name)) yield* walkFiles(joinPath(folder, name));
  }
}

// cost: time O(e log e), heap O(e), stack O(1), io 1
// vars: e = 폴더 항목 수
// basis: estimate
/** 폴더의 파일 이름과 하위 폴더 이름을 정렬해 돌려준다. */
function listFolder(folder) {
  const files = [];
  const dirs = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    (entry.isDirectory() ? dirs : files).push(entry.name);
  }
  return { files: files.sort(compareText), dirs: dirs.sort(compareText) };
}

// cost: time O(f + h), heap O(d), stack O(d), io f + h
// vars: f = 대상 아래 파일 수, h = 저장소 루트까지 상위 폴더 수, d = 폴더 깊이
// basis: estimate
/** 대상 폴더 아래, 없으면 저장소 루트(.git이 있는 폴더)까지 위로 올라가며 tokens.json을 찾는다. */
export function findTokensFile(targets) {
  for (const target of targets) {
    let folder = resolve(isDirectory(target) ? target : dirname(target));
    const below = findBelow(folder);
    if (below) return below;
    for (;;) {
      const candidate = join(folder, 'tokens.json');
      if (existsSync(candidate)) return candidate;
      const parent = dirname(folder);
      if (isDirectory(join(folder, '.git')) || parent === folder) break;
      folder = parent;
    }
  }
  return null;
}

// cost: time O(f), heap O(d), stack O(d), io f
// vars: f = 폴더 아래 항목 수, d = 폴더 깊이
// basis: estimate
/** 폴더와 그 아래(건너뛰는 폴더 제외)에서 처음 만나는 tokens.json. */
function findBelow(folder) {
  if (!isDirectory(folder)) return null;
  const { files, dirs } = listFolder(folder);
  if (files.includes('tokens.json')) return join(folder, 'tokens.json');
  for (const name of dirs) {
    if (SKIP_DIRS.has(name)) continue;
    const found = findBelow(join(folder, name));
    if (found) return found;
  }
  return null;
}

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
export function isFile(path) {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}

// cost: time O(1), heap O(1), stack O(1), io 1
// basis: estimate
export function isDirectory(path) {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

// cost: time O(g), heap O(g), stack O(1)
// vars: g = 경로 글자 수
// basis: estimate
/** 폴더와 이름을 잇는다. 사용자가 준 폴더 표기(`./src`)를 그대로 남긴다. */
export function joinPath(folder, name) {
  return folder.endsWith('/') ? `${folder}${name}` : `${folder}/${name}`;
}

// cost: time O(g), heap O(1), stack O(1)
// vars: g = 글자 수
// basis: estimate
/** 코드 포인트 순서 비교. */
export function compareText(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
