// 차트를 SVG 조각으로 그린다. 계열 요소는 class `cs-{계열 번호}`, 행 요소는 `cr-{행 번호}`를 달아 재생이 드러내기와 밝히기를 건다.
import { drawParts } from './parts.js';
import { drawBars } from './bar.js';
import { drawBoxes, MEDIAN_LABEL } from './box.js';
import { COPY_CHARS, MISSING } from './copy.js';
import { drawDifferences } from './difference.js';
import { drawDumbbells } from './dumbbell.js';
import { drawEcdf } from './ecdf.js';
import { drawHistogram } from './histogram.js';
import { drawHeatmap } from './heatmap.js';
import { drawHeader } from './labels.js';
import { drawLine } from './line.js';
import { PAD, WIDTH } from './metrics.js';
import { collectPatterns } from './pattern.js';
import { drawScatter } from './scatter.js';
import { drawWaterfall } from './waterfall.js';
import { drawStacked } from './stacked.js';

const DRAWERS = { pie: drawParts, donut: drawParts, bar: drawBars, stacked: drawStacked, percent: drawStacked, dumbbell: drawDumbbells, difference: drawDifferences, box: drawBoxes, scatter: drawScatter, line: drawLine, step: drawLine, area: drawLine, ecdf: drawEcdf, heatmap: drawHeatmap, histogram: drawHistogram, waterfall: drawWaterfall };

// cost: time O(r·s + t), heap O(out), stack O(1)
// vars: r = 행 수, s = 계열 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 차트 하나를 그린다. 모든 종류가 같은 틀(제목, 범례, 그림 영역, 축, 표식)과 같은 팔레트 도우미를 쓴다.
 * @returns { body, width, height, rowKeys, fits, dotAts, dimsInkColor, patternKeys, defs }. dimsInkColor는 흐림 대신 밝힌 칸의 글자 굵기만 바꾸는 종류(히트맵)이다. rowKeys[k]는 행 k의 light 이름이다. dotAts는 선 차트 점이 나타나는 시각(자라는 시간 대비 비율, `data-at`)의 오름차순 목록이다. fits는 칸에 들어가야 하는 글({ text, width, room, line, what }), clashes는 비켜 놓지 못해 겹친 점 이름 쌍({ a, b, line })이다.
 * patternKeys는 body가 `url(#id)`로 쓰는 무늬 정의 id 목록(정렬)이고 defs는 그 정의들의 `<pattern>` 글이다. 같은 id는 어느 차트에서든 같은 내용이라 SVG마다 한 번만 넣으면 된다.
 */
export function drawChart(figure) {
  const { result, patternKeys, defs } = collectPatterns(() => {
    const header = drawHeader(figure);
    return { header, plot: DRAWERS[figure.chartType](figure, header.bottom) };
  });
  const { header, plot } = result;
  // 계열이 없는 차트는 그림 전체를 계열 0으로 묶는다. 시간표가 차트 전체를 계열 하나로 보기 때문이다(timeline.js chartSeriesIds).
  const marks = figure.chart.series.length ? plot.svg : `<g class="cs-0">${plot.svg}</g>`;
  return { body: `${header.svg}\n${marks}`, width: figure.chart.layout?.width ?? WIDTH, height: plot.bottom + PAD, rowKeys: plot.rowKeys, fits: plot.fits ?? [], clashes: plot.clashes ?? [], dotAts: plot.dotAts ?? [], dimsInkColor: plot.dimsInkColor ?? false, patternKeys, defs };
}

/** 차트 글자가 쓰는 글꼴. 숫자는 Pretendard의 자리 폭 같은 숫자(num)로 그린다. */
export const CHART_FACES = ['regular', 'semibold', 'num', 'numSemibold'];

// cost: time O(r + n), heap O(n), stack O(1)
// vars: r = 행 수, n = 글자 수
// basis: estimate
/** 차트에 쓰는 글자를 글꼴 조각에 모은다. */
export function chartText(figure) {
  const { chart } = figure;
  return [figure.title, figure.subtitle, chart.x, chart.y, chart.missing ?? MISSING, ...chart.series.map((s) => s.label), ...chart.rules.map((x) => x.label), ...chart.rows.flatMap((row) => [row.label ?? '', row.row ?? '', row.col ?? ''])]
    .filter(Boolean)
    .join('') + `0123456789.ekM−+%=-${COPY_CHARS}${figure.chartType === 'box' ? MEDIAN_LABEL : ''}`;
}
