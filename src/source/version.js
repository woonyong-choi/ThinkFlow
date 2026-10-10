// 첫 문장의 판 표기(`daphnis 2`)를 읽는다. 없거나 다른 판이면 읽을 규칙이 없어 위치와 함께 오류로 끝낸다.
import { VERSION } from './grammar.js';

// cost: time O(s), heap O(s), stack O(1)
// vars: s = 문장 수
// basis: estimate
/**
 * 첫 문장이 `daphnis 2`인지 확인하고 판 표기를 뺀 나머지 문장을 돌려준다.
 * @throws FigureError 판 표기가 없거나 읽지 않는 판이거나 판 표기만 있을 때. 첫 문장 오류만 알린다
 */
export function readVersion(statements, ctx) {
  const [first, ...rest] = statements;
  const { problems, figure } = ctx;
  const [head, number, extra] = first.tokens;
  figure.line = first.line;
  const fail = (message, extra2) => {
    problems.error(first.line, message, extra2);
    // 판을 모르면 이어지는 줄의 규칙을 정할 수 없다. 낱말 나누기 오류 가운데 첫 문장까지의 것만 함께 남긴다.
    problems.errors.splice(0, problems.errors.length, ...problems.errors.filter((e) => e.line <= first.line));
    problems.throwIfAny();
  };
  if (head.type !== 'word' || head.value !== 'daphnis' || number?.type === 'arrow') return fail('the first line must be "daphnis 2"', { code: 'missing-version', column: head.column });
  const version = /^[1-9]\d*$/.test(number?.value ?? '') && number.type === 'word' && !extra ? Number(number.value) : undefined;
  if (version === undefined) return fail(`write the version line as: daphnis ${VERSION}`, { code: 'invalid-version', column: (number ?? head).column });
  if (version < VERSION) return fail(`daphnis ${version} sources are not read. Rewrite the file in daphnis ${VERSION} (docs/design/figure-syntax.md)`, { code: 'unsupported-version', column: number.column });
  if (version > VERSION) return fail(`this tool reads grammar version ${VERSION}. The file says version ${version}. Update daphnis, or write a version it supports`, { code: 'unsupported-version', column: number.column });
  if (!rest.length) return fail('the file has no figure. Declare cards after the version line', { code: 'invalid-version', column: head.column });
  return rest;
}
