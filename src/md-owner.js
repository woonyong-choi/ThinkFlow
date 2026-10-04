// md 명령의 소유 판정: 만든 SVG에 넣는 표시와, 이미 있는 SVG가 어느 문서 것인지 가르는 규칙(docs/design/markdown.md 이름과 위치, 오래된 SVG 정리).
// 쓰기 전 확인과 낡은 SVG 삭제가 같은 판정(ownership)을 쓴다.
import { readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

const MARK = /^<!-- (daphnis|mutoscope) md (v2 )?(.+) -->$/;
// 표시 글의 판 번호. 판 번호 없는 옛 표시는 `%`를 인코딩하지 않아 새 표시와 글자가 겹칠 수 있어 따로 다룬다.
const VERSION = 'v2';

// cost: time O(d), heap O(d), stack O(d), io d
// vars: d = 경로 깊이
// basis: estimate
/** 심볼릭 링크를 풀어 낸 실제 경로. 아직 없는 뒷부분은 있는 가장 깊은 폴더까지만 풀고 그대로 붙인다. */
export function realPath(path) {
  const full = resolve(path);
  try {
    return realpathSync(full);
  } catch {
    const parent = dirname(full);
    return parent === full ? full : join(realPath(parent), basename(full));
  }
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 경로 글자 수
// basis: estimate
// 경로를 XML 주석 안에 넣을 수 있고 되돌릴 수 있게 쓴다. `%`를 먼저 `%25`로, 줄바꿈을 `%0A`, `%0D`로, 그다음 `--`가 될 `-`의 앞쪽을 `%2D`로 바꾼다. `%`, 줄바꿈, 연속 `-`가 없는 경로는 글자가 그대로다.
const encode = (raw) => raw.replace(/%/g, '%25').replace(/\n/g, '%0A').replace(/\r/g, '%0D').replace(/-(?=-)/g, '%2D');

// cost: time O(d + n), heap O(n), stack O(1), io d
// vars: d = 경로 깊이, n = 경로 글자 수
// basis: estimate
/**
 * 문서의 소유 이름 { raw, text }. SVG 폴더에서 문서까지의 상대 경로(구분자 `/`)이고 둘 다 실제 경로로 푼 뒤 잰다.
 * 같은 SVG 폴더를 쓰는 문서끼리는 경로가 늘 달라 소유가 갈리고, 실행 위치와 링크 별칭에 영향받지 않는다.
 * raw는 풀어 쓴 경로, text는 표시에 넣는 인코딩이다.
 */
export function ownerOf(file, outDir) {
  const raw = relative(realPath(outDir), realPath(file)).split(sep).join('/');
  return { raw, text: encode(raw) };
}

/** 이 문서에서 만든 SVG라는 표시 한 줄. */
export const svgMark = (owner) => `<!-- daphnis md ${VERSION} ${owner.text} -->`;

// cost: time O(n), heap O(n), stack O(1), io 1
// vars: n = 파일 글자 수
// basis: estimate
// 이미 있는 SVG의 표시 { name, versioned, text }. 앞 세 줄에서 찾고, 표시가 없거나 읽지 못하면 undefined다.
function markOf(path) {
  let head;
  try {
    head = readFileSync(path, 'utf8').split('\n', 3);
  } catch {
    return undefined;
  }
  for (const line of head) {
    const found = MARK.exec(line.replace(/\r$/, ''));
    if (found) return { name: found[1], versioned: Boolean(found[2]), text: found[3] };
  }
  return undefined;
}

// cost: time O(n), heap O(n), stack O(1), io 1
// vars: n = 파일 글자 수
// basis: estimate
/**
 * 이미 있는 SVG가 이 문서 것인지 판정한다. kind는 'mine', 'other'(다른 문서나 소유를 정할 수 없는 옛 표시, text를 함께 돌려줌), 'unmarked'(표시 없는 파일)다.
 * 판 번호가 있는 표시는 표시 글이 이 문서의 표시 글과 같을 때만 이 문서 것이다.
 * 판 번호 없는 옛 표시(`daphnis md`, `mutoscope md`)는 `%`를 인코딩하지 않아 `x--y`와 `x%2D-y` 같은 경로를 가를 수 없다. 표시 글에 `%`가 없고 이 문서의 경로와 글자가 같을 때만 이 문서 것이고, 그 밖에는 다른 후보 문서가 지금 디스크에 있는지와 무관하게 소유를 정하지 않는다.
 */
export function ownership(path, owner) {
  const mark = markOf(path);
  if (!mark) return { kind: 'unmarked' };
  const same = mark.versioned ? mark.text === owner.text : !mark.text.includes('%') && mark.text === owner.raw;
  return same ? { kind: 'mine' } : { kind: 'other', text: mark.text };
}
