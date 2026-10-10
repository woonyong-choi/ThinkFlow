// 시간 보기와 차트 보기 판을 SVG 조각으로 그린다. 배치와 크기는 layout/time.js와 chart/draw.js가 정한 그대로다.
import { CHART_FACES } from '../chart/draw.js';
import { axisLabels } from '../chart/axis.js';
import { rowName } from '../chart/labels.js';
import { PAD, SPACE } from '../chart/metrics.js';
import { escapeXml, roundCoord as r } from '../text.js';
import { drawChartBody } from './chart.js';
import { drawTexts } from './texts.js';

// 막대 둘레에 켜지는 밝힘 면이 막대보다 넓은 만큼
const LIGHT_GROW = SPACE['1'];

// cost: time O(c), heap O(out), stack O(1)
// vars: c = 차트 글자 수, out = 만든 SVG 글자 수
// basis: estimate
/** 차트 보기 판. 차트 그림을 판 자리에 놓고, 차트 카드 id는 data-chart로 가려 같은 차트가 여러 곳에 그려져도 움직임이 모두 찾는다. */
export function drawPlot(panel, glyphs) {
  return drawChartBody(panel.chart, { ...panel, className: 'fl-plot' }, glyphs);
}

// cost: time O(s + t), heap O(out), stack O(1)
// vars: s = 구간 수, t = 눈금 수
// basis: estimate
/**
 * 시간 보기 판. 레인 이름, 눈금 격자, 구간 막대와 이름, 시간 축을 그린다.
 * 구간은 `light 추적.구간`이 밝히는 부분(data-part)이라 막대 둘레에 밝힘 면을 둔다.
 * @param deps { decorate, glyphs }. decorate는 움직이는 SVG가 켜짐 class를 넣는 함수다
 */
export function drawTime(panel, { decorate, glyphs }) {
  for (const face of CHART_FACES) glyphs.add(panel.text, face);
  const { scale, lanes, axisY } = panel;
  const top = lanes[0].y;
  const ranges = panel.labelLayout.lines ? lanes.flatMap((lane) => lane.spans.map((s) => [s.y, s.y + s.h])) : [[top, axisY]];
  const grid = ranges.flatMap(([from, to]) => scale.ticks.map((t) => `<line x1="${r(scale.at(t))}" x2="${r(scale.at(t))}" y1="${r(from)}" y2="${r(to)}" class="chart-grid"/>`)).join('');
  const rows = lanes.map((lane, k) => {
    const name = rowName(lane.label, { layout: panel.labelLayout, k, top: lane.y, cy: lane.y + lane.h / 2 });
    const separator = `<line x1="${PAD}" x2="${r(panel.plotRight)}" y1="${r(lane.y + lane.h)}" y2="${r(lane.y + lane.h)}" class="chart-grid"/>`;
    return name + separator + lane.spans.map((s) => drawSpan(s, { lane, decorate, glyphs })).join('');
  });
  const axis = `<line x1="${r(scale.start)}" x2="${r(scale.start + scale.length)}" y1="${r(axisY)}" y2="${r(axisY)}" class="chart-axis"/>${axisLabels(scale, axisY, panel.unit)}`;
  return `<g class="fl-time" data-view="${escapeXml(panel.view)}" data-chart="${escapeXml(panel.id)}" transform="translate(${r(panel.x)} ${r(panel.y)})">${panel.header}${grid}${rows.join('')}${axis}</g>`;
}

// cost: time O(1), heap O(out), stack O(1)
// vars: out = 만든 SVG 글자 수
// basis: estimate
// 구간 하나: 밝힘 면(투명), 막대, 이름. 이름은 막대 오른쪽(들어가지 않으면 왼쪽)이다.
function drawSpan(s, { lane, decorate, glyphs }) {
  const glow = `<rect x="${r(s.x - LIGHT_GROW)}" y="${r(s.y - LIGHT_GROW)}" width="${r(s.w + LIGHT_GROW * 2)}" height="${r(s.h + LIGHT_GROW * 2)}" class="part-bg ${decorate('part', 0, s.key)}"/>`;
  const bar = `<rect x="${r(s.x)}" y="${r(s.y)}" width="${r(s.w)}" height="${r(s.h)}" rx="${LIGHT_GROW}" fill="${lane.paint.fill}" stroke="${lane.paint.border}" data-span="${escapeXml(s.key)}"/>`;
  const name = drawTexts(s.texts, { x: 0, y: 0 }, glyphs);
  return `<g class="fl-part" data-part="${escapeXml(s.key)}">${glow}${bar}${name}</g>`;
}
