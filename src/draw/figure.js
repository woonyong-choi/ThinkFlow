// 구조, 상태, 데이터 관계, 순서 그림의 장면을 SVG 조각으로 그린다. 크기와 자리는 배치가 정한 그대로 쓴다.
import { CARD, STYLE, sizePill } from '../measure/sizes.js';
import { routePolyline } from '../route.js';
import { centerBaseline, escapeXml, roundCoord as r } from '../text.js';
import { tokens, values } from '../tokens.js';
import { cardGlyphs, createTones, drawCard } from './card.js';

const SPACE = values.space;
const SIZE = values.size;
const RADIUS = values.radius;
const EDGE_DASH = `${values.dash.line} ${values.dash.gap}`;
const INNER_Y = SPACE['6'];

// cost: time O(s·k·r·n + e·p), heap O(out), stack O(1)
// vars: s = 도형 수, k = 카드 내용 수, r = 카드 줄 수, n = 글자 수, e = 선 수, p = 경로 점 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 장면을 그린다. 순서는 그룹, 생명선, 도형, 선, 메모다.
 * @param decorate (kind, index, extra) => class. 움직이는 SVG가 박자별 class를 넣는다. kind: node, edge, pill, pilltext, quiet, card, layer, empty, column
 * @param glyphs 쓴 글자를 모으는 그릇(createGlyphSet)
 */
export function drawScene(scene, decorate, glyphs) {
  const toneOf = createTones(scene.tagOrder);
  const parts = [];
  scene.groups.forEach((g, j) => parts.push(drawGroup(g, j, decorate, glyphs)));
  for (const line of scene.lifelines ?? []) parts.push(`<line x1="${r(line.x)}" x2="${r(line.x)}" y1="${r(line.y1)}" y2="${r(line.y2)}" class="lifeline"/>`);
  scene.items.forEach((it, i) => parts.push(drawItem(it, i, toneOf, decorate, glyphs)));
  scene.edges.forEach((e, j) => parts.push(drawEdge(e, j, decorate, glyphs)));
  for (const note of scene.notes ?? []) parts.push(drawNote(note, glyphs));
  return parts.join('\n');
}

function drawGroup(g, j, decorate, glyphs) {
  glyphs.add(g.label, 'semibold');
  return (
    `<g id="g-${j}" class="fl-group" data-id="${escapeXml(g.id)}"><rect x="${r(g.x)}" y="${r(g.y)}" width="${r(g.w)}" height="${r(g.h)}" rx="${RADIUS['2xl']}" class="frame-box fl-stroke ${decorate('group', j)}"/>` +
    `<text x="${r(g.x + SPACE['9'])}" y="${r(centerBaseline(g.y + SIZE['group-title'] / 2, STYLE.group.size))}" class="frame">${escapeXml(g.label)}</text></g>`
  );
}

// cost: time O(k·r·n), heap O(out), stack O(1)
// vars: k = 카드 내용 수, r = 카드 줄 수, n = 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 도형 하나: 윤곽, 이름, 부제, 카드. 사람과 원통의 머리, 어깨, 뚜껑은 배치 사각형 바깥 여백에 그린다.
function drawItem(it, i, toneOf, decorate, glyphs) {
  const stroke = `class="fl-stroke ${decorate('node', i)}"`;
  const open = `<g id="n-${i}" class="fl-node" data-id="${escapeXml(it.id)}">`;
  for (const l of it.labelLines ?? []) glyphs.add(l, 'medium');
  for (const l of it.subLines ?? []) glyphs.add(l, 'regular');
  if (it.card) cardGlyphs(it.card.layouts, glyphs);
  const shape = drawShape(it, stroke, glyphs, decorate);
  const card = it.card ? drawCard(it.card, cardBox(it), i, toneOf, decorate) : '';
  return `${open}${shape}${it.shape === 'table' ? '' : drawLabels(it)}${card}</g>`;
}

