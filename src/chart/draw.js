// 여섯 종류 차트를 SVG 조각으로 그린다. 계열 요소는 class `cs-{계열 번호}`, 행 요소는 `cr-{행 번호}`를 달아 재생이 드러내기와 밝히기를 건다.
import { measure } from '../measure/fonts.js';
import { STYLE } from '../measure/sizes.js';
import { centerBaseline, escapeXml, roundCoord as r } from '../text.js';
import { tokens, values } from '../tokens.js';
import { formatChange, formatNumber, makeScale } from './scale.js';

const SPACE = values.space;
const SIZE = values.size;
const TEXT = values.size.text;
const WIDTH = SIZE['chart-width'];
const LABEL_W = SIZE['chart-label'];
const LABEL_MAX = SIZE['chart-label-max'];
const LABEL_GAP = SPACE['6'];
// 차트 항목 이름이 칸에 들어가는 최대 폭
const LABEL_ROOM = LABEL_MAX - LABEL_GAP;
const BAR = SIZE['chart-bar'];
const ROW = SIZE['chart-row'];
const DOT = SIZE['chart-dot'];
const PAD = SPACE['14'];
// 값 글자가 막대 끝 바깥에 들어갈 자리
const VALUE_W = SPACE['30'] + SPACE['18'];
const HEAT_MIN = values.opacity['heat-min'];
const SERIES_COLOR = [tokens.color['series-1'], tokens.color['series-2']];

// cost: time O(r·s + t), heap O(out), stack O(1)
// vars: r = 행 수, s = 계열 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 차트 하나를 그린다.
 * @returns { body, width, height, rowKeys, fits }. rowKeys[k]는 행 k의 light 이름이다. fits는 칸에 들어가야 하는 글({ text, width, room, line, what })이다
 */
export function drawChart(figure) {
  const header = drawHeader(figure);
  const draw = { bar: drawBars, dumbbell: drawDumbbells, box: drawBoxes, scatter: drawScatter, line: drawLine, heatmap: drawHeatmap }[figure.chartType];
  const plot = draw(figure, header.bottom);
  // 계열이 없는 차트는 그림 전체를 계열 0으로 묶는다. 시간표가 차트 전체를 계열 하나로 보기 때문이다(timeline.js chartSeriesIds).
  const marks = figure.chart.series.length ? plot.svg : `<g class="cs-0">${plot.svg}</g>`;
  return { body: `${header.svg}\n${marks}`, width: WIDTH, height: plot.bottom + PAD, rowKeys: plot.rowKeys, fits: plot.fits ?? [] };
}

// cost: time O(r·n), heap O(1), stack O(1)
// vars: r = 항목 수, n = 이름 글자 수
// basis: estimate
/** 항목 이름 칸 너비. 가장 긴 이름에 맞추되 LABEL_W와 LABEL_MAX 사이다. 넘는 이름은 그림 검사 1번이 알린다. */
export function labelColumn(names) {
  return Math.min(LABEL_MAX, Math.max(LABEL_W, ...names.map((name) => measure(name, TEXT['13']) + LABEL_GAP)));
}

function labelFit(name, line) {
  return { text: name, width: measure(name, TEXT['13']), room: LABEL_ROOM, line, what: 'item name' };
}

// cost: time O(s·n), heap O(out), stack O(1)
// vars: s = 계열 수, n = 계열 이름 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 제목, 부제, 계열 범례
function drawHeader(figure) {
  const parts = [];
  let y = PAD;
  if (figure.title) {
    parts.push(`<text x="${PAD}" y="${r(y + TEXT['15'])}" class="chart-title">${escapeXml(figure.title)}</text>`);
    y += TEXT['15'] + SPACE['4'];
  }
  if (figure.subtitle) {
    parts.push(`<text x="${PAD}" y="${r(y + TEXT['12'])}" class="chart-sub">${escapeXml(figure.subtitle)}</text>`);
    y += TEXT['12'] + SPACE['5'];
  }
  if (figure.chart.series.length) {
    let x = PAD;
    figure.chart.series.forEach((s, i) => {
      parts.push(`<g class="cs-${i}"><rect x="${x}" y="${r(y + SPACE['2'])}" width="${BAR}" height="${BAR}" rx="${values.radius.sm}" fill="${SERIES_COLOR[i]}"/>` + `<text x="${x + BAR + SPACE['3']}" y="${r(y + BAR)}" class="chart-legend">${escapeXml(s.label)}</text></g>`);
      x += BAR + SPACE['3'] + measure(s.label, TEXT['12']) + SPACE['9'];
    });
    y += BAR + SPACE['6'];
  }
  return { svg: parts.join('\n'), bottom: y + SPACE['6'] };
}

