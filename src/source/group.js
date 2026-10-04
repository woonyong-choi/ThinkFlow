// 그룹 선언(`group id "이름" [direction=down] [border=dashed] [badge="LB"] [icon=server] [fill=red] [stroke=red] {`)과 닫는 `}`를 읽는다.
import { checkId, currentGroup, rejectName } from './names.js';
import { readOptions } from './options.js';
import { ID_PATTERN } from './words.js';

// 흐름 그림에서만 쓰는 선택 사항
const FLOW_ONLY = ['badge', 'icon', 'border'];

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
  checkGroupOptions(found, line, ctx);
  const { direction, border, badge, icon, fill, stroke } = found;
  const group = { id: id.value, label: label?.value ?? '', direction, border, badge, icon, fill, stroke, parent: currentGroup(ctx), line, hasError: openAt !== rest.length - 1 };
  ctx.figure.groups.push(group);
  ctx.groups.push(group);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선택 사항끼리 맞는지 본다. 꾸밈은 흐름 그림에서만 쓴다.
function checkGroupOptions(found, line, ctx) {
  const { problems, figure } = ctx;
  const outside = FLOW_ONLY.filter((key) => found[key] !== undefined);
  if (figure.kind !== 'flow' && outside.length) problems.error(line, `${outside.join(', ')} belongs to flow figures only`);
}

/** `}`로 그룹이나 테이블을 닫는다. */
export function closeGroup({ tokens, line }, ctx) {
  if (tokens.length > 1) ctx.problems.error(line, 'put "}" on its own line');
  if (!ctx.groups.length) ctx.problems.error(line, 'there is no open group to close');
  else ctx.groups.pop();
}
