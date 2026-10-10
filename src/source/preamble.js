// 첫 문장의 시작 선언을 읽고 본문을 돌려준다.
// cost: time O(s), heap O(s), stack O(1)
// vars: s = 문장 수
// basis: estimate
/**
 * 첫 의미 줄은 숫자나 옵션 없는 thinkflow다.
 * @throws FigureError 시작 선언이 없거나 잘못되었거나 본문이 없을 때
 */
export function readPreamble(statements, ctx) {
  const [first, ...rest] = statements;
  const { problems, figure } = ctx;
  const [head, extra] = first.tokens;
  figure.line = first.line;
  const fail = (message, diagnostic) => {
    problems.error(first.line, message, diagnostic);
    problems.errors.splice(0, problems.errors.length, ...problems.errors.filter((e) => e.line <= first.line));
    problems.throwIfAny();
  };
  if (head.type !== 'word' || head.value !== 'thinkflow') return fail('the first line must be "thinkflow"', { code: 'missing-preamble', column: head.column });
  if (extra) return fail('write the first line as: thinkflow', { code: 'invalid-preamble', column: extra.column });
  if (!rest.length) return fail('the file has no figure. Declare cards after thinkflow', { code: 'invalid-preamble', column: head.column });
  return rest;
}
