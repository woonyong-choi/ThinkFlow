// 흐름 그림 대신 숫자를 비교하는 차트. `#@ chart bars`나 `#@ chart arrows`가 있는 원본은 D2 없이 차트만 그린다.
// bars: 항목마다 우리 값과 비교 값 막대 두 개. arrows: 항목마다 이전 값에서 이후 값으로 가는 화살표.
import { FlowError } from './flow.js';
import { EMBED_SCRIPT, PLAYER_METRICS, VIEW_BUTTONS, VIEWER } from './html.js';
import { DEFS, STYLES } from './styles.js';
import { centerBaseline, escapeXml, measureText, roundCoord } from './text.js';
import { tokens, values } from './tokens.js';

const DIRECTIVE = /^\s*#@\s?(.*)$/;
const KINDS = ['bars', 'arrows'];
const SPACE = values.space;
const TEXT = values.size.text;
const WIDTH = values.size['chart-width'];
const LABEL_W = values.size['chart-label'];
const BAR = values.size['chart-bar'];
const ARROW_ROW = values.size['chart-row'];
const DOT = values.size['chart-dot'];
// 값 글자가 막대 끝 오른쪽에 들어갈 자리
const VALUE_W = SPACE['30'] + SPACE['18'];
// 값이 `-`인 막대 자리에 쓰는 기본 글. `#@ missing 글`로 바꾼다.
const MISSING = '공개 비교 없음';

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 원본 글자 수
// basis: estimate
/**
 * 원본에서 차트를 읽는다. `#@ chart` 줄이 없으면 undefined다.
 * @returns { kind, title?, unit?, missing, scale, series: string[], rows: { label, values: (number | undefined)[], line }[], line }
 * @throws FlowError 모르는 차트 종류, 값 형식 오류, 항목 없음, 음수, log 눈금의 0 이하 값, 모두 0인 값
 */
export function parseChart(source) {
  let chart;
  source.split('\n').forEach((raw, i) => {
    const text = DIRECTIVE.exec(raw)?.[1].trim();
    if (!text) return;
    const line = i + 1;
    const [, head, rest = ''] = /^(\S+)\s*(.*)$/.exec(text);
    if (head === 'chart') {
      if (!KINDS.includes(rest)) throw new FlowError(line, 'chart는 bars나 arrows다');
      chart = { kind: rest, scale: 'linear', missing: MISSING, series: [], rows: [], line };
    } else if (chart) {
      readChartLine(chart, head, rest, line);
    }
  });
  if (chart) checkChart(chart);
  return chart;
}