// cost: time O(r·s), heap O(out), stack O(1)
// vars: r = 행 수, s = 계열 수, out = 만든 SVG 글자 수
// basis: estimate
// 막대: 행마다 계열 막대를 쌓고, 신뢰구간 막대기와 값 글자를 붙인다. 값이 없으면 missing 글이다.
function drawBars(figure, top) {
  const { chart } = figure;
  const plotX = labelColumn(chart.rows.map((row) => row.label)) + PAD;
  const plotW = WIDTH - plotX - VALUE_W;
  const all = chart.rows.flatMap((row) => chart.series.flatMap((s) => [row.values[s.id], row.values[`${s.id}.high`]])).filter((v) => typeof v === 'number');
  const scale = makeScale('linear', 0, Math.max(...all, ...chart.rules.map((x) => x.value)), plotX, plotW);
  const parts = [];
  let y = top;
  chart.rows.forEach((row, k) => {
    const groupH = chart.series.length * BAR + (chart.series.length - 1) * SPACE['2'];
    parts.push(`<text x="${PAD}" y="${r(centerBaseline(y + groupH / 2, TEXT['13']))}" class="chart-label cr-${k}">${escapeXml(row.label)}</text>`);
    chart.series.forEach((s, i) => {
      const by = y + i * (BAR + SPACE['2']);
      const v = row.values[s.id];
      if (v === null) {
        parts.push(`<g class="cr-${k}"><g class="cs-${i}"><text x="${r(plotX)}" y="${r(by + BAR - SPACE['1'])}" class="chart-missing">${escapeXml(chart.missing ?? '비교 없음')}</text></g></g>`);
        return;
      }
      const end = scale.at(v);
      const [low, high] = [row.values[`${s.id}.low`], row.values[`${s.id}.high`]];
      const ci = low !== undefined && high !== undefined ? `<line x1="${r(scale.at(low))}" x2="${r(scale.at(high))}" y1="${r(by + BAR / 2)}" y2="${r(by + BAR / 2)}" class="chart-ci"/>` : '';
      parts.push(
        `<g class="cr-${k}"><g class="cs-${i}"><rect x="${r(plotX)}" y="${r(by)}" width="${r(Math.max(SPACE['1'], end - plotX))}" height="${BAR}" rx="${values.radius.sm}" fill="${SERIES_COLOR[i]}" class="grow"/>${ci}` +
          `<text x="${r(Math.max(end, high !== undefined ? scale.at(high) : end) + SPACE['3'])}" y="${r(by + BAR - SPACE['1'])}" class="chart-value${i === 0 ? ' ours' : ''} late">${formatNumber(v)}</text></g></g>`,
      );
    });
    y += groupH + SPACE['11'];
  });
  const bottom = y - SPACE['11'];
  parts.push(drawRules(chart.rules, scale, top, bottom, 'x'));
  parts.push(drawValueAxis(scale, plotX, plotW, bottom + SPACE['4'], chart.x));
  return { svg: parts.join('\n'), bottom: bottom + SPACE['4'] + TEXT['11'] * 2 + SPACE['9'], rowKeys: chart.rows.map((row) => row.label), fits: chart.rows.map((row) => labelFit(row.label, row.line)) };
}

