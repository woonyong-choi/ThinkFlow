// 타이밍 보기 판을 SVG 조각으로 그린다. 줄 자리는 layout/timing.js의 layoutTiming, 장면마다의 띠·선·화살표는 timingScenes가 정한 그대로다.
// 장면마다 한 묶음(data-si)이고 보이는 장면의 묶음만 보인다(순서 보기의 메시지와 같은 장면 표시 규칙). 묶음 안의 모양은 재생 막대가 지나간 만큼만 보인다(clipPath).
// 움직이는 SVG는 시계로 드러냄 폭과 재생 막대를 SMIL로 옮기고, HTML 재생기는 같은 요소의 data-t0, data-t1을 읽어 표본 시각마다 폭을 쓴다(player/stage.js paintTimings).
import { axisLabels } from '../chart/axis.js';
import { labelText } from '../chart/labels.js';
import { PAD, SPACE, TEXT } from '../chart/metrics.js';
import { categoryPaint } from '../chart-palette.js';
import { discreteWindows } from '../animate/discrete.js';
import { measure } from '../measure/fonts.js';
import { centerBaseline, escapeXml, renderRich, roundCoord as r } from '../text.js';
import { ARROW_LABEL_PAD, BAND_HALF, SLOPE } from '../layout/timing.js';
import { edgeMarker } from './arrow.js';
import { sceneTag } from './scene-tag.js';
import { sizeStatus, statusPillBody } from './status.js';
import { values } from '@woonyong-choi/design-tokens/tokens.js';

const STROKE = values['border-width'];

// 값 띠의 색: 차트의 첫 계열(main)과 같은 범주의 옅은 면과 경계. 값의 크고 작음이 아니라 "이 값이 이 상태다"를 보이므로 한 색 하나로 둔다.
const BAND = categoryPaint(0);
// 화살표 글 바탕 모서리
const LABEL_BG = ARROW_LABEL_PAD;
// 구간 표시의 글과 화살표 사이
const NOTE_GAP = SPACE['1'];

// cost: time O(r + s·(v·c + h + t)), heap O(out), stack O(1)
// vars: r = 줄 수, s = 장면 수, v = 값 줄 수, c = 값이 바뀌는 횟수, h = 이동 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 타이밍 보기 판 하나.
 * @param panel 장면에 놓인 판({ ...layoutTiming, scenes, view, x, y })
 * @param paint { glyphs, scene }. scene.shownSi는 보이는 장면, scene.timingClock은 움직이는 SVG의 시계(없거나 정지면 다 드러난 모습)다
 */
export function drawTiming(panel, { glyphs, scene }) {
  const top = panel.rows[0]?.y ?? PAD;
  const names = panel.rows.map((row) => {
    glyphs.add(row.label, 'regular');
    const separator = `<line x1="${PAD}" x2="${r(panel.plotRight)}" y1="${r(row.y + row.h)}" y2="${r(row.y + row.h)}" class="chart-grid"/>`;
    return labelText(row.label, row.cy, 'chart-label') + separator;
  });
  const scenes = panel.scenes.map((part) => drawScenePart(panel, part, { glyphs, top, shownSi: scene.shownSi, clock: scene.timingClock }));
  return `<g class="fl-timing fl-chart" data-view="${escapeXml(panel.view)}" transform="translate(${r(panel.x)} ${r(panel.y)})">${names.join('')}${scenes.join('')}</g>`;
}

