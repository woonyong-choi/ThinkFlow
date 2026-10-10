// 흐름 조건식(`when="…"`, `wait="…"`)의 자체 파서와 계산기. 값 이름, 숫자, `'낱말'`, 비교, `&&`, `||`, `!`, 괄호만 읽는다.
// 글자를 코드로 실행하지 않는다(eval, Function 없음). 문법은 docs/design/figure-syntax.md 조건과 대기 절이다.
import { unknownName } from './problems.js';
import { NUMBER_PATTERN } from './words.js';

/** 조건식 글자 수 상한. 평가 비용에 상한을 두기 위해서다. */
const CONDITION_MAX = 200;

const COMPARISONS = new Set(['=', '!=', '<', '<=', '>', '>=']);
const ORDERED = new Set(['<', '<=', '>', '>=']);
// 앞에서부터 가장 길게 맞는 연산자. `!=`가 `!`보다, `<=`가 `<`보다 먼저다.
const OPERATORS = ['&&', '||', '!=', '<=', '>=', '=', '<', '>', '!', '(', ')'];
const NUMBER_START = /^-?\d+(?:\.\d+)?/;
const NAME_START = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*/;

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 조건 글자 수
// basis: estimate
// 조건 글을 낱말로 나눈다. 틀리면 { error }다.
function tokenize(text) {
  const tokens = [];
  for (let i = 0; i < text.length; ) {
    const rest = text.slice(i);
    const space = /^\s+/.exec(rest);
    if (space) {
      i += space[0].length;
      continue;
    }
    const operator = OPERATORS.find((op) => rest.startsWith(op));
    const number = NUMBER_START.exec(rest)?.[0];
    const name = NAME_START.exec(rest)?.[0];
    if (operator) {
      tokens.push({ type: operator, at: i });
      i += operator.length;
    } else if (number) {
      tokens.push({ type: 'number', value: number, at: i });
      i += number.length;
    } else if (name) {
      tokens.push({ type: 'name', value: name, at: i });
      i += name.length;
    } else if (rest[0] === "'") {
      const end = rest.indexOf("'", 1);
      if (end < 0) return { error: `a word in a condition closes with ' on both sides, found "${rest}"` };
      tokens.push({ type: 'word', value: rest.slice(1, end), at: i });
      i += end + 1;
    } else {
      return { error: `a condition takes value names, numbers, 'words', comparisons (=, !=, <, <=, >, >=), &&, ||, !, and parentheses. Found "${rest[0]}" at character ${i + 1}` };
    }
  }
  return { tokens };
}

// 조건 문법 오류를 파서 밖으로 알리는 오류. parseCondition이 { error }로 바꾼다.
class ConditionError extends Error {}

/** 재귀 하강 파서. 조건 = 항 { "||" 항 }, 항 = 요소 { "&&" 요소 }, 요소 = "!" 요소 | "(" 조건 ")" | 피연산자 비교 피연산자. */
class ConditionParser {
  at = 0;

  // cost: time O(1), heap O(1), stack O(1)
  // basis: estimate
  constructor(tokens, { ids, text }) {
    Object.assign(this, { tokens, ids, text });
  }

  peek = () => this.tokens[this.at];

  // cost: time O(1), heap O(1), stack O(1)
  // basis: estimate
  // 낱말의 앞부분과 자리(글자 번호)를 오류 글에 쓸 꼴로
  near(token) {
    return token ? `"${this.text.slice(token.at, token.at + 12).trim()}" at character ${token.at + 1}` : 'the end of the condition';
  }

  // cost: time O(v), heap O(1), stack O(1)
  // vars: v = 값 수
  // basis: estimate
  // 피연산자 하나: 숫자, 낱말, 선언된 값 이름
  operand() {
    const token = this.tokens[this.at++];
    if (token?.type === 'number') return { kind: 'number', value: token.value };
    if (token?.type === 'word') return checkWord(token.value);
    if (token?.type === 'name' && this.ids.includes(token.value)) return { kind: 'value', id: token.value };
    if (token?.type === 'name') throw new ConditionError(unknownName('value', token.value, this.ids));
    throw new ConditionError(`expected a value name, a number, or a 'word', found ${this.near(token)}`);
  }

  // cost: time O(n), heap O(n), stack O(d)
  // vars: n = 낱말 수, d = 괄호와 ! 깊이
  // basis: estimate
  // 요소: `!` 요소, 괄호로 묶은 조건, 비교 하나
  element() {
    const token = this.peek();
    if (token?.type === '!') {
      this.at++;
      return { op: 'not', item: this.element() };
    }
    if (token?.type !== '(') return this.comparison();
    this.at++;
    const inner = this.condition();
    if (this.peek()?.type !== ')') throw new ConditionError(`expected ")" but found ${this.near(this.peek())}`);
    this.at++;
    return inner;
  }

  // cost: time O(v), heap O(1), stack O(1)
  // vars: v = 값 수
  // basis: estimate
  // 비교 하나: 피연산자 비교 피연산자
  comparison() {
    const left = this.operand();
    const comparison = this.peek();
    if (!comparison || !COMPARISONS.has(comparison.type)) throw new ConditionError(`expected a comparison (=, !=, <, <=, >, >=) but found ${this.near(comparison)}`);
    this.at++;
    return checkComparison({ op: 'cmp', cmp: comparison.type, left, right: this.operand() });
  }

  // cost: time O(n), heap O(n), stack O(d)
  // vars: n = 낱말 수, d = 괄호 깊이
  // basis: estimate
  // separator로 이은 항들. 하나면 그 항이다.
  joined(op, next, separator) {
    const items = [next()];
    while (this.peek()?.type === separator) {
      this.at++;
      items.push(next());
    }
    return items.length === 1 ? items[0] : { op, items };
  }

