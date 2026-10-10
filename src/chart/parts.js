// 원·도넛은 비율을 각도로 표현하고, 항목별 이름·값·비율을 같은 순서로 읽게 한다.
// 조각 칸은 값이 0이어도 항목마다 하나씩 늘 있다(길이 0인 빈 경로). 그래서 값이 0에서 양수로 바뀌어도 그림 구조가 같고 조각 하나만 자란다.
// 조각은 목록 번호(`1.`)를 조각 안 고리에 적는다(누적 막대와 같은 번호 키). 키 상자가 조각 고리에 들어갈 때만 보이고, 들어가지 않는 얇은 조각은 목록 순서(12시에서 시계 방향)와 비율이 잇는다.
import { categoryPaint } from '../chart-palette.js';
import { wrap } from '../measure/fonts.js';
import { centerBaseline, escapeXml, renderRich, roundCoord as r } from '../text.js';
import { values } from '../vendor/theme/tokens.js';
import { COPY } from './copy.js';
import { keyRoom, segmentKey } from './labels.js';
import { fillSwatch } from './legend.js';
import { markAttrs, markId } from './marks.js';
import { PAD, SIZE, SPACE, TEXT, WIDTH } from './metrics.js';
import { patternPath } from './pattern.js';
import { SHARE_PLACES, valueFormat } from './scale.js';

const TURN = Math.PI * 2;