// cost: time O(v·c + h + t), heap O(out), stack O(1)
// vars: v = 값 줄 수, c = 값이 바뀌는 횟수, h = 이동 수, t = 눈금 수, out = 만든 SVG 글자 수
// basis: estimate
// 장면 하나의 묶음: 눈금 격자와 시간 축, 드러냄 창 안의 줄 모양·화살표·구간 표시, 재생 막대.
function drawScenePart(panel, part, { glyphs, top, shownSi, clock }) {
  const tag = sceneTag({ si: part.si }, shownSi);
  const { scale } = part;
  for (const label of scale.labels) glyphs.add(label, 'regular');
  glyphs.add(part.unit, 'regular');
  const grid = scale.ticks.map((t) => `<line x1="${r(scale.at(t))}" x2="${r(scale.at(t))}" y1="${r(top)}" y2="${r(panel.axisY)}" class="chart-grid"/>`).join('');
  const axis = `<line x1="${r(scale.start)}" x2="${r(scale.start + scale.length)}" y1="${r(panel.axisY)}" y2="${r(panel.axisY)}" class="chart-axis"/>${axisLabels(scale, panel.axisY, part.unit)}`;
  const id = `tc-${panel.view}-${part.si}`;
  const isMoving = clock && clock.mode !== 'static' && clock.total > 0;
  const width = part.end - panel.plotX;
  const window = { x: panel.plotX - SLOPE, y: top, w: width + SLOPE * 2, h: panel.axisY - top };
  const reveal = isMoving ? growAnimation(clock, 'width', [SLOPE, window.w]) : '';
  const clip = `<clipPath id="${id}"><rect x="${r(window.x)}" y="${r(window.y)}" width="${r(window.w)}" height="${r(window.h)}" class="fl-timing-clip" data-t0="${part.t0}" data-t1="${part.t1}" data-w="${r(window.w)}" data-from="${r(SLOPE)}">${reveal}</rect></clipPath>`;
  const shapes = [
    ...panel.rows.map((row, k) => drawRow(row, part.rows[k], { panel, glyphs, end: part.end })),
    ...part.arrows.map((arrow, k) => drawArrow(arrow, `${id}-${k}`, glyphs)),
    ...part.notes.map((note, k) => drawNote(note, `${id}-n${k}`, glyphs)),
  ].join('');
  const head = drawHead({ x: panel.plotX, y0: top, y1: panel.axisY, end: part.end, t0: part.t0, t1: part.t1 }, isMoving ? clock : undefined);
  const pills = panel.rows.map((row, k) => drawStatus(row, part.rows[k], { panel, glyphs, prefix: `${id}-s${k}` })).join('');
  return `<g class="fl-timing-scene${tag.off}"${tag.attr}>${grid}${axis}<defs>${clip}</defs><g clip-path="url(#${id})">${shapes}</g>${pills}${head}</g>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 장면 시계 한 바퀴 동안 속성 하나를 from에서 to로 고르게 바꾼다. 축이 장면의 표시 길이까지라 시계 한 바퀴가 축 전체다.
function growAnimation(clock, attribute, [from, to]) {
  return `<animate attributeName="${attribute}" dur="${clock.duration}" ${clock.smil} calcMode="linear" keyTimes="0;1" values="${r(from)};${r(to)}"/>`;
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 재생 막대: 지금 시각의 세로 선. 켜진 선과 같은 강조 역할(지금 일어나는 것)이고, 장면이 끝나면 숨는다. 정지 모습에는 없다(HTML 재생기는 숨긴 채 두고 재생 중에만 보인다).
function drawHead({ x, y0, y1, end, t0, t1 }, clock) {
  const line = `<line x1="${r(x)}" x2="${r(x)}" y1="${r(y0)}" y2="${r(y1)}" class="fl-path"/>`;
  if (clock) {
    const move = `<animateTransform attributeName="transform" type="translate" dur="${clock.duration}" ${clock.smil} calcMode="linear" keyTimes="0;1" values="0 0;${r(end - x)} 0"/>`;
    // 막대는 한 바퀴 내내 보이고 한 번 재생이 끝나면 숨는다. 이산 창의 끝을 한 바퀴 끝(1)에 두려고 표시 길이를 논리 시각으로 넘긴다.
    return `<g class="fl-edge fl-mini-lit fl-timing-head" visibility="hidden">${discreteWindows(clock, [[0, clock.durationMs * clock.speed]])}${move}${line}</g>`;
  }
  return `<g class="fl-edge fl-mini-lit fl-timing-head" visibility="hidden" data-t0="${t0}" data-t1="${t1}" data-w="${r(end - x)}">${line}</g>`;
}

// cost: time O(c), heap O(out), stack O(1)
// vars: c = 값이 바뀌는 횟수, out = 만든 SVG 글자 수
// basis: estimate
// 줄 하나의 장면 모양. 값 줄은 띠나 높낮이 선, 카드 줄은 기준선과 상태 띠다.
function drawRow(row, shape, { panel, glyphs, end }) {
  if (shape.wave) return `<polyline points="${shape.wave.map((p) => `${r(p.x)},${r(p.y)}`).join(' ')}" fill="none" stroke="${BAND.border}" stroke-width="${STROKE.edge}" stroke-linejoin="round"/>`;
  if (shape.bands) return shape.bands.map((band) => drawBand(band, row, glyphs)).join('');
  return `<line x1="${r(panel.plotX)}" x2="${r(end)}" y1="${r(row.cy)}" y2="${r(row.cy)}" class="chart-grid"/>`;
}

// 카드 줄의 장면 상태 알약. 상태는 장면 내내 같으므로 시간 축이 아니라 줄 이름 옆에 놓고, 도형 모서리 알약과 같은 몸통을 쓴다.
function drawStatus(row, shape, { panel, glyphs, prefix }) {
  if (!shape.status) return '';
  const { w, h } = sizeStatus(shape.status);
  return `<g class="fl-status-${shape.status}">${statusPillBody({ x: panel.pillX, y: row.cy - h / 2, w, h }, shape.status, { glyphs, prefix })}</g>`;
}

// 값 띠 하나: 값이 바뀌는 양 끝이 비스듬한 육각 띠와 그 안의 값 글.
function drawBand({ x0, x1, text, showsText }, row, glyphs) {
  const slope = Math.min(SLOPE, (x1 - x0) / 2);
  const [top, bottom] = [row.cy - BAND_HALF, row.cy + BAND_HALF];
  const d = `M${r(x0)} ${r(row.cy)}L${r(x0 + slope)} ${r(top)}H${r(x1 - slope)}L${r(x1)} ${r(row.cy)}L${r(x1 - slope)} ${r(bottom)}H${r(x0 + slope)}Z`;
  const shape = `<path d="${d}" fill="${BAND.tint}" stroke="${BAND.border}" stroke-width="${STROKE.thin}"/>`;
  if (!showsText) return shape;
  glyphs.add(text, 'regular');
  return `${shape}<text x="${r((x0 + x1) / 2)}" y="${r(centerBaseline(row.cy, TEXT['13']))}" text-anchor="middle" class="chart-label">${renderRich(text)}</text>`;
}

// cost: time O(n), heap O(out), stack O(1)
// vars: n = 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 이동 화살표: 보내는 줄의 출발 시각에서 받는 줄의 도착 시각으로 가는 선. 선과 화살촉은 연결선 부품(fl-edge, edgeMarker)이고, 글은 선 가운데에 바탕을 깐다.
function drawArrow(arrow, id, glyphs) {
  const marker = edgeMarker({ head: 'end' }, id);
  const path = `<path d="M${r(arrow.x0)} ${r(arrow.y0)}L${r(arrow.x1)} ${r(arrow.y1)}" class="fl-path${arrow.isLost ? ' dashed' : ''}"${marker.attributes}/>`;
  return `<g class="fl-edge">${marker.defs}${path}</g>${arrow.label ? arrowLabel(arrow, glyphs) : ''}`;
}

function arrowLabel({ label, labelBox: box }, glyphs) {
  glyphs.add(label, 'regular');
  const cy = box.y + box.h / 2;
  return `<rect x="${r(box.x)}" y="${r(box.y)}" width="${r(box.w)}" height="${r(box.h)}" rx="${LABEL_BG}" class="chart-text-bg"/><text x="${r(box.x + box.w / 2)}" y="${r(centerBaseline(cy, TEXT['13']))}" text-anchor="middle" class="chart-label">${renderRich(label)}</text>`;
}

// 구간 표시: 값이 상태를 가진 구간의 양쪽 화살표와 그 위 글.
function drawNote({ x0, x1, y, label }, id, glyphs) {
  glyphs.add(label, 'regular');
  const lineY = y + TEXT['13'] / 2;
  const marker = edgeMarker({ head: 'both' }, id);
  const path = `<path d="M${r(x0)} ${r(lineY)}H${r(x1)}" class="fl-path"${marker.attributes}/>`;
  const text = `<text x="${r((x0 + x1) / 2)}" y="${r(centerBaseline(lineY - TEXT['13'] / 2 - NOTE_GAP, TEXT['13']))}" text-anchor="middle" class="sub">${renderRich(label)}</text>`;
  return `<g class="fl-edge">${marker.defs}${path}</g>${text}`;
}