// cost: time O(r + t), heap O(out), stack O(1)
// vars: r = 행 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 덤벨: 첫 계열 값(핵심 색 1 빈 점)에서 둘째 계열 값(핵심 색 2 화살촉)으로 화살표, 오른쪽에 바뀐 비율
function drawDumbbells(figure, top) {
  const { chart } = figure;
  const [first, second] = chart.series;
  const plotX = labelColumn(chart.rows.map((row) => row.label)) + PAD;
  const plotW = WIDTH - plotX - VALUE_W;
  const all = chart.rows.flatMap((row) => [row.values[first.id], row.values[second.id]]);
  const ruled = [...all, ...chart.rules.map((x) => x.value)];
  const scale = makeScale(chart.scale, Math.min(...ruled), Math.max(...ruled), plotX, plotW);
  const parts = [];
  chart.rows.forEach((row, k) => {
    const cy = top + k * ROW + ROW / 2;
    const [before, after] = [row.values[first.id], row.values[second.id]];
    const [x1, x2] = [scale.at(before), scale.at(after)];
    const outward = x1 >= x2 ? 1 : -1;
    const base = r(centerBaseline(cy, TEXT['11']));
    parts.push(
      `<text x="${PAD}" y="${r(centerBaseline(cy, TEXT['13']))}" class="chart-label cr-${k}">${escapeXml(row.label)}</text>` +
        `<g class="cr-${k}"><g class="cs-0"><circle cx="${r(x1)}" cy="${r(cy)}" r="${DOT}" class="chart-before pop"/><text x="${r(x1 + outward * (DOT + SPACE['3']))}" y="${base}" class="chart-value first late ${outward > 0 ? 'start' : 'end'}">${formatNumber(before)}</text></g>` +
        `<g class="cs-1"><line x1="${r(x1)}" y1="${r(cy)}" x2="${r(x2)}" y2="${r(cy)}" pathLength="1" class="chart-arrow draw" marker-end="url(#fl-arrow-second)"/>` +
        `<text x="${r(x2 - outward * (DOT + SPACE['3']))}" y="${base}" class="chart-value second late ${outward > 0 ? 'end' : 'start'}">${formatNumber(after)}</text>` +
        `<text x="${WIDTH - PAD}" y="${r(centerBaseline(cy, TEXT['12']))}" class="chart-ratio late">${formatChange(before, after)}</text></g></g>`,
    );
  });
  const bottom = top + chart.rows.length * ROW;
  parts.push(drawRules(chart.rules, scale, top, bottom, 'x'));
  parts.push(drawValueAxis(scale, plotX, plotW, bottom + SPACE['4'], chart.x));
  return { svg: parts.join('\n'), bottom: bottom + SPACE['4'] + TEXT['11'] * 2 + SPACE['9'], rowKeys: chart.rows.map((row) => row.label), fits: chart.rows.map((row) => labelFit(row.label, row.line)) };
}

// cost: time O(r + t), heap O(out), stack O(1)
// vars: r = 행 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 상자: 최소-최대 수염, q1-q3 상자, 가운데 값 선
function drawBoxes(figure, top) {
  const { chart } = figure;
  const plotX = labelColumn(chart.rows.map((row) => row.label)) + PAD;
  const plotW = WIDTH - plotX - VALUE_W;
  const all = chart.rows.flatMap((row) => [row.values.min, row.values.max]);
  const ruled = [...all, ...chart.rules.map((x) => x.value)];
  const scale = makeScale(chart.scale, Math.min(...ruled), Math.max(...ruled), plotX, plotW);
  const parts = chart.rows.map((row, k) => {
    const cy = top + k * ROW + ROW / 2;
    const v = row.values;
    const [a, q1, m, q3, b] = [v.min, v.q1, v.median, v.q3, v.max].map(scale.at);
    return (
      `<text x="${PAD}" y="${r(centerBaseline(cy, TEXT['13']))}" class="chart-label cr-${k}">${escapeXml(row.label)}</text>` +
      `<g class="cr-${k}"><line x1="${r(a)}" x2="${r(b)}" y1="${r(cy)}" y2="${r(cy)}" class="chart-whisker"/>` +
      `<rect x="${r(q1)}" y="${r(cy - BAR)}" width="${r(Math.max(1, q3 - q1))}" height="${BAR * 2}" rx="${values.radius.sm}" class="chart-box grow"/>` +
      `<line x1="${r(m)}" x2="${r(m)}" y1="${r(cy - BAR)}" y2="${r(cy + BAR)}" class="chart-median"/>` +
      `<text x="${r(b + SPACE['3'])}" y="${r(centerBaseline(cy, TEXT['11']))}" class="chart-value late">${formatNumber(v.median)}</text></g>`
    );
  });
  const bottom = top + chart.rows.length * ROW;
  parts.push(drawRules(chart.rules, scale, top, bottom, 'x'));
  parts.push(drawValueAxis(scale, plotX, plotW, bottom + SPACE['4'], chart.x));
  return { svg: parts.join('\n'), bottom: bottom + SPACE['4'] + TEXT['11'] * 2 + SPACE['9'], rowKeys: chart.rows.map((row) => row.label), fits: chart.rows.map((row) => labelFit(row.label, row.line)) };
}

