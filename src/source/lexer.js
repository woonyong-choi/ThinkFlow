// 원본 한 줄을 낱말로 나눈다. 규칙은 docs/design/figure-syntax.md의 "줄과 낱말" 절이다.

// 앞뒤에 공백이 있어야 하는 기호 낱말
const SYMBOLS = { '->': 'arrow', '&': 'amp', '{': 'open', '}': 'close' };

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 줄 글자 수
// basis: estimate
/**
 * 한 줄을 낱말로 나눈다. 주석은 지운다.
 * @returns 낱말 목록. { type: 'word' | 'text' | 'arrow' | 'amp' | 'open' | 'close' | 'option', value, column, length, key?, valueColumn? }
 *   column은 줄 안 1부터 센 자리, length는 원본에서 차지한 글자 수다. option은 `키=값`이고, 값이 글이면 valueType이 'text'다.
 *   형식이 틀리면 problems에 오류를 넣고 그 낱말을 뺀다.
 */
export function tokenizeLine(text, line, problems) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    // 줄 끝 CR(Windows 줄바꿈), BOM, 유니코드 공백도 따옴표 밖에서는 공백으로 읽는다.
    if (/\s|\uFEFF/.test(c)) {
      i++;
    } else if (c === '#') {
      break;
    } else if (c === '"') {
      const quoted = readQuoted(text, i, { line, problems });
      // 빈 글은 이름 없는 도형이나 빈 항목이 된다. 글이 필요 없으면 따옴표째 뺀다.
      if (quoted.value.trim() === '') problems.error(line, 'quoted text cannot be empty. Write the text or remove the quotes', { column: i + 1 });
      tokens.push({ type: 'text', value: quoted.value, column: i + 1, length: quoted.end - i });
      i = quoted.end;
      if (i < text.length && !/\s/.test(text[i]) && text[i] !== '#') problems.error(line, `put a space after the closing quote. Found "${text[i]}"`, { column: i + 1 });
    } else {
      const start = i;
      // 따옴표 밖의 `#`는 낱말 중간이어도 주석의 시작이다.
      while (i < text.length && !/\s|\uFEFF/.test(text[i]) && text[i] !== '"' && text[i] !== '#') i++;
      const word = text.slice(start, i);
      if (text[i] === '"' && word.endsWith('=')) {
        const quoted = readQuoted(text, i, { line, problems });
        if (quoted.value.trim() === '') problems.error(line, `${word.slice(0, -1)}= cannot be empty. Write the text or remove the option`, { column: start + 1 });
        tokens.push({ type: 'option', key: word.slice(0, -1), value: quoted.value, valueType: 'text', column: start + 1, length: quoted.end - start, valueColumn: i + 1 });
        i = quoted.end;
      } else if (text[i] === '"') {
        problems.error(line, `put a space before the quote after "${word}"`, { column: start + 1 });
      } else {
        pushWord(tokens, { word, line, column: start + 1 }, problems);
      }
    }
  }
  return tokens;
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 낱말 글자 수
// basis: estimate
// 기호 낱말, 선택 사항, 일반 낱말을 가른다. 기호가 다른 글자에 붙어 있으면 오류다.
function pushWord(tokens, { word, line, column }, problems) {
  const place = { column, length: word.length };
  if (Object.hasOwn(SYMBOLS, word)) {
    tokens.push({ type: SYMBOLS[word], value: word, ...place });
    return;
  }
  const glued = Object.keys(SYMBOLS).find((s) => word.includes(s));
  if (glued) {
    problems.error(line, `put spaces around "${glued}" in "${word}"`, { column });
    return;
  }
  const eq = word.indexOf('=');
  if (eq === 0 || eq === word.length - 1) {
    problems.error(line, `write options as key=value without spaces around "=". Found "${word}"`, { column });
    return;
  }
  if (eq > 0) {
    tokens.push({ type: 'option', key: word.slice(0, eq), value: word.slice(eq + 1), valueType: 'word', valueColumn: column + eq + 1, ...place });
    return;
  }
  tokens.push({ type: 'word', value: word, ...place });
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 따옴표 안 글자 수
// basis: estimate
// start의 따옴표부터 닫는 따옴표까지 읽는다. `\"`, `\\`만 받는다.
function readQuoted(text, start, { line, problems }) {
  let value = '';
  let j = start + 1;
  while (j < text.length && text[j] !== '"') {
    if (text[j] === '\\') {
      const next = text[j + 1];
      if (next !== '"' && next !== '\\') problems.error(line, `only \\" and \\\\ are allowed inside quotes. Found "\\${next ?? ''}"`);
      value += next ?? '';
      j += 2;
      continue;
    }
    value += text[j];
    j++;
  }
  if (j >= text.length) problems.error(line, 'close the quote on the same line');
  return { value, end: j + 1 };
}
