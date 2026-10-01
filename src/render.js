// 장면을 Hindsight 그림 모양의 SVG로 그린다. HTML 재생기와 움직이는 SVG가 같은 그림을 쓴다.
// 크기, 간격, 색은 모두 토큰(tokens.js)에서 온다. 도형 비율(사람 머리 0.22 등)은 모양 계산이라 토큰 대상이 아니다.
import { drawMiniGraph } from './minigraph.js';
import { CARD, layoutCard, measurePill } from './scene.js';
import { centerBaseline, escapeXml, measureText, roundCoord, wrapText } from './text.js';
import { tokens, values } from './tokens.js';

const SPACE = values.space;
const TEXT = values.size.text;
const LINE = values.size.line;
const RADIUS = values.radius;
// 색을 고르지 않은 태그에 돌아가며 붙이는 색. gray는 일부러 고를 때만 쓴다.
const TONE_ORDER = ['blue', 'purple', 'green', 'orange'];
const VISIBILITY = { public: '+', private: '-', protected: '#' };
const EDGE_DASH = `${values.dash.line} ${values.dash.gap}`;

// cost: time O(s·r·n² + c), heap O(out), stack O(1)
// vars: s = 도형 수, r = 카드 줄 수, n = 줄 글자 수, c = 선 수, out = 만든 SVG 글자 수
// basis: estimate
/**
 * 장면 전체를 SVG 조각으로 그린다. 순서는 container, 생명선, 도형, 선이다.
 * @param decorate (kind, index, extra) => 덧붙일 class. 움직이는 SVG가 박자별 애니메이션 class를 넣는다.
 *   kind: node, edge, pill, pilltext, card, layer, empty
 * @returns `<defs>`를 뺀 SVG 조각
 */
export function renderScene(scene, decorate = () => '') {
  const painter = createPainter(decorate);
  const frames = [];
  const nodes = [];
  scene.items.forEach((it, i) => (it.kind === 'frame' ? frames : nodes).push(painter.drawItem(it, i)));
  const lifelines = scene.edges.filter((e) => e.isLifeline).map(drawLifeline);
  const edges = scene.edges.map((e, j) => (e.isLifeline ? '' : painter.drawEdge(e, j))).filter(Boolean);
  return [...frames, ...lifelines, ...nodes, ...edges].join('\n');
}

