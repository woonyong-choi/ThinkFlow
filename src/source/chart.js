// 차트 선언 문장을 읽는다. 값의 규칙(계열 수, 음수, log)은 validate.js가 모든 행을 읽은 뒤 확인한다.
import { VALUES, optionsOf, valueNames } from './grammar.js';
import { RANGE_MESSAGE, TINY_MESSAGE } from './chart-limits.js';
import { isOverflowNumber, isTinyNumber, parseNumber } from './values.js';
import { readTotal } from './waterfall.js';
import { readBins, readSample } from './histogram.js';
import { ID_PATTERN, NUMBER_PATTERN } from './words.js';

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 차트 선언 하나를 읽는다. */
export function readChartDeclaration(statement, ctx) {
  const word = statement.tokens[0].value;
  const handlers = { total: readTotal, bins: readBins, sample: readSample, series: readSeries, rule: readRule, missing: readMissing, data: readData, row: readRow, point: readPoint, cell: readCell, link: readLink };
  if (!Object.hasOwn(handlers, word)) {
    ctx.problems.error(statement.line, `unknown chart statement "${word}"`);
    return;
  }
  const rowWord = VALUES.chartType.items[ctx.figure.chartType].rowWord;
  const isRowStatement = Object.values(VALUES.chartType.items).some((type) => type.rowWord === word);
  if (isRowStatement && word !== rowWord) {
    ctx.problems.error(statement.line, `a ${ctx.figure.chartType} chart uses "${rowWord}" lines, not "${word}"`);
    return;
  }
  if (word === 'link' && ctx.figure.chartType !== 'scatter') {
    ctx.problems.error(statement.line, 'link is only for scatter charts');
    return;
  }
  handlers[word](statement, ctx);
}

const SERIES_USAGE = `write a series as: series id "name" [role=${valueNames('role').join('|')}] [key="json key"]`;

// cost: time O(w), heap O(1), stack O(1)
// vars: w = 낱말 수
// basis: estimate
// `series id "이름" [role=main|compare] [key="JSON 키"]`
function readSeries({ tokens, line }, { figure, problems }) {
  const [, id, label, ...options] = tokens;
  const given = readSeriesOptions(options);
  if (id?.type !== 'word' || label?.type !== 'text' || !given) {
    problems.error(line, SERIES_USAGE);
    return;
  }
  if (!ID_PATTERN.test(id.value)) {
    problems.error(line, `"${id.value}" is not a valid series name. Use lowercase letters, digits, and "-"`);
    return;
  }
  if (given.role !== undefined && !valueNames('role').includes(given.role)) {
    problems.error(line, `role is one of ${valueNames('role').join(', ')}. Found "${given.role}"`);
    return;
  }
  // 선 차트 행의 `x=`는 가로 값이라 같은 이름의 계열 값과 가를 수 없다.
  if (VALUES.chartType.items[figure.chartType].numericRows && id.value === 'x') {
    problems.error(line, `a ${figure.chartType} chart row uses "x=" for the horizontal value, so a series cannot be named "x"`);
    return;
  }
  // 계열 이름은 차트 카드 안에서 겹치지 않는다. 같은 이름의 값 자리는 어느 계열인지 정할 수 없기 때문이다.
  const same = figure.chart.series.find((s) => s.id === id.value);
  if (same) {
    problems.error(line, `the series "${id.value}" is already declared in this chart (line ${same.line})`);
    return;
  }
  figure.chart.series.push({ id: id.value, label: label.value, key: given.key ?? id.value, role: given.role, line });
}

// cost: time O(n), heap O(1), stack O(1)
// vars: n = 숫자 글자 수
// basis: estimate
// 숫자 글이 지원 범위 밖(무한대가 되는 글, 0이 아닌데 너무 작은 글)일 때의 오류 글. 범위 안이면 undefined다.
function rangeProblem(text) {
  if (isOverflowNumber(text)) return RANGE_MESSAGE;
  return isTinyNumber(text) ? TINY_MESSAGE : undefined;
}

// cost: time O(o), heap O(1), stack O(1)
// vars: o = 선택 낱말 수
// basis: estimate
// 계열 선택 낱말(grammar.js series 범위: key, role)을 한 번씩 읽는다. 모양이 틀리면 undefined다.
function readSeriesOptions(options) {
  const specs = optionsOf('series');
  const given = {};
  for (const t of options) {
    const isKnown = t.type === 'option' && t.valueType === specs[t.key]?.type;
    if (!isKnown || Object.hasOwn(given, t.key)) return undefined;
    given[t.key] = t.value;
  }
  return given;
}

// `rule 값 "라벨"`
function readRule({ tokens, line }, { figure, problems }) {
  const [, value, label, extra] = tokens;
  const number = parseNumber(value?.value);
  if (value?.type !== 'word' || number === undefined || isTinyNumber(value?.value) || label?.type !== 'text' || extra) {
    problems.error(line, rangeProblem(value?.value) ?? 'write a rule as: rule 5 "label"');
    return;
  }
  figure.chart.rules.push({ value: number, label: label.value, line });
}

// `missing "글"`
function readMissing({ tokens, line }, { figure, problems }) {
  const [, text, extra] = tokens;
  if (text?.type !== 'text' || extra) problems.error(line, 'write missing as: missing "text"');
  else figure.chart.missing = text.value;
}

