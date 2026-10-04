// 도형 선언(`box id "이름" ["부제"] [shape=circle|tile] [badge="LB"] [icon=server] [count=3] [fill=red] [stroke=red]`)을 읽는다.
import { STATEMENTS, optionsOf } from './grammar.js';
import { checkId, parentFor, rejectName } from './names.js';
import { readOptions } from './options.js';
import { ID_PATTERN } from './words.js';

// 흐름 그림에서만 쓰는 꾸밈 선택 사항. 다른 그림 종류에서는 쓰지 못한다.
const FLOW_ONLY = ['badge', 'icon', 'count'];

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `box id "이름" ["부제"] [선택 사항...]`. 사람, 갈림길, 상태는 부제가 없다. 선택 사항은 도형 낱말의 scopes가 정한다(모양 shape는 box만, 원은 부제가 없다).
export function readNode({ tokens, line }, ctx) {
  const [head, id, label, ...tail] = tokens;
  const shape = head.value;
  const takesSub = STATEMENTS[shape].node.hasSub;
  if (!checkId(id, { line, ctx }, ID_PATTERN)) return rejectName(id, ctx);
  if (label?.type !== 'text') {
    ctx.problems.error(line, `write ${shape} as: ${shape} ${id.value} "${shape === 'decision' ? 'question' : 'name'}"`);
    return;
  }
  const scopes = STATEMENTS[shape].scopes ?? [];
  const known = new Set(scopes.flatMap((s) => Object.keys(optionsOf(s))));
  const options = tail.filter((t) => t.type === 'option' && known.has(t.key));
  const [sub, ...rest] = tail.filter((t) => !options.includes(t));
  if (sub && (sub.type !== 'text' || !takesSub)) ctx.problems.error(line, takesSub ? 'the subtitle must be quoted text' : `${shape} takes no subtitle`);
  if (rest.length) ctx.problems.error(line, `${shape} takes no more words or options`);
  const found = readOptions(options, { scopes, what: `a ${shape}`, line, ctx });
  const isTile = found.shape === 'tile';
  const form = found.shape === 'rect' || isTile ? undefined : found.shape;
  checkNodeOptions({ found, form, sub, line }, ctx);
  const { badge, icon, count, fill, stroke } = found;
  ctx.figure.nodes.push({ id: id.value, shape: form ?? shape, label: label.value, sub: sub?.type === 'text' ? sub.value : undefined, badge, icon, count, fill, stroke, tile: isTile || undefined, parent: parentFor(id, ctx), line });
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선택 사항끼리 맞는지 본다. 원은 이름만 받고, 타일은 아이콘이 있어야 하고, 꾸밈 선택 사항은 흐름 그림에서만 쓴다.
function checkNodeOptions({ found, form, sub, line }, ctx) {
  const { problems, figure } = ctx;
  if (form === 'circle' && sub) problems.error(line, 'a circle takes a name only. Remove the subtitle or shape=circle');
  if (form === 'circle' && (found.badge !== undefined || found.icon !== undefined)) problems.error(line, 'a circle takes a name only. Remove the badge or icon, or use a rectangle');
  if (found.shape === 'tile' && found.icon === undefined) problems.error(line, 'a tile is an icon card. Add icon=name or use a rectangle');
  const outside = FLOW_ONLY.filter((key) => found[key] !== undefined);
  if (figure.kind !== 'flow' && outside.length) problems.error(line, `${outside.join(', ')} belongs to flow figures only`);
}