// cost: time O(1), heap O(1), stack O(1)
// basis: estimate
// 태그 색 순번과 decorate를 공유하는 그리기 함수 묶음
function createPainter(decorate) {
  const tones = new Map();
  const toneOf = (row) => {
    if (row.tone) return tokens.color.tag[row.tone];
    if (!row.tag) return tokens.color.tag.blue;
    if (!tones.has(row.tag)) tones.set(row.tag, TONE_ORDER[tones.size % TONE_ORDER.length]);
    return tokens.color.tag[tones.get(row.tag)];
  };

  // cost: time O(k·r·n²), heap O(out), stack O(1)
  // vars: k = 카드 내용 수, r = 카드 줄 수, n = 줄 글자 수, out = 만든 SVG 글자 수
  // basis: estimate
  function drawItem(it, i) {
    const paint = {
      fill: it.fill ?? (it.kind === 'frame' ? tokens.color.surface : tokens.color.bg),
      attrs: `${classAttr('fl-stroke', decorate('node', i, it))}${it.isDashed ? ` stroke-dasharray="${EDGE_DASH}"` : ''}${it.stroke ? ` style="stroke:${it.stroke}"` : ''}`,
    };
    const open = `<g id="n-${i}"${classAttr('fl-node', it.kind === 'frame' && 'fl-frame')} data-id="${escapeXml(it.id)}">`;
    if (it.kind === 'frame') {
      return (
        `${open}<rect x="${roundCoord(it.x)}" y="${roundCoord(it.y)}" width="${roundCoord(it.w)}" height="${roundCoord(it.h)}" rx="${RADIUS['2xl']}" fill="${paint.fill}"${paint.attrs}/>` +
        `<text x="${roundCoord(it.x + SPACE['9'])}" y="${roundCoord(it.y + SPACE['11'])}" class="frame">${escapeXml(toUpper(it.label))}</text></g>`
      );
    }
    return open + drawShape(it, paint) + drawLabels(it) + (it.cards ? drawCard(it, i) : '') + '</g>';
  }

  // cost: time O(k·r·n²), heap O(out), stack O(1)
  // vars: k = 카드 내용 수, r = 카드 줄 수, n = 줄 글자 수, out = 만든 SVG 글자 수
  // basis: estimate
  // 점선 카드: 담을 내용마다 층을 하나씩 두고, 박자가 어느 층을 보일지 고른다.
  function drawCard(it, i) {
    const x = it.x + SPACE['5'];
    const w = it.w - SPACE['5'] * 2;
    const h = Math.max(...it.cards.map((rows) => layoutCard(rows, w).height));
    const top = it.y + it.h - SPACE['5'] - h;
    const layers = it.cards
      .map((rows, k) => `<g id="n-${i}-c${k}" opacity="0"${classAttr('fl-layer', decorate('layer', i, k))}>${drawCardRows(rows, x, top, w)}</g>`)
      .join('');
    return (
      `<rect x="${roundCoord(x)}" y="${roundCoord(top)}" width="${roundCoord(w)}" height="${roundCoord(h)}" rx="${RADIUS.md}" fill="${tokens.color.surface}" stroke="${tokens.color.border}" stroke-dasharray="${values.dash.card} ${values.dash.card}"${classAttr('fl-card', decorate('card', i))}/>` +
      `<text x="${roundCoord(x + CARD.side)}" y="${roundCoord(top + CARD.pad + TEXT['11'])}"${classAttr('row', 'muted', 'fl-empty', decorate('empty', i))}>—</text>` +
      layers
    );
  }

  // cost: time O(r·n²), heap O(out), stack O(1)
  // vars: r = 카드 줄 수, n = 줄 글자 수, out = 만든 SVG 글자 수
  // basis: estimate
  // 카드 줄마다 태그 알약, 오른쪽 표시, 나눈 글 줄을 그린다. 긴 태그는 글 위에 따로 선다.
  function drawCardRows(rows, x, top, w) {
    let y = top + CARD.pad;
    return layoutCard(rows, w)
      .rows.map(({ row, isHeading, tagW, lines, graph }) => {
        const left = x + CARD.side;
        if (graph) {
          const drawn = drawMiniGraph(graph, left, y);
          y += graph.height + CARD.gap;
          return drawn;
        }
        const pillW = row.tag ? measureText(row.tag.toUpperCase(), TEXT['9']) + SPACE['4'] : 0;
        const parts = [drawTagPill(row, left, y + SPACE['0-5'], pillW), drawMark(row, x + w - CARD.side, y)];
        if (isHeading) y += CARD.line;
        const indent = !isHeading && tagW ? pillW + SPACE['2-5'] : 0;
        const metaParts = row.meta != null ? splitMeta(lines, `${row.text} · ${row.meta}`, row.text.length) : lines.map(escapeXml);
        lines.forEach((line, li) => {
          const text = metaParts[li];
          parts.push(`<text x="${roundCoord(left + (li === 0 ? indent : 0))}" y="${roundCoord(y + TEXT['11'])}"${classAttr('row', row.isMono && 'mono')}>${text}</text>`);
          y += CARD.line;
        });
        y += CARD.gap;
        return parts.join('');
      })
      .join('');
  }

  // cost: time O(n), heap O(out), stack O(1)
  // vars: n = 태그 글자 수, out = 만든 SVG 글자 수
  // basis: estimate
  function drawTagPill(row, x, y, width) {
    if (!row.tag) return '';
    const tone = toneOf(row);
    const height = values.size.tag;
    return (
      `<rect x="${roundCoord(x)}" y="${roundCoord(y)}" width="${roundCoord(width)}" height="${height}" rx="${RADIUS.sm}" fill="${tone}" fill-opacity="${values.opacity.tag}"/>` +
      `<text x="${roundCoord(x + width / 2)}" y="${roundCoord(centerBaseline(y + height / 2, TEXT['9']))}" class="tag" fill="${tone}">${escapeXml(toUpper(row.tag))}</text>`
    );
  }

  // cost: time O(n), heap O(out), stack O(1)
  // vars: n = 라벨 글자 수, out = 만든 SVG 글자 수
  // basis: estimate
  // 선 하나와 알약 모양 라벨. 라벨은 경로 길이의 절반 지점에 둔다.
  function drawEdge(e, j) {
    const markers = `${e.hasEndArrow ? ' marker-end="url(#fl-arrow)"' : ''}${e.hasStartArrow ? ' marker-start="url(#fl-arrow)"' : ''}`;
    const path = `<path id="p-${j}" d="${e.d}"${classAttr('fl-path', decorate('edge', j, e))}${e.isDashed ? ` stroke-dasharray="${EDGE_DASH}"` : ''}${markers}/>`;
    const open = `<g id="e-${j}"${classAttr('fl-edge', e.isQuiet && 'quiet', e.isQuiet && decorate('quiet', j))}>`;
    if (!e.label) return `${open}${path}</g>`;
    const { w, h } = measurePill(e.label);
    const pill =
      `<g class="fl-pill"><rect x="${roundCoord(e.mid.x - w / 2)}" y="${roundCoord(e.mid.y - h / 2)}" width="${roundCoord(w)}" height="${h}" rx="${h / 2}" fill="${tokens.color.bg}" stroke="${tokens.color.border}"${classAttr(decorate('pill', j))}/>` +
      `<text x="${roundCoord(e.mid.x)}" y="${roundCoord(centerBaseline(e.mid.y, TEXT['11']))}"${classAttr('edgelabel', decorate('pilltext', j))}>${escapeXml(e.label)}</text></g>`;
    return `${open}${path}${pill}</g>`;
  }

  return { drawItem, drawEdge };
}

