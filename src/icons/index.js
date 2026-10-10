// 공통 디자인의 아이콘 이름과 별칭을 읽는다. 사용자 세트의 파일 경계와 SVG 정리는 이 렌더러가 소유한다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { sanitizeIcon } from './sanitize.js';
import { getIconCatalog, readIcon } from '../vendor/theme/ui/build/icons.mjs';

const CATALOG = getIconCatalog();
export const DEFAULT_SET = 'builtin';
export const ICON_NAMES = Object.freeze(Object.fromEntries([
  ...Object.entries(CATALOG.icons).map(([name, icon]) => [name, icon.category === 'brands' ? 'brand' : 'concept']),
  ...Object.entries(CATALOG.aliases).map(([name, target]) => [name, CATALOG.icons[target].category === 'brands' ? 'brand' : 'concept']),
]));
/** 사용자 세트 안의 아이콘 이름 형식. 폴더 밖으로 나가는 경로를 막는다. */
export const USER_ICON_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

// 읽은 파일의 정리 결과. 같은 파일을 그림마다 다시 읽지 않는다.
const cache = new Map();

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** `server`나 `nhn:lb`를 { set, name }으로 가른다. 세트를 적지 않으면 기본 세트다. */
export function splitIconRef(ref) {
  const [set, name] = ref.includes(':') ? ref.split(/:(.*)/s) : [DEFAULT_SET, ref];
  return { set, name };
}

// cost: time O(n·f), heap O(n), stack O(1), io n
// vars: n = 도형과 그룹 수, f = 아이콘 파일 글자 수
// basis: estimate
/**
 * 도형과 그룹의 `icon=`을 읽어 iconData로 붙인다. 파일을 못 읽거나 SVG를 정리할 수 없으면 그 줄의 오류다.
 * 그린 아이콘이 없는 도형은 범주색과 글자 배지가 대신한다(docs/design/layout.md 아이콘).
 */
export function attachIcons(figure, baseDir, problems) {
  for (const item of [...figure.nodes, ...figure.groups]) {
    if (item.icon === undefined) continue;
    try {
      item.iconData = loadIcon(splitIconRef(item.icon), figure.iconSets, baseDir);
    } catch (error) {
      problems.error(item.line, `cannot use icon "${item.icon}": ${error.code === 'ENOENT' ? 'the file does not exist' : error.message}`);
    }
  }
}

// cost: time O(n), heap O(n), stack O(1), io 1
// vars: n = 파일 글자 수
// basis: estimate
/**
 * 내장 아이콘은 공통 SVG 원본, 사용자 아이콘은 검증한 body를 역할과 함께 돌려준다.
 * @param ref { set, name }
 * @param sets 등록한 사용자 세트 목록 { name, path }[]
 * @param baseDir 사용자 세트 경로의 기준 폴더
 * @throws Error 파일이 없거나 SVG를 정리할 수 없을 때
 */
function loadIcon(ref, sets, baseDir) {
  if (ref.set !== DEFAULT_SET) return { ...readSvg(resolve(baseDir, sets.find((s) => s.name === ref.set).path, `${ref.name}.svg`)), role: 'custom' };
  return { svg: readIcon(ref.name), role: ICON_NAMES[ref.name] };
}

// cost: time O(n), heap O(n), stack O(1), io 1
// vars: n = 파일 글자 수
// basis: estimate
// 파일 하나를 정리해 읽는다. 같은 파일은 한 번만 읽는다.
function readSvg(file) {
  if (!cache.has(file)) cache.set(file, sanitizeIcon(readFileSync(file, 'utf8')));
  return cache.get(file);
}
