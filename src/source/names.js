// 이름 선언의 공통 확인. 이름 낱말 형식, 버린 선언의 이름 기록, 지금 열린 그룹을 모든 선언 읽기가 함께 쓴다.
import { TABLE_PATTERN } from './words.js';

// 버린 선언의 이름과, 그 선언이 있던 그룹을 적는다. 그 그룹은 비어 보여도 원인이 이름 오류라 빈 그룹 오류를 덧붙이지 않는다.
export function rejectName(token, ctx) {
  if (token?.type === 'word') ctx.figure.rejectedNames.add(token.value);
  const parent = currentGroup(ctx);
  if (parent) ctx.figure.rejectedNames.add(`group:${parent}`);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 이름 낱말 형식을 확인한다. 문장 종류는 첫 낱말 자리로 정해서 예약어도 이름이 된다.
export function checkId(token, { line, ctx }, pattern) {
  if (token?.type !== 'word') {
    ctx.problems.error(line, 'write a name (id) after the statement word');
    return false;
  }
  if (!pattern.test(token.value)) {
    const joiner = pattern === TABLE_PATTERN ? '_' : '-';
    ctx.problems.error(line, `"${token.value}" is not a valid name. Use lowercase letters and digits, joined by single "${joiner}", starting with a letter`);
    return false;
  }
  return true;
}

function currentGroup(ctx) {
  return ctx.groups.at(-1)?.id;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 형식이 틀려 버린 블록 줄도 `{`로 끝나면, 안쪽 줄을 이 블록의 줄로 읽어 넘기도록 버린 카드 자리를 연다. card는 블록 종류가 안쪽 줄을 담는 빈 목록을 가진 카드 조각이다. */
export function skipBlock(kind, card, { tokens, line }, ctx) {
  if (tokens.at(-1).type === 'open') ctx.block = { kind, card: { ...card, isRejected: true, line }, line };
}

// cost: time O(d), heap O(1), stack O(1)
// vars: d = 열린 그룹 깊이
// basis: estimate
// 새 선언의 부모 그룹. 열린 그룹과 이름이 같은 선언은 중복 오류가 날 선언이라 부모를 두지 않는다(자기나 조상을 부모로 삼으면 부모 사슬이 순환한다).
export function parentFor(id, ctx) {
  return ctx.groups.some((g) => g.id === id.value) ? undefined : currentGroup(ctx);
}
