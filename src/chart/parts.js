// 원·도넛은 비율을 각도로 표현하고, 조각마다 이름과 값·비율을 조각 바깥에 직접 적는다(안내선으로 잇는다).
// 조각 칸은 값이 0이어도 항목마다 하나씩 늘 있다(길이 0인 빈 경로). 그래서 값이 0에서 양수로 바뀌어도 그림 구조가 같고 조각 하나만 자란다.
// 작은 조각은 "기타" 하나로 묶어 이름을 적는다(other.js). 묶인 항목도 자기 조각을 가지고 묶음 끝에 이어 놓여 장면의 밝히기가 그대로 걸린다.
// 이름은 원의 왼쪽과 오른쪽 열에 놓고, 같은 열 안에서는 끝 이름과 같은 배치(placeEndLabels)로 겹치지 않게 조각 높이 가까이 둔다.
// 폭이 좁아 바깥 열이 들어가지 않으면 이름은 원 아래 목록으로 내려간다.
import { STYLE } from '../measure/texts.js';
import { categoryPaint } from '../chart-palette.js';
import { measure, wrap } from '../measure/fonts.js';
import { centerBaseline, escapeXml, renderRich, roundCoord as r } from '../text.js';
import { tokens, values } from '@woonyong-choi/design-tokens/tokens.js';
import { COPY } from './copy.js';
import { placeEndLabels } from './end-labels.js';
import { fillSwatch } from './legend.js';
import { markAttrs, markId } from './marks.js';
import { PAD, SIZE, SPACE, TEXT, WIDTH } from './metrics.js';
import { OTHER, OTHER_PAINT, memberPaint, smallGroup, stackOrder } from './other.js';
import { patternPath } from './pattern.js';
import { SHARE_PLACES, valueFormat } from './scale.js';

const TURN = Math.PI * 2;
// 조각 가장자리에서 안내선이 꺾이는 곳까지, 꺾인 곳에서 이름 열까지의 거리
const LEADER_OUT = SPACE["2"];
const LEADER_RUN = SPACE["4"];
// 이름과 값 사이 틈
const NAME_GAP = SPACE["1-5"];
// 이름 줄 높이. 이름(13)과 값(11)이 한 줄에 놓인다.
const LINE = TEXT['13'] * values.leading.normal;
// 바깥 이름 열이 들어갈 때 원 반지름의 하한. 이보다 작아지면 목록 배치로 바꾼다.
const MIN_RADIUS = SIZE.chart['plot-h'] / 4;

