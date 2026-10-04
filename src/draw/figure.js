// 구조, 상태, 데이터 관계, 순서 그림의 장면을 SVG 조각으로 그린다. 크기와 자리는 배치가 정한 그대로 쓴다.
import { BADGE_STYLE, bodyOf } from '../measure/decor.js';
import { CARD, STYLE, groupHead, hasPill, sizePill } from '../measure/sizes.js';
import { routePolyline } from '../route.js';
import { centerBaseline, escapeXml, renderRich, roundCoord as r } from '../text.js';
import { tokens, values } from '../tokens.js';
import { cardGlyphs, createTones, drawCard } from './card.js';
import { drawDecor, drawGroupTab } from './decor.js';
import { drawHalo, paintOf, tintOf } from './paint.js';
import { drawShape, outlineOf } from './shape.js';

const SPACE = values.space;
const SIZE = values.size;
const RADIUS = values.radius;
const EDGE_DASH = `${values.dash.line} ${values.dash.gap}`;
const INNER_Y = SPACE['6'];
// 그룹 면 단계는 깊이 0, 1, 2 이상 셋(color.group-1, group-2, group-3)이다. 깊이를 이 값으로 막는다.
const MAX_GROUP_STEP = 2;
// 점선 경계 그룹(border=dashed)의 점선
const GROUP_DASH = `${values.dash.line} ${values.dash.gap}`;
// 이름을 도형 안에서 따로 그리는 도형(테이블 머리, 격자 제목)
const HAS_OWN_LABELS = new Set(['table', 'grid']);

// cost: time O(s·k·r·n + e·p), heap O(out), stack O(1)
// vars: s = 도형 수, k = 카드 내용 수, r = 카드 줄 수, n = 글자 수, e = 선 수, p = 경로 점 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 장면을 그린다. body의 순서는 그룹, 생명선, 도형, 선, 메모다. 선 라벨 알약(pills)은 따로 돌려준다. 점과 글 상자가 알약 위로 지나면 알약 글자의 대비가 깨지므로, 호출하는 쪽이 점 층 뒤에 둔다(docs/design/playback.md 점 층).
 * @param decorate (kind, index, extra) => class. 움직이는 SVG가 박자별 class를 넣는다. kind: node, edge, pill, pilltext, quiet, card, layer, part
 * @param glyphs 쓴 글자를 모으는 그릇(createGlyphSet)
 * @returns { body, pills }. pills는 알약이 있는 선마다 `l-번호` 묶음을 담은 `<g class="fl-pills">`이고 알약이 없으면 빈 글이다
 */
export function drawScene(scene, decorate, glyphs) {
  const paint = { toneOf: createTones(scene.tagOrder), decorate, glyphs, scene };
  const parts = [];
  scene.groups.forEach((g, j) => parts.push(drawGroup(g, j, paint)));
  for (const line of scene.lifelines ?? []) parts.push(`<line x1="${r(line.x)}" x2="${r(line.x)}" y1="${r(line.y1)}" y2="${r(line.y2)}" class="lifeline"/>`);
  scene.items.forEach((it, i) => parts.push(drawItem(it, i, paint)));
  scene.edges.forEach((e, j) => parts.push(drawEdge(e, j, paint)));
  for (const note of scene.notes ?? []) parts.push(drawNote(note, glyphs));
  const pills = scene.edges.flatMap((e, j) => drawPill(e, j, paint) ?? []);
  return { body: parts.join('\n'), pills: pills.length ? `<g class="fl-pills">${pills.join('')}</g>` : '' };
}

// 그리는 데 함께 쓰는 것: toneOf(카드 태그 색), decorate(움직이는 SVG의 class), glyphs(쓴 글자 모음), scene(후광이 바깥 바탕을 찾는 데 쓴다)
function drawGroup(g, j, { decorate, glyphs, scene }) {
  glyphs.add(g.label, 'semibold');
  const head = groupHead(g);
  const left = g.x + g.titleDx;
  const decor = head.decor ? drawDecor(head.decor, { x: left, y: g.y + (SIZE.group.title - head.decor.h) / 2, iconData: g.iconData }, glyphs) : '';
  const paint = paintOf(g);
  const tint = tintOf(g, scene);
  const colors = `${paint ? ` ps-${paint}` : ''}${tint ? ` tint-${tint.name}-${tint.level}` : ''}`;
  const depth = Math.min(depthOf(g, scene), MAX_GROUP_STEP);
  const deep = depth ? ` d${depth + 1}` : '';
  const dashed = g.border === 'dashed';
  return (
    `<g id="g-${j}" class="fl-group${g.iconData ? ' tabbed' : ''}" data-id="${escapeXml(g.id)}"><rect x="${r(g.x)}" y="${r(g.y)}" width="${r(g.w)}" height="${r(g.h)}" rx="${RADIUS['2xl']}" class="frame-box fl-stroke${deep}${dashed ? ' dashed' : ''}${colors} ${decorate('group', j)}"${dashed ? ` stroke-dasharray="${GROUP_DASH}"` : ''}/>` +
    `${g.iconData ? drawGroupTab(g) : ''}<text x="${r(left + head.textDx)}" y="${r(centerBaseline(g.y + SIZE.group.title / 2, STYLE.group.size))}" class="frame${paint ? ` gt-${paint}` : ''}">${renderRich(g.label)}</text>${decor}</g>`
  );
}

