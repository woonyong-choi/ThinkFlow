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

export function currentGroup(ctx) {
  return ctx.groups.at(-1)?.id;
}
