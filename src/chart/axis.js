// 차트 축: 값 축 길이 맞춤, 눈금, 축 제목, 기준선, 산점도와 선 차트의 그림 영역.
import { measure } from '../measure/fonts.js';
import { renderRich, roundCoord as r } from '../text.js';
import { labelColumn, labelFit } from './labels.js';
import { PAD, RIGHT, SPACE, TEXT } from './metrics.js';
import { makeScale } from './scale.js';
import { compactAxis } from './compact-axis.js';

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 요소 수
// basis: estimate
/**
 * 값 축 길이. 값 v의 요소는 start + 비율(v) × 길이 + extra까지 닿는다(extra는 값 글자, 점 반지름 같은 고정 폭).
 * 모든 요소가 right 안에 들어가는 가장 긴 길이를 돌려줘, 가장 멀리 닿는 요소가 right에 맞는다. 그래서 왼쪽 여백과 오른쪽 여백이 같다.
 * @param items { value, extra }[]. 비율이 0인 요소는 길이와 상관없어 건너뛴다
 * @param span { start, right }. right를 빼면 내용의 오른쪽 끝(RIGHT)이다
 */
export function fitLength(unit, items, { start, right = RIGHT }) {
  return Math.min(...items.map(({ value, extra }) => (unit.at(value) > 0 ? (right - start - extra) / unit.at(value) : Infinity)));
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 눈금 수
// basis: estimate
// 값 축 눈금 글자는 눈금 가운데에 놓여 양쪽으로 절반씩 나온다.
export function tickReach(unit) {
  return unit.ticks.map((value, i) => ({ value, extra: measure(unit.labels[i], TEXT['11'], 'num') / 2 }));
}

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 기준선 수
// basis: estimate
// 기준선 라벨은 기준선 오른쪽에서 시작한다.
function ruleReach(rules) {
  return rules.map((rule) => ({ value: rule.value, extra: SPACE["1"] + measure(rule.label, TEXT['11']) }));
}

// 눈금 글자 기준선은 축선에서 글자 높이 더하기 한 칸, 축 제목 기준선은 그 아래 글자 한 줄과 한 칸이다.
const TICK_BASE = TEXT['11'] + SPACE["1-5"];
const TITLE_BASE = TEXT['11'] * 2 + SPACE["3"];
// 마지막 글자 줄의 먹이 기준선 아래로 내려오는 몫. 위쪽은 제목 글자 줄 윗면이 PAD 아래에서 시작해 먹이 그만큼 내려와 있어, 아래도 같게 둬 위아래 여백이 같아 보이게 한다.
const LINE_DROP = SPACE["0-75"];

// cost: time O(t), heap O(out), stack O(1)
// vars: t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
/** 값 축 아래 글자: 눈금 글자와 오른쪽 끝에 맞춘 축 제목. y는 축선(눈금 0 줄)의 세로 자리다. */
export function axisLabels(scale, y, title) {
  const ticks = scale.ticks.map((t, i) => `<text x="${r(scale.at(t))}" y="${r(y + TICK_BASE)}" class="chart-tick">${scale.labels[i]}</text>`).join('');
  const label = title ? `<text x="${r(scale.start + scale.length)}" y="${r(y + TITLE_BASE)}" class="chart-unit">${renderRich(title)}</text>` : '';
  return ticks + label;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/** 축 글자까지 포함한 차트 내용의 아래 끝. 그림 아래 여백(PAD)은 이 아래에 더한다. 축 제목이 없으면 눈금 글자 줄이 끝이다. */
export function axisEnd(y, hasTitle) {
  return y + (hasTitle ? TITLE_BASE : TICK_BASE) + LINE_DROP;
}

// cost: time O(t + n²), heap O(out), stack O(1)
// vars: t = 눈금 수, n = 축 제목 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 값 축: 축선, 눈금 글자, 축 제목
function drawValueAxis(chart, scale, y) {
  const { start, length } = scale;
  const axis = chart.layout ? compactAxis(scale, y, chart.x) : { svg: axisLabels(scale, y, chart.x), bottom: axisEnd(y, Boolean(chart.x)) };
  return { svg: `<line x1="${r(start)}" x2="${r(start + length)}" y1="${r(y)}" y2="${r(y)}" class="chart-axis"/>${axis.svg}`, bottom: axis.bottom };
}

// cost: time O(o), heap O(1), stack O(1)
// vars: o = 데이터가 차지한 자리 수
// basis: estimate
// 가로 기준선 라벨 자리. 오른쪽 끝이 기본이고, 데이터가 더 많이 가리면 왼쪽 끝에 둔다. 가린 수가 같으면 오른쪽이다.
function ruleLabelSide(rule, at, { from, to, occupied }) {
  const width = measure(rule.label, TEXT['11']);
  const [top, bottom] = [at - SPACE["1"] - TEXT['11'], at - SPACE["1"]];
  const hits = (x0, x1) => occupied.filter((o) => o.x1 > x0 && o.x0 < x1 && o.y1 > top && o.y0 < bottom).length;
  return hits(to - width, to) <= hits(from, from + width) ? 'end' : 'start';
}

// cost: time O(r·o), heap O(out), stack O(1)
// vars: r = 기준선 수, o = 데이터가 차지한 자리 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 기준선: 값 축에 수직인 점선과 라벨
 * @param span { axis, from, to, occupied }. axis 'x'는 세로선(값 축이 가로), 'y'는 가로선이다. from과 to는 선이 닿는 구간이다.
 * occupied는 'y' 기준선 라벨을 피할 데이터 자리 { x0, x1, y0, y1 }[]이다
 */
export function drawRules(rules, scale, { axis, from, to, occupied = [], labels = true }) {
  return rules
    .map((rule) => {
      const at = scale.at(rule.value);
      if (axis === 'x') return `<line x1="${r(at)}" x2="${r(at)}" y1="${r(from - SPACE["1-5"])}" y2="${r(to)}" class="chart-rule"/>${labels ? `<text x="${r(at + SPACE["1"])}" y="${r(from - SPACE["2"])}" class="chart-rule-label">${renderRich(rule.label)}</text>` : ''}`;
      const isEnd = ruleLabelSide(rule, at, { from, to, occupied }) === 'end';
      return `<line x1="${r(from)}" x2="${r(to)}" y1="${r(at)}" y2="${r(at)}" class="chart-rule"/>${labels ? `<text x="${r(isEnd ? to : from)}" y="${r(at - SPACE["1"])}" class="chart-rule-label${isEnd ? ' end' : ''}">${renderRich(rule.label)}</text>` : ''}`;
    })
    .join('');
}

// cost: time O(r·s), heap O(r·s), stack O(1)
// vars: r = 행 수, s = 계열 수
// basis: estimate
/**
 * 막대, 덤벨, 상자의 값 축. 이름 칸 오른쪽에서 시작해 가장 멀리 닿는 요소가 오른쪽 끝에 맞는 길이다.
 * @param spec { kind, min, max, reaches }. reaches(unit)는 요소가 닿는 거리 목록이다
 * @returns { scale, plotX }
 */
export function rowValueScale(chart, { kind, min: low, max: high, reaches }) {
  // 값에 묶인 차트는 모든 프레임이 같은 축을 쓰도록 값 범위(extent)를 넓히고 그림 영역 길이(plotWidth)를 고정한다. probe는 프레임마다 정해지는 길이를 모으는 그릇이다.
  const [min, max] = [Math.min(low, chart.extent?.min ?? low), Math.max(high, chart.extent?.max ?? high)];
  const unit = makeScale(kind, { min, max, start: 0, length: 1 });
  const plotX = chart.layout ? PAD + measure(unit.labels[0], TEXT['11'], 'num') / 2 : labelColumn(chart.rows.map((row) => row.label)) + PAD;
  const fitted = fitLength(unit, [...reaches(unit), ...tickReach(unit), ...(chart.layout ? [] : ruleReach(chart.rules))], { start: plotX, right: chart.layout ? chart.layout.width - PAD : RIGHT });
  chart.probe?.push(fitted);
  const plotW = chart.plotWidth ?? fitted;
  return { scale: makeScale(kind, { min, max, start: plotX, length: plotW }), plotX };
}

// cost: time O(r + t), heap O(out), stack O(1)
// vars: r = 행 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 가로 행 차트의 마무리: 기준선, 값 축, 아래 끝, 그림 검사 항목.
 * @param body { parts, over, scale, top, bottom }. parts는 행을 그린 SVG 조각, over는 기준선 위에 그릴 조각(값 글자), top과 bottom은 행이 차지하는 구간이다
 */
export function finishRowChart(chart, { parts, over = [], scale, top, bottom }) {
  const rules = chart.layout ? '' : drawRules(chart.rules, scale, { axis: 'x', from: top, to: bottom });
  const axis = drawValueAxis(chart, scale, bottom + SPACE["2"]);
  const svg = [...parts, rules, ...over, axis.svg];
  return { svg: svg.join('\n'), bottom: axis.bottom, rowKeys: chart.rows.map((row) => row.label), fits: chart.rows.map((row) => labelFit(row.label, row.line)) };
}
