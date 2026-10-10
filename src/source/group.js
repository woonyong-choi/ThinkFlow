// 그룹 선언(`group id "이름" [direction=down] [border=dashed] [badge="LB"] [icon=server] [tone=red] [appearance=plain|filled|outline] {`)과 닫는 `}`를 읽는다.
import { checkId, parentFor, rejectName } from './names.js';
import { readLook, readOptions } from './options.js';
import { ID_PATTERN } from './words.js';

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `group id "이름" [선택 사항...] {`
export function readGroup({ tokens, line }, ctx) {
  const [, id, label, ...rest] = tokens;
  if (!checkId(id, { line, ctx }, ID_PATTERN)) {
    rejectName(id, ctx);
    // 닫는 `}`가 짝을 찾도록 자리만 연다.
    if (tokens.at(-1).type === 'open') ctx.groups.push({ isRejected: true, line });
    return;
  }
  if (label?.type !== 'text') ctx.problems.error(line, `write group as: group ${id.value} "name" {`);
  const openAt = rest.findIndex((t) => t.type === 'open');
  if (openAt === -1) ctx.problems.error(line, 'end the group line with "{"');
  else if (openAt < rest.length - 1) ctx.problems.error(line, 'end the group line with "{" and put the group contents on the next lines');
  const found = readOptions(openAt === -1 ? rest : rest.slice(0, openAt), { scopes: ['group'], what: 'a group', line, ctx });
  const { direction, border, badge, icon } = found;
  const group = { id: id.value, label: label?.value ?? '', direction, border, badge, icon, ...readLook(found, { line, ctx }), parent: parentFor(id, ctx), line, hasError: openAt !== rest.length - 1 };
  ctx.figure.groups.push(group);
  ctx.groups.push(group);
}

/** `}`로 그룹이나 테이블을 닫는다. */
export function closeGroup({ tokens, line }, ctx) {
  if (tokens.length > 1) ctx.problems.error(line, 'put "}" on its own line');
  if (!ctx.groups.length) ctx.problems.error(line, 'there is no open group to close');
  else ctx.groups.pop();
}