// cost: time O(k·r·n), heap O(out), stack O(1)
// vars: k = 카드 내용 수, r = 카드 줄 수, n = 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 도형 하나: 윤곽, 이름, 부제, 카드. 사람과 원통의 머리, 어깨, 뚜껑은 배치 사각형 바깥 여백에 그린다.
function drawItem(it, i, paint) {
  const { decorate, glyphs, scene } = paint;
  const stroke = `class="fl-stroke${paintOf(it) ? ` ps-${paintOf(it)}` : ''}${it.shape === 'external' ? ' ext' : ''} ${decorate('node', i)}"`;
  const halo = drawHalo(outlineOf(it), { cls: decorate('halo', i), paint: paintOf(it) });
  const open = `<g id="n-${i}" class="fl-node" data-id="${escapeXml(it.id)}">`;
  for (const l of it.labelLines ?? []) glyphs.add(l, 'medium');
  for (const l of it.subLines ?? []) glyphs.add(l, 'regular');
  if (it.card) cardGlyphs(it.card.layouts, glyphs);
  const shape = drawShape(it.stroke && !it.fill ? { ...it, fill: it.stroke } : it, stroke, paint);
  const decor = it.decor ? drawDecor(it.decor, { x: it.x + it.decor.x, y: it.y + it.decor.y, iconData: it.iconData }, glyphs) : '';
  const card = it.card ? drawCard(it.card, { box: cardBox(it), i }, paint) : '';
  return `${open}${halo}${shape}${decor}${HAS_OWN_LABELS.has(it.shape) ? '' : drawLabels(it)}${card}</g>`;
}

// cost: time O(g), heap O(1), stack O(1)
// vars: g = 그룹 수
// basis: estimate
// 그룹이 안긴 깊이. 바깥 그룹이 0이고 안으로 들어갈수록 1씩 늘며, 면은 깊이 0(group-1), 1(group-2), 2 이상(group-3) 셋 중 하나다.
function depthOf(group, scene) {
  let depth = 0;
  for (let up = scene.groups.find((g) => g.id === group.parent); up; up = scene.groups.find((g) => g.id === up.parent)) depth += 1;
  return depth;
}

// cost: time O(l), heap O(out), stack O(1)
// vars: l = 이름과 부제 줄 수, out = 만든 SVG 글자 수
// basis: estimate
// 이름과 부제. 카드가 있으면 위에 붙이고, 없으면 세로 가운데. 사람은 몸통 아래에 쓴다.
function drawLabels(it) {
  return labelRows(it)
    .map(({ cls, text, cx, baseline }) => `<text x="${r(cx)}" y="${r(baseline)}" class="${cls}">${renderRich(text)}</text>`)
    .join('');
}

// cost: time O(l), heap O(l), stack O(1)
// vars: l = 이름과 부제 줄 수
// basis: estimate
/**
 * 도형의 이름과 부제 줄 자리. 그리는 쪽과 글 상자 자리 계산(draw/boxes.js)이 같은 값을 쓴다.
 * @returns { cls, text, style, cx, center, baseline }[]. center는 줄의 세로 가운데, baseline은 글자 기준선이다
 */
export function labelRows(it) {
  const body = bodyOf(it);
  const cx = body.x + body.w / 2;
  const lines = [...(it.labelLines ?? []).map((l) => ['label', l, STYLE.label]), ...(it.subLines ?? []).map((l) => ['sub', l, STYLE.sub])];
  if (!lines.length) return [];
  const textH = lines.reduce((sum, [, , s]) => sum + s.line, 0);
  let top;
  if (it.shape === 'person') top = it.y + it.h + SPACE['3'];
  else if (it.decor) top = it.y + INNER_Y + it.decor.room;
  else if (it.card) top = it.y + INNER_Y;
  else top = it.y + (body.h - textH) / 2;
  return lines.map(([cls, text, style]) => {
    const center = top + style.line / 2;
    top += style.line;
    return { cls, text, style, cx, center, baseline: centerBaseline(center, style.size) };
  });
}

/** 카드 자리. 사람은 이름표 아래, 테이블은 열 아래, 나머지는 도형 아래쪽 안이다. */
export function cardBox(it) {
  const { w, h } = it.card;
  if (it.shape === 'person') return { x: it.x + (it.w - w) / 2, y: it.y + it.h + SPACE['3'] + it.labelLines.length * STYLE.label.line + CARD.margin, w, h };
  if (it.shape === 'table') return { x: it.x + CARD.margin, y: it.y + it.rowH * (it.columns.length + 1) + CARD.margin, w, h };
  const body = bodyOf(it);
  return { x: it.x + CARD.margin, y: body.y + body.h - CARD.margin - h, w, h };
}