  term = () => this.joined('and', () => this.element(), '&&');
  condition = () => this.joined('or', this.term, '||');

  // cost: time O(n), heap O(n), stack O(d)
  // vars: n = 낱말 수, d = 괄호 깊이
  // basis: estimate
  /** 조건 전체를 읽는다. 남는 낱말이 있으면 오류다. */
  parse() {
    const ast = this.condition();
    if (this.peek()) throw new ConditionError(`unexpected ${this.near(this.peek())}`);
    return ast;
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// `'낱말'`은 공백 없는 글자이고 숫자 꼴이면 따옴표 없이 쓴다. 길이는 값 글자 자리가 실제 글꼴 폭으로 늘어나므로 제한하지 않는다.
function checkWord(value) {
  if (value === '' || /\s/.test(value)) throw new ConditionError(`a word in a condition has no spaces and is not empty. Found '${value}'`);
  if (NUMBER_PATTERN.test(value)) throw new ConditionError(`write the number ${value} without quotes. Quotes make a word`);
  return { kind: 'word', value };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 비교 하나의 정적 규칙: 한쪽 이상은 값 이름이고, `<` 계열에 낱말이 오면 안 된다.
function checkComparison(node) {
  const { left, right, cmp } = node;
  if (left.kind !== 'value' && right.kind !== 'value') throw new ConditionError('a comparison needs a value name on at least one side. Comparing two literals never changes');
  if (ORDERED.has(cmp) && (left.kind === 'word' || right.kind === 'word')) throw new ConditionError(`${cmp} compares numbers, but this side is a word. Use = or != for words`);
  return node;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 조건 AST 노드 수
// basis: estimate
// 조건이 읽는 값 이름(중복 없이).
function refsOf(ast, found = new Set()) {
  if (ast.op === 'cmp') for (const side of [ast.left, ast.right]) if (side.kind === 'value') found.add(side.id);
  for (const child of ast.items ?? (ast.item ? [ast.item] : [])) refsOf(child, found);
  return found;
}

// cost: time O(n), heap O(n), stack O(d)
// vars: n = 조건 글자 수, d = 괄호 깊이
// basis: estimate
/**
 * 조건 글을 읽는다. ids는 선언된 값 이름이다.
 * @returns { text, ast, refs } 또는 { error }. refs는 조건이 읽는 값 이름 목록이다
 */
export function parseCondition(text, ids) {
  if ([...text].length > CONDITION_MAX) return { error: `a condition is at most ${CONDITION_MAX} characters. Shorten it or split the flow` };
  const lexed = tokenize(text);
  if (lexed.error) return { error: lexed.error };
  if (!lexed.tokens.length) return { error: 'a condition is empty. Write a comparison such as holder=\'none\'' };
  try {
    const ast = new ConditionParser(lexed.tokens, { ids, text }).parse();
    return { text, ast, refs: [...refsOf(ast)] };
  } catch (error) {
    if (!(error instanceof ConditionError)) throw error;
    return { error: error.message };
  }
}

// 값 글자가 숫자인지 낱말인지
const kindOf = (text) => (NUMBER_PATTERN.test(text) ? 'number' : 'word');

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 피연산자의 지금 종류와 값. 값 이름은 지금 글이다.
function resolve(side, textOf) {
  if (side.kind === 'value') {
    const text = textOf(side.id);
    return { kind: kindOf(text), value: text, label: `"${side.id}" holds ${kindOf(text) === 'number' ? text : `the word "${text}"`}` };
  }
  return { kind: side.kind, value: side.value, label: side.kind === 'number' ? `${side.value} is a number` : `'${side.value}' is a word` };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 비교 하나를 계산한다. 숫자와 낱말을 견주거나 `<` 계열에 낱말이 오면 TypeError 꼴의 { typeError }다(조용히 거짓이 되지 않는다).
function compare(node, textOf) {
  const left = resolve(node.left, textOf);
  const right = resolve(node.right, textOf);
  if (left.kind !== right.kind) return { typeError: `${left.label}, but ${right.label}. A number and a word cannot be compared` };
  if (left.kind === 'word' && ORDERED.has(node.cmp)) return { typeError: `${node.cmp} compares numbers, but ${left.label} and ${right.label}. Use = or != for words` };
  const [a, b] = left.kind === 'number' ? [Number(left.value), Number(right.value)] : [left.value, right.value];
  const results = { '=': a === b, '!=': a !== b, '<': a < b, '<=': a <= b, '>': a > b, '>=': a >= b };
  return { value: results[node.cmp] };
}

// cost: time O(n), heap O(1), stack O(d)
// vars: n = 조건 AST 노드 수, d = 괄호 깊이
// basis: estimate
/**
 * 조건을 계산한다. textOf(id)는 값의 지금 글이다. 모든 비교를 계산해(짧게 끊지 않는다) 종류가 맞지 않는 비교를 늘 알아낸다.
 * @returns { value } 또는 { typeError }
 */
export function evalCondition(ast, textOf) {
  if (ast.op === 'cmp') return compare(ast, textOf);
  const parts = (ast.items ?? [ast.item]).map((child) => evalCondition(child, textOf));
  const bad = parts.find((part) => part.typeError);
  if (bad) return bad;
  if (ast.op === 'not') return { value: !parts[0].value };
  return { value: ast.op === 'and' ? parts.every((part) => part.value) : parts.some((part) => part.value) };
}