// 12시에서 시계 방향으로 잰 비율 fraction 방향, 중심에서 radius 떨어진 좌표
function polar(cx, cy, radius, fraction) {
  const angle = fraction * TURN - Math.PI / 2;
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

function point(cx, cy, radius, fraction) {
  const { x, y } = polar(cx, cy, radius, fraction);
  return `${r(x)} ${r(y)}`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 번호 키 상자(가운데 anchor, 칸 room)의 네 모서리가 모두 조각의 고리 부분(안쪽 반지름 이상 바깥 반지름 이하, 시작과 끝 비율 사이)에 드는가.
// 조각이 원 전체(비율 1 이상)이면 각도는 보지 않는다.
function keyFitsSector(part, { cx, cy, outer, inner }, anchor, room) {
  const isWhole = part.end - part.start >= 1;
  return [-1, 1].every((sx) => [-1, 1].every((sy) => {
    const [dx, dy] = [anchor.x + sx * room.w / 2 - cx, anchor.y + sy * room.h / 2 - cy];
    const radius = Math.hypot(dx, dy);
    const fraction = (((Math.atan2(dy, dx) + Math.PI / 2) / TURN) % 1 + 1) % 1;
    return radius >= inner && radius <= outer && (isWhole || (fraction >= part.start && fraction <= part.end));
  }));
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

// cost: time O(r·n²), heap O(out), stack O(1)
// vars: r = 항목 수, n = 이름 글자 수, out = 만든 SVG 글자 수
// basis: estimate
export function drawParts(figure, top) {
  const { chart } = figure;
  const width = chart.layout?.width ?? WIDTH;
  const outer = Math.min(SIZE.chart['plot-h'], width - PAD * 2) / 2 - values["border-width"].tag;
  const inner = figure.chartType === 'donut' ? outer * values.scale["chart-hole"] : 0;
  const geometry = { cx: width / 2, cy: top + outer, outer, inner };
  // 번호 키 고리: 도넛은 띠의 가운데 반지름이고, 원도 같은 고리를 쓴다.
  const keyRadius = outer * (1 + values.scale["chart-hole"]) / 2;
  const format = valueFormat(chart.rows.map((row) => row.values.value), chart.decimals);
  const percent = valueFormat([], chart.decimals ?? SHARE_PLACES);
  // 합이 0이면 비율이 정의되지 않는다: 조각 대신 빈 고리와 그 뜻을 알리는 글을 보인다. 표식은 합이 양수일 때도 늘 있어(숨김) 프레임이 같은 구조다.
  const isUndefined = chart.total === 0;
  let y = top + outer * 2 + SPACE["4-5"];
  const svg = [emptyRing(chart, geometry, isUndefined)];
  chart.parts.forEach((part, index) => {
    const paint = categoryPaint(index);
    const row = chart.rows[index];
    const detail = isUndefined ? format(part.value) : `${format(part.value)} · ${percent(part.fraction * 100)}%`;
    const d = sectorPath(part, geometry);
    const label = escapeXml(`${index + 1}. ${row.label}: ${detail}`);
    // 값에 묶인 조각은 프레임마다 값이 달라지므로 `<title>`(처음 값으로 굳는 툴팁)을 두지 않는다. 현재 값은 보이는 글과 재생기가 바꾸는 aria-label이 읽는다.
    const attrs = markAttrs(chart, markId(chart, 0, index), { raw: part.value, paint });
    // 조각과 무늬는 행 묶음 `cr-k`에 담아 다른 차트처럼 밝히지 않은 행으로 함께 흐려진다. 조각이 이미 나타남 애니메이션(`.dot`)을 가져서 흐림은 묶음이 맡는다.
    const slice = `<path d="${d}" fill="${paint.fill}" stroke="${paint.border}" stroke-width="${values["border-width"].tag}" fill-rule="evenodd" class="chart-part dot" data-at="${r(part.start)}" data-row="${index}" data-fraction="${part.fraction}" role="img" aria-label="${label}"${attrs}>${chart.markIds ? '' : `<title>${label}</title>`}</path>`;
    // 번호 키는 조각 안 고리의 중간 반지름에 적고, 조각 고리에 들어가지 않거나 값이 0이거나 합이 0이면 자리만 두고 숨긴다. 조각마다 늘 하나라 프레임 구조가 같다.
    const key = String(index + 1);
    const anchor = polar(geometry.cx, geometry.cy, keyRadius, (part.start + part.end) / 2);
    const fits = !isUndefined && part.fraction > 0 && keyFitsSector(part, geometry, anchor, keyRoom(key));
    const keyMark = segmentKey(chart, { key, x: anchor.x, cy: anchor.y, paint, fits, id: markId(chart, 0, index, '.k') });
    svg.push(`<g class="cr-${index}">${slice}${patternPath(paint, d, markAttrs(chart, markId(chart, 0, index, '.p')))}${keyMark}</g>`);
    const entry = partLabel({ label: `${index + 1}. ${row.label}`, detail, index, raw: part.value }, { y, width, paint, chart });
    svg.push(entry.svg);
    y = entry.bottom;
  });
  if (inner) svg.push(`<text x="${r(geometry.cx)}" y="${r(geometry.cy)}" text-anchor="middle" class="chart-value"${isUndefined ? ' visibility="hidden"' : ''}${markAttrs(chart, markId(chart, 0, 'total', '.t'), { raw: chart.total, isText: true, paint: categoryPaint(0) })}>${renderRich(valueFormat([chart.total], chart.decimals)(chart.total))}</text>`);
  svg.push(...zeroNote(chart, geometry, isUndefined));
  return { svg: svg.join(''), bottom: y, rowKeys: chart.rows.map((row) => row.label), dotAts: [...new Set(chart.parts.filter((part) => part.value > 0).map((part) => Number(r(part.start))))] };
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
  const lineHeight = TEXT['11'] * values.leading.normal;
  return lines.map((line, k) => {
    const y = cy + (k - (lines.length - 1) / 2) * lineHeight;
    return `<text x="${r(cx)}" y="${r(centerBaseline(y, TEXT['11']))}" text-anchor="middle" class="chart-missing"${isUndefined ? '' : ' visibility="hidden"'}${markAttrs(chart, markId(chart, 0, 'empty', `.t${k}`), { isText: true })}>${renderRich(line)}</text>`;
  });
}

// cost: time O(n²), heap O(n), stack O(1)
// vars: n = 이름과 수치 글자 수
// basis: estimate
function partLabel({ label, detail, index, raw }, { y, width, paint, chart }) {
  const x = PAD + SIZE.chart.bar + SPACE["1-5"];
  const lineHeight = TEXT['13'] * values.leading.normal;
  const lines = wrap(label, width - PAD - x, { size: TEXT['13'], face: 'regular' });
  const name = lines.map((line, i) => `<text x="${r(x)}" y="${r(y + TEXT['13'] + i * lineHeight)}" class="chart-label cr-${index} ink">${renderRich(line)}</text>`).join('');
  const detailY = y + lines.length * lineHeight;
  const details = wrap(detail, width - PAD - x, { size: TEXT['11'] });
  const numbers = details.map((line, i) => `<text x="${r(x)}" y="${r(detailY + TEXT['11'] + i * lineHeight)}" class="chart-value cr-${index} ink"${i ? '' : markAttrs(chart, markId(chart, 0, index, '.d'), { raw, isText: true, paint })}>${renderRich(line)}</text>`).join('');
  const swatch = `<g class="cr-${index}">${fillSwatch(paint, { x: PAD, y: y + SPACE["1"] })}</g>`;
  return { svg: swatch + name + numbers, bottom: detailY + details.length * lineHeight + SPACE["3"] };
}
