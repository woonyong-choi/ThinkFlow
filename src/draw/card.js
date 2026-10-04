// 도형 카드 그리기. 내용마다 층을 하나씩 두고 박자가 보일 층을 고른다. 크기는 measure/sizes.js의 layoutCard가 정한 그대로다.
import { measure } from '../measure/fonts.js';
import { MINI_TEXT } from '../measure/minigraph.js';
import { CARD, STYLE } from '../measure/sizes.js';
import { centerBaseline, plainText, renderRich, roundCoord as r } from '../text.js';
import { tokens, values } from '../tokens.js';
import { fillOf } from './paint.js';

const SPACE = values.space;
const RADIUS = values.radius;
// tone 없는 태그에 돌아가며 붙이는 색. brand(지금의 파랑)와 red(오류)는 tone으로 고를 때만 쓴다.
const TONE_ORDER = ['purple', 'green', 'gray'];

// cost: time O(t), heap O(t), stack O(1)
// vars: t = 태그 종류 수
// basis: estimate
/**
 * 그림 하나에서 태그 색을 고정하는 그릇. tone 없는 태그는 원본에 처음 나온 순서대로 색을 받는다.
 * @param tagOrder 원본 시간 흐름에 처음 나온 순서의 tone 없는 태그 목록
 */
export function createTones(tagOrder = []) {
  const tones = new Map();
  for (const tag of tagOrder) if (!tones.has(tag)) tones.set(tag, TONE_ORDER[tones.size % TONE_ORDER.length]);
  return (row) => {
    if (row.tone) return tokens.color.tag[row.tone];
    if (!tones.has(row.tag)) tones.set(row.tag, TONE_ORDER[tones.size % TONE_ORDER.length]);
    return tokens.color.tag[tones.get(row.tag)];
  };
}

// cost: time O(k·r·n), heap O(out), stack O(1)
// vars: k = 카드 내용 수, r = 줄 수, n = 줄 글자 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 카드 틀과 내용 층을 그린다. 내용이 없는 카드는 점선 틀만 보인다.
 * @param place { box, i }. box는 { x, y, w, h } 카드 자리, i는 도형 번호
 * @param paint { toneOf, decorate }. decorate는 움직이는 SVG가 박자별 class를 넣는 함수
 */
export function drawCard(card, { box, i }, { toneOf, decorate }) {
  const layers = card.layouts
    .map((layout, k) => `<g id="n-${i}-c${k}" opacity="0" class="fl-layer ${decorate('layer', i, k)}">${drawFace(layout, box)}${drawRows(layout, box, toneOf)}</g>`)
    .join('');
  return (
    `<rect x="${r(box.x)}" y="${r(box.y)}" width="${r(box.w)}" height="${r(box.h)}" rx="${RADIUS.md}" fill="${tokens.color.card}" stroke="${tokens.color.outline}" stroke-dasharray="${values.dash.card} ${values.dash.card}" class="fl-card ${decorate('card', i)}"/>` +
    layers
  );
}

// cost: time O(r), heap O(1), stack O(1)
// vars: r = 줄 수
// basis: estimate
// 내용이 고른 카드 바탕(`card=`). 그 내용의 줄 가운데 처음 고른 색이 이 내용의 바탕이다. 카드 틀의 테두리가 가려지지 않게 테두리 안쪽만 칠한다. 고르지 않았으면 빈 글이다.
function drawFace(layout, box) {
  const name = layout.rows.find(({ row }) => row.card)?.row.card;
  if (!name) return '';
  const inset = values.border.thin / 2;
  return `<rect x="${r(box.x + inset)}" y="${r(box.y + inset)}" width="${r(box.w - inset * 2)}" height="${r(box.h - inset * 2)}" rx="${RADIUS.md - inset}" fill="${fillOf(name)}"/>`;
}

/** 카드의 줄 하나가 차지한 자리: 맨 위 y와 높이. 값 글자(draw/values.js)가 줄 오른쪽 끝에 얹힐 자리를 찾는 데 쓴다. 자리는 layoutCard가 정한 그대로다. */
export function rowSlot(layout, box, index) {
  return { y: box.y + layout.rows[index].top, h: layout.rows[index].height };
}

// cost: time O(r·n), heap O(out), stack O(1)
// vars: r = 줄 수, n = 줄 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 줄마다 태그 알약, 오른쪽 표시, 나눈 글 줄. 세 글자를 넘는 태그는 글 위에 따로 선다.
function drawRows(layout, box, toneOf) {
  const left = box.x + CARD.side;
  return layout.rows
    .map(({ row, isHeading, tagW, lines, graph, top }) => {
      const rowTop = box.y + top;
      if (graph) return drawMiniGraph(graph, left, rowTop);
      const parts = [drawTag(row, { x: left, y: rowTop }, toneOf), drawMark(row, box.x + box.w - CARD.side, rowTop)];
      const first = rowTop + (isHeading ? STYLE.row.line : 0);
      const indent = !isHeading && tagW ? tagW : 0;
      const body = row.text + (row.meta !== undefined ? ` · ${row.meta}` : '');
      const texts = row.meta !== undefined ? splitMeta(lines, body, plainText(row.text).length) : lines.map((line) => renderRich(line));
      lines.forEach((_, li) => {
        parts.push(`<text x="${r(left + (li === 0 ? indent : 0))}" y="${r(first + li * STYLE.row.line + STYLE.row.size)}" class="row${row.isMono ? ' mono' : ''}">${texts[li]}</text>`);
      });
      return parts.join('');
    })
    .join('');
}

