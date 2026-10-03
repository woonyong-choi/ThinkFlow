// `icons 이름 "폴더"`(사용자 아이콘 세트 등록)와 도형, 그룹의 `icon=` 이름 확인. 이름은 기본 세트의 개념 이름이거나 `세트:이름`이다(docs/design/layout.md 아이콘).
import { DEFAULT_SET, ICON_NAMES, USER_ICON_PATTERN, splitIconRef } from '../icons/index.js';
import { checkId } from './names.js';
import { unknownName } from './problems.js';
import { ID_PATTERN } from './words.js';

// cost: time O(s), heap O(1), stack O(1)
// vars: s = 등록한 세트 수
// basis: estimate
/** `icons 이름 "폴더"` 한 줄. 세트 이름은 이 파일 안에서 하나뿐이고 기본 세트 이름은 쓰지 못한다. */
export function readIcons({ tokens, line }, ctx) {
  const [, name, path, ...extra] = tokens;
  const { problems, figure } = ctx;
  if (!checkId(name, { line, ctx }, ID_PATTERN)) return;
  if (path?.type !== 'text' || extra.length) {
    problems.error(line, `write icons as: icons ${name.value} "folder"`);
    return;
  }
  const known = figure.iconSets.find((s) => s.name === name.value);
  if (name.value === DEFAULT_SET) problems.error(line, `"${DEFAULT_SET}" is the built-in icon set. Pick another name for your set`);
  else if (known) problems.error(line, `the icon set "${name.value}" is already registered (line ${known.line})`);
  else figure.iconSets.push({ name: name.value, path: path.value, line });
}

// cost: time O(n + g), heap O(1), stack O(1)
// vars: n = 도형 수, g = 그룹 수
// basis: estimate
/** 도형과 그룹의 `icon=` 이름이 기본 세트의 이름이거나 등록한 세트의 이름 모양인지 본다. 파일은 만들 때 읽는다(build.js). */
export function checkIcons(figure, problems) {
  for (const item of [...figure.nodes, ...figure.groups]) {
    if (item.icon === undefined) continue;
    const { set, name } = splitIconRef(item.icon);
    if (set === DEFAULT_SET) {
      if (!Object.hasOwn(ICON_NAMES, name)) problems.error(item.line, `${unknownName('icon', name, Object.keys(ICON_NAMES))}. Drop icon= and mark the shape with badge instead`);
    } else if (!figure.iconSets.some((s) => s.name === set)) {
      problems.error(item.line, `${unknownName('icon set', set, [DEFAULT_SET, ...figure.iconSets.map((s) => s.name)])}. Register it first: icons ${set} "folder"`);
    } else if (!USER_ICON_PATTERN.test(name)) {
      problems.error(item.line, `"${name}" is not an icon file name in set "${set}". Use letters, digits, "-" and "_"`);
    }
  }
}
