// md 명령의 장면 구간: 여러 장면을 가진 블록의 둘째 장면부터를 `<details>`로 두는 배치와, 문서에 이미 있는 구간을 알아보는 규칙(docs/design/markdown.md 여러 장면). 파일은 다루지 않는다.
// 구간은 그림 바로 다음 줄(접힌 블록은 접기 끝 표식 다음 줄)에 놓이고 원본 접기의 감싸기와 소유가 따로다. 접기 표식(`torso fold v1`) 안으로 들어가지 않는다.
//   <!-- torso scenes v1 {id} -->    시작 표식
//   <details>                             장면마다 여섯 줄
//   <summary>장면 이름</summary>
//   (빈 줄)
//   ![대체 글](주소)<!-- torso -->
//   (빈 줄)
//   </details>
//   <!-- /torso scenes v1 {id} -->    끝 표식
// 표식 두 줄과 그 사이 모양이 정확히 맞는 것만 이 도구가 만든 구간이다. 그 밖의 `<details>`는 사용자 것이다.
import { contextOf } from './md-blocks.js';
import { isMarkedImage } from './md.js';

const SCENES_VERSION = 'v1';
const START = /^((?:[ \t]*>[ \t]?)*)([ \t]*)<!-- torso scenes (v\d+) ((?:name|n)=[a-z0-9-]+) -->$/;
const END = /^<!-- \/torso scenes (v\d+) ((?:name|n)=[a-z0-9-]+) -->$/;
// 표식처럼 보이지만 온전한 구간에 속하지 않는 줄을 고아 표식으로 알리려고 느슨하게 찾는다.
const MARK_LIKE = /^(?:[ \t]*>)*[ \t]*<!--\s*\/?torso scenes\b/;
const SUMMARY = /^<summary>.*<\/summary>$/;
const GROUP_LINES = 6;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
const markLine = (wrap, id, end = false) => `${wrap}<!-- ${end ? '/' : ''}torso scenes ${SCENES_VERSION} ${id} -->`;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 시작 표식 줄 하나를 읽어 { ctx, version, id }. 표식이 아니면 undefined다. 문맥(인용, 들여쓰기)은 표식 줄 자신의 앞머리에서 읽는다.
function startOf(line) {
  const found = START.exec(line);
  if (!found) return undefined;
  const [, leader, indent, version, id] = found;
  return { ctx: contextOf({ leader, quote: (leader.match(/>/g) ?? []).length, indent }), version, id };
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 구간의 장면 수
// basis: estimate
// 시작 표식 줄 at에서 온전한 구간을 읽어 { start, end, id, count }. 줄 하나라도 모양이 다르면 undefined다.
function parseRegion(lines, at) {
  const head = startOf(lines[at]);
  if (!head || head.version !== SCENES_VERSION) return undefined;
  const { ctx, id } = head;
  for (let count = 0, j = at + 1; j < lines.length; count++, j += GROUP_LINES) {
    const end = END.exec(ctx.content(lines[j]) ?? '');
    if (end) return end[1] === SCENES_VERSION && end[2] === id ? { start: at, end: j, id, count } : undefined;
    const marked = ctx.content(lines[j + 3]);
    const group = ctx.content(lines[j]) === '<details>' && SUMMARY.test(ctx.content(lines[j + 1]) ?? '') && marked !== undefined && isMarkedImage(marked) && ctx.content(lines[j + 5]) === '</details>';
    if (!group || ![j + 2, j + 4].every((i) => ctx.isBlank(lines[i]))) return undefined;
  }
  return undefined;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 문서 줄 수
// basis: estimate
/**
 * 문서에서 장면 구간을 모두 읽는다. 울타리와 들여쓴 코드(code), 앞 줄이 연 끝 조건 있는 HTML 블록 안(opaque: `<pre>`, `<script>`, 주석, CDATA 등)은 사용자 원문이라 읽지 않는다. 둘 다 md-tags.js의 scanDocument가 준다.
 * @returns { regions, tags, errors }. regions는 시작 표식 줄 번호(0부터)에서 { start, end, id, count }로 가는 Map, tags는 구간의 `<details>`와 `</details>` 줄 번호 집합(사용자 details를 셀 때 뺀다),
 *   errors는 온전한 구간에 속하지 않는 표식 줄의 { line, message }(1부터)다. 오류가 있으면 문서를 고치지 않는다.
 */
export function scanRegions(lines, { code, opaque }) {
  const regions = new Map();
  const tags = new Set();
  const owned = new Set();
  const user = (i) => code.has(i) || opaque.has(i);
  lines.forEach((line, i) => {
    const region = user(i) || !START.test(line) ? undefined : parseRegion(lines, i);
    if (!region) return;
    regions.set(i, region);
    owned.add(region.start).add(region.end);
    for (let k = 0; k < region.count; k++) [region.start + 1 + k * GROUP_LINES, region.start + 6 + k * GROUP_LINES].forEach((tag) => tags.add(tag));
  });
  const message = 'this torso scenes mark is not part of an intact scene list. A scene list is the start mark, then for each scene <details>, <summary>, a blank line, the image line, a blank line and </details>, and the end mark with the same id, all with the same indentation. Nothing was changed; repair or delete these lines by hand';
  const errors = lines.flatMap((line, i) => (!user(i) && !owned.has(i) && MARK_LIKE.test(line) ? [{ line: i + 1, message }] : []));
  return { regions, tags, errors };
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 구간의 장면 수
// basis: estimate
/**
 * 구간 하나의 줄들. ctx는 블록의 문맥이고, scenes는 둘째 장면부터 { summary, image }다(summary는 HTML로 이스케이프한 글, image는 이미지 줄 전체).
 * 장면이 없으면 구간도 없다.
 */
export function regionLines({ wrap, blank }, id, scenes) {
  if (!scenes.length) return [];
  const groups = scenes.flatMap(({ summary, image }) => [`${wrap}<details>`, `${wrap}<summary>${summary}</summary>`, blank, image, blank, `${wrap}</details>`]);
  return [markLine(wrap, id), ...groups, markLine(wrap, id, true)];
}
