// 원본 전체를 읽어 그림 모형(figure)으로 만든다. 줄을 머리, 선언, 시간 흐름 세 부분으로 나누고 문장마다 맡을 함수를 고른다.
import { readChartDeclaration } from './chart.js';
import { closeGroup, readColumn, readDeclaration, readEdge } from './declare.js';
import { DECIMALS_MAX, DEFAULT_VERSION, KINDS, STATEMENTS, VALUES, VERSION, valueNames } from './grammar.js';
import { tokenizeLine } from './lexer.js';
import { normalizeKind, normalizeStatement } from './normalize.js';
import { createProblems } from './problems.js';
import { readTimeline } from './steps.js';
import { validateFigure } from './validate.js';
import { parseTime } from './values.js';
import { NUMBER_PATTERN } from './words.js';

const SECTIONS = ['header', 'declare', 'timeline'];

// cost: time O(n + s·k), heap O(n), stack O(1)
// vars: n = 원본 글자 수, s = 문장 수, k = 이름 수
// basis: estimate
/**
 * 원본을 그림 모형으로 읽는다.
 * @returns { figure, warnings, deprecations }. figure 형식은 emptyFigure 주석
 * @throws FigureError 오류가 하나라도 있을 때. 오류를 모두 담는다
 */
export function parseFigure(source) {
  const problems = createProblems(source);
  const figure = readFigure(source, problems);
  problems.throwIfAny();
  return { figure, warnings: problems.warnings, deprecations: problems.deprecations };
}

// cost: time O(n + s·k), heap O(n), stack O(1)
// vars: n = 원본 글자 수, s = 문장 수, k = 이름 수
// basis: estimate
/**
 * 원본을 읽고 오류와 경고를 problems에 모은다. 뒤 단계(글꼴, data) 오류와 함께 한 번에 알리기 위해 오류가 있어도 모형을 돌려준다.
 * @throws FigureError 파일이 비었거나 종류를 모를 때. 다음 줄을 읽을 규칙이 없기 때문이다
 */