// 12시에서 시계 방향으로 잰 비율 fraction 방향, 중심에서 radius 떨어진 좌표
function polar(cx, cy, radius, fraction) {
  const angle = fraction * TURN - Math.PI / 2;
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

function point(cx, cy, radius, fraction) {
  const { x, y } = polar(cx, cy, radius, fraction);
  return `${r(x)} ${r(y)}`;
}

// 원 전체는 SVG의 같은 시작·끝점을 잇는 호 하나로 그릴 수 없어 반원 둘로 나눈다.
function circlePath(cx, cy, radius) {
  const top = point(cx, cy, radius, 0), bottom = point(cx, cy, radius, 0.5);
  const arc = `A ${r(radius)} ${r(radius)} 0 1 1`;
  return `M ${top} ${arc} ${bottom} ${arc} ${top} Z`;
}

// 값이 0인 조각은 그릴 것이 없는 경로다. 길이 0인 호를 그리면 가장자리 선이 방사선으로 남으므로 한 점만 둔다.
function sectorPath(part, { cx, cy, outer, inner }) {
  if (part.end - part.start <= 0) return `M ${r(cx)} ${r(cy)}`;
  if (part.end - part.start >= 1) return circlePath(cx, cy, outer) + (inner ? ` ${circlePath(cx, cy, inner)}` : '');
  const large = part.end - part.start > 0.5 ? 1 : 0;
  const arc = `M ${point(cx, cy, outer, part.start)} A ${r(outer)} ${r(outer)} 0 ${large} 1 ${point(cx, cy, outer, part.end)}`;
  return inner ? `${arc} L ${point(cx, cy, inner, part.end)} A ${r(inner)} ${r(inner)} 0 ${large} 0 ${point(cx, cy, inner, part.start)} Z` : `${arc} L ${r(cx)} ${r(cy)} Z`;
}

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 항목 수
// basis: estimate
// 조각의 각도 자리. 묶인 항목이 없으면 원본 순서 그대로이고, 있으면 묶이지 않은 항목(원본 순서) 뒤에 묶인 항목을 이어 기타가 한 덩어리다.
function arrange(chart, grouped) {
  if (!grouped.size) return chart.parts;
  const order = stackOrder(chart.parts.length, grouped);
  const placed = [];
  let at = 0;
  for (const k of order) {
    const part = chart.parts[k];
    placed[k] = { ...part, start: at, end: at + part.fraction };
    at += part.fraction;
  }
  const last = order.findLast((k) => chart.parts[k].value > 0);
  if (last !== undefined) placed[last].end = 1;
  return placed;
}

// cost: time O(r·n), heap O(r), stack O(1)
// vars: r = 항목 수, n = 이름 글자 수
// basis: estimate
// 이름 글 목록. 묶이지 않은 항목마다 하나와, 묶음이 있으면 기타 하나다. 값이 0이거나 합이 0이면 숨기되 자리는 둔다(프레임 구조가 같다).
function labelEntries(chart, { parts, grouped, isUndefined }) {
  const format = valueFormat(chart.rows.map((row) => row.values.value), chart.decimals);
  const percent = valueFormat([], chart.decimals ?? SHARE_PLACES);
  const detailOf = (value, fraction) => (isUndefined ? format(value) : `${format(value)} · ${percent(fraction * 100)}%`);
  const entries = chart.rows.flatMap((row, k) => (grouped.has(k) ? [] : [{ key: k, name: row.label, detail: detailOf(parts[k].value, parts[k].fraction), raw: parts[k].value, paint: memberPaint(k, grouped, categoryPaint), start: parts[k].start, end: parts[k].end, hidden: isUndefined || !(parts[k].value > 0) }]));
  if (grouped.size) {
    const members = [...grouped].map((k) => parts[k]);
    const value = members.reduce((sum, part) => sum + part.value, 0);
    const fraction = members.reduce((sum, part) => sum + part.fraction, 0);
    entries.push({ key: 'other', name: OTHER, detail: detailOf(value, fraction), raw: value, paint: OTHER_PAINT, start: Math.min(...members.map((p) => p.start)), end: Math.max(...members.map((p) => p.end)), hidden: false, members: [...grouped] });
  }
  return entries.map((entry) => ({ ...entry, nameW: measure(entry.name, TEXT['13']), detailW: measure(entry.detail, TEXT['11'], 'num') }));
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 이름 한 줄의 폭(이름, 틈, 값)
const entryWidth = (entry) => entry.nameW + NAME_GAP + entry.detailW;

// cost: time O(r log r), heap O(r), stack O(1)
// vars: r = 이름 수
// basis: estimate
// 바깥 이름 자리. 조각 가운데 각도가 오른쪽 반원이면 오른쪽 열, 아니면 왼쪽 열이고 열마다 겹치지 않게 놓는다.
function placeOutside(entries, geometry, span) {
  const placed = [];
  for (const side of ['right', 'left']) {
    const mine = entries.filter((entry) => (((entry.start + entry.end) / 2 < 0.5) === (side === 'right')));
    const boxes = mine.map((entry, i) => ({ i, lines: [entry.name], height: LINE, width: entryWidth(entry) }));
    const anchors = new Map(mine.map((entry, i) => [i, polar(geometry.cx, geometry.cy, geometry.outer + LEADER_OUT, (entry.start + entry.end) / 2).y]));
    placeEndLabels(boxes, anchors, span).forEach((box) => placed.push({ ...mine[box.i], side, cy: box.cy }));
  }
  return placed;
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
// 바깥 이름 하나: 안내선, 이름, 값. 오른쪽 열은 왼쪽 맞춤, 왼쪽 열은 오른쪽 맞춤이다.
function outsideLabel(chart, entry, geometry) {
  const { cx, cy, outer } = geometry;
  const mid = (entry.start + entry.end) / 2;
  const sign = entry.side === 'right' ? 1 : -1;
  const edge = polar(cx, cy, outer, mid);
  const elbow = polar(cx, cy, outer + LEADER_OUT, mid);
  const columnX = cx + sign * (outer + LEADER_OUT + LEADER_RUN);
  const textX = columnX + sign * SPACE["1"];
  const hidden = entry.hidden ? ' visibility="hidden"' : '';
  const leader = `<path d="M ${r(edge.x)} ${r(edge.y)} L ${r(elbow.x)} ${r(elbow.y)} L ${r(columnX)} ${r(entry.cy)}" fill="none" stroke="${entry.paint.border}" stroke-width="${values["border-width"].thin}" class="chart-leader"${hidden}${markAttrs(chart, markId(chart, 0, entry.key, '.l'))}/>`;
  const [nameX, detailX] = sign > 0 ? [textX, textX + entry.nameW + NAME_GAP] : [textX - entry.detailW - NAME_GAP, textX];
  const name = `<text x="${r(nameX)}" y="${r(centerBaseline(entry.cy, TEXT['13']))}" class="chart-label"${sign > 0 ? '' : ' text-anchor="end"'}${hidden}${markAttrs(chart, markId(chart, 0, entry.key, '.n'), { isText: true })}>${renderRich(entry.name)}</text>`;
  const detail = `<text x="${r(detailX)}" y="${r(centerBaseline(entry.cy, TEXT['11']))}" class="chart-value${sign > 0 ? '' : ' end'}"${hidden}${markAttrs(chart, markId(chart, 0, entry.key, '.d'), { raw: entry.raw, isText: true, paint: entry.paint })}>${escapeXml(entry.detail)}</text>`;
  return `${leader}${name}${detail}`;
}

// cost: time O(n²), heap O(n), stack O(1)
// vars: n = 이름과 수치 글자 수
// basis: estimate
// 좁은 폭의 목록 한 줄: 색 칸, 이름, 그 아래 값과 비율
function listLabel(chart, entry, { y, width }) {
  const x = PAD + SIZE.chart.bar + SPACE["1-5"];
  const lines = wrap(entry.name, width - PAD - x, { size: TEXT['13'], face: 'regular' });
  const hidden = entry.hidden ? ' visibility="hidden"' : '';
  const name = lines.map((line, i) => `<text x="${r(x)}" y="${r(y + TEXT['13'] + i * LINE)}" class="chart-label"${hidden}${i ? '' : markAttrs(chart, markId(chart, 0, entry.key, '.n'), { isText: true })}>${renderRich(line)}</text>`).join('');
  const detailY = y + lines.length * LINE + TEXT['11'];
  const detail = `<text x="${r(x)}" y="${r(detailY)}" class="chart-value"${hidden}${markAttrs(chart, markId(chart, 0, entry.key, '.d'), { raw: entry.raw, isText: true, paint: entry.paint })}>${escapeXml(entry.detail)}</text>`;
  const swatch = `<g${hidden}>${fillSwatch(entry.paint, { x: PAD, y: y + SPACE["1"] })}</g>`;
  return { svg: swatch + name + detail, bottom: detailY + STYLE.meta.line - TEXT['11'] + SPACE["2"] };
}

// cost: time O(r), heap O(r), stack O(1)
// vars: r = 이름 수
// basis: estimate
// 이름 글이 묶인 행 묶음. 이름은 그 항목 행(`cr-k`)과 함께 흐려지고, 기타는 묶인 행 모두가 흐릴 때만 흐리도록 행 묶음 밖에 둔다.
const labelGroup = (entry, inner) => (typeof entry.key === 'number' ? `<g class="cr-${entry.key} ink">${inner}</g>` : `<g class="ink">${inner}</g>`);

// cost: time O(r·n), heap O(r), stack O(1)
// vars: r = 항목 수, n = 이름 글자 수
// basis: estimate
// 원의 반지름과 이름 배치. 바깥 열이 들어가면 원 옆, 아니면 원 아래 목록이다.
function measureLayout(chart, entries) {
  const width = chart.layout?.width ?? WIDTH;
  const room = Math.max(0, ...entries.map(entryWidth));
  const sideRoom = LEADER_OUT + LEADER_RUN + SPACE["1"] + room;
  const half = SIZE.chart['plot-h'] / 2 - values["border-width"].tag;
  const outer = Math.min(half, (width - PAD * 2) / 2 - sideRoom);
  if (outer >= MIN_RADIUS) return { width, outer, isOutside: true };
  return { width, outer: Math.min(half, (width - PAD * 2) / 2), isOutside: false };
}

// cost: time O(r·n²), heap O(out), stack O(1)
// vars: r = 항목 수, n = 이름 글자 수, out = 만든 SVG 글자 수
// basis: estimate
export function drawParts(figure, top) {
  const { chart } = figure;
  const isUndefined = chart.total === 0;
  const grouped = smallGroup(chart.parts.map((part) => part.value), { isBound: Boolean(chart.markIds) });
  const parts = arrange(chart, grouped);
  const entries = labelEntries(chart, { parts, grouped, isUndefined });
  const layout = measureLayout(chart, entries);
  const inner = figure.chartType === 'donut' ? layout.outer * values.scale["chart-hole"] : 0;
  // 바깥 이름이 원보다 높이 쌓이면 판이 그만큼 자란다. 이름 수는 프레임마다 같으므로 높이도 같다.
  const rightCount = entries.filter((entry) => (entry.start + entry.end) / 2 < 0.5).length;
  const plotH = Math.max(layout.outer * 2, layout.isOutside ? Math.max(rightCount, entries.length - rightCount) * LINE : 0);
  const geometry = { cx: layout.width / 2, cy: top + plotH / 2, outer: layout.outer, inner };
  const svg = [emptyRing(chart, geometry, isUndefined)];
  parts.forEach((part, index) => {
    const paint = memberPaint(index, grouped, categoryPaint);
    const row = chart.rows[index];
    const d = sectorPath(part, geometry);
    const label = escapeXml(`${row.label}: ${part.value}`);
    // 값에 묶인 조각은 프레임마다 값이 달라지므로 `<title>`(처음 값으로 굳는 툴팁)을 두지 않는다. 현재 값은 보이는 글과 재생기가 바꾸는 aria-label이 읽는다.
    const attrs = markAttrs(chart, markId(chart, 0, index), { raw: part.value, paint });
    // 조각 사이 틈은 차트가 놓인 면의 색(currentColor) 가장자리로 낸다. 조각 묶음 `cr-k`는 밝히지 않은 행으로 함께 흐려진다.
    // 기타로 묶인 조각끼리는 조각 색 가장자리라 이음매 없이 한 조각으로 보이고, 묶음 둘레의 틈은 아래 groupOutline 하나가 낸다.
    const edge = grouped.has(index) ? paint.fill : 'currentColor';
    const slice = `<path d="${d}" fill="${paint.fill}" stroke="${edge}" stroke-width="${values["border-width"].tag}" stroke-linejoin="round" fill-rule="evenodd" class="chart-part dot" data-at="${r(part.start)}" data-row="${index}" data-fraction="${part.fraction}" role="img" aria-label="${label}"${attrs}>${chart.markIds ? '' : `<title>${label}</title>`}</path>`;
    svg.push(`<g class="cr-${index}">${slice}${patternPath(paint, d, markAttrs(chart, markId(chart, 0, index, '.p')))}</g>`);
  });
  svg.push(groupOutline(parts, grouped, geometry));
  let bottom = top + plotH;
  if (layout.isOutside) {
    const span = { top, bottom: top + plotH };
    svg.push(...placeOutside(entries, geometry, span).map((entry) => labelGroup(entry, outsideLabel(chart, entry, geometry))));
  }
  svg.push(...centerTotal(chart, geometry, { isUndefined, isDonut: Boolean(inner) }));
  svg.push(...zeroNote(chart, geometry, isUndefined));
  if (!inner) bottom += SPACE["3"] + LINE;
  if (!layout.isOutside) {
    let y = bottom + SPACE["3"];
    for (const entry of entries) {
      const item = listLabel(chart, entry, { y, width: layout.width });
      svg.push(labelGroup(entry, item.svg));
      y = item.bottom;
    }
    bottom = y;
  }
  return { svg: svg.join(''), bottom, rowKeys: chart.rows.map((row) => row.label), dotAts: [...new Set(parts.filter((part) => part.value > 0).map((part) => Number(r(part.start))))] };
}

// cost: time O(g), heap O(1), stack O(1)
// vars: g = 묶인 항목 수
// basis: estimate
// 기타 묶음 전체의 둘레. 이웃 조각과의 틈만 차트 면 색으로 다시 그어, 묶인 조각 색 가장자리가 이웃 조각의 틈을 덮지 않게 한다. 묶음이 없거나 길이가 0이면 그리지 않는다.
function groupOutline(parts, grouped, geometry) {
  const members = [...grouped].map((k) => parts[k]).filter((part) => part.end > part.start);
  if (!members.length) return '';
  const run = { start: Math.min(...members.map((p) => p.start)), end: Math.max(...members.map((p) => p.end)) };
  return `<path d="${sectorPath(run, geometry)}" fill="none" stroke="currentColor" stroke-width="${values["border-width"].tag}" stroke-linejoin="round" class="chart-part-edge" aria-hidden="true"/>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 합계와 그 이름. 도넛은 구멍 가운데에 큰 합계와 아래 "합계"를, 원은 원 아래 한 줄에 "합계 값"을 적는다. 합이 0이면 숨는다.
function centerTotal(chart, { cx, cy, outer }, { isUndefined, isDonut }) {
  const hidden = isUndefined ? ' visibility="hidden"' : '';
  const total = valueFormat([chart.total], chart.decimals)(chart.total);
  const mark = markAttrs(chart, markId(chart, 0, 'total', '.t'), { raw: chart.total, isText: true, paint: categoryPaint(0) });
  if (!isDonut) {
    const y = cy + outer + SPACE["3"] + LINE / 2;
    return [`<text x="${r(cx)}" y="${r(centerBaseline(y, TEXT['13']))}" text-anchor="middle" class="chart-label"${hidden}${mark}>${escapeXml(`${COPY.total} ${total}`)}</text>`];
  }
  const big = values.text.figure['22'];
  const valueY = cy - SPACE["1"];
  return [
    `<text x="${r(cx)}" y="${r(valueY + big * 0.35)}" text-anchor="middle" style="font-size: ${tokens.text.figure['22']}; font-weight: ${tokens['font-weight'].semibold}" class="chart-label"${hidden}${mark}>${escapeXml(total)}</text>`,
    `<text x="${r(cx)}" y="${r(centerBaseline(valueY + big / 2 + SPACE["2"] + TEXT['11'] / 2, TEXT['11']))}" text-anchor="middle" class="chart-legend"${hidden}>${escapeXml(COPY.total)}</text>`,
  ];
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 합이 0일 때 보이는 빈 고리(원은 안쪽 구멍이 없는 원 테두리). 합이 양수이면 숨어 있다.
function emptyRing(chart, { cx, cy, outer, inner }, isUndefined) {
  const d = circlePath(cx, cy, outer) + (inner ? ` ${circlePath(cx, cy, inner)}` : '');
  return `<path d="${d}" fill="none" fill-rule="evenodd" class="chart-empty"${isUndefined ? '' : ' visibility="hidden"'}${markAttrs(chart, markId(chart, 0, 'empty'))}/>`;
}

// cost: time O(n²), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
// 합이 0임을 알리는 글. 고리 한가운데에 구멍(도넛) 또는 원 폭 안에서 줄을 바꿔 적는다. 합이 양수이면 숨어 있고, 줄 수는 늘 같다.
function zeroNote(chart, { cx, cy, outer, inner }, isUndefined) {
  const room = (inner || outer) * 2 - SPACE["3"];
  const lines = wrap(COPY.zeroSum, room, { size: TEXT['11'] });
  const lineHeight = STYLE.meta.line;
  return lines.map((line, k) => {
    const y = cy + (k - (lines.length - 1) / 2) * lineHeight;
    return `<text x="${r(cx)}" y="${r(centerBaseline(y, TEXT['11']))}" text-anchor="middle" class="chart-missing"${isUndefined ? '' : ' visibility="hidden"'}${markAttrs(chart, markId(chart, 0, 'empty', `.t${k}`), { isText: true })}>${renderRich(line)}</text>`;
  });
}