// cost: time O(p + l + t), heap O(out), stack O(1)
// vars: p = 점 수, l = link 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 산점도: 같은 크기 점, 이름 글자, link 화살표. 계열이 있으면 계열 색이다.
function drawScatter(figure, top) {
  const { chart } = figure;
  const { sx, sy, frame, top: plotTop } = plotFrame(figure, top, chart.rows.map((p) => p.values.x), chart.rows.map((p) => p.values.y));
  const seriesIndex = (p) => Math.max(0, chart.series.findIndex((s) => s.id === p.values.series));
  const parts = [frame];
  const at = new Map(chart.rows.map((p) => [p.label, { x: sx.at(p.values.x), y: sy.at(p.values.y), p }]));
  for (const link of chart.links) {
    const [a, b] = [at.get(link.from), at.get(link.to)];
    const ka = chart.rows.indexOf(a.p);
    // 두 점의 테두리에서 끊는다. 화살촉이 끝 점에 가려 방향이 안 보이는 일을 막기 위해서다.
    const gap = DOT + SPACE['2'];
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const [ux, uy] = [(b.x - a.x) / length, (b.y - a.y) / length];
    const [x1, y1, x2, y2] = [a.x + ux * gap, a.y + uy * gap, b.x - ux * gap, b.y - uy * gap];
    parts.push(`<g class="cr-${ka}"><g class="cs-${seriesIndex(b.p)}"><line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" pathLength="1" class="chart-link draw" marker-end="url(#fl-arrow)"/></g></g>`);
  }
  const fits = [];
  chart.rows.forEach((p, k) => {
    const { x, y } = at.get(p.label);
    const i = seriesIndex(p);
    // 점 이름은 점 오른쪽에 두고, 그림 오른쪽 끝을 넘으면 점 왼쪽으로 옮긴다.
    const nameW = measure(p.label, TEXT['12']);
    const offset = DOT + SPACE['3'];
    const toLeft = x + offset + nameW > WIDTH - PAD;
    fits.push({ text: p.label, width: nameW, room: Math.max(WIDTH - PAD - x, x - PAD) - offset, line: p.line, what: 'point name' });
    const name = `<text x="${r(toLeft ? x - offset : x + offset)}" y="${r(centerBaseline(y, TEXT['11']))}" class="chart-name late${toLeft ? ' end' : ''}">${escapeXml(p.label)}</text>`;
    parts.push(`<g class="cr-${k}"><g class="cs-${i}"><circle cx="${r(x)}" cy="${r(y)}" r="${DOT}" fill="${chart.series.length ? SERIES_COLOR[i] : SERIES_COLOR[0]}" class="pop"/>${name}</g></g>`);
  });
  parts.push(drawRules(chart.rules, sy, sx.at(sx.ticks[0]), sx.at(sx.ticks.at(-1)), 'y'));
  return { svg: parts.join('\n'), bottom: plotTop + SIZE['chart-plot-h'] + TEXT['11'] * 2 + SPACE['12'], rowKeys: chart.rows.map((p) => p.label), fits };
}

// cost: time O(p·s + t), heap O(out), stack O(1)
// vars: p = 점 수, s = 계열 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 선 차트: 계열마다 선과 점 표시. x 순서대로 잇는다.
function drawLine(figure, top) {
  const { chart } = figure;
  const points = [...chart.rows].sort((a, b) => a.values.x - b.values.x);
  const ys = points.flatMap((p) => chart.series.map((s) => p.values[s.id]));
  const { sx, sy, frame, top: plotTop } = plotFrame(figure, top, points.map((p) => p.values.x), ys);
  const parts = [frame];
  chart.series.forEach((s, i) => {
    const d = points.map((p, k) => `${k ? 'L' : 'M'} ${r(sx.at(p.values.x))} ${r(sy.at(p.values[s.id]))}`).join(' ');
    parts.push(`<g class="cs-${i}"><path d="${d}" fill="none" stroke="${SERIES_COLOR[i]}" stroke-width="${values.border.strong}" pathLength="1" class="draw"/></g>`);
  });
  chart.rows.forEach((p, k) => {
    for (const [i, s] of chart.series.entries()) parts.push(`<g class="cr-${k}"><g class="cs-${i}"><circle cx="${r(sx.at(p.values.x))}" cy="${r(sy.at(p.values[s.id]))}" r="${DOT}" fill="${SERIES_COLOR[i]}" class="pop"/></g></g>`);
  });
  parts.push(drawRules(chart.rules, sy, sx.at(sx.ticks[0]), sx.at(sx.ticks.at(-1)), 'y'));
  return { svg: parts.join('\n'), bottom: plotTop + SIZE['chart-plot-h'] + TEXT['11'] * 2 + SPACE['12'], rowKeys: chart.rows.map((p) => `x=${p.values.x}`) };
}