function drawTag(row, { x, y }, toneOf) {
  if (!row.tag) return '';
  const tag = row.tag.toUpperCase();
  const tone = toneOf(row);
  const height = values.size.tag.height;
  const width = measureTag(tag);
  return (
    `<rect x="${r(x)}" y="${r(y + SPACE['0-5'])}" width="${r(width)}" height="${height}" rx="${RADIUS.sm}" fill="${tone}" fill-opacity="${values.opacity.tag}"/>` +
    `<text x="${r(x + width / 2)}" y="${r(centerBaseline(y + SPACE['0-5'] + height / 2, STYLE.tag.size))}" class="tag">${renderRich(tag)}</text>`
  );
}

function measureTag(tag) {
  return measureTagWidth(tag) + SPACE['4'];
}

// 값 줄(isValue)의 오른쪽 끝은 값이 바뀔 때마다 새 글을 보이는 자리라 mark 본보기 글을 그리지 않는다. 값 글자는 draw/values.js가 따로 그린다.
function drawMark(row, right, y) {
  return row.mark && !row.isValue ? `<text x="${r(right)}" y="${r(y + STYLE.row.size)}" class="mark">${renderRich(row.mark)}</text>` : '';
}

// cost: time O(r·n), heap O(n), stack O(1)
// vars: r = 줄 수, n = 글자 수
// basis: estimate
// 나눈 줄마다 원래 글(body)의 metaAt 자리부터를 흐리게 쓴다. 덧붙임 전체가 흐리다. 자리는 백틱 표시를 뺀 글자 기준이다.
function splitMeta(lines, body, metaAt) {
  const plainBody = plainText(body);
  let cursor = 0;
  return lines.map((line) => {
    const plain = plainText(line);
    const start = Math.max(cursor, plainBody.indexOf(plain, cursor));
    cursor = start + plain.length;
    return renderRich(line, Math.max(0, metaAt - start));
  });
}

// cost: time O(n + e), heap O(out), stack O(1)
// vars: n = 이름 수, e = 관계 수, out = 만든 SVG 글자 수
// basis: estimate
// 관계 그래프. 밝힌 이름과, 밝힌 두 이름 사이 선은 강조 색이다. 열을 건너뛰는 관계는 위로 휜다.
function drawMiniGraph(laid, x, y) {
  const lines = laid.edges.map(({ from, to, isLit, isSkip }) => {
    const stroke = isLit ? tokens.color.state.active : tokens.color.border;
    if (isSkip) {
      const [x1, x2] = [from.x + from.w / 2, to.x + to.w / 2];
      const top = Math.min(from.y, to.y);
      return `<path d="M ${r(x + x1)} ${r(y + from.y)} Q ${r(x + (x1 + x2) / 2)} ${r(y - top)} ${r(x + x2)} ${r(y + to.y)}" fill="none" stroke="${stroke}" stroke-width="${values.border.thin}"/>`;
    }
    const isSameColumn = Math.abs(from.x - to.x) < 1;
    const [x1, y1] = isSameColumn ? [from.x + from.w / 2, from.y + from.h] : [from.x + from.w, from.y + from.h / 2];
    const [x2, y2] = isSameColumn ? [to.x + to.w / 2, to.y] : [to.x, to.y + to.h / 2];
    return `<line x1="${r(x + x1)}" y1="${r(y + y1)}" x2="${r(x + x2)}" y2="${r(y + y2)}" stroke="${stroke}" stroke-width="${values.border.thin}"/>`;
  });
  const pills = laid.nodes.map((n) => {
    const fill = n.isLit ? tokens.color.state['active-fill'] : tokens.color.node;
    const stroke = n.isLit ? tokens.color.state['active-fill'] : tokens.color.outline;
    return (
      `<rect x="${r(x + n.x)}" y="${r(y + n.y)}" width="${r(n.w)}" height="${n.h}" rx="${n.h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${values.border.thin}"/>` +
      `<text x="${r(x + n.x + n.w / 2)}" y="${r(centerBaseline(y + n.y + n.h / 2, MINI_TEXT))}" class="mini${n.isLit ? ' on' : ''}">${renderRich(n.name)}</text>`
    );
  });
  return lines.join('') + pills.join('');
}

// cost: time O(k·r·n), heap O(1), stack O(1)
// vars: k = 카드 내용 수, r = 줄 수, n = 글자 수
// basis: estimate
/** 카드에 쓰는 글자를 글꼴 조각에 모은다. */
export function cardGlyphs(layouts, glyphs) {
  for (const layout of layouts) {
    for (const { row, graph } of layout.rows) {
      if (graph) glyphs.add(graph.nodes.map((n) => n.name).join(''), 'regular');
      else {
        glyphs.add(row.text + (row.meta !== undefined ? ` · ${row.meta}` : ''), row.isMono ? 'mono' : 'regular');
        if (row.tag) glyphs.add(row.tag.toUpperCase(), 'semibold');
        if (row.mark) glyphs.add(row.mark, 'semibold');
      }
    }
  }
}

function measureTagWidth(tag) {
  return measure(tag, STYLE.tag.size, STYLE.tag.face);
}