// D2 모양 이름에 맞는 도형 윤곽. 글자는 drawLabels가 그린다.
function drawShape(it, { fill, attrs }) {
  const { x, y, w, h } = it;
  const cx = x + w / 2;
  const r = roundCoord;
  switch (it.kind) {
    case 'store': {
      const cap = values.size['store-cap'];
      return (
        `<path d="M${r(x)} ${r(y + cap)} a ${r(w / 2)} ${cap} 0 0 1 ${r(w)} 0 v ${r(h - cap * 2)} a ${r(w / 2)} ${cap} 0 0 1 ${r(-w)} 0 z" fill="${fill}"${attrs}/>` +
        `<path d="M${r(x)} ${r(y + cap)} a ${r(w / 2)} ${cap} 0 0 0 ${r(w)} 0" fill="none"${attrs}/>`
      );
    }
    case 'decision':
      return `<polygon points="${r(cx)},${r(y)} ${r(x + w)},${r(y + h / 2)} ${r(cx)},${r(y + h)} ${r(x)},${r(y + h / 2)}" fill="${fill}"${attrs}/>`;
    case 'oval':
      return `<ellipse cx="${r(cx)}" cy="${r(y + h / 2)}" rx="${r(w / 2)}" ry="${r(h / 2)}" fill="${fill}"${attrs}/>`;
    case 'hexagon': {
      const k = Math.min(w * 0.25, h * 0.5);
      return `<polygon points="${r(x + k)},${r(y)} ${r(x + w - k)},${r(y)} ${r(x + w)},${r(y + h / 2)} ${r(x + w - k)},${r(y + h)} ${r(x + k)},${r(y + h)} ${r(x)},${r(y + h / 2)}" fill="${fill}"${attrs}/>`;
    }
    case 'person': {
      const head = Math.min(w, h) * 0.22;
      const inset = SPACE['1'];
      return (
        `<circle cx="${r(cx)}" cy="${r(y + head + inset)}" r="${r(head)}" fill="${fill}"${attrs}/>` +
        `<path d="M${r(x + inset)} ${r(y + h)} v -${r(h * 0.18)} a ${r(w / 2 - inset)} ${r(h * 0.34)} 0 0 1 ${r(w - inset * 2)} 0 v ${r(h * 0.18)} z" fill="${fill}"${attrs}/>`
      );
    }
    case 'text':
    case 'markdown':
      return '';
    case 'image':
      return it.icon ? `<image href="${escapeXml(it.icon)}" x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}"/>` : '';
    default: {
      // 라벨 없는 작은 상자는 순서 그림의 활성 구간이라 모서리를 덜 둥글린다.
      const isSpan = it.h < SPACE['20'] && !it.label;
      return `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${isSpan ? RADIUS.sm : RADIUS.xl}" fill="${it.kind === 'code' ? tokens.color.surface : fill}"${attrs}/>`;
    }
  }
}

