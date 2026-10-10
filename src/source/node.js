// 도형 선언(`box id "이름" ["부제"] [shape=circle|tile] [badge="LB"] [icon=server] [count=3] [tone=red] [appearance=plain|filled|outline]`)을 읽는다.
import { CARD_SHAPES, STATEMENTS } from './grammar.js';
import { checkId, parentFor, rejectName, skipBlock } from './names.js';
import { readLook, readOptions } from './options.js';
import { ID_PATTERN } from './words.js';

// 사람 카드가 따로 고르지 않을 때 쓰는 의미 아이콘. 모든 카드가 같은 틀과 머리를 쓰고, 사람은 이 아이콘으로 가른다.
const PERSON_ICON = 'user';

// cost: time O(t), heap O(1), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `box id "이름" ["부제"] [선택 사항...]`. 사람, 갈림길, 상태는 부제가 없다. 선택 사항은 도형 낱말의 scopes가 정한다(모양 shape는 box만, 원은 부제가 없다).
export function readNode(statement, ctx) {
  const { tokens, line } = statement;
  const [head, id, label, ...tail] = tokens;
  const hasBody = tail.at(-1)?.type === 'open';
  if (hasBody) tail.pop();
  const shape = head.value;
  const takesSub = STATEMENTS[shape].node.hasSub;
  if (!checkId(id, { line, ctx }, ID_PATTERN)) {
    rejectName(id, ctx);
    skipBlock('card', {}, statement, ctx);
    return;
  }
  if (label?.type !== 'text') {
    ctx.problems.error(line, `write ${shape} as: ${shape} ${id.value} "${shape === 'decision' ? 'question' : 'name'}"`);
    skipBlock('card', {}, statement, ctx);
    return;
  }
  const scopes = STATEMENTS[shape].scopes ?? [];
  const options = tail.filter((t) => t.type === 'option');
  const [sub, ...rest] = tail.filter((t) => !options.includes(t));
  if (sub && (sub.type !== 'text' || !takesSub)) ctx.problems.error(line, takesSub ? 'the subtitle must be quoted text' : `${shape} takes no subtitle`);
  if (rest.length) ctx.problems.error(line, `${shape} takes no more words or options`);
  const found = readOptions(options, { scopes, what: `a ${shape}`, line, ctx });
  const isTile = found.shape === 'tile';
  const form = found.shape === 'rect' || isTile ? undefined : found.shape;
  checkNodeOptions({ found, form, sub, line }, ctx);
  const { badge, count } = found;
  const look = readLook(found, { line, ctx });
  const icon = found.icon ?? (shape === 'person' ? PERSON_ICON : undefined);
  const queue = shape === 'queue' ? readQueue({ found, id: id.value, label: label.value, line }, ctx) : undefined;
  const card = { id: id.value, shape: form ?? shape, label: label.value, sub: sub?.type === 'text' ? sub.value : undefined, badge, icon, count, ...look, tile: isTile || undefined, ...queue, parent: parentFor(id, ctx), line };
  ctx.figure.nodes.push(card);
  if (!hasBody) return;
  if (!CARD_SHAPES.includes(card.shape)) {
    ctx.problems.error(line, `a ${card.shape} takes no body. Use a box, person, external, or store`);
    skipBlock('card', {}, statement, ctx);
    return;
  }
  card.content = [];
  ctx.block = { kind: 'card', card, line };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 큐의 칸 수(slots)와 처음 찬 칸 수(from, 생략하면 0). 큐는 같은 이름의 값 하나를 스스로 가진다(찬 칸 수). 이 값은 `on 큐 큐+1`, `set="큐-1@큐"`처럼 도형 이름으로 바꾸고 카드 줄은 만들지 않는다(queue: true).
function readQueue({ found, id, label, line }, ctx) {
  if (found.slots === undefined) ctx.problems.error(line, `a queue needs its slot count. Write: queue ${id} "${label}" slots=N`);
  if (found.slots !== undefined && found.from > found.slots) ctx.problems.error(line, `from is the number of filled slots at the start, at most slots=${found.slots}. Found ${found.from}`);
  const slots = found.slots ?? 1;
  const from = found.from ?? 0;
  ctx.figure.values.push({ id, label, on: id, from: String(from), ref: undefined, queue: true, slots, line });
  return { slots, from };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선택 사항끼리 맞는지 본다. 원은 이름만 받고, 타일은 아이콘이 있어야 한다.
function checkNodeOptions({ found, form, sub, line }, ctx) {
  const { problems } = ctx;
  if (form === 'circle' && sub) problems.error(line, 'a circle takes a name only. Remove the subtitle or shape=circle');
  if (form === 'circle' && (found.badge !== undefined || found.icon !== undefined)) problems.error(line, 'a circle takes a name only. Remove the badge or icon, or use a rectangle');
  if (found.shape === 'tile' && found.icon === undefined) problems.error(line, 'a tile is an icon card. Add icon=name or use a rectangle');
}
