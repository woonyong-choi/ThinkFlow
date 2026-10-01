// 차트 선언 문장을 읽는다. 값의 규칙(계열 수, 음수, log)은 validate.js가 모든 행을 읽은 뒤 확인한다.
import { parseNumber } from './values.js';
import { FLAGS, ID_PATTERN, RESERVED } from './words.js';

// 종류마다 행 줄의 문장 낱말
const ROW_WORD = { bar: 'row', dumbbell: 'row', box: 'row', scatter: 'point', line: 'point', heatmap: 'cell' };

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 문장 낱말 수
// basis: estimate
/** 차트 선언 하나를 읽는다. */
export function readChartDeclaration(statement, ctx) {
  const word = statement.tokens[0].value;
  const handlers = { series: readSeries, rule: readRule, missing: readMissing, data: readData, row: readRow, point: readPoint, cell: readCell, link: readLink };
  if (!handlers[word]) {
    ctx.problems.error(statement.line, `unknown chart statement "${word}"`);
    return;
  }
  const rowWord = ROW_WORD[ctx.figure.chartType];
  const isRowStatement = ['row', 'point', 'cell'].includes(word);
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

// cost: time O(w), heap O(1), stack O(1)
// vars: w = 예약어 수
// basis: estimate
// `series id "이름" [key="JSON 키"]`
function readSeries({ tokens, line }, { figure, problems }) {
  const [, id, label, key, extra] = tokens;
  const isKey = key === undefined || (key.type === 'option' && key.key === 'key' && key.valueType === 'text');
  if (id?.type !== 'word' || label?.type !== 'text' || !isKey || extra) {
    problems.error(line, 'write a series as: series id "name" [key="json key"]');
    return;
  }
  if (!ID_PATTERN.test(id.value) || RESERVED.has(id.value) || FLAGS.includes(id.value)) {
    problems.error(line, `"${id.value}" is not a valid series name. Use lowercase letters, digits, and "-" and avoid reserved words`);
    return;
  }
  figure.chart.series.push({ id: id.value, label: label.value, key: key?.value ?? id.value, line });
}

// `rule 값 "라벨"`
function readRule({ tokens, line }, { figure, problems }) {
  const [, value, label, extra] = tokens;
  const number = parseNumber(value?.value);
  if (value?.type !== 'word' || number === undefined || label?.type !== 'text' || extra) {
    problems.error(line, 'write a rule as: rule 5 "label"');
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
  const values = readValues(rest, line, problems);
  if (values) figure.chart.rows.push({ label: label.value, values, line });
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
  const values = readValues(isScatter ? rest : tokens.slice(1), line, problems, isScatter ? ['series'] : []);
  if (values) figure.chart.rows.push({ label: isScatter ? name.value : undefined, values, line });
  else figure.chart.hasRejectedRow = true;
}

// `cell "행" "열" 값`
function readCell({ tokens, line }, { figure, problems }) {
  const [, row, col, value, extra] = tokens;
  const number = parseNumber(value?.value);
  if (row?.type !== 'text' || col?.type !== 'text' || value?.type !== 'word' || number === undefined || extra) {
    problems.error(line, 'write a cell as: cell "row" "column" 12');
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
function readValues(tokens, line, problems, textKeys = []) {
  const values = {};
  for (const t of tokens) {
    if (t.type !== 'option' || t.valueType !== 'word') {
      problems.error(line, `write values as key=number. Found "${t.value}"`);
      return undefined;
    }
    if (t.key in values) {
      problems.error(line, `"${t.key}" is written twice`);
      return undefined;
    }
    if (textKeys.includes(t.key)) {
      values[t.key] = t.value;
      continue;
    }
    const number = t.value === '-' ? null : parseNumber(t.value);
    if (number === undefined) {
      problems.error(line, `"${t.key}" needs a number or "-". Found "${t.value}"`);
      return undefined;
    }
    values[t.key] = number;
  }
  return values;
}

