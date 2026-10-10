// 차트 카드 블록(`chart id "제목" 종류 ["부제"] {` ... `}`)을 읽는다. 블록 안 줄은 차트 선언이다. 카드는 plot에 차트 하나를 통째로 담는다.
import { readChartDeclaration } from './chart.js';
import { DECIMALS_MAX, VALUES, valueNames } from './grammar.js';
import { checkId, parentFor, rejectName, skipBlock } from './names.js';
import { ID_PATTERN, INTEGER_PATTERN } from './words.js';

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 비어 있는 차트 내용. 줄은 블록 안에서 채운다. */
function emptyChart() {
  return { series: [], rules: [], missing: undefined, data: undefined, x: undefined, y: undefined, scale: VALUES.scale.default, scaleLine: undefined, zero: VALUES.zero.default, zeroLine: undefined, decimals: undefined, rows: [], links: [] };
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 차트 카드를 연다. plot은 차트 그리기가 그대로 받는 { chartType, title, subtitle, chart, line }이다. */
export function readChartCard({ tokens, line }, ctx) {
  const [, id, title, type, ...rest] = tokens;
  const form = 'write chart as: chart id "title" type ["subtitle"] {';
  if (!checkId(id, { line, ctx }, ID_PATTERN)) {
    rejectName(id, ctx);
    skipBlock('chart', { id: id?.value, plot: { chart: emptyChart() } }, { tokens, line }, ctx);
    return;
  }
  const subtitle = rest.length > 1 ? rest[0] : undefined;
  const isShape = title?.type === 'text' && type?.type === 'word' && rest.at(-1)?.type === 'open' && rest.length <= 2 && (!subtitle || subtitle.type === 'text');
  if (!isShape) {
    ctx.problems.error(line, form);
    skipBlock('chart', { id: id.value, plot: { chart: emptyChart() } }, { tokens, line }, ctx);
    return;
  }
  const isType = valueNames('chartType').includes(type.value);
  if (!isType) ctx.problems.error(line, `a chart type is one of ${valueNames('chartType').join(', ')}. Found "${type.value}"`);
  const plot = { chartType: isType ? type.value : undefined, title: title.value, subtitle: subtitle?.value, chart: emptyChart(), line };
  const card = { id: id.value, shape: 'chart', label: title.value, plot, parent: parentFor(id, ctx), line, isRejected: !isType || undefined };
  ctx.figure.nodes.push(card);
  ctx.block = { kind: 'chart', card, line };
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 차트 블록 안 줄. `}`면 닫고, x, y, scale, zero, decimals는 차트 머리 줄이며, 나머지는 차트 선언이다. */
export function readChartLine(statement, ctx) {
  const { tokens, line } = statement;
  const { card } = ctx.block;
  if (tokens[0].type === 'close') {
    if (tokens.length > 1) ctx.problems.error(line, 'put "}" on its own line');
    ctx.block = ctx.block.parent;
    return;
  }
  if (statement.hasLexError || card.isRejected) return;
  if (tokens[0].type !== 'word') {
    ctx.problems.error(line, 'start a chart line with a word such as series or row');
    return;
  }
  const word = tokens[0].value;
  const plotCtx = { ...ctx, figure: card.plot };
  if (['x', 'y', 'scale', 'zero', 'decimals'].includes(word)) readChartHeader(statement, plotCtx);
  else readChartDeclaration(statement, plotCtx);
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 차트 머리 줄 하나: 값 축 이름(x, y), 축 종류(scale), 0 기준(zero), 값 소수 자릿수(decimals)
function readChartHeader({ tokens, line }, { figure, problems }) {
  const [head, value, extra] = tokens;
  const { chart } = figure;
  const key = head.value;
  if (extra) problems.error(line, `"${key}" takes one value`);
  if (chart[`${key}Line`] !== undefined || (key === 'decimals' && chart.decimals !== undefined)) problems.error(line, `"${key}" is written twice`);
  if (key === 'x' || key === 'y') {
    if (value?.type !== 'text') problems.error(line, `write ${key} as quoted text: ${key} "..."`);
    else Object.assign(chart, { [key]: value.value, [`${key}Line`]: line });
  } else if (key === 'decimals') {
    const places = Number(value?.value);
    if (value?.type !== 'word' || !INTEGER_PATTERN.test(value.value) || places > DECIMALS_MAX) problems.error(line, `write decimals as a whole number from 0 to ${DECIMALS_MAX}, such as decimals 2`);
    else chart.decimals = places;
  } else if (!valueNames(key).includes(value?.value)) problems.error(line, `${key} is ${valueNames(key).map((v) => `"${v}"`).join(' or ')}`);
  else Object.assign(chart, { [key]: value.value, [`${key}Line`]: line });
}
