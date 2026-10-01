// 여섯 종류 차트를 SVG 조각으로 그린다. 계열 요소는 class `cs-{계열 번호}`, 행 요소는 `cr-{행 번호}`를 달아 재생이 드러내기와 밝히기를 건다.
import { measure } from '../measure/fonts.js';
import { STYLE } from '../measure/sizes.js';
import { centerBaseline, escapeXml, roundCoord as r } from '../text.js';
import { tokens, values } from '../tokens.js';
import { curveOf, timeAt } from '../easing.js';
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
const CAP = SIZE['chart-cap'];
const RANGE = SIZE['chart-range'];
const ARROW_MIN = SIZE['chart-arrow-min'];
// 값 글자가 막대 끝 바깥에 들어갈 자리
const VALUE_W = SPACE['30'] + SPACE['18'];
// 히트맵 칸 색. 값 0은 핵심 1 옅게, 최댓값은 핵심 1 진하게이고 그 사이는 sRGB 보간이다(문서 스킬 색표).
const HEAT_LOW = values.color['heat-low'];
const HEAT_HIGH = values.color['heat-high'];
const SERIES_COLOR = [tokens.color['series-1'], tokens.color['series-2']];
const REVEAL = curveOf('reveal');

// cost: time O(r·s + t), heap O(out), stack O(1)
// vars: r = 행 수, s = 계열 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 차트 하나를 그린다.
 * @returns { body, width, height, rowKeys, fits, dotAts }. rowKeys[k]는 행 k의 light 이름이다. dotAts는 선 차트 점이 나타나는 시각(자라는 시간 대비 비율, `data-at`)의 오름차순 목록이다. fits는 칸에 들어가야 하는 글({ text, width, room, line, what })이다
 */
export function drawChart(figure) {
  const header = drawHeader(figure);
  const draw = { bar: drawBars, dumbbell: drawDumbbells, box: drawBoxes, scatter: drawScatter, line: drawLine, heatmap: drawHeatmap }[figure.chartType];
  const plot = draw(figure, header.bottom);
  // 계열이 없는 차트는 그림 전체를 계열 0으로 묶는다. 시간표가 차트 전체를 계열 하나로 보기 때문이다(timeline.js chartSeriesIds).
  const marks = figure.chart.series.length ? plot.svg : `<g class="cs-0">${plot.svg}</g>`;
  return { body: `${header.svg}\n${marks}`, width: WIDTH, height: plot.bottom + PAD, rowKeys: plot.rowKeys, fits: plot.fits ?? [], dotAts: plot.dotAts ?? [] };
}