// cost: time O(c), heap O(out), stack O(1)
// vars: c = 칸 수, out = 만든 SVG 글자 수
// basis: estimate
// 히트맵: 행과 열 이름, 값에 비례한 칸 진하기, 칸 안 값
function drawHeatmap(figure, top) {
  const { chart } = figure;
  const rows = [...new Set(chart.rows.map((c) => c.row))];
  const cols = [...new Set(chart.rows.map((c) => c.col))];
  const plotX = labelColumn(rows) + PAD;
  const cell = Math.min(SIZE['chart-cell'], (WIDTH - plotX - PAD) / cols.length);
  const max = Math.max(...chart.rows.map((c) => c.values.value));
  const parts = cols.map((c, j) => `<text x="${r(plotX + j * cell + cell / 2)}" y="${r(top + TEXT['11'])}" class="chart-tick">${escapeXml(c)}</text>`);
  const gridTop = top + TEXT['11'] + SPACE['4'];
  rows.forEach((row, i) => parts.push(`<text x="${PAD}" y="${r(centerBaseline(gridTop + i * cell + cell / 2, TEXT['13']))}" class="chart-label">${escapeXml(row)}</text>`));
  chart.rows.forEach((c, k) => {
    const [x, y] = [plotX + cols.indexOf(c.col) * cell, gridTop + rows.indexOf(c.row) * cell];
    const strength = max ? c.values.value / max : 0;
    parts.push(
      `<g class="cr-${k}"><rect x="${r(x)}" y="${r(y)}" width="${r(cell - SPACE['1'])}" height="${r(cell - SPACE['1'])}" rx="${values.radius.sm}" fill="${SERIES_COLOR[0]}" fill-opacity="${r(HEAT_MIN + strength * (1 - HEAT_MIN))}"/>` +
        `<text x="${r(x + cell / 2)}" y="${r(centerBaseline(y + cell / 2, TEXT['11']))}" class="chart-cell${HEAT_MIN + strength * (1 - HEAT_MIN) > values.opacity['heat-text'] ? ' on' : ''}">${formatNumber(c.values.value)}</text></g>`,
    );
  });
  // 열 이름은 칸 너비 안에 들어가야 한다. 넘으면 옆 열 이름과 겹친다.
  const fits = cols.map((c) => ({ text: c, width: measure(c, TEXT['11'], 'mono'), room: cell - SPACE['1'], line: chart.rows.find((row) => row.col === c).line, what: 'column name' }));
  fits.push(...rows.map((row) => labelFit(row, chart.rows.find((c) => c.row === row).line)));
  return { svg: parts.join('\n'), bottom: gridTop + rows.length * cell, rowKeys: chart.rows.map((c) => `${c.row}\u0000${c.col}`), fits };
}

