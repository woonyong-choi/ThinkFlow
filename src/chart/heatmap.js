// 히트맵: 행과 열 이름, 값에 비례한 칸 진하기, 칸 안 값
import { pickInk } from '../contrast.js';
import { roundToScale } from '../format.js';
import { measure, wrap } from '../measure/fonts.js';
import { centerBaseline, renderRich, roundCoord as r } from '../text.js';
import { tokens, values } from '../vendor/theme/tokens.js';
import { labelColumn, labelFit, labelText } from './labels.js';
import { markAttrs, markId } from './marks.js';
import { mixOklab } from './oklab.js';
import { PAD, RIGHT, SIZE, SPACE, TEXT } from './metrics.js';
import { valueFormat } from './scale.js';

// 칸 색. 값 0은 옅은 끝(heat-low), 최댓값은 진한 끝(heat-high)이고 그 사이는 OKLab 보간이다.
// 칸 색은 CSS(.chart-heat의 color-mix in oklab)가 변수로 계산해 다크 모드 값을 따라간다. 여기 hex는 color-mix를 모르는 뷰어용 대체 색(라이트)이고 같은 OKLab 보간이다.
// 칸 안 값 글자 후보. 칸마다 대비가 큰 쪽을 빌드 때 고른다. 다크는 두 후보가 같은 밝은 색이고 칸 색 범위가 그 글자와 4.5 이상이 되게 정했다(테스트가 모든 강도를 잰다).
// 칸 갱신 효과의 칠: 히트맵은 계열이 아니라 옅은 끝(heat-low)에서 짙은 끝(heat-high)으로 가는 하나의 띠라서 두 끝이 효과의 면과 테두리다.
const HEAT_PAINT = { tint: tokens.color.data['heat-low'], border: tokens.color.data['heat-high'] };
const LIGHT_HEAT = { low: values.color.data['heat-low'], high: values.color.data['heat-high'], ink: values.color.data['heat-ink'], inkOn: values.color.data['heat-ink-on'] };
// 칸 강도(0~1)를 `--s`에 담을 때 줄이는 자릿수 배율(소수 셋째 자리)
const STRENGTH_PRECISION = 1000;
// 이웃한 열 이름 사이에 남기는 간격
const COLUMN_GAP = SPACE["2"];

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 열 이름이 쓸 수 있는 폭. 이름은 칸 가운데에 놓이므로 칸 너비에서 이웃 이름과의 간격을 뺀 폭이면 이웃 이름과 COLUMN_GAP 이상 떨어진다. 줄바꿈과 그림 검사가 이 폭 하나를 읽는다.
function columnRoom(cellW) {
  return cellW - COLUMN_GAP;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 칸 하나의 모양. 칸 색(`fill`)과 글자색(`isOn`: 밝은 글자)을 같은 강도 한 값에서 같은 식으로 정한다. CSS `--s`도 이 `strength`를 쓰므로 CSS가 계산하는 칸 색과 어긋나지 않는다.
 * @param heat { low, high, ink, inkOn }. 칸 색 양끝과 글자 후보(`#rrggbb`)
 * @returns { strength, fill, isOn }. strength는 STRENGTH_PRECISION에 맞춰 줄인 강도다.
 */
function heatLook(rawStrength, heat) {
  const strength = roundToScale(rawStrength, STRENGTH_PRECISION);
  const fill = mixOklab(heat.low, heat.high, strength);
  return { strength, fill, isOn: pickInk(fill, heat.ink, heat.inkOn) === heat.inkOn };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 칸 하나: 면과 값 글자. 밝히지 않은 칸도 흐리지 않고 면과 글자 색은 그대로다. 밝힌 칸의 숫자만 굵게(weight.semibold) 한다(docs/design/charts.md 흐림).
function heatCell(grid, c, k) {
  const { chart, rows, cols, plotX, cellW, cellH, top, max, format } = grid;
  const [x, y] = [plotX + cols.indexOf(c.col) * cellW, top + rows.indexOf(c.row) * cellH];
  const { strength, fill, isOn } = heatLook(max ? c.values.value / max : 0, LIGHT_HEAT);
  const face = { x, y, w: cellW - SPACE["0-5"], h: cellH - SPACE["0-5"], radius: 0 };
  const raw = c.values.value;
  return (
    `<g class="cr-${k} chart-heat-cell"><rect x="${r(face.x)}" y="${r(face.y)}" width="${r(face.w)}" height="${r(face.h)}" rx="${face.radius}" class="chart-heat" style="--s:${strength}" fill="${fill}"${markAttrs(chart, markId(chart, 0, k), { raw, paint: HEAT_PAINT })}/></g>` +
    `<text x="${r(x + cellW / 2)}" y="${r(centerBaseline(y + cellH / 2, TEXT['11']))}" class="cr-${k} ink chart-cell${isOn ? ' on' : ''}"${markAttrs(chart, markId(chart, 0, k, '.t'), { raw, isText: true, paint: HEAT_PAINT })}>${format(c.values.value)}</text>`
  );
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 칸 수
// basis: estimate
// 열 이름은 칸 너비 안에 들어가야 한다. 넘으면 옆 열 이름과 겹친다.
function headerFits(chart, grid) {
  if (grid.names) {
    const fits = (names, { room, size, face, what }) => names.flatMap((lines) => lines.map((text) => ({ text, width: measure(text, size, face), room, line: chart.rows[0].line, what })));
    return [...fits(grid.names.cols, { room: columnRoom(grid.cellW), size: TEXT['11'], face: 'num', what: 'column name' }), ...fits(grid.names.rows, { room: grid.plotX - PAD - SPACE["3"], size: TEXT['13'], face: 'regular', what: 'item name' }), ...chart.rows.map((c) => ({ text: grid.format(c.values.value), width: measure(grid.format(c.values.value), TEXT['11'], 'num'), room: grid.cellW - SPACE["0-5"] - SPACE["2"], line: c.line, what: 'cell value' }))];
  }
  const colFits = grid.cols.map((c) => ({ text: c, width: measure(c, TEXT['11'], 'num'), room: columnRoom(grid.cellW), line: chart.rows.find((row) => row.col === c).line, what: 'column name' }));
  return [...colFits, ...grid.rows.map((row) => labelFit(row, chart.rows.find((c) => c.row === row).line))];
}

// cost: time O(c), heap O(out), stack O(1)
// vars: c = 칸 수, out = 만든 SVG 글자 수
// basis: estimate
export function drawHeatmap(figure, top) {
  const { chart } = figure;
  const rows = [...new Set(chart.rows.map((c) => c.row))];
  const cols = [...new Set(chart.rows.map((c) => c.col))];
  const format = valueFormat(chart.rows.map((c) => c.values.value), chart.decimals);
  const available = (chart.layout?.width ?? RIGHT + PAD) - PAD * 2;
  const valueRoom = Math.max(...chart.rows.map((c) => measure(format(c.values.value), TEXT['11'], 'num'))) + SPACE["2"] + SPACE["0-5"];
  // 좁은 폭에서 행 이름 칸은 가장 긴 행 이름이 한 줄로 들어갈 만큼만(기본 최소 너비 없이) 얻고 남는 폭은 열이 가져간다. 이름이 길어도 열과 같은 몫을 넘지 않는다.
  const rowNeed = Math.max(...rows.map((row) => measure(row, TEXT['13'], 'regular'))) + SPACE["3"];
  const labelW = chart.layout ? Math.max(SPACE["3"] + TEXT['13'], Math.min(rowNeed, available / (cols.length + 1), available - cols.length * valueRoom)) : labelColumn(rows);
  const plotX = labelW + PAD;
  const cellW = (available - labelW + SPACE["0-5"]) / cols.length;
  const names = chart.layout ? { rows: rows.map((row) => wrap(row, labelW - SPACE["3"], { size: TEXT['13'], face: 'regular' })), cols: cols.map((col) => wrap(col, columnRoom(cellW), { size: TEXT['11'], face: 'num' })) } : undefined;
  const leading = values.leading.normal;
  const headerH = names ? Math.max(...names.cols.map((lines) => lines.length)) * TEXT['11'] * leading : TEXT['11'];
  const cellH = names ? Math.max(SIZE.chart.cell, Math.max(...names.rows.map((lines) => lines.length)) * TEXT['13'] * leading + SPACE["2"]) : SIZE.chart.cell;
  const grid = { chart, rows, cols, plotX, cellW, cellH, names, top: top + headerH + SPACE["2"], max: Math.max(...chart.rows.map((c) => c.values.value)), format };
  const parts = cols.map((c, j) => names ? matrixLabel(names.cols[j], { x: plotX + j * cellW + cellW / 2, cy: top + headerH / 2, size: TEXT['11'], className: 'chart-tick' }) : `<text x="${r(plotX + j * cellW + cellW / 2)}" y="${r(top + TEXT['11'])}" class="chart-tick">${renderRich(c)}</text>`);
  rows.forEach((row, i) => parts.push(names ? matrixLabel(names.rows[i], { x: PAD, cy: grid.top + i * cellH + cellH / 2, size: TEXT['13'], className: 'chart-label' }) : labelText(row, grid.top + i * cellH + cellH / 2, 'chart-label')));
  chart.rows.forEach((c, k) => parts.push(heatCell(grid, c, k)));
  return { svg: parts.join('\n'), bottom: grid.top + rows.length * grid.cellH, rowKeys: chart.rows.map((c) => `${c.row}\u0000${c.col}`), fits: headerFits(chart, grid), dimsInkColor: true };
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 이름 글자 수
// basis: estimate
// 행과 열 이름은 셀 격자를 유지한 채 같은 글자 크기로 줄바꿈한다.
function matrixLabel(lines, { x, cy, size, className }) {
  const lineHeight = size * values.leading.normal;
  const y = centerBaseline(cy - (lines.length - 1) * lineHeight / 2, size);
  return `<text x="${r(x)}" y="${r(y)}" class="${className}">${lines.map((line, i) => `<tspan x="${r(x)}" y="${r(y + i * lineHeight)}">${renderRich(line)}</tspan>`).join('')}</text>`;
}
