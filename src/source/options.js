// 선택 사항(`키=값`) 낱말을 문법 표(grammar.js의 OPTIONS)의 항목대로 읽는다. 값 종류는 정수(min), 낱말(값 목록), 글(maxLength)이고, 값 없는 낱말(flag)은 읽지 않는다.
import { VALUES, optionsOf, valueNames } from './grammar.js';

const INTEGER_PATTERN = /^\d+$/;

// cost: time O(t·s), heap O(t), stack O(1)
// vars: t = 낱말 수, s = 범위 수
// basis: estimate
/**
 * `키=값` 낱말들을 { 키: 값 }으로 읽는다. 표에 없는 키와 선택 사항이 아닌 낱말, 같은 키 두 번, 값 형식 위반은 오류다(오류 낱말의 값은 담지 않는다).
 * @param tokens 낱말 목록
 * @param context { scopes, what, line, ctx }. scopes는 키를 찾을 OPTIONS 범위 목록, what은 오류 메시지의 대상 이름(`a grid`)이다
 */
export function readOptions(tokens, { scopes, what, line, ctx }) {
  const found = {};
  for (const t of tokens) {
    const spec = t.type === 'option' ? scopes.map((s) => optionsOf(s)[t.key]).find(Boolean) : undefined;
    if (!spec) ctx.problems.error(line, `${what} takes ${listKeys(scopes)}. Found "${t.key ?? t.value}"`);
    else if (Object.hasOwn(found, t.key)) ctx.problems.error(line, `"${t.key}" is written twice`);
    else {
      const value = readValue(t, spec, { line, ctx });
      if (value !== undefined) found[t.key] = value;
    }
  }
  return found;
}

// cost: time O(v), heap O(1), stack O(1)
// vars: v = 값 목록의 값 수
// basis: estimate
// 값 하나를 항목 형식대로 읽는다. 어긋나면 오류를 내고 undefined다.
function readValue(token, spec, { line, ctx }) {
  const bad = (message) => ctx.problems.error(line, message);
  if (spec.type === 'number') {
    const isNumber = token.valueType === 'word' && INTEGER_PATTERN.test(token.value) && Number.isSafeInteger(Number(token.value)) && Number(token.value) >= spec.min;
    return isNumber ? Number(token.value) : bad(`${token.key} is a whole number of ${spec.min} or more. Found "${token.value}"`);
  }
  if (spec.type === 'text') {
    if (token.valueType !== 'text') return bad(`${token.key} is quoted text: ${token.key}="..."`);
    return spec.maxLength === undefined || token.value.length <= spec.maxLength ? token.value : bad(`${token.key} is at most ${spec.maxLength} characters. Found ${token.value.length}`);
  }
  if (!spec.values) return token.valueType === 'word' ? token.value : bad(`${token.key} is a ${spec.format}, not quoted text`);
  const isListed = token.valueType === 'word' && valueNames(spec.values).includes(token.value);
  const hint = VALUES[spec.values].hint;
  return isListed ? token.value : bad(`${token.key} is one of ${valueNames(spec.values).join(', ')}${hint ? `. ${hint}` : ''}`);
}

// cost: time O(s·o), heap O(s·o), stack O(1)
// vars: s = 범위 수, o = 범위의 선택 사항 수
// basis: estimate
// 오류 메시지에 적는 `키=` 목록. 값 없는 낱말(flag)은 뺀다.
function listKeys(scopes) {
  return scopes.flatMap((s) => Object.entries(optionsOf(s)).filter(([, spec]) => spec.type !== 'flag').map(([key]) => `${key}=`)).join(', ');
}
