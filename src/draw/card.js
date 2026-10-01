// 도형 카드 그리기. 내용마다 층을 하나씩 두고 박자가 보일 층을 고른다. 크기는 measure/sizes.js의 layoutCard가 정한 그대로다.
import { measure } from '../measure/fonts.js';
import { MINI_TEXT } from '../measure/minigraph.js';
import { CARD, STYLE } from '../measure/sizes.js';
import { centerBaseline, escapeXml, roundCoord as r } from '../text.js';
import { tokens, values } from '../tokens.js';

const SPACE = values.space;
const RADIUS = values.radius;
// tone 없는 태그에 돌아가며 붙이는 색. gray는 tone으로 고를 때만 쓴다.
const TONE_ORDER = ['blue', 'purple', 'green', 'orange'];

/** 그림 하나에서 태그 색을 고정하는 그릇. tone 없는 태그는 처음 나온 순서대로 색을 받는다. */
export function createTones() {
  const tones = new Map();
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
 * 카드 틀, 빈 표시, 내용 층을 그린다.
 * @param box { x, y, w, h } 카드 자리
 * @param decorate 움직이는 SVG가 박자별 class를 넣는 함수
 */
export function drawCard(card, box, i, toneOf, decorate) {
  const layers = card.layouts
    .map((layout, k) => `<g id="n-${i}-c${k}" opacity="0" class="fl-layer ${decorate('layer', i, k)}">${drawRows(layout, box, toneOf)}</g>`)
    .join('');
  return (
    `<rect x="${r(box.x)}" y="${r(box.y)}" width="${r(box.w)}" height="${r(box.h)}" rx="${RADIUS.md}" fill="${tokens.color.surface}" stroke="${tokens.color.border}" stroke-dasharray="${values.dash.card} ${values.dash.card}" class="fl-card ${decorate('card', i)}"/>` +
    `<text x="${r(box.x + CARD.side)}" y="${r(box.y + CARD.pad + STYLE.row.size)}" class="row muted fl-empty ${decorate('empty', i)}">—</text>` +
    layers
  );
}

// cost: time O(r·n), heap O(out), stack O(1)
// vars: r = 줄 수, n = 줄 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 줄마다 태그 알약, 오른쪽 표시, 나눈 글 줄. 세 글자를 넘는 태그는 글 위에 따로 선다.
function drawRows(layout, box, toneOf) {
  let y = box.y + CARD.pad;
  const left = box.x + CARD.side;
  return layout.rows
    .map(({ row, isHeading, tagW, lines, graph }) => {
      if (graph) {
        const drawn = drawMiniGraph(graph, left, y);
        y += graph.height + CARD.gap;
        return drawn;
      }
      const parts = [drawTag(row, left, y, toneOf), drawMark(row, box.x + box.w - CARD.side, y)];
      if (isHeading) y += STYLE.row.line;
      const indent = !isHeading && tagW ? tagW : 0;
      const body = row.text + (row.meta !== undefined ? ` · ${row.meta}` : '');
      const texts = row.meta !== undefined ? splitMeta(lines, body, row.text.length) : lines.map(escapeXml);
      lines.forEach((_, li) => {
        parts.push(`<text x="${r(left + (li === 0 ? indent : 0))}" y="${r(y + STYLE.row.size)}" class="row${row.isMono ? ' mono' : ''}">${texts[li]}</text>`);
        y += STYLE.row.line;
      });
      y += CARD.gap;
      return parts.join('');
    })
    .join('');
}

function drawTag(row, x, y, toneOf) {
  if (!row.tag) return '';
  const tag = row.tag.toUpperCase();
  const tone = toneOf(row);
  const height = values.size.tag;
  const width = measureTag(tag);
  return (
    `<rect x="${r(x)}" y="${r(y + SPACE['0-5'])}" width="${r(width)}" height="${height}" rx="${RADIUS.sm}" fill="${tone}" fill-opacity="${values.opacity.tag}"/>` +
    `<text x="${r(x + width / 2)}" y="${r(centerBaseline(y + SPACE['0-5'] + height / 2, STYLE.tag.size))}" class="tag" fill="${tone}">${escapeXml(tag)}</text>`
  );
}

function measureTag(tag) {
  return measureTagWidth(tag) + SPACE['4'];
}

function drawMark(row, right, y) {
  return row.mark ? `<text x="${r(right)}" y="${r(y + STYLE.row.size)}" class="mark">${escapeXml(row.mark)}</text>` : '';
}

// cost: time O(r·n), heap O(n), stack O(1)
// vars: r = 줄 수, n = 글자 수
// basis: estimate
// 나눈 줄마다 원래 글(body)의 metaAt 자리부터를 흐리게 쓴다. 덧붙임 전체가 흐리다.
function splitMeta(lines, body, metaAt) {
  let cursor = 0;
  return lines.map((line) => {
    const start = Math.max(cursor, body.indexOf(line, cursor));
    cursor = start + line.length;
    const cut = Math.min(line.length, Math.max(0, metaAt - start));
    const muted = line.slice(cut);
    return escapeXml(line.slice(0, cut)) + (muted ? `<tspan class="muted">${escapeXml(muted)}</tspan>` : '');
  });
}

// cost: time O(n + e), heap O(out), stack O(1)
// vars: n = 이름 수, e = 관계 수, out = 만든 SVG 글자 수
// basis: estimate
// 관계 그래프. 밝힌 이름과, 밝힌 두 이름 사이 선은 강조 색이다. 열을 건너뛰는 관계는 위로 휜다.
function drawMiniGraph(laid, x, y) {
  const lines = laid.edges.map(({ from, to, isLit, isSkip }) => {
    const stroke = isLit ? tokens.color.accent : tokens.color.border;
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
    const fill = n.isLit ? tokens.color.accent : tokens.color.bg;
    const stroke = n.isLit ? tokens.color.accent : tokens.color.border;
    return (
      `<rect x="${r(x + n.x)}" y="${r(y + n.y)}" width="${r(n.w)}" height="${n.h}" rx="${n.h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${values.border.thin}"/>` +
      `<text x="${r(x + n.x + n.w / 2)}" y="${r(centerBaseline(y + n.y + n.h / 2, MINI_TEXT))}" class="mini${n.isLit ? ' on' : ''}">${escapeXml(n.name)}</text>`
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
        glyphs.add(row.text + (row.meta !== undefined ? ` · ${row.meta}` : '') + '—', row.isMono ? 'mono' : 'regular');
        if (row.tag) glyphs.add(row.tag.toUpperCase(), 'semibold');
        if (row.mark) glyphs.add(row.mark, 'semibold');
      }
    }
  }
}

function measureTagWidth(tag) {
  return measure(tag, STYLE.tag.size, STYLE.tag.face);
}