// cost: time O(c), heap O(out), stack O(1)
// vars: c = 테이블 열 수, out = 만든 SVG 글자 수
// basis: estimate
function drawShape(it, stroke, glyphs, decorate) {
  const { x, y, w, h } = it;
  const cx = x + w / 2;
  const fill = `fill="${tokens.color.bg}"`;
  switch (it.shape) {
    case 'store': {
      const cap = it.marginTop;
      return (
        `<path d="M${r(x)} ${r(y)} a ${r(w / 2)} ${cap} 0 0 1 ${r(w)} 0 v ${r(h)} a ${r(w / 2)} ${cap} 0 0 1 ${r(-w)} 0 z" ${fill} ${stroke}/>` +
        `<path d="M${r(x)} ${r(y)} a ${r(w / 2)} ${cap} 0 0 0 ${r(w)} 0" fill="none" ${stroke}/>`
      );
    }
    case 'person': {
      const head = SIZE['person-head'] / 2;
      const shoulder = SIZE['person-shoulder'];
      const bodyW = w;
      const bx = x;
      return (
        `<circle cx="${r(cx)}" cy="${r(y - shoulder - SPACE['1'] - head)}" r="${r(head)}" ${fill} ${stroke}/>` +
        `<path d="M${r(bx)} ${r(y + h)} V ${r(y)} A ${r(bodyW / 2)} ${shoulder} 0 0 1 ${r(bx + bodyW)} ${r(y)} V ${r(y + h)} Z" ${fill} ${stroke}/>`
      );
    }
    case 'decision':
      return `<polygon points="${r(cx)},${r(y)} ${r(x + w)},${r(y + h / 2)} ${r(cx)},${r(y + h)} ${r(x)},${r(y + h / 2)}" ${fill} ${stroke}/>`;
    case 'start':
      return `<circle cx="${r(cx)}" cy="${r(y + h / 2)}" r="${r(w / 2)}" fill="${tokens.color.fg}" ${stroke}/>`;
    case 'final':
      return `<circle cx="${r(cx)}" cy="${r(y + h / 2)}" r="${r(w / 2)}" fill="none" ${stroke}/><circle cx="${r(cx)}" cy="${r(y + h / 2)}" r="${r(w / 4)}" fill="${tokens.color.fg}"/>`;
    case 'table':
      return drawTable(it, stroke, glyphs, decorate);
    default: {
      const dash = it.shape === 'external' ? ` stroke-dasharray="${EDGE_DASH}"` : '';
      return `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${RADIUS.xl}" ${fill} ${stroke}${dash}/>`;
    }
  }
}

// cost: time O(l), heap O(out), stack O(1)
// vars: l = 이름과 부제 줄 수, out = 만든 SVG 글자 수
// basis: estimate
// 이름과 부제. 카드가 있으면 위에 붙이고, 없으면 세로 가운데. 사람은 몸통 아래에 쓴다.
function drawLabels(it) {
  const cx = it.x + it.w / 2;
  const lines = [...(it.labelLines ?? []).map((l) => ['label', l, STYLE.label]), ...(it.subLines ?? []).map((l) => ['sub', l, STYLE.sub])];
  if (!lines.length) return '';
  const textH = lines.reduce((sum, [, , s]) => sum + s.line, 0);
  let top;
  if (it.shape === 'person') top = it.y + it.h + SPACE['3'];
  else if (it.card) top = it.y + INNER_Y;
  else top = it.y + (it.h - textH) / 2;
  return lines
    .map(([cls, text, style]) => {
      const baseline = centerBaseline(top + style.line / 2, style.size);
      top += style.line;
      return `<text x="${r(cx)}" y="${r(baseline)}" class="${cls}">${escapeXml(text)}</text>`;
    })
    .join('');
}

// 카드 자리. 사람은 이름표 아래, 테이블은 열 아래, 나머지는 도형 아래쪽 안이다.
function cardBox(it) {
  const { w, h } = it.card;
  if (it.shape === 'person') return { x: it.x + (it.w - w) / 2, y: it.y + it.h + SPACE['3'] + it.labelLines.length * STYLE.label.line + CARD.margin, w, h };
  if (it.shape === 'table') return { x: it.x + CARD.margin, y: it.y + it.rowH * (it.columns.length + 1) + CARD.margin, w, h };
  return { x: it.x + CARD.margin, y: it.y + it.h - CARD.margin - h, w, h };
}

