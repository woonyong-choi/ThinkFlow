// 원본 전체를 읽어 문서 모형(figure) 하나로 만든다. 줄을 머리, 선언, 시간 흐름 세 부분으로 나누고 문장마다 맡을 함수를 고른다.
import { BLOCK_WORDS, STATEMENTS, VALUES } from './grammar.js';
import { BLOCK_READERS, openBlock } from './blocks.js';
import { readDeclaration, readEdge } from './declare.js';
import { closeGroup } from './group.js';
import { readIcons } from './icons.js';
import { tokenizeLine } from './lexer.js';
import { createProblems } from './problems.js';
import { readTimeline } from './steps.js';
import { readHeader } from './header.js';
import { readSequenceControl, prepareSequenceFragments } from './sequence-fragments.js';
import { readPreamble } from './preamble.js';
import { readOn, readValue } from './value.js';
import { readView } from './view.js';
import { validateFigure } from './validate.js';

const SECTIONS = ['header', 'declare', 'timeline'];

// cost: time O(n + s·k), heap O(n), stack O(1)
// vars: n = 원본 글자 수, s = 문장 수, k = 이름 수
// basis: estimate
/**
 * 원본을 문서 모형으로 읽는다.
 * @returns { figure, warnings }. figure 형식은 emptyFigure 주석
 * @throws FigureError 오류가 하나라도 있을 때. 오류를 모두 담는다
 */
export function parseFigure(source) {
  const problems = createProblems(source);
  const figure = readFigure(source, problems);
  problems.throwIfAny();
  return { figure, warnings: problems.warnings };
}

// cost: time O(n + s·k), heap O(n), stack O(1)
// vars: n = 원본 글자 수, s = 문장 수, k = 이름 수
// basis: estimate
/**
 * 원본을 읽고 오류와 경고를 problems에 모은다. 뒤 단계(글꼴, data) 오류와 함께 한 번에 알리기 위해 오류가 있어도 모형을 돌려준다.
 * @throws FigureError 파일이 비었거나 첫 문장이 시작 선언가 아닐 때. 다음 줄을 읽을 규칙이 없기 때문이다
 */
export function readFigure(source, problems) {
  const statements = splitStatements(source, problems);
  const figure = emptyFigure(source);
  const ctx = { figure, problems, section: 'header', groups: [], block: undefined, step: undefined, headers: new Map(), previous: undefined };
  if (!statements.length) {
    problems.error(1, 'the file is empty. The first line is "thinkflow"', { code: 'missing-preamble' });
    problems.throwIfAny();
  }
  const body = readPreamble(statements, ctx);
  for (const statement of body) readStatement(statement, ctx);
  if (ctx.block) problems.error(ctx.block.card.line, ctx.block.kind === 'view' ? 'close the view block with "}"' : `close ${ctx.block.kind} "${ctx.block.card.id}" with "}"`);
  for (const group of ctx.groups) if (!group.isRejected) problems.error(group.line, `close group "${group.id}" with "}"`);
  for (const block of ctx.sequenceBlocks ?? []) problems.error(block.line, 'close the sequence block with }');
  prepareSequenceFragments(figure, problems);
  // 색을 고르지 않은 카드(표, API, 클래스, 차트 등)도 중립 면(plain)이라는 값을 모형에 담는다.
  for (const card of figure.nodes) card.appearance ??= VALUES.appearance.default;
  validateFigure(figure, problems);
  return figure;
}

/**
 * 비어 있는 문서 모형.
 * source: 받은 원본 글 그대로(줄바꿈 CRLF, 첫 글자 포함). 읽기 전에 고치지 않고 정리하지 않는다. 문법 복사가 이 글을 쓴다.
 * nodes: { id, shape, label, sub, parent, tone, appearance, line, columns?, members?, cells?, plot?, spans? },
 * groups: { id, label, direction, parent, tone, appearance, line },
 * edges: { from, to, label, quiet, dashed, head, no, line, relation?, fromColumns?, toColumns?, fromCell?, toCell?, fromSpan?, toSpan? },
 * views: { id, strategy, direction, label, members, line, isImplicit }. id는 v1, v2, ...로 resolveViews가 붙인다,
 * steps: { label, mode, speed, line, beats, tracks, forMs, keep, sets, status }
 */
function emptyFigure(source) {
  return {
    source,
    title: undefined,
    subtitle: undefined,
    paceMs: undefined,
    aspect: undefined,
    // 캔버스 폭 선택: standard(생략과 같음)나 wide
    width: undefined,
    nodes: [],
    // 이름 오류로 버린 선언의 이름. 그 이름을 가리키는 줄에 "모르는 이름" 오류를 덧붙이지 않기 위해 둔다.
    rejectedNames: new Set(),
    groups: [],
    // `icons` 줄로 등록한 사용자 아이콘 세트 { name, path, line }
    iconSets: [],
    edges: [],
    views: [],
    // `value` 줄로 선언한 값 { id, label, on, from, ref, line }
    values: [],
    // `on` 줄로 선언한 도착 값 바꾸기 { node, sets, line }
    arrivals: [],
    // `when`이나 `wait`를 하나라도 썼는지. 안 쓴 원본은 시간표가 이벤트 처리를 거치지 않는다.
    hasConditions: false,
    hasReserve: false,
    start: undefined,
    finals: [],
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
// 문장이 시작 선언 자리와 파일 부분 순서에 맞는지 본다. 어기면 오류를 내고 false다.
function isPlaced(word, { tokens, line }, ctx) {
  const { problems } = ctx;
  const entry = STATEMENTS[word];
  if (!entry) {
    problems.error(line, `unknown statement "${word}"`);
    if (tokens.at(-1).type === 'open') ctx.groups.push({ isRejected: true, line });
    return false;
  }
  if (entry.in) {
    problems.error(line, `"${word}" belongs inside a ${entry.in} block`, { column: tokens[0].column });
    return false;
  }
  if (entry.section === 'preamble') {
    problems.error(line, 'the first line declaration "thinkflow" must be the first line of the file', { code: 'invalid-preamble' });
    return false;
  }
  if (SECTIONS.indexOf(entry.section) < SECTIONS.indexOf(ctx.section)) {
    problems.error(line, `"${word}" belongs to the ${entry.section} part, which must come before the ${ctx.section} part`);
    return false;
  }
  if (entry.section === 'timeline' && word !== 'scene' && !ctx.step) {
    problems.error(line, 'start the timeline with a "scene" line');
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
  if (ctx.block) {
    BLOCK_READERS[ctx.block.kind](statement, ctx);
    return;
  }
  if (readSequenceControl(statement, ctx)) return;
  const [head, second] = tokens;
  if (statement.hasLexError) {
    // 그룹이나 블록을 여는 줄이면 닫는 `}`가 짝을 찾도록 자리만 연다.
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
  const word = isArrowLine ? (ctx.section === 'timeline' ? 'hop' : 'edge') : head.value;
  if (!isPlaced(word, statement, ctx)) return;
  ctx.section = STATEMENTS[word].section;
  readByPart({ word, section: ctx.section }, statement, ctx);
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// 정해진 부분(머리, 시간 흐름, 선, 값, 보기, 선언)의 읽는 함수로 보낸다.
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
  else if (Object.hasOwn(BLOCK_WORDS, word)) openBlock(word, statement, ctx);
  else if (word === 'icons') readIcons(statement, ctx);
  else if (word === 'value') readValue(statement, ctx);
  else if (word === 'on') readOn(statement, ctx);
  else if (word === 'view') readView(statement, ctx);
  else readDeclaration(statement, ctx);
}