// 선 양끝 화살촉 속성. 기본은 끝(`end`)에만, `both`는 시작에도, `none`은 없다.
function arrowheads({ head }) {
  const start = head === 'both' ? ' marker-start="url(#fl-arrow)"' : '';
  return `${start}${head === 'none' ? '' : ' marker-end="url(#fl-arrow)"'}`;
}

// cost: time O(p), heap O(out), stack O(1)
// vars: p = 경로 점 수, out = 만든 SVG 글자 수
// basis: estimate
// 선 하나. 알약 라벨은 drawPill이 따로 그린다.
function drawEdge(e, j, { decorate }) {
  const { d } = routePolyline(e.points, RADIUS.route);
  const dash = e.dashed ? ` stroke-dasharray="${EDGE_DASH}"` : '';
  const path = `<path id="p-${j}" d="${d}" class="fl-path ${decorate('edge', j)}"${dash}${arrowheads(e)}/>`;
  return `<g id="e-${j}" class="${edgeClass(e, j, decorate)}">${path}</g>`;
}

// 선과 알약 묶음이 함께 쓰는 class. 알약 묶음도 선과 같이 켜지고 조용해진다.
function edgeClass(e, j, decorate) {
  return `fl-edge${e.isMark ? ' mark' : ''}${e.quiet ? ` quiet ${decorate('quiet', j)}` : ''}`;
}

// cost: time O(n), heap O(out), stack O(1)
// vars: n = 라벨 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 선의 알약 라벨 묶음. 라벨 자리는 배치가 정했다. 없으면 undefined다.
function drawPill(e, j, { decorate, glyphs }) {
  if (!hasPill(e) || !e.labelAt) return undefined;
  const { w, h, numW, textW } = sizePill(e.label, e.no);
  const { x, y } = e.labelAt;
  const frame = e.label === undefined ? '' : `<rect x="${r(x - w / 2)}" y="${r(y - h / 2)}" width="${r(w)}" height="${h}" rx="${h / 2}" class="pill ${decorate('pill', j)}"/>`;
  const number = e.no === undefined ? '' : drawNumber(e.no, { x: x - w / 2 + SPACE['1'], y, numW }, glyphs);
  const text = e.label === undefined ? '' : drawPillText(e.label, { x: e.no === undefined ? x : x - w / 2 + SPACE['1'] + numW + SPACE['2'] + textW / 2, y, cls: decorate('pilltext', j) }, glyphs);
  return `<g id="l-${j}" class="${edgeClass(e, j, decorate)}"><g class="fl-pill">${frame}${number}${text}</g></g>`;
}

// cost: time O(n), heap O(out), stack O(1)
// vars: n = 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 선 라벨 글. 번호 원이 왼쪽에 붙으면 글 가운데가 그만큼 오른쪽이다.
function drawPillText(label, { x, y, cls }, glyphs) {
  glyphs.add(label, STYLE.pill.face);
  return `<text x="${r(x)}" y="${r(centerBaseline(y, STYLE.pill.size))}" class="edgelabel ${cls}">${renderRich(label)}</text>`;
}

// cost: time O(1), heap O(out), stack O(1)
// vars: out = 만든 SVG 글자 수
// basis: estimate
// 선 번호 원. 정지 그림과 문서에서도 순서가 읽히도록 선언한 번호를 그대로 쓴다(재생 단계 번호와 독립이다). left는 원 왼쪽 끝, y는 세로 가운데다.
function drawNumber(no, { x: left, y, numW }, glyphs) {
  glyphs.add(String(no), BADGE_STYLE.face);
  const h = numW;
  return (
    `<rect x="${r(left)}" y="${r(y - h / 2)}" width="${r(numW)}" height="${h}" rx="${h / 2}" class="number-pill"/>` +
    `<text x="${r(left + numW / 2)}" y="${r(centerBaseline(y, BADGE_STYLE.size))}" class="number">${no}</text>`
  );
}

// cost: time O(l), heap O(out), stack O(1)
// vars: l = 메모 줄 수, out = 만든 SVG 글자 수
// basis: estimate
function drawNote(note, glyphs) {
  glyphs.add(note.text, 'regular');
  const lines = note.lines.map((l, k) => `<text x="${r(note.x + SPACE['5'])}" y="${r(note.y + SPACE['5'] + STYLE.row.size + k * STYLE.row.line)}" class="row">${renderRich(l)}</text>`);
  return `<g class="fl-note"><rect x="${r(note.x)}" y="${r(note.y)}" width="${r(note.w)}" height="${r(note.h)}" rx="${RADIUS.md}" class="note-box"/>${lines.join('')}</g>`;
}
