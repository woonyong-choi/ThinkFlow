// 아이콘 찾기와 읽기. 기본 세트(IBM Carbon 범용 개념과 Simple Icons 기술 브랜드)는 names.json 표 하나에서 이름으로 찾고, `icons` 줄로 등록한 사용자 세트는 폴더의 `<이름>.svg`를 읽는다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeIcon } from './sanitize.js';

/** 이름 앞에 세트를 적지 않았을 때 찾는 세트. 저장소에 파일이 들어 있다. */
export const DEFAULT_SET = 'builtin';
/** 기본 세트의 이름 → 파일 경로(`carbon/…`, `simple-icons/…`, 확장자 없음) 표(names.json). 개념 이름(`server`)과 브랜드 이름(`git`)이 한 표에 있어 서로 겹치지 못한다. */
export const ICON_NAMES = JSON.parse(readFileSync(new URL('./names.json', import.meta.url), 'utf8'));
/** 사용자 세트 안의 아이콘 이름 형식. 폴더 밖으로 나가는 경로를 막는다. */
export const USER_ICON_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

const BUNDLED = new URL('./', import.meta.url);
// 읽은 파일의 정리 결과. 같은 파일을 그림마다 다시 읽지 않는다.
const cache = new Map();

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** `server`나 `nhn:lb`를 { set, name }으로 가른다. 세트를 적지 않으면 기본 세트다. */
export function splitIconRef(ref) {
  const [set, name] = ref.includes(':') ? ref.split(/:(.*)/s) : [DEFAULT_SET, ref];
  return { set, name };
}

// cost: time O(n), heap O(n), stack O(1), io 1
// vars: n = 파일 글자 수
// basis: estimate
/**
 * 아이콘 하나를 읽어 { viewBox, body }로 돌려준다.
 * @param ref { set, name }
 * @param sets 등록한 사용자 세트 목록 { name, path }[]
 * @param baseDir 사용자 세트 경로의 기준 폴더
 * @throws Error 파일이 없거나 SVG를 정리할 수 없을 때
 */
export function loadIcon(ref, sets, baseDir) {
  const file = ref.set === DEFAULT_SET ? fileURLToPath(new URL(`${ICON_NAMES[ref.name]}.svg`, BUNDLED)) : resolve(baseDir, sets.find((s) => s.name === ref.set).path, `${ref.name}.svg`);
  if (!cache.has(file)) cache.set(file, sanitizeIcon(readFileSync(file, 'utf8')));
  return { ...cache.get(file), role: iconRole(ref), name: ref.set === DEFAULT_SET ? ref.name : undefined };
}

// cost: time O(n·f), heap O(n), stack O(1), io n
// vars: n = 도형과 그룹 수, f = 아이콘 파일 글자 수
// basis: estimate
/**
 * 도형과 그룹의 `icon=`을 읽어 iconData({ viewBox, body })로 붙인다. 파일을 못 읽거나 SVG를 정리할 수 없으면 그 줄의 오류다.
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

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 이름 계약은 유지하고 역할색만 고른다. 사용자 세트와 브랜드는 제품 의미를 추측하지 않는다.
function iconRole({ set, name }) {
  if (set !== DEFAULT_SET) return 'custom';
  if (ICON_NAMES[name].startsWith('simple-icons/')) return 'brand';
  if (['db', 'block', 'cache', 'object', 'mq', 'logsearch'].includes(name)) return 'data';
  if (['admin', 'bastion', 'ddos', 'firewall', 'key', 'subnet', 'vpn'].includes(name)) return 'access';
  if (['user', 'notify'].includes(name)) return 'person';
  return 'service';
}