// cost: time O(t), heap O(out), stack O(1)
// vars: t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 산점도와 선 차트의 그림 영역: 두 축, 격자, 눈금, 축 제목
function plotFrame(figure, top, xs, ys) {
  const { chart } = figure;
  const left = PAD + SIZE['chart-axis'];
  const plotW = WIDTH - left - PAD - SPACE['30'];
  const plotH = SIZE['chart-plot-h'];
  // 세로축 제목은 그림 영역 위 한 줄에 둔다. 맨 위 눈금 글자와 겹치지 않게 그만큼 내린다.
  const titleH = chart.y ? values.size.text['11'] + SPACE['8'] : 0;
  top += titleH;
  const xKind = figure.chartType === 'scatter' ? chart.scale : 'linear';
  // 선 차트 가로축은 값 축이 아니라 0에서 시작하지 않는다(docs/design/charts.md 값 축 표).
  const sx = makeScale(xKind, Math.min(...xs), Math.max(...xs), left, plotW, { fromZero: figure.chartType === 'scatter' });
  // 기준선은 세로 값 축에 긋는다. 기준선이 그림 밖에 그려지지 않게 값 범위에 넣는다.
  const ruledYs = [...ys, ...chart.rules.map((x) => x.value)];
  const yScale = makeScale(chart.scale, Math.min(...ruledYs), Math.max(...ruledYs), 0, plotH);
  const sy = { ...yScale, at: (v) => top + plotH - (yScale.at(v) - 0) };
  const parts = [];
  for (const t of sy.ticks) parts.push(`<line x1="${left}" x2="${r(left + plotW)}" y1="${r(sy.at(t))}" y2="${r(sy.at(t))}" class="chart-grid"/><text x="${r(left - SPACE['3'])}" y="${r(centerBaseline(sy.at(t), TEXT['11']))}" class="chart-tick end">${formatNumber(t)}</text>`);
  for (const t of sx.ticks) parts.push(`<text x="${r(sx.at(t))}" y="${r(top + plotH + TEXT['11'] + SPACE['3'])}" class="chart-tick">${formatNumber(t)}</text>`);
  if (chart.x) parts.push(`<text x="${r(left + plotW)}" y="${r(top + plotH + TEXT['11'] * 2 + SPACE['8'])}" class="chart-unit">${escapeXml(chart.x)}</text>`);
  if (chart.y) parts.push(`<text x="${PAD}" y="${r(top - titleH + values.size.text['11'])}" class="chart-unit start">${escapeXml(chart.y)}</text>`);
  return { sx, sy, frame: parts.join(''), top };
}

// cost: time O(t), heap O(out), stack O(1)
// vars: t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 값 축: 축선, 눈금 글자, 축 제목
function drawValueAxis(scale, x, width, y, title) {
  const ticks = scale.ticks.map((t) => `<text x="${r(scale.at(t))}" y="${r(y + TEXT['11'] + SPACE['3'])}" class="chart-tick">${formatNumber(t)}</text>`).join('');
  const label = title ? `<text x="${r(x + width)}" y="${r(y + TEXT['11'] * 2 + SPACE['6'])}" class="chart-unit">${escapeXml(title)}</text>` : '';
  return `<line x1="${r(x)}" x2="${r(x + width)}" y1="${r(y)}" y2="${r(y)}" class="chart-axis"/>${ticks}${label}`;
}

// cost: time O(r), heap O(out), stack O(1)
// vars: r = 기준선 수, out = 만든 SVG 글자 수
// basis: estimate
// 기준선: 값 축에 수직인 점선과 라벨
function drawRules(rules, scale, from, to, axis) {
  return rules
    .map((rule) => {
      const at = scale.at(rule.value);
      return axis === 'x'
        ? `<line x1="${r(at)}" x2="${r(at)}" y1="${r(from - SPACE['3'])}" y2="${r(to)}" class="chart-rule"/><text x="${r(at + SPACE['2'])}" y="${r(from - SPACE['4'])}" class="chart-rule-label">${escapeXml(rule.label)}</text>`
        : `<line x1="${r(from)}" x2="${r(to)}" y1="${r(at)}" y2="${r(at)}" class="chart-rule"/><text x="${r(to)}" y="${r(at - SPACE['2'])}" class="chart-rule-label end">${escapeXml(rule.label)}</text>`;
    })
    .join('');
}

// cost: time O(r + n), heap O(n), stack O(1)
// vars: r = 행 수, n = 글자 수
// basis: estimate
/** 차트에 쓰는 글자를 글꼴 조각에 모은다. */
export function chartText(figure) {
  const { chart } = figure;
  return [figure.title, figure.subtitle, chart.x, chart.y, chart.missing ?? '비교 없음', ...chart.series.map((s) => s.label), ...chart.rules.map((x) => x.label), ...chart.rows.flatMap((row) => [row.label ?? '', row.row ?? '', row.col ?? ''])]
    .filter(Boolean)
    .join('') + '0123456789.kM−+%-';
}

export { STYLE };
