// 같은 폭의 연속 구간을 건수·비율·확률밀도 높이로 표시한다.
// 구간마다 막대 칸이 하나씩 늘 있다(건수가 0이어도 길이 0인 막대). 이웃한 구간은 바탕이 드러나는 작은 틈으로 갈린다.
import { histogramLabels, histogramMeasure, histogramValue } from '../histogram.js';
import { escapeXml, roundCoord as r } from '../text.js';
import { values } from '../vendor/theme/tokens.js';
import { drawRules } from './axis.js';
import { markAttrs, markId } from './marks.js';
import { SPACE, seriesFill, seriesOutline, seriesPaint } from './metrics.js';
import { noDataNote, plotFrame } from './plot-frame.js';

// cost: time O(b + t), heap O(b), stack O(1)
// vars: b = 구간 수, t = 축 눈금 수
// basis: estimate
export function drawHistogram(figure, top) {
  const { chart } = figure;
  const bins = chart.bins.map((bin) => ({ ...bin, value: histogramValue(bin, chart), measure: histogramMeasure(chart) }));
  // 관측이 하나도 없으면 막대가 없다(빠진 표본은 0건 관측이 아니다). 명시한 구간은 가로축을 정하고, 구간이 없으면 대체 범위 0~1을 쓴다.
  const plot = plotFrame(figure, top, { xs: bins.length ? [bins[0].lower, bins.at(-1).upper] : (chart.binEdges ?? [0, 1]), ys: bins.map((bin) => bin.value), markReach: values["border-width"].tag / 2 });
  const boxes = bins.map((bin) => ({ x: plot.sx.at(bin.lower), y: plot.sy.at(bin.value), w: plot.sx.at(bin.upper) - plot.sx.at(bin.lower), h: plot.sy.at(0) - plot.sy.at(bin.value), radius: 0 }));
  const labels = histogramLabels(chart);
  const marks = bins.map((bin, i) => binMark(chart, bin, { box: boxes[i], index: i, baseline: plot.sy.at(0), labels }));
  const occupied = boxes.map((box) => ({ x0: box.x, x1: box.x + box.w, y0: box.y, y1: box.y + box.h }));
  const rules = drawRules(chart.rules, plot.sy, { axis: 'y', from: plot.sx.start, to: plot.sx.start + plot.sx.length, occupied, labels: !chart.layout });
  const blank = bins.length ? '' : noDataNote({ sx: plot.sx, top: plot.top, plotBottom: plot.plotBottom });
  return { svg: `${plot.frame}${marks.join('')}${rules}${blank}`, bottom: plot.bottom, rowKeys: bins.map((bin) => `x=${bin.lower}`) };
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 막대 하나. 이웃과 틈을 두려고 양쪽을 줄이되 막대가 틈보다 좁으면 그대로 둔다.
function binMark(chart, bin, { box, index, baseline, labels }) {
  // 보이는 이름은 입력 구간표와 같은 서식이다. data-value는 반올림 전 높이 그대로 둔 구조 자료다.
  const label = `${labels.range(bin)}: ${labels.height(bin)} ${bin.measure} (${bin.count}건)`;
  const inset = box.w > SPACE["0-5"] * 2 ? SPACE["0-25"] : 0;
  const rect = `<rect x="${r(box.x + inset)}" y="${r(box.y)}" width="${r(box.w - inset * 2)}" height="${r(box.h)}" fill="${seriesFill(chart, 0)}" stroke="${seriesOutline(chart, 0)}" stroke-width="${values["border-width"].tag}" class="chart-histogram-bin" data-count="${bin.count}" data-value="${bin.value}"${markAttrs(chart, markId(chart, 0, index), { raw: bin.count, paint: seriesPaint(chart, 0) })}/>`;
  return `<g class="rise" style="transform-origin: ${r(box.x)}px ${r(baseline)}px"><g class="cr-${index}" role="img" aria-label="${escapeXml(label)}"><title>${escapeXml(label)}</title>${rect}</g></g>`;
}