// cost: time O(n²), heap O(out), stack O(1)
// vars: n = 라벨 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// 도형 종류에 맞는 자리에 라벨과 부제목을 쓴다. 카드가 있는 도형은 라벨을 위로 붙인다.
function drawLabels(it) {
  const { x, y, w, h } = it;
  const cx = x + w / 2;
  if (it.kind === 'table' || it.kind === 'class') return drawTable(it);
  if (it.kind === 'markdown') return drawMarkdown(it);
  if (it.kind === 'code') {
    return wrapText([it.label, ...it.sub].join('\n'), w - SPACE['5'] * 2, TEXT['10-5'])
      .map((line, li) => `<text x="${roundCoord(x + SPACE['5'])}" y="${roundCoord(y + SPACE['9'] + li * LINE['15'])}" class="row mono">${escapeXml(line)}</text>`)
      .join('');
  }
  const below = y + h + SPACE['8-5'];
  if (it.kind === 'person') return `<text x="${roundCoord(cx)}" y="${roundCoord(below)}" class="label">${escapeXml(it.label)}</text>`;
  if (it.kind === 'image') return it.label ? `<text x="${roundCoord(cx)}" y="${roundCoord(below)}" class="sub">${escapeXml(it.label)}</text>` : '';
  if (!it.label && !it.sub.length) return '';
  const labelY = labelBaseline(it);
  const iconSize = values.size.icon;
  const icon = it.icon
    ? `<image href="${escapeXml(it.icon)}" x="${roundCoord(cx - measureText(it.label, TEXT['14']) / 2 - SPACE['13'])}" y="${roundCoord(labelY - LINE['15'])}" width="${iconSize}" height="${iconSize}"/>`
    : '';
  return (
    icon +
    `<text x="${roundCoord(it.icon ? cx + SPACE['6'] : cx)}" y="${roundCoord(labelY)}" class="label">${escapeXml(it.label)}</text>` +
    it.sub.map((s, si) => `<text x="${roundCoord(cx)}" y="${roundCoord(labelY + LINE['15'] * (si + 1))}" class="sub">${escapeXml(s)}</text>`).join('')
  );
}

// 라벨 첫 줄의 글자 기준선. 원통은 둥근 윗면만큼 내려 쓴다.
function labelBaseline(it) {
  const isStore = it.kind === 'store';
  const top = it.y + (isStore ? SPACE['12'] : SPACE['5']) + SPACE['6-5'];
  if (it.cards) return top;
  const centered = centerBaseline(it.y + it.h / 2, TEXT['14']) - (it.sub.length * LINE['15']) / 2;
  return isStore ? Math.max(top, centered + SPACE['3']) : centered;
}