// cost: time O(r·n), heap O(1), stack O(1)
// vars: r = 항목 수, n = 이름 글자 수
// basis: estimate
/** 항목 이름 칸 너비. 가장 긴 이름에 맞추되 LABEL_W와 LABEL_MAX 사이다. 넘는 이름은 그림 검사 1번이 알린다. */
export function labelColumn(names) {
  return Math.min(LABEL_MAX, Math.max(LABEL_W, ...names.map((name) => measure(name, TEXT['13']) + LABEL_GAP)));
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
function heatColor(strength) {
  const channel = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mix = [0, 1, 2].map((i) => Math.round(channel(HEAT_LOW, i) + (channel(HEAT_HIGH, i) - channel(HEAT_LOW, i)) * strength));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
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
// 막대: 행마다 계열 막대를 쌓고, 신뢰구간 막대기(끝 캡 없는 선)와 값 글자를 붙인다. 값이 없으면 missing 글이다.
// 값 글자는 기준선에 걸려도 비키지 않고 막대 끝 옆에 둔다. 기준선보다 위에 그려 글자의 바탕색 테두리(halo)가 점선을 가리므로 막대, 기준선, 값 글자 순으로 쌓는다.
function drawBars(figure, top) {
  const { chart } = figure;
  const plotX = labelColumn(chart.rows.map((row) => row.label)) + PAD;
  const plotW = WIDTH - plotX - VALUE_W;
  const all = chart.rows.flatMap((row) => chart.series.flatMap((s) => [row.values[s.id], row.values[`${s.id}.high`]])).filter((v) => typeof v === 'number');
  const scale = makeScale('linear', 0, Math.max(...all, ...chart.rules.map((x) => x.value)), plotX, plotW);
  const parts = [];
  const valueTexts = [];
  let y = top;
  chart.rows.forEach((row, k) => {
    const groupH = chart.series.length * BAR + (chart.series.length - 1) * SPACE['2'];
    // 이름은 계열이 모두 보일 때 막대 묶음 가운데에 둔다. 계열을 하나씩 드러내는 동안은 시간표의 labelShift만큼 옮겨 보이는 막대에 맞춘다(timeline.js).
    parts.push(`<g class="cr-${k}"><text x="${PAD}" y="${r(centerBaseline(y + groupH / 2, TEXT['13']))}" class="chart-label shift">${escapeXml(row.label)}</text></g>`);
    chart.series.forEach((s, i) => {
      const by = y + i * (BAR + SPACE['2']);
      const cy = by + BAR / 2;
      const v = row.values[s.id];
      if (v === null) {
        parts.push(`<g class="cr-${k}"><g class="cs-${i}"><text x="${r(plotX)}" y="${r(centerBaseline(cy, TEXT['11']))}" class="chart-missing">${escapeXml(chart.missing ?? '비교 없음')}</text></g></g>`);
        return;
      }
      const end = scale.at(v);
      const [low, high] = [row.values[`${s.id}.low`], row.values[`${s.id}.high`]];
      const reach = high !== undefined ? scale.at(high) : end;
      const ci = high !== undefined ? `<line x1="${r(scale.at(low))}" x2="${r(reach)}" y1="${r(cy)}" y2="${r(cy)}" class="chart-ci late"/>` : '';
      parts.push(`<g class="cr-${k}"><g class="cs-${i}"><rect x="${r(plotX)}" y="${r(by)}" width="${r(Math.max(SPACE['1'], end - plotX))}" height="${BAR}" rx="${values.radius.sm}" fill="${SERIES_COLOR[i]}" class="grow"/>${ci}</g></g>`);
      valueTexts.push(`<g class="cr-${k}"><g class="cs-${i}"><text x="${r(Math.max(end, reach) + SPACE['3'])}" y="${r(centerBaseline(cy, TEXT['11']))}" class="chart-value${i === 0 ? ' ours' : ''} late">${formatNumber(v)}</text></g></g>`);
    });
    y += groupH + SPACE['11'];
  });
  const bottom = y - SPACE['11'];
  parts.push(drawRules(chart.rules, scale, top, bottom, 'x'));
  parts.push(...valueTexts);
  parts.push(drawValueAxis(scale, plotX, plotW, bottom + SPACE['4'], chart.x));
  return { svg: parts.join('\n'), bottom: bottom + SPACE['4'] + TEXT['11'] * 2 + SPACE['9'], rowKeys: chart.rows.map((row) => row.label), fits: chart.rows.map((row) => labelFit(row.label, row.line)) };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 선 차트에서 신뢰구간이 한 점뿐일 때 쓰는 세로 오차 막대. 점과 같은 시각 at에 나타난다. 경로 d는 구간 선과 양 끝 캡이고, 흰 바탕 위라서 보조 글자 색 가는 선으로 점보다 앞서지 않게 한다.
function pointInterval(d, at) {
  return `<path d="${d}" class="chart-interval dot" data-at="${at}"/>`;
}

// cost: time O(r + t), heap O(out), stack O(1)
// vars: r = 행 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 덤벨: 첫 계열 값(핵심 색 1 빈 점)에서 둘째 계열 값(핵심 색 2 화살촉)으로 화살표, 오른쪽에 바뀐 비율.
// 신뢰구간은 점 뒤에 같은 줄로 깔리는 옅은 범위 막대기다. 값 글자는 두 범위의 바깥 끝 밖에 두어 막대기, 점, 화살표와 겹치지 않는다.
// 두 점이 가까워 화살표를 그릴 자리가 없으면 화살표를 빼고 둘째 값을 점으로 찍는다.
function drawDumbbells(figure, top) {
  const { chart } = figure;
  const [first, second] = chart.series;
  const plotX = labelColumn(chart.rows.map((row) => row.label)) + PAD;
  const plotW = WIDTH - plotX - VALUE_W;
  const all = chart.rows.flatMap((row) => [first, second].flatMap((s) => [row.values[s.id], row.values[`${s.id}.low`], row.values[`${s.id}.high`]])).filter((v) => typeof v === 'number');
  const ruled = [...all, ...chart.rules.map((x) => x.value)];
  const scale = makeScale(chart.scale, Math.min(...ruled), Math.max(...ruled), plotX, plotW);
  const parts = [];
  chart.rows.forEach((row, k) => {
    const cy = top + k * ROW + ROW / 2;
    const [before, after] = [row.values[first.id], row.values[second.id]];
    const [x1, x2] = [scale.at(before), scale.at(after)];
    const dir = x2 >= x1 ? 1 : -1;
    const base = r(centerBaseline(cy, TEXT['11']));
    const range = (s, i) => {
      const [low, high] = [row.values[`${s.id}.low`], row.values[`${s.id}.high`]];
      return low === undefined ? '' : `<line x1="${r(scale.at(low))}" x2="${r(scale.at(high))}" y1="${r(cy)}" y2="${r(cy)}" stroke="${SERIES_COLOR[i]}" stroke-width="${RANGE}" class="chart-range pop"/>`;
    };
    // 값 글자는 두 점과 두 범위를 모두 덮는 구간의 바깥에 둔다. 한 점의 범위가 다른 점의 글자 자리까지 뻗어도 겹치지 않게 하기 위해서다.
    const ends = [first, second].flatMap((s, i) => {
      const x = i ? x2 : x1;
      return [x - DOT, x + DOT, ...[`${s.id}.low`, `${s.id}.high`].map((key) => row.values[key]).filter((v) => v !== undefined).map(scale.at)];
    });
    const [left, right] = [Math.min(...ends) - SPACE['3'], Math.max(...ends) + SPACE['3']];
    const gap = Math.abs(x2 - x1) - DOT - SPACE['1'];
    const hasArrow = gap >= ARROW_MIN;
    const arrow = hasArrow
      ? `<line x1="${r(x1 + dir * (DOT + SPACE['1']))}" y1="${r(cy)}" x2="${r(x2)}" y2="${r(cy)}" pathLength="1" class="chart-arrow draw" marker-end="url(#fl-arrow-second)"/>`
      : `<circle cx="${r(x2)}" cy="${r(cy)}" r="${DOT}" fill="${SERIES_COLOR[1]}" class="chart-after pop"/>`;
    const [firstX, secondX] = x1 < x2 ? [left, right] : [right, left];
    const side = (x) => (x === left ? 'end' : 'start');
    parts.push(
      `<text x="${PAD}" y="${r(centerBaseline(cy, TEXT['13']))}" class="chart-label cr-${k}">${escapeXml(row.label)}</text>` +
        `<g class="cr-${k}"><g class="cs-0">${range(first, 0)}<circle cx="${r(x1)}" cy="${r(cy)}" r="${DOT}" class="chart-before pop"/><text x="${r(firstX)}" y="${base}" class="chart-value first late ${side(firstX)}">${formatNumber(before)}</text></g>` +
        `<g class="cs-1">${range(second, 1)}${arrow}` +
        `<text x="${r(secondX)}" y="${base}" class="chart-value second late ${side(secondX)}">${formatNumber(after)}</text>` +
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
// 산점도: 같은 크기 점, 이름 글자, link 화살표. 계열이 있으면 계열 색이다. 신뢰구간은 받지 않는다.
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

// cost: time O(p·s·STEPS + t), heap O(out), stack O(1)
// vars: p = 점 수, s = 계열 수, STEPS = timeAt의 이분 탐색 횟수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 선 차트: 계열마다 선과 점 표시. x 순서대로 잇는다. 신뢰구간은 계열 색의 옅은 띠(low~high)이고 선과 점은 띠 위에 그린다.
// 신뢰구간이 이어진 점이 하나뿐이면 띠가 면이 못 되므로 세로 오차 막대로 그린다.
function drawLine(figure, top) {
  const { chart } = figure;
  const points = [...chart.rows].sort((a, b) => a.values.x - b.values.x);
  const ys = points.flatMap((p) => chart.series.flatMap((s) => [p.values[s.id], p.values[`${s.id}.low`], p.values[`${s.id}.high`]])).filter((v) => v !== undefined);
  const { sx, sy, frame, top: plotTop } = plotFrame(figure, top, points.map((p) => p.values.x), ys);
  const parts = [frame];
  const order = new Map(points.map((p, k) => [p, k]));
  const ats = chart.series.map((s) => arrivals(points.map((p) => [sx.at(p.values.x), sy.at(p.values[s.id])])));
  chart.series.forEach((s, i) => {
    const bands = intervalRuns(points, s.id).map((run) => (run.length > 1 ? bandPath(run, s.id, sx, sy, i) : pointInterval(verticalInterval(sx.at(run[0].values.x), sy.at(run[0].values[`${s.id}.low`]), sy.at(run[0].values[`${s.id}.high`])), ats[i][order.get(run[0])])));
    if (bands.length) parts.push(`<g class="cs-${i}">${bands.join('')}</g>`);
  });
  chart.series.forEach((s, i) => {
    const d = points.map((p, k) => `${k ? 'L' : 'M'} ${r(sx.at(p.values.x))} ${r(sy.at(p.values[s.id]))}`).join(' ');
    parts.push(`<g class="cs-${i}"><path d="${d}" fill="none" stroke="${SERIES_COLOR[i]}" stroke-width="${values.border.strong}" pathLength="1" class="draw"/></g>`);
  });
  chart.rows.forEach((p, k) => {
    for (const [i, s] of chart.series.entries()) parts.push(`<g class="cr-${k}"><g class="cs-${i}"><circle cx="${r(sx.at(p.values.x))}" cy="${r(sy.at(p.values[s.id]))}" r="${DOT}" fill="${SERIES_COLOR[i]}" class="dot" data-at="${ats[i][order.get(p)]}"/></g></g>`);
  });
  parts.push(drawRules(chart.rules, sy, sx.at(sx.ticks[0]), sx.at(sx.ticks.at(-1)), 'y'));
  return { svg: parts.join('\n'), bottom: plotTop + SIZE['chart-plot-h'] + TEXT['11'] * 2 + SPACE['12'], rowKeys: chart.rows.map((p) => `x=${p.values.x}`), dotAts: [...new Set(ats.flat())].sort((a, b) => a - b) };
}

// cost: time O(p·STEPS), heap O(p), stack O(1)
// vars: p = 점 수, STEPS = timeAt의 이분 탐색 횟수
// basis: estimate
// 선이 점마다 닿는 시각. 선은 왼쪽부터 길이 순서로 그려지고(dashoffset) 길이 비율 f에 닿는 시간 비율은 easing.reveal을 거꾸로 푼 timeAt(f)이다.
// 값은 자라는 시간 대비 비율이고 소수 셋째 자리로 줄인다. 재생기와 움직이는 SVG가 이 값에 자라는 시간을 곱해 쓴다.
function arrivals(xy) {
  const lengths = [0];
  for (let k = 1; k < xy.length; k++) lengths.push(lengths[k - 1] + Math.hypot(xy[k][0] - xy[k - 1][0], xy[k][1] - xy[k - 1][1]));
  const total = lengths.at(-1) || 1;
  return lengths.map((length) => Math.round(timeAt(REVEAL, length / total) * 1000) / 1000);
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 점 수
// basis: estimate
// x 순서 점 가운데 신뢰구간이 있는 점의 이어진 묶음들
function intervalRuns(points, id) {
  const runs = [];
  let run = [];
  for (const p of points) {
    if (p.values[`${id}.high`] !== undefined) run.push(p);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

// cost: time O(p), heap O(p), stack O(1)
// vars: p = 묶음의 점 수
// basis: estimate
// 띠: high를 왼쪽에서 오른쪽으로, low를 오른쪽에서 왼쪽으로 이은 면. 계열이 자랄 때 왼쪽부터 드러난다(wipe).
function bandPath(run, id, sx, sy, i) {
  const edge = (p, key) => `${r(sx.at(p.values.x))} ${r(sy.at(p.values[`${id}.${key}`]))}`;
  const d = [...run.map((p) => edge(p, 'high')), ...[...run].reverse().map((p) => edge(p, 'low'))].map((xy, k) => `${k ? 'L' : 'M'} ${xy}`).join(' ');
  return `<path d="${d} Z" fill="${SERIES_COLOR[i]}" class="chart-band wipe"/>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 세로 신뢰구간 경로: 세로선과 양 끝 가로 캡. yLow, yHigh는 화면 좌표다.
function verticalInterval(x, yLow, yHigh) {
  return `M ${r(x - CAP / 2)} ${r(yLow)} H ${r(x + CAP / 2)} M ${r(x)} ${r(yLow)} V ${r(yHigh)} M ${r(x - CAP / 2)} ${r(yHigh)} H ${r(x + CAP / 2)}`;
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
  // 칸 너비는 가장 긴 열 이름에 맞추되 남은 폭을 열 수로 나눈 값을 넘지 않는다. 칸 높이는 토큰 그대로다.
  const widestCol = Math.max(...cols.map((c) => measure(c, TEXT['11'], 'mono'))) + SPACE['4'];
  const cellW = Math.min(Math.max(SIZE['chart-cell'], widestCol), (WIDTH - plotX - PAD) / cols.length);
  const cellH = SIZE['chart-cell'];
  const max = Math.max(...chart.rows.map((c) => c.values.value));
  const parts = cols.map((c, j) => `<text x="${r(plotX + j * cellW + cellW / 2)}" y="${r(top + TEXT['11'])}" class="chart-tick">${escapeXml(c)}</text>`);
  const gridTop = top + TEXT['11'] + SPACE['4'];
  rows.forEach((row, i) => parts.push(`<text x="${PAD}" y="${r(centerBaseline(gridTop + i * cellH + cellH / 2, TEXT['13']))}" class="chart-label">${escapeXml(row)}</text>`));
  chart.rows.forEach((c, k) => {
    const [x, y] = [plotX + cols.indexOf(c.col) * cellW, gridTop + rows.indexOf(c.row) * cellH];
    const strength = max ? c.values.value / max : 0;
    parts.push(
      `<g class="cr-${k}"><rect x="${r(x)}" y="${r(y)}" width="${r(cellW - SPACE['1'])}" height="${r(cellH - SPACE['1'])}" rx="${values.radius.sm}" fill="${heatColor(strength)}"/>` +
        `<text x="${r(x + cellW / 2)}" y="${r(centerBaseline(y + cellH / 2, TEXT['11']))}" class="chart-cell${strength > values.opacity['heat-text'] ? ' on' : ''}">${formatNumber(c.values.value)}</text></g>`,
    );
  });
  // 열 이름은 칸 너비 안에 들어가야 한다. 넘으면 옆 열 이름과 겹친다.
  const fits = cols.map((c) => ({ text: c, width: measure(c, TEXT['11'], 'mono'), room: cellW - SPACE['1'], line: chart.rows.find((row) => row.col === c).line, what: 'column name' }));
  fits.push(...rows.map((row) => labelFit(row, chart.rows.find((c) => c.row === row).line)));
  return { svg: parts.join('\n'), bottom: gridTop + rows.length * cellH, rowKeys: chart.rows.map((c) => `${c.row}\u0000${c.col}`), fits };
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
