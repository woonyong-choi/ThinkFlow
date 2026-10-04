// 히트맵: 행과 열 이름, 값에 비례한 칸 진하기, 칸 안 값
import { mixHex, pickInk } from '../contrast.js';
import { roundToScale } from '../format.js';
import { measure } from '../measure/fonts.js';
import { centerBaseline, renderRich, roundCoord as r } from '../text.js';
import { tokens, values } from '../tokens.js';
import { labelColumn, labelFit, labelText } from './labels.js';
import { PAD, RIGHT, SIZE, SPACE, TEXT } from './metrics.js';
import { rimRect } from './rim.js';
import { valueFormat } from './scale.js';

// 칸 색. 값 0은 핵심 1 옅게, 최댓값은 핵심 1 진하게이고 그 사이는 sRGB 보간이다(문서 스킬 색표).
// 칸 색은 CSS(.chart-heat의 color-mix)가 변수로 계산해 다크 모드 값을 따라간다. 여기 hex는 color-mix를 모르는 뷰어용 대체 색(라이트)이다.
// 칸 안 값 글자 후보. 칸마다 대비가 큰 쪽을 빌드 때 고른다. 다크는 두 후보가 같은 밝은 색이고 칸 색 범위가 그 글자와 4.5 이상이 되게 정했다(테스트가 모든 강도를 잰다).
const LIGHT_HEAT = { low: values.color.data['heat-low'], high: values.color.data['heat-high'], ink: values.color.data['heat-ink'], inkOn: values.color.data['heat-ink-on'] };
// 칸 강도(0~1)를 `--s`에 담을 때 줄이는 자릿수 배율(소수 셋째 자리)
const STRENGTH_PRECISION = 1000;

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
/**
 * 칸 하나의 모양. 칸 색(`fill`)과 글자색(`isOn`: 밝은 글자)을 같은 강도 한 값에서 같은 식으로 정한다. CSS `--s`도 이 `strength`를 쓰므로 CSS가 계산하는 칸 색과 어긋나지 않는다.
 * @param heat { low, high, ink, inkOn }. 칸 색 양끝과 글자 후보(`#rrggbb`)
 * @returns { strength, fill, isOn }. strength는 STRENGTH_PRECISION에 맞춰 줄인 강도다.
 */
export function heatLook(rawStrength, heat) {
  const strength = roundToScale(rawStrength, STRENGTH_PRECISION);
  const fill = mixHex(heat.low, heat.high, strength);
  return { strength, fill, isOn: pickInk(fill, heat.ink, heat.inkOn) === heat.inkOn };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 칸 하나: 면과 값 글자. 밝히지 않은 칸은 면이 `opacity.dim`으로, 글자가 `opacity.dim-ink`로 흐려진다(글자 색도 바뀐다. 면과 글자는 서서히 가지 않고 한꺼번에 바뀐다. docs/design/charts.md 흐림).
function heatCell(grid, c, k) {
  const { rows, cols, plotX, cellW, cellH, top, max, format } = grid;
  const [x, y] = [plotX + cols.indexOf(c.col) * cellW, top + rows.indexOf(c.row) * cellH];
  const { strength, fill, isOn } = heatLook(max ? c.values.value / max : 0, LIGHT_HEAT);
  const face = { x, y, w: cellW - SPACE['1'], h: cellH - SPACE['1'], radius: values.radius.sm };
  return (
    `<g class="cr-${k} chart-heat-cell"><rect x="${r(face.x)}" y="${r(face.y)}" width="${r(face.w)}" height="${r(face.h)}" rx="${face.radius}" class="chart-heat" style="--s:${strength}" fill="${fill}"/></g>` +
    rimRect({ k }, face, { color: tokens.color.data['heat-high'] }) +
    `<text x="${r(x + cellW / 2)}" y="${r(centerBaseline(y + cellH / 2, TEXT['11']))}" class="cr-${k} ink chart-cell${isOn ? ' on' : ''}">${format(c.values.value)}</text>`
  );
}

// cost: time O(c), heap O(c), stack O(1)
// vars: c = 칸 수
// basis: estimate
// 열 이름은 칸 너비 안에 들어가야 한다. 넘으면 옆 열 이름과 겹친다.
function headerFits(chart, grid) {
  const colFits = grid.cols.map((c) => ({ text: c, width: measure(c, TEXT['11'], 'num'), room: grid.cellW - SPACE['1'], line: chart.rows.find((row) => row.col === c).line, what: 'column name' }));
  return [...colFits, ...grid.rows.map((row) => labelFit(row, chart.rows.find((c) => c.row === row).line))];
}

// cost: time O(c), heap O(out), stack O(1)
// vars: c = 칸 수, out = 만든 SVG 글자 수
// basis: estimate
export function drawHeatmap(figure, top) {
  const { chart } = figure;
  const rows = [...new Set(chart.rows.map((c) => c.row))];
  const cols = [...new Set(chart.rows.map((c) => c.col))];
  const plotX = labelColumn(rows) + PAD;
  // 칸 너비는 이름 칸 오른쪽에서 내용의 오른쪽 끝까지 남은 폭을 열 수로 나눈 값이다. 상한 없이 채워 다른 차트처럼 960 폭을 채우고 좌우 여백이 같다. 칸 높이는 토큰 그대로다.
  const cellW = (RIGHT - plotX + SPACE['1']) / cols.length;
  const grid = { rows, cols, plotX, cellW, cellH: SIZE.chart.cell, top: top + TEXT['11'] + SPACE['4'], max: Math.max(...chart.rows.map((c) => c.values.value)), format: valueFormat(chart.rows.map((c) => c.values.value), chart.decimals) };
  const parts = cols.map((c, j) => `<text x="${r(plotX + j * cellW + cellW / 2)}" y="${r(top + TEXT['11'])}" class="chart-tick">${renderRich(c)}</text>`);
  rows.forEach((row, i) => parts.push(labelText(row, grid.top + i * grid.cellH + grid.cellH / 2, 'chart-label')));
  chart.rows.forEach((c, k) => parts.push(heatCell(grid, c, k)));
  return { svg: parts.join('\n'), bottom: grid.top + rows.length * grid.cellH, rowKeys: chart.rows.map((c) => `${c.row}\u0000${c.col}`), fits: headerFits(chart, grid), dimsInkColor: true };
}
