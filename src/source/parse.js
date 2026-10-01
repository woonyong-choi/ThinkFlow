// 원본 전체를 읽어 그림 모형(figure)으로 만든다. 줄을 머리, 선언, 시간 흐름 세 부분으로 나누고 문장마다 맡을 함수를 고른다.
import { readChartDeclaration } from './chart.js';
import { closeGroup, readColumn, readDeclaration, readEdge } from './declare.js';
import { tokenizeLine } from './lexer.js';
import { createProblems } from './problems.js';
import { readTimeline } from './steps.js';
import { validateFigure } from './validate.js';
import { parseTime } from './values.js';
import { ALLOWED, CHART_TYPES, DIRECTIONS, HEADER_WORDS, KINDS, NUMBER_PATTERN, TIMELINE_WORDS } from './words.js';

const SECTIONS = ['header', 'declare', 'timeline'];

// cost: time O(n + s·k), heap O(n), stack O(1)
// vars: n = 원본 글자 수, s = 문장 수, k = 이름 수
// basis: estimate
/**
 * 원본을 그림 모형으로 읽는다.
 * @returns { figure, warnings }. figure 형식은 emptyFigure 주석
 * @throws FigureError 오류가 하나라도 있을 때. 오류를 모두 담는다
 */
export function parseFigure(source) {
  const problems = createProblems();
  const figure = readFigure(source, problems);
  problems.throwIfAny();
  return { figure, warnings: problems.warnings };
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
  const ctx = { figure, problems, section: 'header', groups: [], table: undefined, step: undefined, headers: new Map(), previous: undefined };
  if (!statements.length) {
    problems.error(1, 'the file is empty. Start with a kind such as "flow right"');
    problems.throwIfAny();
  }
  readKind(statements[0], ctx);
  // 종류를 모르면 다음 줄의 규칙을 정할 수 없어 여기서 멈춘다. 그 밖의 오류는 끝까지 모아 한 번에 알린다.
  if (!figure.kind) {
    // 낱말 나누기는 모든 줄을 먼저 보지만, 종류를 모르면 그 뒤 줄의 오류는 뜻이 없어 첫 문장 오류만 남긴다.
    problems.errors.splice(0, problems.errors.length, ...problems.errors.filter((e) => e.line <= statements[0].line));
    problems.throwIfAny();
  }
  for (const statement of statements.slice(1)) readStatement(statement, ctx);
  if (ctx.table) problems.error(ctx.table.line, `close table "${ctx.table.id}" with "}"`);
  for (const group of ctx.groups) if (!group.isRejected) problems.error(group.line, `close group "${group.id}" with "}"`);
  validateFigure(figure, problems);
  return figure;
}

/**
 * 비어 있는 그림 모형.
 * nodes: { id, shape, label, sub, parent, line, columns? }, groups: { id, label, direction, parent, line },
 * edges: { from, to, label, quiet, dashed, line, fromColumn?, toColumn? }, steps: { label, caption, line, beats }
 */
function emptyFigure() {
  return {
    kind: undefined,
    chartType: undefined,
    direction: 'right',
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
    chart: { series: [], rules: [], missing: undefined, data: undefined, x: undefined, y: undefined, scale: 'linear', scaleLine: undefined, rows: [], links: [] },
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
function readKind({ line, tokens }, { figure, problems }) {
  const [kind, second, ...rest] = tokens;
  if (kind.type !== 'word' || !KINDS.includes(kind.value)) {
    problems.error(line, `start the file with a kind: ${KINDS.join(', ')}. Found "${kind.value}"`);
    return;
  }
  figure.kind = kind.value;
  figure.line = line;
  if (rest.length) problems.error(line, 'the kind statement takes at most one more word');
  if (kind.value === 'sequence') {
    if (second) problems.error(line, '"sequence" takes no direction');
  } else if (kind.value === 'chart') {
    if (!second || !CHART_TYPES.includes(second.value)) problems.error(line, `write "chart" with a type: ${CHART_TYPES.join(', ')}`);
    else figure.chartType = second.value;
  } else if (second) {
    if (!DIRECTIONS.includes(second.value)) problems.error(line, `direction is "right" or "down". Found "${second.value}"`);
    else figure.direction = second.value;
  }
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// 문장 하나의 부분(머리, 선언, 시간 흐름)을 정하고, 순서를 어기면 오류를 낸다.
function readStatement(statement, ctx) {
  const { tokens, line } = statement;
  const { figure, problems } = ctx;
  if (ctx.table) {
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
  const word = isArrowLine ? (ctx.section === 'timeline' ? 'hop' : 'edge') : head.value;
  if (head.type !== 'word') {
    problems.error(line, 'start a statement with a word, not with quoted text or an option');
    return;
  }
  if (ALLOWED[word] && !ALLOWED[word].includes(figure.kind)) {
    problems.error(line, `"${word === 'hop' || word === 'edge' ? 'a -> b' : word}" is not allowed in a ${figure.kind} figure. Remove the line or change the kind statement`);
    if (tokens.at(-1).type === 'open') ctx.groups.push({ isRejected: true, line });
    return;
  }
  const section = sectionOf(word, figure);
  if (SECTIONS.indexOf(section) < SECTIONS.indexOf(ctx.section)) {
    problems.error(line, `"${word}" belongs to the ${section} part, which must come before the ${ctx.section} part`);
    return;
  }
  if (section === 'timeline' && word !== 'step' && !ctx.step) {
    problems.error(line, 'start the timeline with a "step" line');
    return;
  }
  ctx.section = section;
  if (section === 'header') {
    if (ctx.headers.has(word)) problems.error(line, `"${word}" is written twice (line ${ctx.headers.get(word)})`);
    ctx.headers.set(word, line);
    readHeader(statement, ctx);
  }
  else if (section === 'timeline') {
    readTimeline(word, statement, ctx);
    ctx.previous = word;
  }
  else if (word === 'edge') readEdge(statement, ctx);
  else if (figure.kind === 'chart') readChartDeclaration(statement, ctx);
  else readDeclaration(statement, ctx);
}

// cost: time O(k), heap O(1), stack O(1)
// vars: k = 고정 낱말 수
// basis: estimate
// 문장 첫 낱말이 속한 부분. 차트의 `x`, `y`, `scale`은 머리다.
function sectionOf(word, figure) {
  if (word === 'hop' || TIMELINE_WORDS.includes(word)) return 'timeline';
  const isHeader = HEADER_WORDS.includes(word) && (figure.kind === 'chart' || !['x', 'y', 'scale'].includes(word));
  return isHeader ? 'header' : 'declare';
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
    else if (key === 'x' || key === 'y') figure.chart[key] = value.value;
    else figure[key] = value.value;
  } else if (key === 'speed') {
    const ms = parseTime(value?.value);
    if (value?.type !== 'word' || ms === undefined) problems.error(line, 'write speed as a time such as 900ms or 2s');
    else figure.speedMs = ms;
  } else if (key === 'aspect') {
    const ratio = Number(value?.value);
    if (value?.type !== 'word' || !NUMBER_PATTERN.test(value.value) || !(ratio > 0)) problems.error(line, 'write aspect as a positive number such as 1.6');
    else figure.aspect = ratio;
  } else if (key === 'scale') {
    if (!['linear', 'log'].includes(value?.value)) problems.error(line, 'scale is "linear" or "log"');
    else Object.assign(figure.chart, { scale: value.value, scaleLine: line });
  }
}