// cost: time O(r), heap O(1), stack O(1)
// vars: r = 항목 수
// basis: estimate
// 그릴 수 없는 값을 줄 번호와 함께 막는다. 막대 길이와 축은 0 이상의 값과 0보다 큰 최댓값을 전제로 한다.
function checkChart(chart) {
  if (!chart.rows.length) throw new FlowError(chart.line, '차트에 항목(bar, arrow)이 없다');
  for (const row of chart.rows) {
    const known = row.values.filter((v) => v !== undefined);
    if (known.some((v) => v < 0)) throw new FlowError(row.line, `값은 0 이상이다: ${row.label}`);
    if (chart.scale === 'log' && known.some((v) => v <= 0)) throw new FlowError(row.line, `log 눈금의 값은 0보다 커야 한다: ${row.label}`);
  }
  const max = Math.max(...chart.rows.flatMap((r) => r.values.filter((v) => v !== undefined)));
  if (!(max > 0)) throw new FlowError(chart.line, '값이 모두 0이거나 비어 있어 길이를 정할 수 없다');
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 줄 글자 수
// basis: estimate
function readChartLine(chart, head, rest, line) {
  if (head === 'title') chart.title = rest;
  else if (head === 'unit') chart.unit = rest;
  else if (head === 'missing') chart.missing = rest;
  else if (head === 'series') chart.series = rest.split(',').map((s) => s.trim());
  else if (head === 'scale') {
    if (rest !== 'log' && rest !== 'linear') throw new FlowError(line, 'scale은 log나 linear다');
    chart.scale = rest;
  } else if (head === 'bar' || head === 'arrow') {
    const at = rest.lastIndexOf(':');
    if (at < 0) throw new FlowError(line, `${head}는 \`이름: 값\` 형식이다`);
    const parts = rest.slice(at + 1).split(head === 'arrow' ? '->' : /\s+/).map((v) => v.trim()).filter(Boolean);
    const numbers = parts.map((v) => (v === '-' ? undefined : Number(v)));
    if (numbers.some((v) => Number.isNaN(v))) throw new FlowError(line, `값은 숫자나 - 다: ${rest.slice(at + 1).trim()}`);
    const isArrowShape = numbers.length === 2 && !numbers.includes(undefined);
    if (head === 'arrow' && !isArrowShape) throw new FlowError(line, 'arrow는 `이름: 이전 -> 이후` 형식이고 두 값 모두 숫자다');
    chart.rows.push({ label: rest.slice(0, at).trim(), values: numbers, line });
  } else {
    throw new FlowError(line, `차트에서 모르는 줄: ${head}`);
  }
}

// cost: time O(r·n), heap O(out), stack O(1)
// vars: r = 항목 수, n = 이름 글자 수, out = 만든 SVG 글자 수
// basis: estimate
/** 차트를 SVG 문서로 그린다. 막대와 화살표는 자라고 머물렀다 다시 자라기를 되풀이한다. */
export function toChartSvg(chart) {
  const header = drawHeader(chart);
  const body = chart.kind === 'bars' ? drawBars(chart, header.height) : drawArrows(chart, header.height);
  const H = body.bottom + SPACE['14'];
  return `<svg xmlns="http://www.w3.org/2000/svg" class="fl fl-chart" width="${WIDTH}" height="${roundCoord(H)}" style="aspect-ratio: ${WIDTH} / ${roundCoord(H)}" viewBox="0 0 ${WIDTH} ${roundCoord(H)}">
<style>${STYLES.tokens}${STYLES.figure}${STYLES.chart}</style>
<defs>${DEFS}</defs>
<rect width="100%" height="100%" fill="${tokens.color.bg}"/>
${header.svg}
${body.svg}
</svg>
`;
}

/** 차트 SVG 하나를 담은 HTML 문서. 흐름 그림과 같은 전체 화면과 확대·축소를 쓴다. */
export function toChartHtml(chart, title) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(title)}</title>
${EMBED_SCRIPT}
<style>${STYLES.tokens}${STYLES.player}</style>
</head>
<body>
<figure class="fl-figure fl-chart-page" tabindex="0">
${VIEW_BUTTONS}
<div class="fl-canvas">${toChartSvg(chart)}</div>
</figure>
<script>
${VIEWER}
d2flowView(document.querySelector('.fl-figure'), ${JSON.stringify(PLAYER_METRICS)});
</script>
</body>
</html>
`;
}

// cost: time O(s·n), heap O(out), stack O(1)
// vars: s = 계열 수, n = 계열 이름 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 제목과, 막대 차트면 계열 범례
function drawHeader(chart) {
  let y = SPACE['14'];
  const parts = [];
  if (chart.title) {
    parts.push(`<text x="${SPACE['14']}" y="${y + TEXT['15']}" class="chart-title">${escapeXml(chart.title)}</text>`);
    y += TEXT['15'] + SPACE['6'];
  }
  if (chart.kind === 'bars' && chart.series.length) {
    let x = SPACE['14'];
    chart.series.forEach((name, k) => {
      parts.push(`<rect x="${x}" y="${y + SPACE['2']}" width="${BAR}" height="${BAR}" rx="${values.radius.sm}" fill="${seriesColor(k)}"/>`);
      parts.push(`<text x="${x + BAR + SPACE['3']}" y="${y + BAR}" class="chart-legend">${escapeXml(name)}</text>`);
      x += BAR + SPACE['3'] + measureText(name, TEXT['12']) + SPACE['9'];
    });
    y += BAR + SPACE['6'];
  }
  return { svg: parts.join('\n'), height: y + SPACE['6'] };
}

// cost: time O(r·s), heap O(out), stack O(1)
// vars: r = 항목 수, s = 계열 수, out = 만든 SVG 글자 수
// basis: estimate
// 항목마다 계열 수만큼 막대를 쌓는다. 값이 없는 계열은 막대 대신 MISSING 글자를 둔다.
function drawBars(chart, top) {
  const plotX = LABEL_W + SPACE['14'];
  const plotW = WIDTH - plotX - VALUE_W;
  const max = Math.max(...chart.rows.flatMap((r) => r.values.filter((v) => v !== undefined)));
  const unit = chart.unit ?? '';
  const parts = [];
  let y = top;
  chart.rows.forEach((row, ri) => {
    const groupH = row.values.length * BAR + (row.values.length - 1) * SPACE['2'];
    parts.push(`<text x="${SPACE['14']}" y="${roundCoord(centerBaseline(y + groupH / 2, TEXT['13']))}" class="chart-label">${escapeXml(row.label)}</text>`);
    row.values.forEach((v, k) => {
      const by = y + k * (BAR + SPACE['2']);
      if (v === undefined) {
        parts.push(`<text x="${plotX}" y="${roundCoord(by + BAR - SPACE['1'])}" class="chart-missing">${escapeXml(chart.missing)}</text>`);
        return;
      }
      const w = Math.max(SPACE['1'], (v / max) * plotW);
      const delay = `animation-delay: ${ri * values.duration.stagger}ms`;
      parts.push(
        `<rect x="${plotX}" y="${roundCoord(by)}" width="${roundCoord(w)}" height="${BAR}" rx="${values.radius.sm}" fill="${seriesColor(k)}" class="chart-grow" style="${delay}"/>` +
          `<text x="${roundCoord(plotX + w + SPACE['3'])}" y="${roundCoord(by + BAR - SPACE['1'])}" class="chart-value${k === 0 ? ' ours' : ''}" style="${delay}">${formatNumber(v)}${escapeXml(unit)}</text>`,
      );
    });
    y += groupH + SPACE['11'];
  });
  return { svg: parts.join('\n'), bottom: y - SPACE['11'] };
}

// cost: time O(r + t), heap O(out), stack O(1)
// vars: r = 항목 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 항목마다 이전 값(빈 점)에서 이후 값(채운 점)으로 화살표를 긋고, 오른쪽에 바뀐 비율을 적는다.
function drawArrows(chart, top) {
  const plotX = LABEL_W + SPACE['14'];
  const plotW = WIDTH - plotX - VALUE_W;
  const all = chart.rows.flatMap((r) => r.values);
  const scale = makeScale(chart.scale, Math.min(...all), Math.max(...all), plotX, plotW);
  const parts = [];
  chart.rows.forEach((row, ri) => {
    const cy = top + ri * ARROW_ROW + ARROW_ROW / 2;
    const [before, after] = row.values;
    const [x1, x2] = [scale.x(before), scale.x(after)];
    const delay = `animation-delay: ${ri * values.duration.stagger}ms`;
    // 값 글자는 화살표 양 끝 바깥쪽에 둔다. 두 값이 가까워도 글자가 겹치지 않게 하기 위해서다.
    const outward = x1 >= x2 ? 1 : -1;
    const baseline = roundCoord(centerBaseline(cy, TEXT['11']));
    // 줄면 −, 늘면 +를 붙인 바뀐 비율. 두 방향을 같은 단위로 읽게 하기 위해서다.
    // 이전 값이 0이면 비율이 없어 적지 않는다.
    const change = before > 0 ? Math.round((after / before - 1) * 100) : undefined;
    const ratio = change === undefined ? '' : `${change < 0 ? '−' : '+'}${Math.abs(change)}%`;
    parts.push(
      `<text x="${SPACE['14']}" y="${roundCoord(centerBaseline(cy, TEXT['13']))}" class="chart-label">${escapeXml(row.label)}</text>` +
        `<line x1="${roundCoord(x1)}" y1="${roundCoord(cy)}" x2="${roundCoord(x2)}" y2="${roundCoord(cy)}" pathLength="1" class="chart-draw" style="${delay}" marker-end="url(#fl-arrow-on)"/>` +
        `<circle cx="${roundCoord(x1)}" cy="${roundCoord(cy)}" r="${DOT}" class="chart-before"/>` +
        `<text x="${roundCoord(x1 + outward * (DOT + SPACE['3']))}" y="${baseline}" class="chart-value ${outward > 0 ? 'start' : 'end'}">${formatNumber(before)}</text>` +
        `<text x="${roundCoord(x2 - outward * (DOT + SPACE['3']))}" y="${baseline}" class="chart-value ours chart-late ${outward > 0 ? 'end' : 'start'}" style="${delay}">${formatNumber(after)}</text>` +
        `<text x="${WIDTH - SPACE['14']}" y="${roundCoord(centerBaseline(cy, TEXT['13']))}" class="chart-ratio chart-late" style="${delay}">${ratio}</text>`,
    );
  });
  const axisY = top + chart.rows.length * ARROW_ROW + SPACE['4'];
  parts.push(`<line x1="${plotX}" y1="${axisY}" x2="${plotX + plotW}" y2="${axisY}" class="chart-axis"/>`);
  for (const t of scale.ticks) {
    parts.push(`<text x="${roundCoord(scale.x(t))}" y="${axisY + TEXT['11'] + SPACE['3']}" class="chart-tick">${formatNumber(t)}</text>`);
  }
  if (chart.unit) parts.push(`<text x="${plotX + plotW}" y="${axisY + TEXT['11'] * 2 + SPACE['6']}" class="chart-unit">${escapeXml(chart.unit)}${chart.scale === 'log' ? ' (로그 눈금)' : ''}</text>`);
  return { svg: parts.join('\n'), bottom: axisY + TEXT['11'] * 2 + SPACE['6'] };
}

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 눈금 수
// basis: estimate
// 값을 x 좌표로 바꾸는 함수와 눈금. log는 10의 거듭제곱마다, linear는 5칸으로 나눈다.
function makeScale(kind, min, max, x0, width) {
  if (kind === 'log') {
    const [lo, hi] = [Math.floor(Math.log10(min)), Math.ceil(Math.log10(max))];
    const span = Math.max(1, hi - lo);
    const ticks = Array.from({ length: span + 1 }, (_, k) => 10 ** (lo + k));
    return { x: (v) => x0 + ((Math.log10(v) - lo) / span) * width, ticks };
  }
  const step = niceStep(max / 5);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, k) => k * step);
  return { x: (v) => x0 + (v / top) * width, ticks };
}

// cost: time O(1), heap O(1), stack O(1), alloc 1
// basis: estimate
// 1, 2, 5 × 10ⁿ 중 raw 이상인 가장 작은 값
function niceStep(raw) {
  const base = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * base).find((s) => s >= raw);
}

// 1000 이상은 k, 1000000 이상은 M을 붙이고, 소수는 한 자리까지 쓴다.
function formatNumber(v) {
  const compact = (n, suffix) => `${Math.round(n * 10) / 10}${suffix}`;
  if (Math.abs(v) >= 1e6) return compact(v / 1e6, 'M');
  if (Math.abs(v) >= 1e3) return compact(v / 1e3, 'k');
  return compact(v, '');
}

// 첫 계열은 강조 색, 나머지는 회색이다. 우리 값과 비교 값을 나누기 위해서다.
function seriesColor(k) {
  return k === 0 ? tokens.color.accent : tokens.color.tag.gray;
}
