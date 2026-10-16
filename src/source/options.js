// 선택 사항(`키=값`) 낱말과 값 없는 낱말(flag)을 문법 표(grammar.js의 OPTIONS)의 항목대로 읽는다. 값 종류는 정수(min), 낱말(값 목록), 글(maxLength)이고, flag를 `키=값`으로 쓰면 오류다.
import { VALUES, optionsOf, valueNames } from './grammar.js';
import { INTEGER_PATTERN } from './words.js';
import { optionMistake, withHint } from './mistakes.js';
import { didYouMean } from './problems.js';
import { NEUTRAL } from '../tone.js';


// cost: time O(t·s), heap O(t), stack O(1)
// vars: t = 낱말 수, s = 범위 수
// basis: estimate
/**
 * `키=값` 낱말과 값 없는 낱말(flag)들을 { 키: 값 }으로 읽는다. flag는 true로 담는다. 표에 없는 키와 선택 사항이 아닌 낱말, 같은 키 두 번, 값 형식 위반은 오류다(오류 낱말의 값은 담지 않는다).
 * 오류는 그 낱말의 자리(column)에 내고, 가까운 키나 값이 있으면 제안한다.
 * @param tokens 낱말 목록
 * @param context { scopes, what, line, ctx }. scopes는 키를 찾을 OPTIONS 범위 목록, what은 오류 메시지의 대상 이름(`a grid`)이다
 */
export function readOptions(tokens, { scopes, what, line, ctx }) {
  const found = {};
  // 범위 표는 낱말마다가 아니라 줄마다 한 번 만든다. 칸이 수십만 줄인 격자에서 줄마다 표를 다시 만드는 비용이 컸다.
  const tables = scopes.map((s) => optionsOf(s));
  for (const t of tokens) {
    const name = t.type === 'option' ? t.key : t.type === 'word' ? t.value : undefined;
    const spec = name === undefined ? undefined : tables.map((table) => table[name]).find(Boolean);
    const isFlagWord = t.type === 'word' && spec?.type === 'flag';
    if (!spec || (t.type === 'word' && !isFlagWord)) ctx.problems.error(line, unknownOption(t, { scopes, what }), { column: t.column });
    else if (Object.hasOwn(found, name)) ctx.problems.error(line, `"${name}" is written twice`, { column: t.column });
    else if (isFlagWord) found[name] = true;
    else {
      const value = readValue(t, spec, { line, ctx });
      if (value !== undefined) found[name] = value;
    }
  }
  return found;
}

// cost: time O(s·o·n²), heap O(s·o), stack O(1)
// vars: s = 범위 수, o = 범위의 선택 사항 수, n = 키 글자 수
// basis: estimate
// 받지 않는 낱말의 진단 글. 받는 목록을 알리고, 다른 도구의 습관이면 고칠 꼴을, 오타면 가까운 키를 덧붙인다.
function unknownOption(t, { scopes, what }) {
  const keys = scopes.flatMap((s) => Object.keys(optionsOf(s)));
  const written = t.type === 'option' ? t.key : t.value;
  const base = `${what} takes ${listKeys(scopes) || 'no options'}. Found "${written}"`;
  if (t.type === 'text') return `${base}. Text goes right after the name; options are key=value`;
  const hint = t.type === 'option' ? optionMistake(t, keys) : undefined;
  if (hint) return withHint(base, hint);
  // 값 없는 낱말에 값을 붙였거나(`dashed=true`), 키에 값을 붙이지 않았으면(`tone`) 그 키를 그대로 알린다.
  const spec = keys.includes(written) ? scopes.map((s) => optionsOf(s)[written]).find(Boolean) : undefined;
  if (spec && t.type === 'word') return `${base}. ${written} takes a value: ${written}=${spec.values ? valueNames(spec.values)[0] : '...'}`;
  return `${base}.${didYouMean(written, keys)}`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 도형과 그룹의 색 선택 사항 둘을 모형 값 { tone, appearance }로 읽는다. appearance를 적지 않으면 plain이다. filled와 outline에 tone을 적지 않으면 무채색 gray 계열로 칠한다. */
export function readLook(found) {
  const appearance = found.appearance ?? VALUES.appearance.default;
  return { tone: found.tone ?? (appearance === VALUES.appearance.default ? undefined : NEUTRAL), appearance };
}

// cost: time O(v), heap O(1), stack O(1)
// vars: v = 값 목록의 값 수
// basis: estimate
// 값 하나를 항목 형식대로 읽는다. 어긋나면 값 자리(column)에 오류를 내고 undefined다.
function readValue(token, spec, { line, ctx }) {
  const bad = (message) => ctx.problems.error(line, message, { column: token.valueColumn ?? token.column });
  if (spec.type === 'number') {
    const isNumber = token.valueType === 'word' && INTEGER_PATTERN.test(token.value) && Number.isSafeInteger(Number(token.value)) && Number(token.value) >= spec.min && Number(token.value) <= (spec.max ?? Infinity);
    const range = spec.max === undefined ? `${spec.min} or more` : `${spec.min} to ${spec.max}`;
    return isNumber ? Number(token.value) : bad(`${token.key} is a whole number of ${range}. Found "${token.value}"`);
  }
  if (spec.type === 'flag') return bad(`${token.key} takes no value. Write ${token.key} without =${token.value}`);
  if (spec.type === 'text') {
    if (token.valueType !== 'text') return bad(`${token.key} is quoted text: ${token.key}="${token.value}"`);
    const length = [...token.value].length;
    return spec.maxLength === undefined || length <= spec.maxLength ? token.value : bad(`${token.key} is at most ${spec.maxLength} characters. Found ${length}`);
  }
  if (!spec.values) return token.valueType === 'word' || spec.allowsText ? token.value : bad(`${token.key} takes a word without quotes: ${token.key}=${token.value.trim().split(/\s+/)[0]}`);
  const names = valueNames(spec.values);
  const isListed = token.valueType === 'word' && names.includes(token.value);
  const hint = VALUES[spec.values].hint;
  return isListed ? token.value : bad(`${token.key} is one of ${names.join(', ')}. Found "${token.value}"${hint ? `. ${hint}` : ''}.${didYouMean(token.value, names)}`);
}

// cost: time O(s·o), heap O(s·o), stack O(1)
// vars: s = 범위 수, o = 범위의 선택 사항 수
// basis: estimate
// 오류 메시지에 적는 받는 낱말 목록. 값을 받는 키는 `키=`, 값 없는 낱말(flag)은 그 낱말이다.
function listKeys(scopes) {
  return scopes.flatMap((s) => Object.entries(optionsOf(s)).map(([key, spec]) => (spec.type === 'flag' ? key : `${key}=`))).join(', ');
}
