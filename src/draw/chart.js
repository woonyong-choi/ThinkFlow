// 모든 자리의 차트가 같은 글꼴·식별자·그림 묶음을 쓴다.
import { CHART_FACES } from '../chart/draw.js';
import { escapeXml, roundCoord as r } from '../text.js';

export function drawChartBody(chart, { id, x, y, className = '', view }, glyphs) {
  for (const face of CHART_FACES) glyphs.add(chart.text, face);
  const viewAttr = view === undefined ? '' : ` data-view="${escapeXml(view)}"`;
  return `<g class="fl-chart${className ? ` ${className}` : ''}" data-chart="${escapeXml(id)}"${viewAttr} transform="translate(${r(x)} ${r(y)})">${chart.body}</g>`;
}