export function readFigure(source, problems) {
  const statements = splitStatements(source, problems);
  const figure = emptyFigure();
  const ctx = { figure, problems, version: DEFAULT_VERSION, section: 'header', groups: [], table: undefined, step: undefined, headers: new Map(), previous: undefined };
  if (!statements.length) {
    problems.error(1, 'the file is empty. Start with a kind such as "flow right"');
    problems.throwIfAny();
  }
  const [kindStatement, ...body] = readVersion(statements, ctx);
  readKind(kindStatement, ctx);
  // 종류를 모르면 다음 줄의 규칙을 정할 수 없어 여기서 멈춘다. 그 밖의 오류는 끝까지 모아 한 번에 알린다.
  if (!figure.kind) {
    // 낱말 나누기는 모든 줄을 먼저 보지만, 종류를 모르면 그 뒤 줄의 오류는 뜻이 없어 첫 문장 오류만 남긴다.
    problems.errors.splice(0, problems.errors.length, ...problems.errors.filter((e) => e.line <= kindStatement.line));
    problems.throwIfAny();
  }
  for (const statement of body) readStatement(statement, ctx);
  if (ctx.table) problems.error(ctx.table.line, `close table "${ctx.table.id}" with "}"`);
  for (const group of ctx.groups) if (!group.isRejected) problems.error(group.line, `close group "${group.id}" with "}"`);
  validateFigure(figure, problems);
  return figure;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 첫 문장이 판 표기(`mutoscope 1`)면 그 판을 정하고 뺀 나머지 문장을 돌려준다. 판 표기가 없으면 DEFAULT_VERSION이다.
// 모르는 판이거나 판 표기만 있고 그림이 없으면 읽을 규칙이 없어 여기서 멈춘다.
function readVersion(statements, ctx) {
  const [first, ...rest] = statements;
  const [head, number, extra] = first.tokens;
  if (head.type !== 'word' || head.value !== 'mutoscope' || first.tokens[1]?.type === 'arrow') return statements;
  const { problems } = ctx;
  const version = /^[1-9]\d*$/.test(number?.value ?? '') && number.type === 'word' && !extra ? Number(number.value) : undefined;
  if (version === undefined) problems.error(first.line, `write the version line as: mutoscope ${VERSION}`, { code: 'invalid-version' });
  else if (version > VERSION) {
    problems.error(first.line, `this tool reads grammar version ${VERSION === 1 ? '1' : `1 to ${VERSION}`}. The file says version ${version}. Update mutoscope, or write a version it supports`, { code: 'unsupported-version', column: number.column });
  } else ctx.version = ctx.figure.version = version;
  problems.throwIfAny();
  if (!rest.length) {
    problems.error(first.line, 'the file has no figure. Write a kind such as "flow right" after the version line');
    problems.throwIfAny();
  }
  return rest;
}

/**
 * 비어 있는 그림 모형.
 * nodes: { id, shape, label, sub, parent, line, columns? }, groups: { id, label, direction, parent, line },
 * edges: { from, to, label, quiet, dashed, line, fromColumn?, toColumn? }, steps: { label, caption, line, beats }
 */
function emptyFigure() {
  return {
    version: DEFAULT_VERSION,
    kind: undefined,
    chartType: undefined,
    direction: VALUES.direction.default,
    title: undefined,
    subtitle: undefined,
    speedMs: undefined,
    aspect: undefined,
    nodes: [],
    // 이름 오류로 버린 선언의 이름. 그 이름을 가리키는 줄에 "모르는 이름" 오류를 덧붙이지 않기 위해 둔다.
    rejectedNames: new Set(),
    groups: [],
    edges: [],
    start: undefined,
    finals: [],
    chart: { series: [], rules: [], missing: undefined, data: undefined, x: undefined, y: undefined, scale: VALUES.scale.default, scaleLine: undefined, decimals: undefined, rows: [], links: [] },
    steps: [],
  };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
// 줄마다 낱말로 나누고 빈 줄과 주석 줄을 뺀다.
function splitStatements(source, problems) {
  return source
    .split('\n')
    .map((text, i) => {
      const before = problems.errors.length;
      const tokens = tokenizeLine(text, i + 1, problems);
      // 낱말을 바로 나누지 못한 줄은 뜻을 읽지 않는다. 빠진 낱말 때문에 덧붙는 오류를 막기 위해서다.
      return { line: i + 1, tokens, hasLexError: problems.errors.length > before };
    })
    .filter((s) => s.tokens.length);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 그림 종류 문장. `flow right`, `sequence`, `chart bar` 꼴이다.
function readKind(statement, ctx) {
  const { line, tokens } = statement;
  const { figure, problems } = ctx;
  normalizeKind(statement, ctx);
  const [kind, second, ...rest] = tokens;
  if (kind.type !== 'word' || !(kind.value in KINDS)) {
    problems.error(line, `start the file with a kind: ${Object.keys(KINDS).join(', ')}. Found "${kind.value}"`);
    return;
  }
  figure.kind = kind.value;
  figure.line = line;
  if (rest.length) problems.error(line, 'the kind statement takes at most one more word');
  if (kind.value === 'sequence') {
    if (second) problems.error(line, '"sequence" takes no direction');
  } else if (kind.value === 'chart') {
    if (!second || !valueNames('chartType').includes(second.value)) problems.error(line, `write "chart" with a type: ${valueNames('chartType').join(', ')}`);
    else figure.chartType = second.value;
  } else if (second) {
    if (!valueNames('direction').includes(second.value)) problems.error(line, `direction is "right" or "down". Found "${second.value}"`);
    else figure.direction = second.value;
  }
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 문장이 이 그림 종류에서 쓸 수 있고, 판 표기 자리와 파일 부분 순서에 맞는지 본다. 어기면 오류를 내고 false다.
function isPlaced(word, { tokens, line }, ctx) {
  const { figure, problems } = ctx;
  const section = STATEMENTS[word]?.section ?? 'declare';
  if (STATEMENTS[word] && !STATEMENTS[word].kinds.includes(figure.kind)) {
    problems.error(line, `"${word === 'hop' || word === 'edge' ? 'a -> b' : word}" is not allowed in a ${figure.kind} figure. Remove the line or change the kind statement`);
    if (tokens.at(-1).type === 'open') ctx.groups.push({ isRejected: true, line });
    return false;
  }
  if (section === 'version') {
    problems.error(line, 'the version line "mutoscope N" must be the first line of the file', { code: 'invalid-version' });
    return false;
  }
  if (SECTIONS.indexOf(section) < SECTIONS.indexOf(ctx.section)) {
    problems.error(line, `"${word}" belongs to the ${section} part, which must come before the ${ctx.section} part`);
    return false;
  }
  if (section === 'timeline' && word !== 'step' && !ctx.step) {
    problems.error(line, 'start the timeline with a "step" line');
    return false;
  }
  return true;
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// 문장 하나의 부분(머리, 선언, 시간 흐름)을 정하고, 순서를 어기면 오류를 낸다.
function readStatement(statement, ctx) {
  const { tokens, line } = statement;
  const { problems } = ctx;
  if (ctx.table) {
    normalizeStatement(statement, { word: 'column', isHeadWord: false }, ctx);
    readColumn(statement, ctx);
    return;
  }
  const [head, second] = tokens;
  if (statement.hasLexError) {
    // 그룹 여는 줄이면 닫는 `}`가 짝을 찾도록 자리만 연다.
    if (tokens.at(-1).type === 'open') ctx.groups.push({ isRejected: true, line });
    return;
  }
  if (head.type === 'close') {
    closeGroup(statement, ctx);
    return;
  }
  const isArrowLine = second?.type === 'arrow';
  if (head.type !== 'word') {
    problems.error(line, 'start a statement with a word, not with quoted text or an option');
    return;
  }
  const arrowWord = ctx.section === 'timeline' ? 'hop' : 'edge';
  const word = normalizeStatement(statement, { word: isArrowLine ? arrowWord : head.value, isHeadWord: !isArrowLine }, ctx);
  const section = STATEMENTS[word]?.section ?? 'declare';
  if (!isPlaced(word, statement, ctx)) return;
  ctx.section = section;
  readByPart({ word, section }, statement, ctx);
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// 정해진 부분(머리, 시간 흐름, 선, 차트 선언, 선언)의 읽는 함수로 보낸다.
function readByPart({ word, section }, statement, ctx) {
  const { line } = statement;
  if (section === 'header') {
    if (ctx.headers.has(word)) ctx.problems.error(line, `"${word}" is written twice (line ${ctx.headers.get(word)})`);
    ctx.headers.set(word, line);
    readHeader(statement, ctx);
  } else if (section === 'timeline') {
    readTimeline(word, statement, ctx);
    ctx.previous = word;
  } else if (word === 'edge') readEdge(statement, ctx);
  else if (ctx.figure.kind === 'chart') readChartDeclaration(statement, ctx);
  else readDeclaration(statement, ctx);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 머리 줄 하나. 값은 글, 시간, 숫자, 낱말 중 하나다.
function readHeader({ tokens, line }, { figure, problems }) {
  const [head, value, extra] = tokens;
  if (extra) problems.error(line, `"${head.value}" takes one value`);
  const key = head.value;
  if (['title', 'subtitle', 'x', 'y'].includes(key)) {
    if (value?.type !== 'text') problems.error(line, `write ${key} as quoted text: ${key} "..."`);
    else if (key === 'x' || key === 'y') Object.assign(figure.chart, { [key]: value.value, [`${key}Line`]: line });
    else figure[key] = value.value;
  } else if (key === 'speed') {
    const ms = parseTime(value?.value);
    if (value?.type !== 'word' || ms === undefined) problems.error(line, 'write speed as a time such as 900ms or 2s');
    else figure.speedMs = ms;
  } else if (key === 'aspect') {
    const ratio = Number(value?.value);
    if (value?.type !== 'word' || !NUMBER_PATTERN.test(value.value) || !(ratio > 0)) problems.error(line, 'write aspect as a positive number such as 1.6');
    else figure.aspect = ratio;
  } else if (key === 'decimals') {
    const places = Number(value?.value);
    if (value?.type !== 'word' || !Number.isInteger(places) || places < 0 || places > DECIMALS_MAX) problems.error(line, `write decimals as a whole number from 0 to ${DECIMALS_MAX}, such as decimals 2`);
    else figure.chart.decimals = places;
  } else if (key === 'scale') {
    if (!valueNames('scale').includes(value?.value)) problems.error(line, `scale is ${valueNames('scale').map((v) => `"${v}"`).join(' or ')}`);
    else Object.assign(figure.chart, { scale: value.value, scaleLine: line });
  }
}