// `data "경로" at "/포인터"`
function readData({ tokens, line }, { figure, problems }) {
  // `at "/포인터"`를 빼면 문서 전체(빈 포인터)가 배열이다. 빈 글 `""`을 쓰지 않게 하기 위해서다.
  const [, path, at, pointer, extra] = tokens;
  const isWhole = path?.type === 'text' && at === undefined;
  const isShape = isWhole || (path?.type === 'text' && at?.type === 'word' && at.value === 'at' && pointer?.type === 'text' && !extra);
  if (!isShape) {
    problems.error(line, 'write data as: data "path.json" [at "/pointer"]');
    return;
  }
  if (figure.chart.data) problems.error(line, `data is already set (line ${figure.chart.data.line})`);
  figure.chart.data = { path: path.value, pointer: isWhole ? '' : pointer.value, line };
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `row "항목" 키=값 …`. 막대, 덤벨, 상자.
function readRow({ tokens, line }, { figure, problems }) {
  const [, label, ...rest] = tokens;
  if (label?.type !== 'text') {
    problems.error(line, 'write a row as: row "item" key=value');
    figure.chart.hasRejectedRow = true;
    return;
  }
  const bind = {};
  const values = readValues(rest, { line, problems, figure, bind });
  if (values) figure.chart.rows.push({ label: label.value, values, line, ...(Object.keys(bind).length ? { bind } : {}) });
  else figure.chart.hasRejectedRow = true;
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
// `point "이름" x=값 y=값 [series=계열]` 또는 선 차트의 `point x=값 계열=값`
function readPoint({ tokens, line }, { figure, problems }) {
  const isScatter = figure.chartType === 'scatter';
  const [, name, ...rest] = tokens;
  if (isScatter && name?.type !== 'text') {
    problems.error(line, 'write a scatter point as: point "name" x=1 y=2 [series=id]');
    figure.chart.hasRejectedRow = true;
    return;
  }
  const bind = {};
  const values = readValues(isScatter ? rest : tokens.slice(1), { line, problems, figure, bind }, isScatter ? ['series'] : []);
  if (values) figure.chart.rows.push({ label: isScatter ? name.value : undefined, values, line, ...(Object.keys(bind).length ? { bind } : {}) });
  else figure.chart.hasRejectedRow = true;
}

// `cell "행" "열" 값`
function readCell({ tokens, line }, { figure, problems }) {
  const [, row, col, value, extra] = tokens;
  const number = parseNumber(value?.value);
  if (row?.type !== 'text' || col?.type !== 'text' || value?.type !== 'word' || number === undefined || isTinyNumber(value?.value) || extra) {
    problems.error(line, rangeProblem(value?.value) ?? 'write a cell as: cell "row" "column" 12');
    figure.chart.hasRejectedRow = true;
    return;
  }
  figure.chart.rows.push({ label: `${row.value}\u0000${col.value}`, row: row.value, col: col.value, values: { value: number }, line });
}

// cost: time O(l), heap O(1), stack O(1)
// vars: l = 이미 적은 link 수
// basis: estimate
// `link "이름" -> "이름"`
function readLink({ tokens, line }, { figure, problems }) {
  const [, from, arrow, to, extra] = tokens;
  if (from?.type !== 'text' || arrow?.type !== 'arrow' || to?.type !== 'text' || extra) {
    problems.error(line, 'write a link as: link "a" -> "b"');
    return;
  }
  const same = figure.chart.links.find((l) => l.from === from.value && l.to === to.value);
  if (from.value === to.value) problems.error(line, `a link joins two different points. Found "${from.value}" twice`);
  else if (same) problems.error(line, `there is already a link "${from.value}" -> "${to.value}" (line ${same.line})`);
  else figure.chart.links.push({ from: from.value, to: to.value, line });
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 낱말 수
// basis: estimate
// `키=값` 낱말들을 { 키: 숫자 | null }로. `-`는 빠진 값 null이다. textKeys는 이름 값을 받는 키다.
// 숫자 자리에 값 이름(`ms=depth`)을 쓰면 묶음(bind)이다: 이름을 bind에 적고 자리는 0으로 둔다. 시작 값은 validate.js가 값 선언에서 채운다.
// 상자 그림은 다섯 숫자가 한 묶음의 순서 규칙이고 워터폴은 누계가 행 순서에 기대, 값이 바뀌면 두 그림 모두 축과 모양이 함께 바뀌어 묶음을 받지 않는다.
// 가로 위치(`x=`)는 값이 아니라 자리라서 선, 면, 산점도 모두 묶음을 받지 않는다.
function readValues(tokens, { line, problems, figure, bind }, textKeys = []) {
  const takesBind = bind && !['box', 'waterfall'].includes(figure.chartType);
  const values = {};
  for (const t of tokens) {
    if (t.type !== 'option' || t.valueType !== 'word') {
      problems.error(line, `write values as key=number. Found "${t.value}"`);
      return undefined;
    }
    if (Object.hasOwn(values, t.key)) {
      problems.error(line, `"${t.key}" is written twice`);
      return undefined;
    }
    if (textKeys.includes(t.key)) {
      values[t.key] = t.value;
      continue;
    }
    const number = t.value === '-' ? null : parseNumber(t.value);
    if (number === undefined && ID_PATTERN.test(t.value) && !NUMBER_PATTERN.test(t.value)) {
      if (!takesBind || t.key === 'x') {
        problems.error(line, `${t.key === 'x' ? 'a horizontal position' : `a ${figure.chartType} chart`} takes numbers, not values. Found ${t.key}=${t.value}`, { code: 'binding-unsupported' });
        return undefined;
      }
      bind[t.key] = t.value;
      values[t.key] = 0;
      continue;
    }
    if (number === undefined || isTinyNumber(t.value)) {
      problems.error(line, rangeProblem(t.value) ?? `"${t.key}" needs a number or "-". Found "${t.value}"`);
      return undefined;
    }
    values[t.key] = number;
  }
  return values;
}