// cost: time O(c), heap O(out), stack O(1)
// vars: c = 열 수, out = 만든 SVG 글자 수
// basis: estimate
// 테이블: 머리 칸, 열마다 이름과 표시(PK, FK, UNQ), 타입. 열 줄은 밝히기 대상이다.
function drawTable(it, stroke, glyphs, decorate) {
  const rowH = it.rowH;
  const frame = `<rect x="${r(it.x)}" y="${r(it.y)}" width="${r(it.w)}" height="${r(it.h)}" rx="${RADIUS.xl}" fill="${tokens.color.bg}" ${stroke}/>`;
  glyphs.add(it.label, 'medium');
  const header = `<text x="${r(it.x + it.w / 2)}" y="${r(centerBaseline(it.y + rowH / 2, STYLE.label.size))}" class="label">${escapeXml(it.label)}</text>`;
  const rows = it.columns.map((c, k) => {
    const key2 = `${it.id}.${c.name}`;
    const y = it.y + rowH * (k + 1);
    const key = c.pk ? 'PK' : c.fk ? 'FK' : c.unique ? 'UNQ' : '';
    glyphs.add(c.name, 'regular');
    glyphs.add(c.type, 'mono');
    glyphs.add(key, 'semibold');
    const baseline = r(centerBaseline(y + rowH / 2, STYLE.cell.size));
    return (
      `<g class="fl-col" data-col="${escapeXml(key2)}"><rect x="${r(it.x + values.border.thin)}" y="${r(y)}" width="${r(it.w - values.border.thin * 2)}" height="${r(rowH)}" class="col-bg ${decorate('column', 0, key2)}"/>` +
      `<line x1="${r(it.x)}" x2="${r(it.x + it.w)}" y1="${r(y)}" y2="${r(y)}" class="col-line"/>` +
      `<text x="${r(it.x + SPACE['9'])}" y="${baseline}" class="cell">${escapeXml(c.name)}${key ? `<tspan class="key" dx="${SPACE['3']}">${key}</tspan>` : ''}</text>` +
      `<text x="${r(it.x + it.w - SPACE['9'])}" y="${baseline}" class="cell type">${escapeXml(c.type)}</text></g>`
    );
  });
  return frame + header + rows.join('');
}

// cost: time O(p + n), heap O(out), stack O(1)
// vars: p = 경로 점 수, n = 라벨 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 선 하나와 알약 라벨. 라벨 자리는 배치가 정했다.
function drawEdge(e, j, decorate, glyphs) {
  const { d } = routePolyline(e.points, RADIUS.route);
  const dash = e.dashed ? ` stroke-dasharray="${EDGE_DASH}"` : '';
  const path = `<path id="p-${j}" d="${d}" class="fl-path ${decorate('edge', j)}"${dash} marker-end="url(#fl-arrow)"/>`;
  const quiet = e.quiet ? ` quiet ${decorate('quiet', j)}` : '';
  const open = `<g id="e-${j}" class="fl-edge${e.isMark ? ' mark' : ''}${quiet}">`;
  if (!e.label || !e.labelAt) return `${open}${path}</g>`;
  glyphs.add(e.label, 'mono');
  const { w, h } = sizePill(e.label);
  const { x, y } = e.labelAt;
  return (
    `${open}${path}<g class="fl-pill"><rect x="${r(x - w / 2)}" y="${r(y - h / 2)}" width="${r(w)}" height="${h}" rx="${h / 2}" class="pill ${decorate('pill', j)}"/>` +
    `<text x="${r(x)}" y="${r(centerBaseline(y, STYLE.pill.size))}" class="edgelabel ${decorate('pilltext', j)}">${escapeXml(e.label)}</text></g></g>`
  );
}

// cost: time O(l), heap O(out), stack O(1)
// vars: l = 메모 줄 수, out = 만든 SVG 글자 수
// basis: estimate
function drawNote(note, glyphs) {
  glyphs.add(note.text, 'regular');
  const lines = note.lines.map((l, k) => `<text x="${r(note.x + SPACE['5'])}" y="${r(note.y + SPACE['5'] + STYLE.row.size + k * STYLE.row.line)}" class="row">${escapeXml(l)}</text>`);
  return `<g class="fl-note"><rect x="${r(note.x)}" y="${r(note.y)}" width="${r(note.w)}" height="${r(note.h)}" rx="${RADIUS.md}" class="note-box"/>${lines.join('')}</g>`;
}