// cost: time O(k), heap O(out), stack O(1)
// vars: k = 칸 수, out = 만든 SVG 글자 수
// basis: estimate
// sql_table과 class. 머리 칸 아래로 칸마다 이름과 타입을 쓴다.
function drawTable(it) {
  const rows =
    it.kind === 'table'
      ? (it.columns ?? []).map((c) => ({ name: c.name?.label ?? '', type: c.type?.label ?? '', key: [].concat(c.constraint ?? []).join(',') }))
      : [...(it.fields ?? []), ...(it.methods ?? [])].map((f) => ({ name: `${VISIBILITY[f.visibility] ?? ''}${f.name}`, type: f.type ?? f.return ?? '', key: '' }));
  const rowH = it.h / (rows.length + 1);
  const r = roundCoord;
  const corner = RADIUS.xl;
  const header =
    `<path d="M${r(it.x)} ${r(it.y + rowH)} v -${r(rowH - corner)} a ${corner} ${corner} 0 0 1 ${corner} -${corner} h ${r(it.w - corner * 2)} a ${corner} ${corner} 0 0 1 ${corner} ${corner} v ${r(rowH - corner)} z" fill="${tokens.color.surface}"/>` +
    `<text x="${r(it.x + it.w / 2)}" y="${r(centerBaseline(it.y + rowH / 2, TEXT['14']))}" class="label">${escapeXml(it.label)}</text>`;
  const cells = rows.map((row, ri) => {
    const y = it.y + rowH * (ri + 1);
    const baseline = centerBaseline(y + rowH / 2, TEXT['11-5']);
    const key = constraintMark(row.key);
    return (
      `<line x1="${r(it.x)}" x2="${r(it.x + it.w)}" y1="${r(y)}" y2="${r(y)}" stroke="${tokens.color.border}" stroke-width="${values.border.hair}"/>` +
      `<text x="${r(it.x + SPACE['5'])}" y="${r(baseline)}" class="cell">${escapeXml(row.name)}${key ? `<tspan class="mark key" dx="${SPACE['3']}">${key}</tspan>` : ''}</text>` +
      `<text x="${r(it.x + it.w - SPACE['5'])}" y="${r(baseline)}" class="cell type">${escapeXml(row.type)}</text>`
    );
  });
  return header + cells.join('');
}

function constraintMark(constraint) {
  if (/primary/.test(constraint)) return 'PK';
  if (/foreign/.test(constraint)) return 'FK';
  if (/unique/.test(constraint)) return 'UNQ';
  return '';
}

// cost: time O(n), heap O(out), stack O(1)
// vars: n = 글자 수, out = 만든 SVG 글자 수
// basis: estimate
// Markdown은 제목과 목록만 살리고 강조 기호는 지운다.
function drawMarkdown(it) {
  let y = it.y + SPACE['8'];
  return [it.label, ...it.sub]
    .filter((line) => line.trim() !== '')
    .map((raw) => {
      const isHeading = /^#{1,6}\s+/.test(raw);
      const text = raw.replace(/^#{1,6}\s+/, '').replace(/^\s*[-*]\s+/, '• ').replace(/[*_`]/g, '');
      const out = `<text x="${roundCoord(it.x + SPACE['2'])}" y="${roundCoord(y)}" class="md${isHeading ? ' h' : ''}">${escapeXml(text)}</text>`;
      y += isHeading ? LINE['22'] : LINE['18'];
      return out;
    })
    .join('');
}

function drawLifeline(e) {
  return `<path d="${e.d}" fill="none" stroke="${tokens.color.border}" stroke-width="${values.border.lifeline}" stroke-dasharray="${values.dash.gap} ${values.dash.gap}"/>`;
}

function drawMark(row, right, y) {
  return row.mark ? `<text x="${roundCoord(right)}" y="${roundCoord(y + TEXT['11'])}" class="mark">${escapeXml(row.mark)}</text>` : '';
}

// cost: time O(r·n), heap O(n), stack O(1)
// vars: r = 줄 수, n = 글자 수
// basis: estimate
// 나눈 줄마다 원래 글(body)의 metaAt 자리부터를 흐리게 쓴다. 덧붙임 안의 ` · `나 줄바꿈과 상관없이 덧붙임 전체가 흐리다.
function splitMeta(lines, body, metaAt) {
  let cursor = 0;
  return lines.map((line) => {
    // wrapText가 줄 사이 띄어쓰기를 지우므로, 원래 글에서 이 줄이 시작하는 자리를 다시 찾는다.
    const start = Math.max(cursor, body.indexOf(line, cursor));
    cursor = start + line.length;
    const cut = Math.min(line.length, Math.max(0, metaAt - start));
    const muted = line.slice(cut);
    return escapeXml(line.slice(0, cut)) + (muted ? `<tspan class="muted">${escapeXml(muted)}</tspan>` : '');
  });
}

// cost: time O(k), heap O(k), stack O(1)
// vars: k = 이름 수
// basis: estimate
function classAttr(...names) {
  const list = names.filter(Boolean).join(' ');
  return list ? ` class="${list}"` : '';
}

// cost: time O(n), heap O(n), stack O(1)
// vars: n = 글자 수
// basis: estimate
function toUpper(text) {
  return String(text ?? '').toUpperCase();
}
